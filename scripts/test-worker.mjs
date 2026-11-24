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
const origin = 'https://away.umaxica.net';
const bundle = await build({
  entryPoints: [runtimeConfig.main],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  external: ['node:url', 'node:net'],
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
  assets: {
    directory: fileURLToPath(new URL('../public', import.meta.url)),
    binding: runtimeConfig.assets.binding,
    run_worker_first: runtimeConfig.assets.run_worker_first,
    routerConfig: { has_user_worker: true },
    assetConfig: { not_found_handling: runtimeConfig.assets.not_found_handling },
  },
  ratelimits: Object.fromEntries(
    runtimeConfig.ratelimits.map(({ name, namespace_id, simple }) => [
      name,
      { namespace_id, simple },
    ]),
  ),
};
let runtime;
try {
  runtime = new Miniflare(convertV4MiniflareOptions(options));
  const health = await runtime.dispatchFetch(`${origin}/health`, { redirect: 'manual' });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'OK');
  for (const path of ['/', '/not-found']) {
    const missing = await runtime.dispatchFetch(`${origin}${path}`, { redirect: 'manual' });
    assert.equal(missing.status, 404);
    assert.match(missing.headers.get('content-type') ?? '', /text\/html/);
    assert.equal(missing.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
    assert.match(missing.headers.get('content-security-policy') ?? '', /style-src 'self'/);
    assert.match(await missing.text(), /name="robots" content="noindex,nofollow,noarchive"/);
  }
  const head = await runtime.dispatchFetch(`${origin}/`, { method: 'HEAD', redirect: 'manual' });
  assert.equal(head.status, 404);
  assert.equal(await head.text(), '');
  const json = await runtime.dispatchFetch(`${origin}/not-found`, {
    headers: { Accept: 'application/json' },
    redirect: 'manual',
  });
  assert.equal(json.status, 404);
  assert.equal(await json.text(), '');
  // eslint-disable-next-line no-console -- concise runtime verification result.
  console.log('workerd: health and browser/JSON not-found contracts passed');
} catch (error) {
  // eslint-disable-next-line no-console -- error code only, never raw exception text.
  console.error(`workerd contract failed: ${error?.code ?? 'runtime_error'}`);
  process.exitCode = 1;
} finally {
  await runtime?.dispose();
}
