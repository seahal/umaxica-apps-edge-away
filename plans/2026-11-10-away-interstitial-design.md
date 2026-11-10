# Away Interstitial Design (2026-11-10)

Status: accepted design (owner, 2026-11-10); implementation follows the order in
`plans/2026-11-10-away-scope-after-cosmos-split.md` (AWS KMS and PS256 in the Cosmos repositories,
then Jump, then Away). Responsibility boundary: `adr/0001-independent-away-responsibility.md`.
Incorporates an owner-supplied proposal (drafted with ChatGPT) and the Cosmos decisions in
`adr/secure-jump-link-redirector.md` there.

## Definition

Away is **not** a service that takes a URL and forwards to it. Away verifies an authorized
navigation request and shows the user exactly where it leads. It has three duties only:

1. Verify that the navigation request is authentic.
2. Show that the destination is outside the current site, and show the exact destination.
3. Let the user leave by an explicit click, without leaking information.

Danger detection and reputation checks are later work, not part of this design.

## Verification: the same process as Jump

Away verifies the inbound token exactly as Jump does; only the outcome differs.

| Step | Jump | Away |
| --- | --- | --- |
| Verify signature against the issuing repository's JWKS (PS256, `kid`) | yes | yes |
| Check issuer, audience, purpose, expiry; refuse replays where required | yes | yes (audience and purpose are Away-only) |
| Check the destination against policy | approved edge map | destination rules below |
| On success | re-sign a return token and redirect | render the interstitial with a plain link |
| Re-sign or redirect automatically | yes | never |

Invalid, expired, wrong-issuer, wrong-audience or wrong-purpose tokens fail closed: an error page
that shows no destination, no `Location` header, and no fallback to Jump or a direct link.

A valid signature does not make a destination safe. Deciding whether a link may be issued at all is
the issuer's policy (Rails' gateway concern), a separate control from Away's verification. A design
that signs user-supplied links without policy would let attackers mint Away tokens.

## Destination rules

- `https` only. Parse and normalize with the standard URL parser; refuse anything that does not
  round-trip.
- Refuse userinfo, fragments that carry data, control characters, and hosts that are `localhost`,
  internal, link-local, private or reserved IP literals.
- Refuse Jump and Away themselves as destinations (no gateway-to-gateway hops).
- Never accept a raw URL query interface such as `away.umaxica.net/?url=...`.
- Away never fetches the destination (no previews, favicons or OGP images), so it needs no SSRF
  defense. Any future fetching feature needs one first.
- OAuth/OpenID Connect redirects (`redirect_uri`, authorization codes, tokens) never pass through
  Away. Authentication flows stay separate.

## The interstitial page

- Title: leaving the current site; body: the site is not managed by the current UMAXICA service.
- Show the **destination host** prominently, normalized, with the Punycode (ASCII) form beside any
  internationalized name, then the full destination URL as escaped text.
- One primary action: a plain link `<a href="..." rel="noreferrer noopener">`. No JavaScript, no
  HTTP 302, no automatic navigation, no new tab by default (if a new tab is ever used, add
  `target="_blank"` with `rel="noopener noreferrer"`).
- A way back that needs no script (for example a link to the issuer's validated home origin carried
  in the token).
- Never claim the destination is safe or endorsed; an authentic request is not a safe destination.
- Shown for every destination, first-party cross-TLD moves included.

## Response headers (initial set; no JavaScript, own CSS only)

```text
Content-Security-Policy: default-src 'none'; style-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Cache-Control: no-store
X-Robots-Tag: noindex, nofollow
Strict-Transport-Security: max-age=63072000; includeSubDomains
```

`frame-ancestors 'none'` prevents clickjacking; `default-src 'none'` does not replace it. `noindex`
is advice to search engines, not access control.

## Referrer and data leakage

- `Referrer-Policy: no-referrer` on Away stops the Referer to the destination. It cannot stop the
  Referer from the originating page to Away; the originating link (Rails) must also send no referrer
  or use a strict policy.
- URLs must not contain authorization codes, access tokens or personal data in the first place;
  referrer policy does not fix that.
- Away keeps no session and sets no cookies.
- Logs never record raw destination URLs or tokens; record the issuer, a destination host and the
  decision only.

## Threats

| Threat | Response | Priority |
| --- | --- | --- |
| Open redirect | issuer verification, destination policy, direct link only | highest |
| OAuth/OIDC information leakage | authentication redirects never use Away | highest |
| XSS | URL validation, output escaping, CSP | highest |
| Referrer leakage | `no-referrer` on Away and on the originating link | high |
| Phishing abuse | host display with Punycode, issuance limits, a way to revoke bad links | high |
| Clickjacking | `frame-ancestors 'none'`, `X-Frame-Options: DENY` | high |
| Navigation to internal networks | refuse localhost, internal and reserved addresses | high |
| Sensitive data in logs | no raw URLs or tokens in logs | high |
| Dangerous destinations | reputation checks, later | medium |

RFC 9700 section 4.11 notes that endpoints with a warning page can still be abused as open
redirectors, so the interstitial is one layer, not the whole defense.

## Open points

- Long-lived public links: short-lived tokens would break them; a server-side identifier mapped to
  the destination is an option if such links are needed.
- Advertising on the interstitial (future idea, `plans/2026-11-10-away-scope-after-cosmos-split.md`).
- Replacing the older "cushion" wording (deferred).

## References

- OWASP Unvalidated Redirects and Forwards Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html
- RFC 9700, Best Current Practice for OAuth 2.0 Security (section 4.11, open redirection):
  https://www.rfc-editor.org/rfc/rfc9700.html
- MDN, Referrer-Policy:
  https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy
- MDN, Content-Security-Policy:
  https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy
