import { isIP } from 'node:net';
import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ISSUERS } from './config/issuers';
import { logAudit } from './core/audit';
import { normalizeDestination } from './core/destination';
import { fetchIssuerJwks } from './core/fetch_jwks';
import { JwksCache, type FetchJwks } from './core/jwks_cache';
import { limiterKey, type RateLimiter } from './core/rate_limit';
import {
  renderAbout,
  renderError,
  renderInterstitial,
  renderRateLimited,
  renderUnavailable,
  requestLocale,
} from './core/page';
import { ABOUT_CSS, AWAY_CSS, withSecurityHeaders } from './core/security_headers';
import type { IssuerConfig } from './core/types';
import { AwayError } from './core/types';
import { verifyAwayJwt } from './core/verify_jwt';

const SERVICE = { name: 'away', version: '0.1.0' } as const;
export const AWAY_ORIGIN = 'https://away.umaxica.net';
const ENTRY_QUERY = /^\?at=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const PREFETCH_HEADERS = ['Sec-Purpose', 'X-Sec-Purpose', 'Purpose', 'X-Purpose', 'X-Moz'];
const FETCH_SITES = new Set(['cross-site', 'same-origin', 'same-site', 'none']);

export type AppOptions = {
  serviceOrigin?: string;
  issuers?: readonly IssuerConfig[];
  fetchJwks?: FetchJwks;
  jwksCache?: JwksCache;
  now?: () => number;
  rateLimiter?: RateLimiter;
};

