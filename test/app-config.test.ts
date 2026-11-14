import { describe, expect, it } from 'vite-plus/test';
import { createApp } from '../src/index';
import { JwksCache } from '../src/core/jwks_cache';

const ISSUER = 'https://issuer.example.com';
const issuer = { iss: ISSUER, jwks_uri: `${ISSUER}/.well-known/jwks.json` };

describe('Away app configuration', () => {
  it('requires an exact HTTPS service origin', () => {
    for (const value of [
      'not an origin',
      'http://away.example.com',
      'https://away.example.com:8443',
      'https://away.example.com.',
      'https://away.example.com/path',
    ]) {
      expect(() => createApp({ serviceOrigin: value, issuers: [issuer] })).toThrow(
        'invalid service origin',
      );
    }
  });

  it('requires unique exact HTTPS issuers pinned to the issuer JWKS path', () => {
    for (const invalid of [
      { iss: 'not a URL', jwks_uri: 'not a URL' },
      {
        iss: 'http://issuer.example.com',
        jwks_uri: 'http://issuer.example.com/.well-known/jwks.json',
      },
      {
        iss: 'https://issuer.example.com/path',
        jwks_uri: 'https://issuer.example.com/path/.well-known/jwks.json',
      },
      { iss: ISSUER, jwks_uri: 'https://other.example.com/.well-known/jwks.json' },
      {
        iss: 'https://away.example.com',
        jwks_uri: 'https://away.example.com/.well-known/jwks.json',
      },
    ]) {
      expect(() =>
        createApp({ serviceOrigin: 'https://away.example.com', issuers: [invalid] }),
      ).toThrow('invalid issuer');
    }
    expect(() =>
      createApp({ serviceOrigin: 'https://away.example.com', issuers: [issuer, issuer] }),
    ).toThrow('duplicate issuer');
  });

  it('bounds the configured issuer set and permits an injected cache', () => {
    expect(() => createApp({ issuers: [] })).toThrow('issuer list size rejected');
    const manyIssuers = Array.from({ length: 33 }, (_, index) => {
      const iss = `https://issuer-${index}.example.com`;
      return { iss, jwks_uri: `${iss}/.well-known/jwks.json` };
    });
    expect(() => createApp({ issuers: manyIssuers })).toThrow('issuer list size rejected');
    const cache = new JwksCache(async () => ({ keys: [] }));
    expect(() =>
      createApp({ serviceOrigin: 'https://away.example.com', issuers: [issuer], jwksCache: cache }),
    ).not.toThrow();
  });
});
