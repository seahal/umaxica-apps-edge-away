import { describe, expect, it, vi } from 'vite-plus/test';
import worker, { limiterKey, type CloudflareEnv } from '../src/cloudflare';
import { renderRateLimited } from '../src/core/page';
const ctx = {} as ExecutionContext;
const request = (ip = '203.0.113.1', headers: HeadersInit = {}) =>
  new Request('https://away.umaxica.net/?at=a.b.c', {
    headers: { 'CF-Connecting-IP': ip, ...Object.fromEntries(new Headers(headers)) },
  });
describe('Away Worker rate limiting', () => {
  it('rejects excess requests before token verification with secure localized HTML', async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const response = await worker.fetch(request(), { AWAY_RATE_LIMITER: { limit } }, ctx);
    expect(response.status).toBe(429);
    expect(limit).toHaveBeenCalledWith({ key: '203.0.113.1' });
    expect(response.headers.get('retry-after')).toBe('60');
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/i);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
    const html = await response.text();
    expect(html).toContain('アクセスが集中しています');
    expect(html).toContain('<meta name="robots" content="noindex,nofollow,noarchive">');
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
  it('keys IPv6 clients by /64 prefix', async () => {
    const limit = vi.fn(async () => ({ success: false }));
    await worker.fetch(request('2001:DB8:1:2:aaaa::1'), { AWAY_RATE_LIMITER: { limit } }, ctx);
    expect(limit).toHaveBeenCalledWith({ key: '2001:db8:1:2::/64' });
    expect(limiterKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(limiterKey('2001:db8:0:0:1:2:3:4')).toBe('2001:db8:0:0::/64');
    expect(limiterKey('::ffff:192.0.2.1')).toBe('0:0:0:0::/64');
    expect(limiterKey('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
    expect(limiterKey('::')).toBe('0:0:0:0::/64');
    expect(limiterKey('192.0.2.1')).toBe('192.0.2.1');
  });
  it('fails closed for call exceptions and bounds a hanging limiter', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const response = await worker.fetch(
        request('203.0.113.1', { 'CF-Ray': 'ray-test' }),
        {
          AWAY_RATE_LIMITER: {
            limit: async () => {
              throw new Error('private detail');
            },
          },
        },
        ctx,
      );
      expect(response.status).toBe(503);
      expect(response.headers.get('x-away-error')).toBe('limiter_unavailable');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(warn.mock.calls)).not.toContain('private detail');
      const audit = JSON.parse(String(warn.mock.calls[0]?.[0]));
      expect(audit).toMatchObject({
        event: 'away_rate_limit_failed',
        request_id: response.headers.get('x-request-id'),
        status: 503,
        cf_ray: 'ray-test',
        reason: 'limiter_call_exception',
      });
      expect(JSON.stringify(audit)).not.toContain('203.0.113.1');
      const timeout = await worker.fetch(
        request(),
        { AWAY_RATE_LIMITER: { limit: async () => new Promise(() => {}) } },
        ctx,
      );
      expect(timeout.status).toBe(503);
      expect(JSON.parse(String(warn.mock.calls[1]?.[0])).reason).toBe('limiter_timeout');
    } finally {
      warn.mockRestore();
    }
  });
  it('handles a timeout signal that was already aborted', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort());
    try {
      const response = await worker.fetch(
        request(),
        { AWAY_RATE_LIMITER: { limit: async () => new Promise(() => {}) } },
        ctx,
      );
      expect(timeout).toHaveBeenCalledOnce();
      expect(timeout.mock.results[0]?.value.aborted).toBe(true);
      expect(warn.mock.calls).toHaveLength(1);
      expect(response.status).toBe(503);
      expect(JSON.parse(String(warn.mock.calls[0]?.[0])).reason).toBe('limiter_timeout');
    } finally {
      timeout.mockRestore();
      warn.mockRestore();
    }
  });
  it('keeps public pages and non-GET requests outside the token limiter', async () => {
    expect((await worker.fetch(new Request('https://away.umaxica.net/'), {}, ctx)).status).toBe(
      404,
    );
    for (const path of ['/about', '/health', '/assets/away.css'])
      expect(
        (await worker.fetch(new Request(`https://away.umaxica.net${path}`), {}, ctx)).status,
      ).toBeLessThan(400);
    expect(
      (
        await worker.fetch(
          new Request('https://away.umaxica.net/?at=a.b.c', { method: 'POST' }),
          {},
          ctx,
        )
      ).status,
    ).toBe(405);
    const head = await worker.fetch(
      new Request('https://away.umaxica.net/', { method: 'HEAD' }),
      {},
      ctx,
    );
    expect(head.status).toBe(405);
    expect(head.body).toBeNull();
  });
});
