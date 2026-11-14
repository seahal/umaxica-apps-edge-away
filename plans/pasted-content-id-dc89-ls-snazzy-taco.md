# Add EDGE Family section to away's README

## Context
edge's README now has an `## EDGE Family` section. away's README has only two lines. away should show the same family, from its own point of view: it marks itself as "this repository" and says what it does next to jump.

## Change (README.md only)
```markdown
# umaxica-apps-edge-away

Cushion page for the Umaxica project: the interstitial shown before a user
leaves for an external site.

## Status

Planned. No application code yet; the cushion page is not yet implemented in
jump and will live here as an independent system.

## EDGE Family

away is one of several repositories split out of edge.

- [umaxica-apps-edge](https://github.com/seahal/umaxica-apps-edge) — the
  original edge monorepo on Cloudflare Workers; the family's starting point.
- [umaxica-apps-jump](https://github.com/seahal/umaxica-apps-jump) — controls
  the Umaxica TLDs and blocks open redirects on its own.
- [umaxica-apps-edge-core](https://github.com/seahal/umaxica-apps-edge-core) —
  future home of the TanStack Start core once it outgrows edge; idle for now.
- **umaxica-apps-edge-away** (this repository) — the external-facing cushion
  page split out from jump.

## Relationship to jump

jump decides whether a destination is allowed; away only displays the cushion
page. How away verifies jump's approval (e.g. a signed token) is undecided and
should be recorded in an ADR before implementation.
```

Points:
- Use the same one-line descriptions as edge's README so the family reads the same everywhere (I'll copy edge's exact wording when editing).
- jump's real URL has no "edge" in it.
- No changes to AGENTS.md (it says README holds the layout once code exists).

## Verification
- `git diff --check`
- Read the README rendered on GitHub after pushing; check the 4 links open.
- Not committed unless you ask.
