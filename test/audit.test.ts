import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { logAudit } from '../src/core/audit';

describe('Away audit records', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs only correlation and verified issuer fields for decisions', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    logAudit({
      event: 'away_accepted',
      requestId: '4e6f4f0f-e5c1-4c65-a323-bbc6f5c30f45',
      status: 200,
      cfRay: 'a1b2c3d4',
      iss: 'https://issuer.example.com',
    });
    expect(JSON.parse(String(info.mock.calls[0]?.[0]))).toEqual({
      event: 'away_accepted',
      request_id: '4e6f4f0f-e5c1-4c65-a323-bbc6f5c30f45',
      status: 200,
      cf_ray: 'a1b2c3d4',
      iss: 'https://issuer.example.com',
    });
  });

  it('warns with a bounded reason for rate-limit failures', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logAudit({
      event: 'away_rate_limit_failed',
      requestId: '4e6f4f0f-e5c1-4c65-a323-bbc6f5c30f45',
      status: 503,
      reason: 'limiter_timeout',
    });
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toEqual({
      event: 'away_rate_limit_failed',
      request_id: '4e6f4f0f-e5c1-4c65-a323-bbc6f5c30f45',
      status: 503,
      reason: 'limiter_timeout',
    });
  });
});
