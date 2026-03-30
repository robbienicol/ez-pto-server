import { createSchema, createYoga } from 'graphql-yoga';
import { authenticate } from './auth';
import { resolvers } from './resolvers';
import { typeDefs } from './typeDefs';
import type { YogaContext } from './types';

export type { YogaContext } from './types';

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
