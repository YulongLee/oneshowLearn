# Project catalogue commercial refinement — 2026-10-04

## Scope and implementation

Owner approved concept `exec-85418d76-6a6b-43da-b9a1-6e83936b6abb.png`, development,
self-test, uploading code to Git and production publication.

- Preserve shared shell/branding/course offer, existing five projects, filters,
  categories, search/sort/pagination, private continuation and project readers.
- Independent sharp cover areas replace faded artwork behind text. Reuse labeled
  existing category illustrations only for missing/known generic demo covers;
  preserve actual safe CMS covers, with honest error fallback. Miniapp illustration
  treatment is distinct; no bitmap editing or new fabricated CMS material.
- Actual concise descriptions/audiences, explicit demonstration badges, configured
  recommendation highlighting, true difficulty/access labels and existing tags.
  Hide zero attachment counts, omit demo practice estimates, distinguish pending
  tutorials from delivered lessons. Details retain the full original descriptions.
- First-time users see a starter, returning users see account-owned continuation.
  Unstarted catalogue details navigation is read-only; preview does not create a
  run. Only explicit start/continue uses existing authorized APIs; guard repeated
  start clicks. Do not imply that course ownership grants independent project rights.
- Design-adaptation note: no recommendation is synthesized when CMS flags are off;
  titles, audiences, counts and access remain based on actual published records.
- Includes the previously published, still-uncommitted course composer fix in the
  requested Git upload. Credentials, databases, uploaded media and generated QA
  captures remain excluded.

## Verification

- Full regression: 376 tests, zero failures; production build passed with existing
  bundle-size advisory.
- Isolated project browser suite: 57 checks, 320–2560px covers/metadata/touch layout,
  filter/search/sort/empty/error and pagination, actual CMS cover/error fallback,
  long text, guest login/paid previews, read-only details/preview, explicit start,
  continuation without duplicate enrollment and cross-account isolation.
- Course browser suite: 170 checks; workbench: 171; commercial: 56, all passed.
  Total isolated browser checks: 454, zero script errors.
- Desktop/mobile screenshots inspected. Fixtures are disposable local databases;
  no production imports or real AI/payment/email/SMS calls.

## Release contract

Frontend only, expected live entry
`9fd4de7bfd16387e634281785347f99627e751935ca41e62bab05304f35ae143`, new entry
`b83e20b9318c049c7f91f7d2287d4ef9ca49decd48553496d96028b493632a10`.
Recoverable frontend/protected backend/environment/manifests/database snapshot,
old asset retention, atomic entry replacement and automatic rollback on failed
HTTPS verification. Preserve private-record/order identities, historical amounts,
configuration/pricing/catalogues/backend hashes and all service processes.
No production fixture/migration/CMS/config write, provider request or restart.