export function createApp(options: AppOptions = {}) {
  const serviceOrigin = validateServiceOrigin(options.serviceOrigin ?? AWAY_ORIGIN);
  const issuers = new Map<string, IssuerConfig>();
  for (const issuer of options.issuers ?? ISSUERS) {
    validateIssuer(issuer, serviceOrigin);
    if (issuers.has(issuer.iss)) throw new Error('duplicate issuer');
    issuers.set(issuer.iss, issuer);
  }
  if (issuers.size === 0 || issuers.size > 32) throw new Error('issuer list size rejected');
  const jwksCache = options.jwksCache ?? new JwksCache(options.fetchJwks ?? fetchIssuerJwks);

  const app = new Hono<{
    Bindings: {
      ASSETS?: { fetch(request: Request): Promise<Response> };
      AWAY_RATE_LIMITER?: RateLimiter;
    };
    Variables: { requestId: string; issuer: string };
  }>({ strict: true });

  // This outer middleware owns request correlation and response hardening.
  app.use('*', async (c, next) => {
    const requestId = crypto.randomUUID();
    c.set('requestId', requestId);
    await next();
    let response = withSecurityHeaders(c.res);
    response.headers.set('X-Request-ID', requestId);
    if (c.req.method === 'HEAD') {
      response = new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }
    c.res = response;
  });

  // Origin is checked before any request consumes a rate-limit unit.
  app.use('*', async (c, next) => {
    if (new URL(c.req.url).origin !== serviceOrigin) {
      const locale = requestLocale(c.req.header('Accept-Language') ?? null);
      const cfRay = c.req.header('CF-Ray');
      logAudit({
        event: 'away_rejected',
        requestId: c.get('requestId'),
        ...(cfRay ? { cfRay } : {}),
        status: 421,
        reason: 'invalid_origin',
      });
      return publicHtml(c, renderError(locale), 421, 'invalid_origin');
    }
    await next();
  });

  app.use('*', async (c, next) => {
    const requestId = c.get('requestId');
    const cfRay = c.req.header('CF-Ray');
    const auditFields = { requestId, ...(cfRay ? { cfRay } : {}) };
    const locale = requestLocale(c.req.header('Accept-Language') ?? null);
    const unavailable = (reason: string) => {
      logAudit({
        event: 'away_rate_limit_failed',
        ...auditFields,
        status: 503,
        reason,
      });
      return publicHtml(c, renderUnavailable(locale), 503, 'limiter_unavailable');
    };
    const limiter = options.rateLimiter ?? c.env?.AWAY_RATE_LIMITER;
    if (!limiter || typeof limiter.limit !== 'function') return unavailable('limiter_unavailable');

    const ip = c.req.header('CF-Connecting-IP');
    if (!ip || !isIP(ip)) {
      logAudit({
        event: 'away_rejected',
        ...auditFields,
        status: 400,
        reason: 'invalid_client_ip',
      });
      return publicHtml(c, renderError(locale), 400, 'invalid_client_ip');
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
    let result: unknown;
    try {
      result = await Promise.race([limiter.limit({ key: limiterKey(ip) }), timeout]);
    } catch {
      return unavailable(timeoutReason);
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }

    if (
      typeof result !== 'object' ||
      result === null ||
      !('success' in result) ||
      typeof result.success !== 'boolean'
    )
      return unavailable('limiter_invalid_response');
    if (!result.success) {
      logAudit({
        event: 'away_rejected',
        ...auditFields,
        status: 429,
        reason: 'rate_limited',
      });
      const response = publicHtml(c, renderRateLimited(locale), 429, 'rate_limited');
      response.headers.set('Retry-After', '60');
      return response;
    }

    await next();
  });

  app.get('/favicon.ico', (c) => {
    if (!c.env?.ASSETS) return serveNotFound(c);
    return c.env.ASSETS.fetch(c.req.raw);
  });

  app.get('/health', (c) =>
    c.json({ status: 'OK', service: SERVICE.name, version: SERVICE.version }),
  );
  app.get('/assets/away.css', (c) =>
    c.body(AWAY_CSS, 200, { 'Content-Type': 'text/css; charset=utf-8' }),
  );
  app.get('/assets/about.css', (c) =>
    c.body(ABOUT_CSS, 200, { 'Content-Type': 'text/css; charset=utf-8' }),
  );
  app.get('/about', (c) =>
    c.html(renderAbout(requestLocale(c.req.header('Accept-Language') ?? null))),
  );
  app.all('/', async (c) => {
    const url = new URL(c.req.url);
    if (!url.search) return serveNotFound(c);

    const locale = requestLocale(c.req.header('Accept-Language') ?? null);
    const cfRay = c.req.header('CF-Ray');
    const auditFields = {
      requestId: c.get('requestId'),
      ...(cfRay ? { cfRay } : {}),
    };
    if (c.req.method !== 'GET') {
      const response = c.body(null, 405);
      response.headers.set('Allow', 'GET');
      response.headers.set('X-Away-Error', 'method_not_allowed');
      return response;
    }

    if (!isAllowedEntryMetadata(c.req.raw.headers)) {
      logAudit({
        event: 'away_rejected',
        ...auditFields,
        status: 400,
        reason: 'invalid_fetch_metadata',
      });
      return publicHtml(c, renderError(locale), 400, 'invalid_fetch_metadata');
    }

    let token: string;
    try {
      token = readEntryToken(url);
    } catch {
      logAudit({
        event: 'away_rejected',
        ...auditFields,
        status: 400,
        reason: 'malformed',
      });
      return publicHtml(c, renderError(locale), 400, 'malformed');
    }

    try {
      const verified = await verifyAwayJwt(token, {
        issuers,
        jwksCache,
        audience: serviceOrigin,
        now: options.now?.() ?? Math.floor(Date.now() / 1000),
        signal: c.req.raw.signal,
      });
      c.set('issuer', verified.issuer.iss);
      const destination = normalizeDestination(verified.claim.url, serviceOrigin);
      logAudit({
        event: 'away_accepted',
        ...auditFields,
        status: 200,
        iss: verified.issuer.iss,
      });
      return publicHtml(c, renderInterstitial(destination, verified.issuer.iss, locale), 200);
    } catch (error) {
      const awayError = error instanceof AwayError ? error : new AwayError('internal_error');
      const status =
        awayError.code === 'jwks_unavailable'
          ? 503
          : awayError.code === 'jwks_bad_gateway'
            ? 502
            : awayError.code === 'internal_error'
              ? 500
              : 400;
      logAudit({
        event: 'away_rejected',
        ...auditFields,
        status,
        iss: c.get('issuer'),
        reason: awayError.code,
      });
      return status === 503 || status === 502
        ? publicHtml(c, renderUnavailable(locale), status, awayError.code)
        : publicHtml(c, renderError(locale), status, awayError.code);
    }
  });

  app.notFound((c) => serveNotFound(c));

  app.onError((_error, c) => {
    const locale = requestLocale(c.req.header('Accept-Language') ?? null);
    const cfRay = c.req.header('CF-Ray');
    logAudit({
      event: 'away_rejected',
      requestId: c.get('requestId'),
      ...(cfRay ? { cfRay } : {}),
      status: 500,
      iss: c.get('issuer'),
      reason: 'internal_error',
    });
    return publicHtml(c, renderError(locale), 500, 'internal_error');
  });

  return {
    request(input: RequestInfo | URL, init?: RequestInit, env?: object) {
      return app.request(
        input instanceof Request ? input : new URL(input, serviceOrigin),
        init,
        env,
      );
    },
    fetch(request: Request, env?: object, ctx?: ExecutionContext) {
      return app.fetch(request, env, ctx);
    },
  };
}

function publicHtml(
  context: Context,
  html: string,
  status: ContentfulStatusCode,
  errorCode?: string,
) {
  const response = context.html(html, status);
  response.headers.set('Content-Type', 'text/html; charset=utf-8');
  if (errorCode) response.headers.set('X-Away-Error', publicErrorCode(errorCode));
  return response;
}

async function serveNotFound(context: Context) {
  const method = context.req.method;
  const acceptsJson = context.req
    .header('Accept')
    ?.split(',')
    .some((mediaType) => mediaType.split(';', 1)[0]?.trim().toLowerCase() === 'application/json');
  const assets = context.env?.ASSETS;
  if ((method !== 'GET' && method !== 'HEAD') || acceptsJson || !assets)
    return context.body(null, 404);

  const assetUrl = new URL('/404.html', context.req.url);
  const asset = await assets.fetch(new Request(assetUrl, { headers: context.req.raw.headers }));
  return new Response(asset.body, { status: 404, headers: asset.headers });
}

// Token rejection details stay in logs; clients only learn the coarse outcome.
const PUBLIC_ERROR_CODES = new Set([
  'internal_error',
  'jwks_bad_gateway',
  'jwks_unavailable',
  'limiter_unavailable',
  'rate_limited',
  'invalid_client_ip',
]);

function publicErrorCode(code: string) {
  return PUBLIC_ERROR_CODES.has(code) || code === 'method_not_allowed' ? code : 'rejected';
}

function readEntryToken(url: URL) {
  if (url.search.length > 4100 || !ENTRY_QUERY.test(url.search))
    throw new AwayError('malformed', 'entry query rejected');
  return url.search.slice('?at='.length);
}

function validateServiceOrigin(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('invalid service origin');
  }
  if (value !== url.origin || url.protocol !== 'https:' || url.port || url.hostname.endsWith('.'))
    throw new Error('invalid service origin');
  return url.origin;
}

function validateIssuer(issuer: IssuerConfig, serviceOrigin: string) {
  let url: URL;
  try {
    url = new URL(issuer.iss);
  } catch {
    throw new Error('invalid issuer');
  }
  if (
    issuer.iss === serviceOrigin ||
    url.protocol !== 'https:' ||
    issuer.iss !== url.origin ||
    issuer.jwks_uri !== `${issuer.iss}/.well-known/jwks.json`
  )
    throw new Error('invalid issuer');
}

function isAllowedEntryMetadata(headers: Headers) {
  if (PREFETCH_HEADERS.some((name) => headers.has(name))) return false;
  if (![...headers.keys()].some((name) => name.startsWith('sec-fetch-'))) return true;
  const site = headers.get('Sec-Fetch-Site');
  const user = headers.get('Sec-Fetch-User');
  return (
    headers.get('Sec-Fetch-Mode') === 'navigate' &&
    headers.get('Sec-Fetch-Dest') === 'document' &&
    site !== null &&
    FETCH_SITES.has(site) &&
    (user === null || user === '?1')
  );
}
