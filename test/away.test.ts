import { describe, expect, it } from 'vitest';
import worker from '../src/cloudflare';
import { createApp } from '../src/index';

describe('away scaffold', () => {
  it('/health reports the service', async () => {
    const response = await createApp().request('/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'OK', service: 'away', version: '0.1.0' });
  });

  it('unknown routes are not found', async () => {
    const response = await createApp().request('/not-found');

    expect(response.status).toBe(404);
  });

  it('the Cloudflare adapter serves the same app', async () => {
    const executionContext = {
      waitUntil() {},
      passThroughOnException() {},
    } as unknown as ExecutionContext;
    const response = await worker.fetch(
      new Request('https://away.example/health'),
      {},
      executionContext,
    );

    expect(response.status).toBe(200);
  });
});
