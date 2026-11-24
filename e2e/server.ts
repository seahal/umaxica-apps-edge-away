import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { serve } from '@hono/node-server';
import { createApp } from '../src/index';
import { createTestKeyPair, defaultClaims, ISSUER, NOW, signToken } from '../test/support/away-jwt';

const port = Number(process.env.E2E_PORT ?? 4173);
const awayOrigin = 'https://away.example.com';
const notFoundHtml = await readFile(
  fileURLToPath(new NodeURL('../public/404.html', import.meta.url)),
  'utf8',
);
const pair = await createTestKeyPair();
const token = await signToken(pair, defaultClaims());

const app = createApp({
  serviceOrigin: awayOrigin,
  issuers: [{ iss: ISSUER, jwks_uri: `${ISSUER}/.well-known/jwks.json` }],
  now: () => NOW,
  fetchJwks: async () => ({ keys: [pair.publicJwk] }),
  rateLimiter: { limit: async () => ({ success: true }) },
});
const server = serve({
  fetch: (request) => {
    if (new URL(request.url).pathname === '/__e2e/token')
      return new Response(token, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    const requestUrl = new URL(request.url);
    const headers = new Headers(request.headers);
    headers.set('CF-Connecting-IP', '203.0.113.9');
    const serviceRequest = new Request(`${awayOrigin}${requestUrl.pathname}${requestUrl.search}`, {
      method: request.method,
      headers,
    });
    return app.fetch(serviceRequest, {
      ASSETS: {
        fetch: async (assetRequest: Request) =>
          new URL(assetRequest.url).pathname === '/404.html'
            ? new Response(notFoundHtml, {
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
              })
            : new Response(null, { status: 404 }),
      },
    });
  },
  hostname: '127.0.0.1',
  port,
});

function close() {
  server.close();
}

process.once('SIGINT', close);
process.once('SIGTERM', close);
