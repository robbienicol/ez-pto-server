import { db } from '../../db';
import type { YogaContext } from '../types';

export async function me(
  _: unknown,
  __: unknown,
  ctx: YogaContext,
) {
  if (!ctx.userId) return null;
  const row = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.clerkId, ctx.userId as string),
  });
  return row ?? null;
}
