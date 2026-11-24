import { isIP } from 'node:net';

export type RateLimiter = {
  limit(options: { key: string }): Promise<unknown>;
};

/** IPv6 clients usually control a whole /64, so they share one limiter bucket. */
export function limiterKey(ip: string) {
  if (isIP(ip) !== 6) return ip;
  const [left = '', right] = ip.replace(/%.*$/, '').toLowerCase().split('::');
  const width = (groups: string[]) =>
    groups.reduce((total, group) => total + (group.includes('.') ? 2 : 1), 0);
  const head = left ? left.split(':') : [];
  const tail = right ? right.split(':') : [];
  const groups =
    right === undefined
      ? head
      : [...head, ...Array(8 - width(head) - width(tail)).fill('0'), ...tail];
  return `${groups
    .slice(0, 4)
    .map((group) => Number.parseInt(group, 16).toString(16))
    .join(':')}::/64`;
}
