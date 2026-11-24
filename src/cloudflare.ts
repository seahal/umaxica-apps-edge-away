import { createApp } from './index';
import type { RateLimiter } from './core/rate_limit';

export type CloudflareEnv = {
  AWAY_RATE_LIMITER?: RateLimiter;
  ASSETS?: { fetch(request: Request): Promise<Response> };
};
const app = createApp();

export default {
  fetch(request: Request, env: CloudflareEnv, executionContext: ExecutionContext) {
    return app.fetch(request, env, executionContext);
  },
};
