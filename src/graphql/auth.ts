import { createClerkClient, verifyToken } from '@clerk/backend';

const clerkSecretKey = process.env.CLERK_SECRET_KEY;

export const clerkClient = clerkSecretKey
  ? createClerkClient({ secretKey: clerkSecretKey })
  : null;

export { clerkSecretKey };

/** Non-production GraphQL without Clerk uses this `userId` (e.g. GraphiQL). Set GRAPHQL_REQUIRE_AUTH=1 to disable. */
export const DEV_GRAPHQL_CLERK_ID =
  process.env.GRAPHQL_DEV_CLERK_ID ?? 'dev_local_graphql';

export function devAuthBypassEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.GRAPHQL_REQUIRE_AUTH !== '1' &&
    process.env.GRAPHQL_REQUIRE_AUTH !== 'true'
  );
}

function getBearerToken(req: Request): string | null {
  const header =
    req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function getCookie(req: Request, name: string): string | null {
  const cookie = req.headers.get('cookie');
  if (!cookie) return null;
  const parts = cookie.split(';');
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

export async function authenticate(
  req: Request,
): Promise<{ userId: string | null }> {
  const token = getCookie(req, '__session') ?? getBearerToken(req);

  if (!clerkSecretKey) {
    if (devAuthBypassEnabled()) return { userId: DEV_GRAPHQL_CLERK_ID };
    return { userId: null };
  }

  if (!token) {
    if (devAuthBypassEnabled()) return { userId: DEV_GRAPHQL_CLERK_ID };
    return { userId: null };
  }

  try {
    const verified = await verifyToken(token, { secretKey: clerkSecretKey });
    const userId = typeof verified?.sub === 'string' ? verified.sub : null;
    return { userId };
  } catch {
    return { userId: null };
  }
}
