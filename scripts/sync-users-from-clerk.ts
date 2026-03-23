/**
 * One-shot backfill: copies all Clerk users into the local `users` table.
 * Use when users existed before webhooks were configured, or webhooks couldn't reach your server (e.g. localhost).
 *
 * Requires: CLERK_SECRET_KEY, DATABASE_URL (Bun loads .env automatically)
 *
 *   bun run clerk:sync-users
 */
import { createClerkClient } from '@clerk/backend';
import { db } from '../src/db';
import { users } from '../src/db/schema';

const secret = process.env.CLERK_SECRET_KEY;
if (!secret) {
  console.error('Missing CLERK_SECRET_KEY in environment');
  process.exit(1);
}

const clerk = createClerkClient({ secretKey: secret });
const limit = 100;
let offset = 0;
let upserted = 0;

function primaryEmail(u: {
  id: string;
  primaryEmailAddressId: string | null;
  emailAddresses: { id: string; emailAddress: string }[];
}): string {
  const primaryId = u.primaryEmailAddressId;
  const list = u.emailAddresses ?? [];
  if (primaryId) {
    const found = list.find((e) => e.id === primaryId);
    if (found?.emailAddress) return found.emailAddress;
  }
  const first = list[0]?.emailAddress;
  if (first) return first;
  return `${u.id}@no-email.clerk.local`;
}

for (;;) {
  const res = await clerk.users.getUserList({ limit, offset });
  for (const u of res.data) {
    const email = primaryEmail(u);
    const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();

    await db
      .insert(users)
      .values({ clerkId: u.id, email, name })
      .onConflictDoUpdate({
        target: users.clerkId,
        set: { email, name, updatedAt: new Date() },
      });
    upserted++;
  }

  if (res.data.length < limit) break;
  offset += limit;
}

console.log(`Upserted ${upserted} user(s) from Clerk into Postgres.`);
