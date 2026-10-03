// Local workerd contract test; no remote fetch.
// dispatchFetch avoids an application server, but this Miniflare version still
// requires internal TCP listeners. Do not replace workerd with a Node-only fake.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { unstable_readConfig as readConfig } from 'wrangler';
const runtimeConfig = readConfig({
  config: fileURLToPath(new URL('../wrangler.jsonc', import.meta.url)),
});
assert.equal(runtimeConfig.observability.redact_query_string, true, 'query redaction configured');
const origin = 'https://away-next.example';
const bundle = await build({
  entryPoints: [runtimeConfig.main],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  write: false,
  jsx: 'automatic',
  jsxImportSource: 'hono/jsx',
});
const options = {
  cf: false,
  modules: true,
  script: bundle.outputFiles[0].text,
  compatibilityDate: runtimeConfig.compatibility_date,
  compatibilityFlags: runtimeConfig.compatibility_flags,
};
let runtime;
try {
  runtime = new Miniflare(convertV4MiniflareOptions(options));
  const health = await runtime.dispatchFetch(`${origin}/health`, { redirect: 'manual' });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'OK');
  const missing = await runtime.dispatchFetch(`${origin}/not-found`, { redirect: 'manual' });
  assert.equal(missing.status, 404);
  await missing.text();
  // eslint-disable-next-line no-console -- concise runtime verification result.
  console.log('workerd: health and not-found contracts passed');
} catch (error) {
  // eslint-disable-next-line no-console -- error code only, never raw exception text.
  console.error(`workerd contract failed: ${error?.code ?? 'runtime_error'}`);
  process.exitCode = 1;
} finally {
  await runtime?.dispose();
}
