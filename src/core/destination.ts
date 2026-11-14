import { domainToUnicode } from 'node:url';
import { AwayError } from './types';

const FORBIDDEN_QUERY_KEYS = new Set([
  'access_token',
  'at',
  'authorization_code',
  'client_assertion',
  'client_secret',
  'code',
  'code_challenge',
  'code_challenge_method',
  'code_verifier',
  'continue',
  'id_token',
  'next',
  'nonce',
  'nt',
  'openid',
  'pt',
  'redirect',
  'redirect_to',
  'redirect_uri',
  'response_mode',
  'response_type',
  'return_to',
  'rt',
  'scope',
  'state',
  'token',
  'url',
  'xt',
]);
const FORBIDDEN_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.lan',
  '.home',
  '.corp',
  '.invalid',
  '.test',
  '.example',
  '.onion',
  '.arpa',
];

export type NormalizedDestination = {
  href: string;
  hostname: string;
  displayHostname: string;
};

export function normalizeDestination(input: string, serviceOrigin: string): NormalizedDestination {
  const authority = input.match(/^https:\/\/([^/?#]*)/i)?.[1];
  if (
    typeof input !== 'string' ||
    input.length === 0 ||
    input.length > 2048 ||
    /[\s\\]/.test(input) ||
    containsControl(input) ||
    /%(?![0-9a-fA-F]{2})/.test(input) ||
    !/^https:\/\//i.test(input) ||
    authority === undefined ||
    authority.includes('@') ||
    authority.includes('%') ||
    input.includes('#')
  )
    throw new AwayError('invalid_url', 'destination syntax rejected');
  try {
    if (containsControl(decodeURIComponent(input)))
      throw new AwayError('invalid_url', 'encoded control character rejected');
  } catch (error) {
    if (error instanceof AwayError) throw error;
    throw new AwayError('invalid_url', 'destination encoding rejected');
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new AwayError('invalid_url', 'destination parse failed');
  }
  const hostname = url.hostname.toLowerCase();
  const serviceHostname = new URL(serviceOrigin).hostname;
  if (
    url.protocol !== 'https:' ||
    !hostname ||
    url.username ||
    url.password ||
    hostname.endsWith('.') ||
    isForbiddenHost(hostname) ||
    isGatewayHost(hostname) ||
    hostname === serviceHostname
  )
    throw new AwayError('invalid_url', 'destination host rejected');
  if (isAuthenticationUrl(url)) throw new AwayError('invalid_url', 'authentication url rejected');

  const href = url.href;
  const unicodeHostname = hostname.startsWith('[') ? hostname : domainToUnicode(hostname);
  return {
    href,
    hostname,
    displayHostname:
      unicodeHostname && unicodeHostname.toLowerCase() !== hostname
        ? `${unicodeHostname} (${hostname})`
        : hostname,
  };
}

function containsControl(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

function isForbiddenHost(hostname: string) {
  if (hostname.startsWith('[') && hostname.endsWith(']'))
    return !isPublicIpv6(hostname.slice(1, -1));
  if (!hostname.includes('.')) return true;
  if (FORBIDDEN_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return true;
  const ipv4 = parseIpv4(hostname);
  return ipv4 ? isReservedIpv4(ipv4) : false;
}

function isGatewayHost(hostname: string) {
  return hostname === 'jump.umaxica.net' || hostname === 'away.umaxica.net';
}

function parseIpv4(hostname: string): [number, number, number, number] | null {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return null;
  const octets = hostname.split('.').map(Number);
  return [Number(octets[0]), Number(octets[1]), Number(octets[2]), Number(octets[3])];
}

function isReservedIpv4([a, b, c]: [number, number, number, number]) {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 31 && c === 196) ||
    (a === 192 && b === 52 && c === 193) ||
    (a === 192 && b === 175 && c === 48) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

function isPublicIpv6(address: string) {
  const groups = expandIpv6(address);
  const first = Number(groups[0]);
  if ((first & 0xe000) !== 0x2000) return false;
  const second = Number(groups[1]);
  if (first === 0x2001 && (second < 0x0200 || [0x0db8, 0x0000, 0x0010, 0x0020].includes(second)))
    return false;
  if (first === 0x2002 || (first === 0x3fff && second < 0x1000)) return false;
  return true;
}

function expandIpv6(address: string) {
  const marker = address.indexOf('::');
  const hasCompression = marker >= 0;
  const [left = '', right = ''] = hasCompression ? address.split('::') : [address, ''];
  const head = left ? left.split(':') : [];
  const tail = hasCompression && right ? right.split(':') : [];
  const zeroCount = 8 - head.length - tail.length;
  return [...head, ...Array(hasCompression ? zeroCount : 0).fill('0'), ...tail].map((group) =>
    Number.parseInt(group, 16),
  );
}

function isAuthenticationUrl(url: URL) {
  let pathname = url.pathname;
  // Inspect each decoding layer; reject ambiguous excessive or malformed encoding.
  for (let attempt = 0; ; attempt += 1) {
    if (/\/(?:oauth2?|authorize|authorization|openid-connect)(?:[/;]|$)/i.test(pathname))
      return true;
    if (!pathname.includes('%')) break;
    if (attempt >= 3) return true;
    try {
      pathname = decodeURIComponent(pathname).replaceAll('\\', '/');
    } catch {
      return true;
    }
  }
  for (const [rawKey] of url.searchParams) {
    let key = rawKey.toLowerCase();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const root = key.replace(/\[.*$/, '');
      if (FORBIDDEN_QUERY_KEYS.has(root)) return true;
      try {
        const decoded = decodeURIComponent(key);
        if (decoded === key) break;
        key = decoded.toLowerCase();
      } catch {
        return true;
      }
    }
  }
  return false;
}
