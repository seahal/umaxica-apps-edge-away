import { expect, test } from '@playwright/test';

test.describe('away smoke', () => {
  test('/health returns health JSON', async ({ request }) => {
    const response = await request.get('/health');

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(await response.json()).toEqual(
      expect.objectContaining({ status: 'OK', service: 'away' }),
    );
  });

  test('renders a verified destination without redirecting or leaking the token', async ({
    request,
  }) => {
    const tokenResponse = await request.get('/__e2e/token');
    const token = await tokenResponse.text();
    const response = await request.get(`/?at=${token}`, {
      headers: { 'accept-language': 'en' },
    });
    const html = await response.text();

    expect(response.status()).toBe(200);
    expect(html).toContain('This site is not managed by UMAXICA');
    expect(html).toContain('example.com');
    expect(html).toContain(
      'href="https://example.com/leave?source=test" rel="noreferrer noopener"',
    );
    expect(html).not.toContain(token);
    expect(response.headers().location).toBeUndefined();
    expect(response.headers()['cache-control']).toBe('no-store');
    expect(response.headers()['referrer-policy']).toBe('no-referrer');
  });
});

test('bare entry opens the About page in the Jump reading layout', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.locator('body')).toHaveClass('product');
  await expect(page.getByRole('heading')).toContainText('UMAXICA Away');
  await expect(page.locator('header')).toHaveText('UMAXICA');
  await expect(page.locator('footer')).toContainText('UMAXICA');
  await page.screenshot({ path: '/tmp/away-about.png', fullPage: true });
});

test('invalid tokens stop at an error without redirecting to About or a destination', async ({
  request,
}) => {
  for (const query of ['at=', 'at=abc.def', 'at=a.b.c', 'url=https://example.com/']) {
    const response = await request.get(`/?${query}`, { maxRedirects: 0 });
    expect(response.status()).toBe(400);
    expect(response.headers().location).toBeUndefined();
    expect(await response.text()).not.toContain('class="primary"');
  }
});

for (const theme of ['light', 'dark'] as const) {
  for (const width of [320, 1280]) {
    test(`Away pages follow Jump styling: ${theme}, ${width}px`, async ({ page, request }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({ colorScheme: theme });
      const token = await (await request.get('/__e2e/token')).text();
      for (const [name, path] of [
        ['about', '/about'],
        ['error', '/?at=invalid'],
        ['confirmation', `/?at=${token}`],
      ] as const) {
        await page.goto(path);
        await expect(page.getByRole('heading')).toBeVisible();
        expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(
          true,
        );
        const expected = theme === 'dark' ? 'rgb(12, 10, 9)' : 'rgb(28, 25, 23)';
        if (name !== 'about') {
          await expect(page.locator('body')).toHaveCSS('background-color', expected);
          await expect(
            page.getByRole('link', { name: /About this service|このサイトについて/ }),
          ).toBeVisible();
        }
        await page.screenshot({ path: `/tmp/away-${name}-${theme}-${width}.png`, fullPage: true });
      }
    });
  }
}
