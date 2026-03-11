import { Webhook } from 'svix';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

const webhookSecret = process.env.CLERK_WEBHOOK_SECRET!;

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

  switch (event.type) {
    case 'user.created':
      await db.insert(users).values({
        clerkId: event.data.id,
        email: event.data.email_addresses[0].email_address,
        name: `${event.data.first_name} ${event.data.last_name}`.trim(),
      });
      break;

    case 'user.updated':
      await db
        .update(users)
        .set({
          email: event.data.email_addresses[0].email_address,
          name: `${event.data.first_name} ${event.data.last_name}`.trim(),
        })
        .where(eq(users.clerkId, event.data.id));
      break;

    case 'user.deleted':
      await db.delete(users).where(eq(users.clerkId, event.data.id));
      break;
  }

  return new Response('OK', { status: 200 });
}
