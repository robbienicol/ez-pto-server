import type { UserJSON } from '@clerk/backend';
import { Webhook } from 'svix';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

const webhookSecret = process.env.CLERK_WEBHOOK_SECRET!;

/** Webhook payloads use `UserJSON` (snake_case). */
function rowFromUserJson(data: UserJSON): {
  clerkId: string;
  email: string;
  name: string;
} {
  const { id } = data;
  const emails = data.email_addresses ?? [];
  const primaryId = data.primary_email_address_id;
  let email = '';
  if (primaryId) {
    email = emails.find((e) => e.id === primaryId)?.email_address ?? '';
  }
  if (!email) email = emails[0]?.email_address ?? '';
  if (!email) email = `${id}@no-email.clerk.local`;
  const name = `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim();
  return { clerkId: id, email, name };
}

async function upsertUserFromClerk(data: UserJSON) {
  const row = rowFromUserJson(data);
  await db
    .insert(users)
    .values({ ...row, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: users.clerkId,
      set: {
        email: row.email,
        name: row.name,
        updatedAt: new Date(),
      },
    });
}

export async function handleClerkWebhook(req: Request): Promise<Response> {
  const payload = await req.text();
  const headers = {
    'svix-id': req.headers.get('svix-id')!,
    'svix-timestamp': req.headers.get('svix-timestamp')!,
    'svix-signature': req.headers.get('svix-signature')!,
  };

  const wh = new Webhook(webhookSecret);
  let event: { type: string; data: any };

  try {
    event = wh.verify(payload, headers) as { type: string; data: any };
  } catch {
    return new Response('Invalid webhook signature', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'user.created':
      case 'user.updated':
        await upsertUserFromClerk(event.data as UserJSON);
        break;

      case 'user.deleted': {
        const id = event.data?.id as string | undefined;
        if (id) {
          await db.delete(users).where(eq(users.clerkId, id));
        }
        break;
      }
    }
  } catch (err) {
    console.error('[clerk webhook]', event.type, err);
    // 500 so Clerk retries transient DB errors
    return new Response('Webhook handler error', { status: 500 });
  }

  return new Response('OK', { status: 200 });
}
