import { GraphQLError } from 'graphql';
import { db } from '../../../db';
import { users } from '../../../db/schema';
import { clerkClient } from '../../auth';
import type { YogaContext } from '../../types';

export async function changeEmail(
  _: unknown,
  args: { newEmail: string },
  ctx: YogaContext,
) {
  if (!ctx.userId) {
    throw new GraphQLError('Not authenticated', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }
  if (!clerkClient) {
    throw new GraphQLError('Server missing CLERK_SECRET_KEY', {
      extensions: { code: 'MISCONFIGURED' },
    });
  }

  const newEmail = args.newEmail.trim().toLowerCase();
  if (!newEmail || !newEmail.includes('@')) {
    throw new GraphQLError('Invalid email', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  // NOTE: This marks the new email as verified. For production, you typically
  // want a verification flow (Clerk UI/custom flow) and then only switch primary.
  const email = await clerkClient.emailAddresses.createEmailAddress({
    userId: ctx.userId,
    emailAddress: newEmail,
    primary: true,
    verified: true,
  });

  await clerkClient.users.updateUser(ctx.userId, {
    primaryEmailAddressID: email.id,
    notifyPrimaryEmailAddressChanged: true,
  });

  const clerkUser = await clerkClient.users.getUser(ctx.userId);
  const name = `${clerkUser.firstName ?? ''} ${clerkUser.lastName ?? ''}`.trim();

  const [row] = await db
    .insert(users)
    .values({
      clerkId: ctx.userId,
      email: newEmail,
      name,
    })
    .onConflictDoUpdate({
      target: users.clerkId,
      set: {
        email: newEmail,
        name,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!row) {
    throw new GraphQLError('Failed to update user record', {
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    });
  }

  return row;
}

export async function changeEmailInDb(
  _: unknown,
  args: { newEmail: string },
  ctx: YogaContext,
) {
  if (!ctx.userId) {
    throw new GraphQLError('Not authenticated', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }

  const newEmail = args.newEmail.trim().toLowerCase();
  if (!newEmail || !newEmail.includes('@')) {
    throw new GraphQLError('Invalid email', {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  const existing = await db.query.users.findFirst({
    where: (u, { eq: eqCol }) => eqCol(u.clerkId, ctx.userId as string),
  });

  const name = existing?.name ?? '';

  const [row] = await db
    .insert(users)
    .values({
      clerkId: ctx.userId,
      email: newEmail,
      name,
    })
    .onConflictDoUpdate({
      target: users.clerkId,
      set: {
        email: newEmail,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!row) {
    throw new GraphQLError('Failed to update user record', {
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    });
  }

  return row;
}
