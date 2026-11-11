# Away visual alignment with Jump

About already used Jump's product reading layout. Updated confirmation and
error/unavailable pages to use Jump's splash presentation: stone-colored
background, paper panel, Japanese/system font stack, UMAXICA bar and circular
About link. Confirmation retains its wider destination panel and explicit
continue/return links. Pages remain script-free with the existing CSP and
escaping. Only presentation was adapted; no Jump trust data or runtime was copied.

Validation under mise Node 26.13.1 / pnpm 12.0.0: format:check, lint:check,
typecheck, test:cov (152 tests, coverage thresholds met), test:e2e (8 tests),
and test:worker passed. Browser tests covered About, error and confirmation at
320px and 1280px in light/dark modes, asserting no horizontal overflow.
Visually inspected desktop confirmation and mobile light confirmation/dark
error screenshots. Screenshots remain temporary local artifacts in /tmp.
No production deployment occurred.
