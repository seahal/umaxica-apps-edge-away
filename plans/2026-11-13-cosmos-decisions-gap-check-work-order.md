Task (umaxica-apps-edge-away): check this repository against the Cosmos decisions of 2026-11-12 and
2026-11-13 and close any implementation gap. Much of this may already be done; verify from the
current tree, report each item as "already satisfied" (with file and test) or fix it with a failing
test first. No commit unless the owner asks. Never print secrets or key material. Deploys, secret
changes and any Cloudflare change need the owner's approval at execution time.

Written on the Cosmos machine from a read of commit `7bd0275`; the tree here may be newer. The
current tree, accepted ADRs and `plans/2026-11-12-away-implementation-contract.md` are
authoritative; report conflicts instead of resolving them silently.

## Decisions to check against

1. **PS256 only, complete cut-over (owner, 2026-11-13).** Every first-party JWT is PS256 with RSA
   3072 or larger; ES384 is not accepted at any time. Check the `at` request contract
   (`src/core/token_profile.ts`, `src/core/issuer_jwks.ts`): only `kty` RSA, `alg` PS256, `use` sig
   keys with a 3072-bit floor; header `alg` equal to the key's `alg`; no ES384, RS256, PS384, `none`
   or HMAC path in `src/`, tests, fixtures or docs; tests cover the refusals and the size boundary
   (below, at, above).
2. **One signing key set and one JWKS per repository** (Access ADR
   `cosmos-jwt-ps256-and-op-signing-in-aws-kms.md`, amended 2026-11-10). Check
   `src/config/issuers.ts` against the split: which origins belong to Access, Governance, Sphere
   and Press, which JWKS URL each uses, and that no origin of a removed surface remains. Report the
   mapping; ask the owner where ownership is unclear.
3. **Away is not part of the Access <-> Governance handoff.** That exchange uses Jump only (Access
   `adr/access-is-a-pure-openid-provider.md` decision 18). Away keeps its single job: the
   interstitial before an external destination. Confirm nothing in Away accepts or forwards
   first-party handoff tokens, that Away stays independent of Jump's keys and registry, and that
   destination query values are not logged.
4. **JWKS fetch stays.** Fetching issuers' published JWKS over HTTPS is allowed: cache, refetch on
   unknown `kid`, fail closed. Issuers will publish RSA PS256 keys only.
5. **Rails issuance is still open.** The `at` issuer on the Cosmos side is not implemented; when it
   is, it signs PS256 with the issuing repository's own key. Report anything in the contract that
   the Cosmos side must know (claims, lifetime, size limits).
6. **Key rotation lesson (2026-11-12, from Jump).** A secret replaced without its matching `kid`
   and JWKS made the deployed version fail closed. If Away holds any key or key-related variables,
   check the runbook says to change them as one consistent set, closing the service first.
7. **Node.** Move to the Node 26 LTS line (`docs/backlog/2026-11-12-node-lts-26.md`, pushed
   separately) if not done.
8. **Static checks.** The Cosmos repositories now require every CI static check to report zero
   problems without suppression. Report whether this repository's checks are clean and whether any
   suppression or ignore file exists.

## Report

Record in evidence/YYYY-MM-DD-cosmos-decisions-gap-check-XXXX.md (full `git rev-parse HEAD`;
whether uncommitted changes affected results): each item above with its status, changed files and
tests, the issuer mapping, open questions for the owner, and checks run with results.
