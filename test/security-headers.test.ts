import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';
import { withSecurityHeaders } from '../src/core/security_headers';

describe('Away security headers', () => {
  it('keeps the static host header file in sync with application responses', async () => {
    const response = withSecurityHeaders(new Response(null));
    const applicationHeaders = Object.fromEntries(response.headers.entries());
    const testDirectory = dirname(fileURLToPath(import.meta.url));
    const headerFile = await readFile(join(testDirectory, '../public/_headers'), {
      encoding: 'utf8',
    });
    const staticHeaders = Object.fromEntries(
      headerFile.split('\n').flatMap((line) => {
        const match = line.match(/^\s{2}([^:]+):\s*(.*)$/);
        return match ? [[match[1]?.toLowerCase(), match[2]]] : [];
      }),
    );
    const expected = Object.fromEntries(
      Object.entries(applicationHeaders).filter(([name]) => name !== 'content-length'),
    );
    expect(staticHeaders).toEqual(expected);
  });
});
