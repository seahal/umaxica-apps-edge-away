import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ISSUERS } from './config/issuers';
import { logAudit } from './core/audit';
import { normalizeDestination } from './core/destination';
import { fetchIssuerJwks } from './core/fetch_jwks';
import { JwksCache, type FetchJwks } from './core/jwks_cache';
import {
  renderAbout,
  renderError,
  renderInterstitial,
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
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PREFETCH_HEADERS = ['Sec-Purpose', 'X-Sec-Purpose', 'Purpose', 'X-Purpose', 'X-Moz'];
const FETCH_SITES = new Set(['cross-site', 'same-origin', 'same-site', 'none']);

export type AppOptions = {
  serviceOrigin?: string;
  issuers?: readonly IssuerConfig[];
  fetchJwks?: FetchJwks;
  jwksCache?: JwksCache;
  now?: () => number;
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
  const internalRequestIds = new WeakMap<Request, string>();

  const app = new Hono<{
    Bindings: { ASSETS?: { fetch(request: Request): Promise<Response> } };
    Variables: { requestId: string; issuer: string };
  }>({ strict: true });
  app.use('*', async (c, next) => {
    const requestId = internalRequestIds.get(c.req.raw) ?? crypto.randomUUID();
    c.set('requestId', requestId);
    if (new URL(c.req.url).origin !== serviceOrigin) {
      const locale = requestLocale(c.req.header('Accept-Language') ?? null);
      const cfRay = c.req.header('CF-Ray');
      c.res = publicHtml(c, renderError(locale), 421, 'invalid_origin');
      logAudit({
        event: 'away_rejected',
        requestId,
        ...(cfRay ? { cfRay } : {}),
        status: 421,
        reason: 'invalid_origin',
      });
    } else {
      await next();
    }
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

  app.get('/favicon.ico', (c) => {
    if (!c.env?.ASSETS) return c.notFound();
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

    const url = new URL(c.req.url);
    if (!url.search) return c.notFound();

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
    fetch(request: Request, env?: object, ctx?: ExecutionContext, requestId?: string) {
      if (requestId && REQUEST_ID.test(requestId)) internalRequestIds.set(request, requestId);
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

// Token rejection details stay in logs; clients only learn the coarse outcome.
const PUBLIC_ERROR_CODES = new Set(['internal_error', 'jwks_bad_gateway', 'jwks_unavailable']);

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
