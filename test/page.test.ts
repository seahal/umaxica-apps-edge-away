import { describe, expect, it } from 'vite-plus/test';
import {
  renderError,
  renderInterstitial,
  renderUnavailable,
  requestLocale,
} from '../src/core/page';

describe('Away pages', () => {
  it('chooses Japanese when requested and defaults to Japanese without a header', () => {
    expect(requestLocale(null)).toBe('ja');
    expect(requestLocale('ja-JP,en-US;q=0.8')).toBe('ja');
    expect(requestLocale('en,ja;q=0')).toBe('en');
    expect(requestLocale('en-US,en;q=0.9')).toBe('en');
    expect(requestLocale('fr-FR;q=0.8,en;q=0.8')).toBe('en');
    expect(requestLocale('en;q=invalid')).toBe('ja');
    expect(requestLocale('fr-FR')).toBe('ja');
    expect(requestLocale(' , ')).toBe('ja');
  });

  it('escapes every dynamic interstitial value in the document', () => {
    const html = renderInterstitial(
      {
        href: 'https://example.com/?a=&b=<tag>&q="\' ',
        hostname: 'example.com',
        displayHostname: 'Example & <site> "name"',
      },
      'https://issuer.example.com/?back=<unsafe>&quote="\'',
      'en',
    );
    expect(html).toContain('Example &amp; &lt;site&gt; &quot;name&quot;');
    expect(html).toContain('href="https://example.com/?a=&amp;b=&lt;tag&gt;&amp;q=&quot;&#39; "');
    expect(html).toContain(
      'href="https://issuer.example.com/?back=&lt;unsafe&gt;&amp;quote=&quot;&#39;"',
    );
    expect(html).not.toContain('<tag>');
    expect(html).not.toContain('<unsafe>');
  });

  it('renders distinct Japanese and English fail-closed messages', () => {
    expect(renderError('ja')).toContain('リクエストを確認できません');
    expect(renderError('en')).toContain('We could not verify this request');
    expect(renderUnavailable('ja')).toContain('一時的に確認できません');
    expect(renderUnavailable('en')).toContain('We cannot verify this request right now');
  });
});
