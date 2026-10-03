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
});
