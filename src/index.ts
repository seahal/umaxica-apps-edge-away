import { Hono } from 'hono';

const SERVICE = { name: 'away', version: '0.1.0' } as const;

export function createApp() {
  const app = new Hono({ strict: true });
  app.get('/health', (c) =>
    c.json({ status: 'OK', service: SERVICE.name, version: SERVICE.version }),
  );
  return app;
}
