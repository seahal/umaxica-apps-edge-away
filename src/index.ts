import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ISSUERS } from './config/issuers';
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

  const app = new Hono<{ Bindings: { ASSETS?: { fetch(request: Request): Promise<Response> } } }>({
    strict: true,
  });
  app.use('*', async (c, next) => {
    await next();
    c.res = withSecurityHeaders(c.res);
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
    if (c.req.method !== 'GET') {
      const response = c.html(renderError(locale), 405);
      response.headers.set('Allow', 'GET');
      response.headers.set('X-Away-Error', 'method_not_allowed');
      return response;
    }

    if (!new URL(c.req.url).search) return c.redirect('/about', 302);

    let token: string;
    try {
      token = readEntryToken(new URL(c.req.url));
    } catch {
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
      const destination = normalizeDestination(verified.claim.url, serviceOrigin);
      logDecision('accepted', verified.issuer.iss, destination.hostname);
      return publicHtml(c, renderInterstitial(destination, verified.issuer.iss, locale), 200);
    } catch (error) {
      const awayError = error instanceof AwayError ? error : new AwayError('internal_error');
      logDecision('rejected', undefined, undefined, awayError.code);
      return awayError.code === 'jwks_unavailable'
        ? publicHtml(c, renderUnavailable(locale), 503, awayError.code)
        : awayError.code === 'jwks_bad_gateway'
          ? publicHtml(c, renderUnavailable(locale), 502, awayError.code)
          : publicHtml(
              c,
              renderError(locale),
              awayError.code === 'internal_error' ? 500 : 400,
              awayError.code,
            );
    }
  });

  app.onError((_error, c) => {
    const locale = requestLocale(c.req.header('Accept-Language') ?? null);
    return publicHtml(c, renderError(locale), 500, 'internal_error');
  });

  return {
    request: app.request.bind(app),
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
  if (errorCode) response.headers.set('X-Away-Error', errorCode);
  return response;
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

function logDecision(
  result: 'accepted' | 'rejected',
  issuer?: string,
  destinationHost?: string,
  reason?: string,
) {
  // eslint-disable-next-line no-console -- only configured issuer, host and coarse decision.
  console.info(
    JSON.stringify({
      event: `away_${result}`,
      result,
      ...(issuer ? { iss: issuer } : {}),
      ...(destinationHost ? { dst_host: destinationHost } : {}),
      ...(reason ? { reason } : {}),
    }),
  );
}
