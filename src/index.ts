import { handleClerkWebhook } from './webhooks/clerk';

Bun.serve({
  port: process.env.PORT ?? 3000,
  routes: {
    '/webhooks/clerk': {
      POST: handleClerkWebhook,
    },
  },
  fetch(req) {
    return new Response('Not found', { status: 404 });
  },
});

console.log(`Server running on port ${process.env.PORT ?? 3000}`);
