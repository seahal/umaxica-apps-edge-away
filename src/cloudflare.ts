import { createApp } from './index';

const app = createApp();

export default {
  fetch(request: Request, env: object, executionContext: ExecutionContext) {
    return app.fetch(request, env, executionContext);
  },
};
