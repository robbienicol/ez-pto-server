import { GraphQLError } from 'graphql';

/** Postgres/libpq often rejects NUL in text; model output can rarely include them. */
export function sanitizePgText(s: string): string {
  return s.includes('\0') ? s.replace(/\0/g, '') : s;
}

type PostgresLike = Error & {
  errno?: string;
  detail?: string;
  table?: string;
};

function leafCauseError(err: unknown): Error | null {
  let cur: unknown = err;
  const seen = new Set<unknown>();
  let last: Error | null = null;
  while (cur instanceof Error && !seen.has(cur)) {
    seen.add(cur);
    last = cur;
    if (cur.cause instanceof Error) {
      cur = cur.cause;
      continue;
    }
    break;
  }
  return last;
}

/** Prefer the inner Postgres error; Drizzle's message embeds huge `params` (full script). */
export function formatDbFailure(err: unknown): string {
  const leaf = leafCauseError(err);
  if (!leaf) return String(err);
  const p = leaf as PostgresLike;
  const parts = [leaf.message];
  if (typeof p.detail === 'string' && p.detail.trim()) {
    parts.push(p.detail.trim());
  }
  return parts.join(' — ');
}

function pgFailureExtensions(
  err: unknown,
): Record<string, string> | undefined {
  if (process.env.NODE_ENV === 'production') return undefined;
  const leaf = leafCauseError(err) as PostgresLike | null;
  if (!leaf || typeof leaf.errno !== 'string') return undefined;
  const ext: Record<string, string> = { pgSqlState: leaf.errno };
  if (typeof leaf.table === 'string' && leaf.table) {
    ext.pgTable = leaf.table;
  }
  return ext;
}

/** Maps Drizzle/Postgres insert failures on `audios` to a safe client-facing error. */
export function graphQLErrorForAudiosInsert(err: unknown): GraphQLError {
  const pg = formatDbFailure(err);
  console.error('[createAudio] audios insert', pg);

  const tonesArrayHint =
    /text\[\]|is of type text\[\]/i.test(pg) && /tones/i.test(pg)
      ? 'Database still has `audios.tones` as text[] — run `bun run db:migrate` (0002). '
      : '';

  const cachedPlanHint = /cached plan must not change result type/i.test(pg)
    ? 'Stale prepared plan after a schema change — restart the server; Bun SQL uses prepare=false by default (set DATABASE_PREPARE_STATEMENTS=1 only if you need it). '
    : '';

  const detail = process.env.NODE_ENV !== 'production' ? pg : '';
  const message = [
    'Failed to save audio.',
    tonesArrayHint,
    cachedPlanHint,
    detail && `${detail}`,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  return new GraphQLError(message, {
    extensions: {
      code: 'INTERNAL_SERVER_ERROR',
      ...pgFailureExtensions(err),
    },
  });
}
