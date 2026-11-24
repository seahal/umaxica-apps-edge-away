import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import worker from '../src/cloudflare';
import { createApp, AWAY_ORIGIN } from '../src/index';
import { limiterKey } from '../src/core/rate_limit';
import { renderRateLimited } from '../src/core/page';

const ctx = {} as ExecutionContext;
const request = (path = '/', ip = '203.0.113.1', headers: HeadersInit = {}) =>
  new Request(`${AWAY_ORIGIN}${path}`, {
    headers: { 'CF-Connecting-IP': ip, ...Object.fromEntries(new Headers(headers)) },
  });

afterEach(() => vi.restoreAllMocks());

describe('Away Hono rate-limit middleware', () => {
  it.each(['/', '/about', '/health', '/not-found', '/assets/away.css'])(
    'limits dynamic route %s before its handler',
    async (path) => {
      const info = vi.spyOn(console, 'info').mockImplementation(() => {});
      const limit = vi.fn(async () => ({ success: false }));
      const response = await worker.fetch(
        request(path, '203.0.113.1', { 'CF-Ray': 'ray-limit-test' }),
        { AWAY_RATE_LIMITER: { limit } },
        ctx,
      );

      expect(response.status).toBe(429);
      expect(response.headers.get('retry-after')).toBe('60');
      expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/i);
      expect(response.headers.get('x-away-error')).toBe('rate_limited');
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(limit).toHaveBeenCalledWith({ key: '203.0.113.1' });
      expect(await response.text()).toContain(
        '<meta name="robots" content="noindex,nofollow,noarchive">',
      );
      expect(renderRateLimited('en')).toContain('Too many requests');
      const audit = JSON.parse(String(info.mock.calls[0]?.[0]));
      expect(audit).toMatchObject({
        event: 'away_rejected',
        request_id: response.headers.get('x-request-id'),
        status: 429,
        cf_ray: 'ray-limit-test',
        reason: 'rate_limited',
      });
      expect(JSON.stringify(audit)).not.toContain('203.0.113.1');
    },
  );

  it('passes the Cloudflare binding to Hono and allows route execution', async () => {
    const limit = vi.fn(async () => ({ success: true }));
    const response = await worker.fetch(request('/health'), { AWAY_RATE_LIMITER: { limit } }, ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'OK', service: 'away', version: '0.1.0' });
    expect(limit).toHaveBeenCalledWith({ key: '203.0.113.1' });
  });

  it('supports an injected limiter and checks origin before calling it', async () => {
    const limit = vi.fn(async () => ({ success: true }));
    const app = createApp({ rateLimiter: { limit } });
    const allowed = await app.request('/health', {
      headers: { 'CF-Connecting-IP': '203.0.113.10' },
    });
    expect(allowed.status).toBe(200);
    expect(limit).toHaveBeenCalledWith({ key: '203.0.113.10' });

    limit.mockClear();
    const mismatched = await app.request('https://preview.away.example.com/health', {
      headers: { 'CF-Connecting-IP': '203.0.113.10' },
    });
    expect(mismatched.status).toBe(421);
    expect(limit).not.toHaveBeenCalled();
  });

  it('fails closed when the binding is missing or has no callable limit method', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const missing = await worker.fetch(request('/health', '203.0.113.1'), {}, ctx);
    expect(missing.status).toBe(503);
    expect(missing.headers.get('x-away-error')).toBe('limiter_unavailable');
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toMatchObject({
      event: 'away_rate_limit_failed',
      request_id: missing.headers.get('x-request-id'),
      status: 503,
      reason: 'limiter_unavailable',
    });

    const invalid = await worker.fetch(
      request('/about', '203.0.113.1'),
      { AWAY_RATE_LIMITER: { limit: undefined } } as never,
      ctx,
    );
    expect(invalid.status).toBe(503);
    expect(JSON.parse(String(warn.mock.calls[1]?.[0])).reason).toBe('limiter_unavailable');
  });

  it.each([null, {}, { success: 'true' }, 'invalid'])(
    'fails closed for malformed limiter response %j',
    async (result) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const response = await worker.fetch(
        request('/about'),
        { AWAY_RATE_LIMITER: { limit: async () => result } },
        ctx,
      );
      expect(response.status).toBe(503);
      expect(JSON.parse(String(warn.mock.calls[0]?.[0])).reason).toBe('limiter_invalid_response');
    },
  );

  it('returns 400 for a missing or invalid client IP before calling the limiter', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const limit = vi.fn(async () => ({ success: true }));
    for (const ip of ['', 'not-an-ip']) {
      const response = await worker.fetch(
        request('/health', ip),
        { AWAY_RATE_LIMITER: { limit } },
        ctx,
      );
      expect(response.status).toBe(400);
      expect(response.headers.get('x-away-error')).toBe('invalid_client_ip');
    }
    expect(limit).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledTimes(2);
  });

  it('uses IPv4 addresses and canonical IPv6 /64 prefixes as limiter keys', async () => {
    const limit = vi.fn(async () => ({ success: true }));
    const ipv6 = await worker.fetch(
      request('/health', '2001:DB8:1:2:aaaa::1'),
      { AWAY_RATE_LIMITER: { limit } },
      ctx,
    );
    expect(ipv6.status).toBe(200);
    expect(limit).toHaveBeenCalledWith({ key: '2001:db8:1:2::/64' });
    expect(limiterKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(limiterKey('2001:db8:0:0:1:2:3:4')).toBe('2001:db8:0:0::/64');
    expect(limiterKey('::ffff:192.0.2.1')).toBe('0:0:0:0::/64');
    expect(limiterKey('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
    expect(limiterKey('::')).toBe('0:0:0:0::/64');
    expect(limiterKey('192.0.2.1')).toBe('192.0.2.1');
  });

  it('fails closed for limiter exceptions and removes an aborted timeout listener', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = await worker.fetch(
      request('/health', '203.0.113.1', { 'CF-Ray': 'ray-error-test' }),
      {
        AWAY_RATE_LIMITER: {
          limit: async () => {
            throw new Error('private detail');
          },
        },
      },
      ctx,
    );
    expect(error.status).toBe(503);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private detail');
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toMatchObject({
      event: 'away_rate_limit_failed',
      request_id: error.headers.get('x-request-id'),
      status: 503,
      cf_ray: 'ray-error-test',
      reason: 'limiter_call_exception',
    });

    const deadline = AbortSignal.abort();
    const removeListener = vi.spyOn(deadline, 'removeEventListener');
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline);
    const timedOut = await worker.fetch(
      request('/about'),
      { AWAY_RATE_LIMITER: { limit: async () => new Promise(() => {}) } },
      ctx,
    );
    expect(timedOut.status).toBe(503);
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(JSON.parse(String(warn.mock.calls[1]?.[0])).reason).toBe('limiter_timeout');
    timeout.mockRestore();
  });

  it('keeps the response body empty for HEAD, after rate limiting', async () => {
    const response = await worker.fetch(
      request('/', '203.0.113.1'),
      { AWAY_RATE_LIMITER: { limit: async () => ({ success: true }) } },
      ctx,
    );
    expect(response.status).toBe(404);
    const head = await worker.fetch(
      new Request(`${AWAY_ORIGIN}/health`, {
        method: 'HEAD',
        headers: { 'CF-Connecting-IP': '203.0.113.1' },
      }),
      { AWAY_RATE_LIMITER: { limit: async () => ({ success: true }) } },
      ctx,
    );
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
  });
});
