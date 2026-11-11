import { describe, expect, it, vi } from 'vitest';
import worker, { type CloudflareEnv } from '../src/cloudflare';
import { renderRateLimited } from '../src/core/page';
const ctx = {} as ExecutionContext;
const request = (ip = '203.0.113.1') =>
  new Request('https://away.umaxica.net/?at=a.b.c', { headers: { 'CF-Connecting-IP': ip } });
describe('Away Worker rate limiting', () => {
  it('rejects excess requests before token verification with secure localized HTML', async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const response = await worker.fetch(request(), { AWAY_RATE_LIMITER: { limit } }, ctx);
    expect(response.status).toBe(429);
    expect(limit).toHaveBeenCalledWith({ key: '203.0.113.1' });
    expect(response.headers.get('retry-after')).toBe('60');
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toContain('アクセスが集中しています');
    expect(renderRateLimited('en')).toContain('Too many requests');
  });
  it('lets allowed requests reach token validation', async () => {
    expect(
      (
        await worker.fetch(
          request('2001:db8::1'),
          { AWAY_RATE_LIMITER: { limit: async () => ({ success: true }) } },
          ctx,
        )
      ).status,
    ).toBe(400);
  });
  it('rejects missing bindings, malformed responses and invalid client IPs', async () => {
    expect((await worker.fetch(request(), {}, ctx)).status).toBe(503);
    const env = { AWAY_RATE_LIMITER: { limit: async () => null } } as unknown as CloudflareEnv;
    expect((await worker.fetch(request(), env, ctx)).status).toBe(503);
    const limiter = { AWAY_RATE_LIMITER: { limit: async () => ({ success: true }) } };
    expect((await worker.fetch(request('not-an-ip'), limiter, ctx)).status).toBe(400);
    expect((await worker.fetch(request(''), limiter, ctx)).status).toBe(400);
  });
  it('fails open only for call exceptions and bounds a hanging limiter', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const response = await worker.fetch(
        request(),
        {
          AWAY_RATE_LIMITER: {
            limit: async () => {
              throw new Error('private detail');
            },
          },
        },
        ctx,
      );
      expect(response.status).toBe(400);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(warn.mock.calls)).not.toContain('private detail');
      const timeout = await worker.fetch(
        request(),
        { AWAY_RATE_LIMITER: { limit: async () => new Promise(() => {}) } },
        ctx,
      );
      expect(timeout.status).toBe(503);
    } finally {
      warn.mockRestore();
    }
  });
  it('keeps public pages and non-GET requests outside the token limiter', async () => {
    for (const path of ['/', '/about', '/health', '/assets/away.css']) {
      expect(
        (await worker.fetch(new Request(`https://away.umaxica.net${path}`), {}, ctx)).status,
      ).toBeLessThan(400);
    }
    expect(
      (
        await worker.fetch(
          new Request('https://away.umaxica.net/?at=a.b.c', { method: 'POST' }),
          {},
          ctx,
        )
      ).status,
    ).toBe(405);
  });
});
