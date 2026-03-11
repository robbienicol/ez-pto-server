import { handleClerkWebhook } from './webhooks/clerk';
import { yoga } from './graphql/yoga';

Bun.serve({
  hostname: '0.0.0.0',
  port: process.env.PORT ?? 3000,
  routes: {
    '/graphql': {
      GET: (req) => yoga.fetch(req),
      POST: (req) => yoga.fetch(req),
      OPTIONS: (req) => yoga.fetch(req),
    },
    '/webhooks/clerk': {
      POST: handleClerkWebhook,
    },
  },
  fetch(req) {
    return new Response('Not found', { status: 404 });
  },
});

console.log(`Server running on port ${process.env.PORT ?? 3000}`);
