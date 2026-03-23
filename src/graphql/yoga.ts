import { createSchema, createYoga } from 'graphql-yoga';
import { GraphQLError } from 'graphql';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { db } from '../db';
import { users } from '../db/schema';

type YogaContext = {
  userId: string | null;
};

const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkClient = clerkSecretKey
  ? createClerkClient({ secretKey: clerkSecretKey })
  : null;

function getBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
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

async function authenticate(req: Request): Promise<{ userId: string | null }> {
  if (!clerkSecretKey) return { userId: null };

  const token = getCookie(req, '__session') ?? getBearerToken(req);
  if (!token) return { userId: null };

  try {
    const verified = await verifyToken(token, { secretKey: clerkSecretKey });
    const userId = typeof verified?.sub === 'string' ? verified.sub : null;
    return { userId };
  } catch {
    return { userId: null };
  }
}

const typeDefs = /* GraphQL */ `
  type User {
    id: ID!
    clerkId: String!
    email: String!
    name: String!
  }

  type Query {
    me: User
  }

  type Mutation {
    """
    Updates the user's email in Clerk and mirrors it to the local DB.
    """
    changeEmail(newEmail: String!): User!
    """
    Updates only the email column for the signed-in user in the local database.
    Does not call Clerk — use when you manage email elsewhere or want a manual DB fix.
    """
    changeEmailInDb(newEmail: String!): User!
  }
`;

const resolvers = {
  Query: {
    me: async (_: unknown, __: unknown, ctx: YogaContext) => {
      if (!ctx.userId) return null;
      const row = await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.clerkId, ctx.userId as string),
      });
      return row ?? null;
    },
  },
  Mutation: {
    changeEmail: async (
      _: unknown,
      args: { newEmail: string },
      ctx: YogaContext,
    ) => {
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
    },

    changeEmailInDb: async (
      _: unknown,
      args: { newEmail: string },
      ctx: YogaContext,
    ) => {
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
    },
  },
};

export const yoga = createYoga<YogaContext>({
  graphqlEndpoint: '/graphql',
  graphiql: process.env.NODE_ENV !== 'production',
  schema: createSchema({
    typeDefs,
    resolvers,
  }),
  context: async ({ request }): Promise<YogaContext> => {
    const { userId } = await authenticate(request);
    return { userId };
  },
});

