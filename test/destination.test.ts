import { describe, expect, it } from 'vite-plus/test';
import { normalizeDestination } from '../src/core/destination';
import { AwayError } from '../src/core/types';

const SERVICE = 'https://away.example.com';

describe('Away destination validation', () => {
  it('normalizes a public HTTPS URL and displays IDNs with their ASCII form', () => {
    expect(normalizeDestination('HTTPS://bücher.example.com/商品?q=a%20b', SERVICE)).toEqual({
      href: 'https://xn--bcher-kva.example.com/%E5%95%86%E5%93%81?q=a%20b',
      hostname: 'xn--bcher-kva.example.com',
      displayHostname: 'bücher.example.com (xn--bcher-kva.example.com)',
    });
  });

  it('allows a public IPv4 literal and an ordinary URL query', () => {
    expect(normalizeDestination('https://8.8.8.8:8443/path?item=1', SERVICE).href).toBe(
      'https://8.8.8.8:8443/path?item=1',
    );
    expect(normalizeDestination('https://public.example.com/?q=a&q=b', SERVICE).href).toBe(
      'https://public.example.com/?q=a&q=b',
    );
  });

  it.each([
    ['', 'empty'],
    ['a'.repeat(2049), 'too long'],
    ['http://example.com/', 'http'],
    ['ftp://example.com/', 'wrong scheme'],
    ['//example.com/', 'relative'],
    ['https://example.com/a b', 'space'],
    ['https://example.com/%', 'bad escape'],
    ['https://example.com\\@evil.example/', 'backslash'],
    ['https://example.com/%0A', 'control in url'],
    ['https://example.com/%C2%85', 'encoded C1 control'],
    ['https://example.com/%FF', 'invalid UTF-8 escape'],
    ['https://example.com/#fragment', 'fragment'],
    ['https://example.com/#', 'empty fragment delimiter'],
    ['https://user@example.com/', 'userinfo'],
    ['https://@example.com/', 'empty userinfo'],
    ['https://%65xample.com/', 'encoded host'],
    ['https://example.com./', 'trailing dot'],
    ['https://localhost/', 'localhost'],
    ['https://service.local/', 'local domain'],
    ['https://service.internal/', 'internal domain'],
    ['https://router.lan/', 'lan domain'],
    ['https://singlelabel/', 'single label'],
    ['https://127.0.0.1/', 'loopback IPv4'],
    ['https://0.1.2.3/', 'special IPv4 range'],
    ['https://10.0.0.8/', 'private IPv4'],
    ['https://172.16.1.2/', 'private IPv4 range'],
    ['https://192.168.1.2/', 'private IPv4 range'],
    ['https://192.0.0.1/', 'reserved IPv4 range'],
    ['https://192.0.0.2/', 'reserved IPv4 range'],
    ['https://192.88.99.1/', 'deprecated IPv4 range'],
    ['https://192.31.196.1/', 'reserved IPv4 range'],
    ['https://192.52.193.1/', 'reserved IPv4 range'],
    ['https://192.175.48.1/', 'reserved IPv4 range'],
    ['https://169.254.169.254/', 'link-local IPv4'],
    ['https://100.64.0.1/', 'shared IPv4'],
    ['https://192.0.2.1/', 'documentation IPv4'],
    ['https://198.18.0.1/', 'benchmark IPv4'],
    ['https://198.19.0.1/', 'benchmark IPv4'],
    ['https://198.51.100.1/', 'documentation IPv4'],
    ['https://203.0.113.1/', 'documentation IPv4'],
    ['https://224.0.0.1/', 'multicast IPv4'],
    ['https://255.255.255.255/', 'reserved IPv4'],
    ['https://[::1]/', 'loopback IPv6'],
    ['https://[fc00::1]/', 'unique local IPv6'],
    ['https://[fe80::1]/', 'link-local IPv6'],
    ['https://[2001:db8::1]/', 'documentation IPv6'],
    ['https://[2001:10::1]/', 'special IPv6 range'],
    ['https://[2001:20::1]/', 'special IPv6 range'],
    ['https://[2002::1]/', '6to4 IPv6'],
    ['https://[3fff::1]/', 'documentation IPv6'],
    ['https://[64:ff9b::808:808]/', 'translation IPv6'],
    ['https://away.umaxica.net/', 'Away gateway'],
    ['https://jump.umaxica.net/', 'Jump gateway'],
    ['https://away.example.com/path', 'current origin'],
    ['https://away.example.com:8443/path', 'current host on another port'],
    ['https://example.com/oauth/authorize', 'OAuth endpoint'],
    ['https://example.com/%61uthorize', 'encoded OAuth endpoint'],
    ['https://example.com/%2561uthorize', 'double-encoded OAuth endpoint'],
    ['https://example.com/path%2Fauthorize', 'encoded separator'],
    ['https://example.com/path%5Cauthorize', 'encoded backslash separator'],
    ['https://example.com/authorize;session=1', 'path parameters'],
    ['https://example.com/%2525252561uthorize', 'excessive encoding'],
    ['https://example.com/%25', 'ambiguous encoded path'],
    ['https://example.com/openid-connect/auth', 'OIDC endpoint'],
    ['https://example.com/?redirect_uri=https%3A%2F%2Fid.example', 'redirect URI'],
    ['https://example.com/?code%5B%5D=x', 'bracketed authorization code'],
    ['https://example.com/?%2561ccess_token=x', 'double-encoded access token'],
    ['https://example.com/?rt=token', 'gateway query'],
    ['https://example.com/?%25=x', 'malformed encoded query name'],
  ])('rejects %s (%s)', (input) => {
    expect(() => normalizeDestination(input, SERVICE)).toThrow(AwayError);
  });

  it('allows global IPv6 and rejects malformed IPv6 host data', () => {
    expect(normalizeDestination('https://[2606:4700:4700::1111]/', SERVICE).hostname).toBe(
      '[2606:4700:4700::1111]',
    );
    expect(normalizeDestination('https://[2606:1234:1:2:3:4:5:6]/', SERVICE).hostname).toBe(
      '[2606:1234:1:2:3:4:5:6]',
    );
    expect(() => normalizeDestination('https://[not-ipv6]/', SERVICE)).toThrow(AwayError);
  });
});
