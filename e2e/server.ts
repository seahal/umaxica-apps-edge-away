import { serve } from '@hono/node-server';
import { createApp } from '../src/index';
import { createTestKeyPair, defaultClaims, ISSUER, NOW, signToken } from '../test/support/away-jwt';

const port = Number(process.env.E2E_PORT ?? 4173);
const awayOrigin = 'https://away.example.com';
const pair = await createTestKeyPair();
const token = await signToken(pair, defaultClaims());

const app = createApp({
  serviceOrigin: awayOrigin,
  issuers: [{ iss: ISSUER, jwks_uri: `${ISSUER}/.well-known/jwks.json` }],
  now: () => NOW,
  fetchJwks: async () => ({ keys: [pair.publicJwk] }),
});
const server = serve({
  fetch: (request, ...args) => {
    if (new URL(request.url).pathname === '/__e2e/token')
      return new Response(token, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    return app.fetch(request, ...args);
  },
  hostname: '127.0.0.1',
  port,
});

function close() {
  server.close();
}

process.once('SIGINT', close);
process.once('SIGTERM', close);
