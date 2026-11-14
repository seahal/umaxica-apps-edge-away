# Away Scope After the Cosmos Split (2026-11-10)

Status: planned; starts after the Jump review and PS256 migration
(`umaxica-apps-edge-jump/plans/2026-11-10-review-after-cosmos-split.md`). Earlier plan:
`plans/away-external-navigation.md`.

Decisions from the Cosmos repositories (owner, 2026-11-10; `adr/secure-jump-link-redirector.md`
there):

- Away is mandatory for every move that crosses a top-level domain, first-party included (for
  example `.com` to `.app`), and for every external site. Jump never crosses a top-level domain.
- Until Away exists, Rails fails closed for cross-TLD navigation.
- Away's job is small: verify the Rails-issued JWT (PS256, keys from the issuing repository's JWKS;
  issuer, audience, purpose and expiry checked), then render a notice page with a link to the
  destination.
- It always shows the notice; it never redirects automatically and never re-signs.
- It never accepts Jump or Away itself as a destination (no gateway-to-gateway hops).
- It passes no token, query or referrer onward (`Referrer-Policy: no-referrer`, the link opened
  with `rel="noopener noreferrer"`), and its responses are `Cache-Control: no-store`.

## Terminology

Away's page is the **interstitial page** (owner, 2026-11-10). Existing documents still say
"cushion"; replacing that wording is deferred.

## Order

1. Cosmos: signer component and AWS KMS with PS256 (RSA 3072); each repository publishes its JWKS.
2. Jump: verify and issue PS256 (Jump's key in Workers secrets).
3. Away: verify the PS256 JWT against the issuing repository's JWKS and render the interstitial.

## Future idea: advertising on the interstitial (not decided)

The owner may later want the interstitial to show or omit advertising per navigation. Constraints
if it is pursued:

- The choice must travel inside the signed token, not as a free GET parameter; anything in the
  query can be changed by whoever holds the URL.
- Third-party advertising scripts on a security page widen the attack surface (script injection,
  tracking, misleading content next to the real link) and conflict with a strict Content Security
  Policy; prefer first-party, script-free placements.
- The destination link and the leaving-site notice must stay unambiguous and visually primary.
