import { isIP } from 'node:net';
import { createApp, AWAY_ORIGIN } from './index';
import { logAudit } from './core/audit';
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
    if (url.origin !== AWAY_ORIGIN) return app.fetch(request, env, executionContext);
    // Bound expensive token verification; public explanations, health and assets stay available.
    if (request.method === 'GET' && url.pathname === '/' && url.search) {
      const requestId = crypto.randomUUID();
      const cfRay = request.headers.get('CF-Ray');
      const auditFields = { requestId, ...(cfRay ? { cfRay } : {}) };
      const locale = requestLocale(request.headers.get('Accept-Language'));
      const logRateLimitFailure = (reason: string) =>
        logAudit({
          event: 'away_rate_limit_failed',
          ...auditFields,
          status: 503,
          reason,
        });
      const error = (html: string, status: number, code: string) =>
        withSecurityHeaders(
          new Response(html, {
            status,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'X-Away-Error': code,
              'X-Request-ID': requestId,
              ...(status === 429 ? { 'Retry-After': '60' } : {}),
            },
          }),
        );
      const ip = request.headers.get('CF-Connecting-IP');
      if (!env.AWAY_RATE_LIMITER || typeof env.AWAY_RATE_LIMITER.limit !== 'function') {
        logRateLimitFailure('limiter_unavailable');
        return error(renderUnavailable(locale), 503, 'limiter_unavailable');
      }
      if (!ip || !isIP(ip)) {
        logAudit({
          event: 'away_rejected',
          ...auditFields,
          status: 400,
          reason: 'invalid_client_ip',
        });
        return error(renderError(locale), 400, 'invalid_client_ip');
      }
      const deadline = AbortSignal.timeout(1000);
      let rejectTimeout!: (reason?: unknown) => void;
      let timeoutReason = 'limiter_call_exception';
      const timeout = new Promise<never>((_resolve, reject) => {
        rejectTimeout = reject;
      });
      const onAbort = () => {
        timeoutReason = 'limiter_timeout';
        rejectTimeout(new Error('timeout'));
      };
      deadline.addEventListener('abort', onAbort, { once: true });
      if (deadline.aborted) onAbort();
      try {
        const result = await Promise.race([
          env.AWAY_RATE_LIMITER.limit({ key: limiterKey(ip) }),
          timeout,
        ]);
        if (!result || typeof result.success !== 'boolean') {
          logRateLimitFailure('limiter_invalid_response');
          return error(renderUnavailable(locale), 503, 'limiter_unavailable');
        }
        if (!result.success) {
          logAudit({
            event: 'away_rejected',
            ...auditFields,
            status: 429,
            reason: 'rate_limited',
          });
          return error(renderRateLimited(locale), 429, 'rate_limited');
        }
      } catch {
        logRateLimitFailure(timeoutReason);
        return error(renderUnavailable(locale), 503, 'limiter_unavailable');
      } finally {
        deadline.removeEventListener('abort', onAbort);
      }
      return app.fetch(request, env, executionContext, requestId);
    }
    return app.fetch(request, env, executionContext);
  },
};

/** IPv6 clients usually control a whole /64, so they share one limiter bucket. */
export function limiterKey(ip: string) {
  if (isIP(ip) !== 6) return ip;
  const [left = '', right] = ip.replace(/%.*$/, '').toLowerCase().split('::');
  const width = (groups: string[]) =>
    groups.reduce((total, group) => total + (group.includes('.') ? 2 : 1), 0);
  const head = left ? left.split(':') : [];
  const tail = right ? right.split(':') : [];
  const groups =
    right === undefined
      ? head
      : [...head, ...Array(8 - width(head) - width(tail)).fill('0'), ...tail];
  return `${groups
    .slice(0, 4)
    .map((group) => Number.parseInt(group, 16).toString(16))
    .join(':')}::/64`;
}
