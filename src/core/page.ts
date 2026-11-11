import type { NormalizedDestination } from './destination';

export type Locale = 'ja' | 'en';

export function requestLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return 'ja';
  const languages = acceptLanguage
    .split(',')
    .map((part, index) => {
      const [tag = '', ...parameters] = part.split(';');
      const quality = parameters.find((parameter) => parameter.trim().startsWith('q='));
      const qualityValue = quality === undefined ? 1 : Number(quality.trim().slice(2));
      return {
        tag: tag.trim().toLowerCase(),
        quality:
          Number.isFinite(qualityValue) && qualityValue >= 0 && qualityValue <= 1
            ? qualityValue
            : 0,
        index,
      };
    })
    .filter((language) => language.tag && language.quality > 0)
    .sort((left, right) => right.quality - left.quality || left.index - right.index);
  for (const { tag } of languages) {
    if (tag === 'ja' || tag.startsWith('ja-')) return 'ja';
    if (tag === 'en' || tag.startsWith('en-')) return 'en';
  }
  return 'ja';
}

export function renderInterstitial(
  destination: NormalizedDestination,
  homeOrigin: string,
  locale: Locale,
) {
  const copy =
    locale === 'ja'
      ? {
          title: '別のサイトへ移動します',
          heading: 'この先は UMAXICA の管理外です',
          explanation: '移動先を確認してください。リンクを押すと、そのサイトへ移動します。',
          host: '移動先のホスト',
          address: '移動先の URL',
          leave: 'このサイトへ移動',
          back: '元のサービスへ戻る',
        }
      : {
          title: 'Leaving this site',
          heading: 'This site is not managed by UMAXICA',
          explanation: 'Check the destination. Select the link below only if you want to continue.',
          host: 'Destination host',
          address: 'Destination URL',
          leave: 'Continue to this site',
          back: 'Return to the service',
        };

  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(copy.title)} — UMAXICA</title><link rel="stylesheet" href="/assets/away.css"></head><body class="splash"><main class="card">${renderBrandBar(locale)}<h1>${escapeHtml(copy.heading)}</h1><p>${escapeHtml(copy.explanation)}</p><dl><dt>${escapeHtml(copy.host)}</dt><dd class="host">${escapeHtml(destination.displayHostname)}</dd><dt>${escapeHtml(copy.address)}</dt><dd class="url">${escapeHtml(destination.href)}</dd></dl><nav class="actions"><a class="primary" href="${escapeHtml(destination.href)}" rel="noreferrer noopener">${escapeHtml(copy.leave)}</a><a href="${escapeHtml(homeOrigin)}" rel="noreferrer noopener">${escapeHtml(copy.back)}</a></nav></main></body></html>`;
}

export function renderError(locale: Locale) {
  const text: [string, string] =
    locale === 'ja'
      ? ['リクエストを確認できません', 'リンクの有効期限が切れているか、リンクが正しくありません。']
      : ['We could not verify this request', 'The link may be expired or invalid.'];
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(text[0])} — UMAXICA</title><link rel="stylesheet" href="/assets/away.css"></head><body class="splash"><main>${renderBrandBar(locale)}<h1>${escapeHtml(text[0])}</h1><p>${escapeHtml(text[1])}</p></main></body></html>`;
}

export function renderUnavailable(locale: Locale) {
  const text: [string, string] =
    locale === 'ja'
      ? ['一時的に確認できません', '少し時間をおいてから、元のサービスでもう一度お試しください。']
      : [
          'We cannot verify this request right now',
          'Please return to the service and try again later.',
        ];
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(text[0])} — UMAXICA</title><link rel="stylesheet" href="/assets/away.css"></head><body class="splash"><main>${renderBrandBar(locale)}<h1>${escapeHtml(text[0])}</h1><p>${escapeHtml(text[1])}</p></main></body></html>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

export function renderAbout(locale: Locale) {
  const title = locale === 'ja' ? 'このサイトについて' : 'About';
  const heading = locale === 'ja' ? 'UMAXICA Away について' : 'About UMAXICA Away';
  const description =
    locale === 'ja'
      ? 'UMAXICA Away は、別のサイトへ移動する前に、移動先を確認するためのページです。元のサービスのリンクからご利用ください。'
      : 'UMAXICA Away lets you check your destination before leaving for another site. Use a link from the original service to continue.';
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title} — UMAXICA (NET)</title><link rel="stylesheet" href="/assets/about.css"></head><body class="product"><header><a href="/">UMAXICA</a></header><main><h1>${heading}</h1><p>${description}</p></main><footer>© ${new Date().getUTCFullYear()} UMAXICA</footer></body></html>`;
}

function renderBrandBar(locale: Locale) {
  const label = locale === 'ja' ? 'このサイトについて' : 'About this service';
  return `<div class="bar"><span class="brand">UMAXICA</span><a class="about" href="/about" aria-label="${label}" title="${label}">i</a></div>`;
}

export function renderRateLimited(locale: Locale) {
  const title = locale === 'ja' ? 'アクセスが集中しています' : 'Too many requests';
  const body =
    locale === 'ja'
      ? '少し時間をおいてから、元のサービスでもう一度お試しください。'
      : 'Please wait a moment, then try again from the original service.';
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — UMAXICA</title><link rel="stylesheet" href="/assets/away.css"></head><body class="splash"><main>${renderBrandBar(locale)}<h1>${title}</h1><p>${body}</p></main></body></html>`;
}
