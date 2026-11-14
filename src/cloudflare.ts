import { isIP } from 'node:net';
import { createApp } from './index';
import { renderError, renderRateLimited, renderUnavailable, requestLocale } from './core/page';
import { withSecurityHeaders } from './core/security_headers';

export type CloudflareEnv = {
  AWAY_RATE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  ASSETS?: { fetch(request: Request): Promise<Response> };
};
const app = createApp();

export default {
  async fetch(request: Request, env: CloudflareEnv, executionContext: ExecutionContext) {
    const url = new URL(request.url);
    // Bound expensive token verification; public explanations, health and assets stay available.
    if (request.method === 'GET' && url.pathname === '/' && url.search) {
      const locale = requestLocale(request.headers.get('Accept-Language'));
      const error = (html: string, status: number, code: string) =>
        withSecurityHeaders(
          new Response(html, {
            status,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'X-Away-Error': code,
              ...(status === 429 ? { 'Retry-After': '60' } : {}),
            },
          }),
        );
      const ip = request.headers.get('CF-Connecting-IP');
      if (!env.AWAY_RATE_LIMITER || typeof env.AWAY_RATE_LIMITER.limit !== 'function')
        return error(renderUnavailable(locale), 503, 'limiter_unavailable');
      if (!ip || !isIP(ip)) return error(renderError(locale), 400, 'invalid_client_ip');
      const deadline = AbortSignal.timeout(1000);
      try {
        const result = await Promise.race([
          env.AWAY_RATE_LIMITER.limit({ key: ip }),
          new Promise<never>((_resolve, reject) =>
            deadline.addEventListener('abort', () => reject(new Error('timeout')), { once: true }),
          ),
        ]);
        if (!result || typeof result.success !== 'boolean')
          return error(renderUnavailable(locale), 503, 'limiter_unavailable');
        if (!result.success) return error(renderRateLimited(locale), 429, 'rate_limited');
      } catch {
        if (deadline.aborted) return error(renderUnavailable(locale), 503, 'limiter_unavailable');
        // Match Jump: only a configured limiter's call exception fails open.
        // eslint-disable-next-line no-console -- coarse limiter outcome only.
        console.warn(
          JSON.stringify({ event: 'away_rate_limit_skipped', reason: 'limiter_call_exception' }),
        );
      }
    }
    return app.fetch(request, env, executionContext);
  },
};
