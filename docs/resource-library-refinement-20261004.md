# Resource library refinement — 2026-10-04

Owner approved concept `exec-e802f15e-4467-4a48-ac91-b277d455c907.png`,
implementation and production deployment. No new Git push requested.

## Implementation

- Preserve shared sidebar/header/branding and authoritative course offer.
  Quiet title, existing favorites destination, broad search, populated primary
  resource categories and keyboard-accessible more-category disclosure.
- Five compact phase filters match the approved five-chapter course. Formal
  chapter identity takes precedence; other resource types use transparently
  labeled keyword-derived matching. Search/type/phase combine without discarding
  the user's other selections. Default catalogue order is course/chapter/title;
  latest, accessible-first and title sorting remain available.
- Three real published CMS cards: independent sharp native cover area above
  text, labeled category illustrations, short actual chapter summary, real
  chapter/access state and explicit reading/preview action. Configured pack
  recommendations take priority; absent configuration uses “从课程资料开始”,
  not an invented editorial endorsement. No fake templates, Prompts, counts,
  brands, downloads or editable-template promises from the reference image.
- Readable resource-name/type, purpose, chapter, access and action catalogue.
  Two/one-column cards and stacked table entries on smaller content widths.
  Existing resource reader, copy/export, guarded attachments, account-private
  favorites and learned state stay unchanged. Guest/locked/revoked/draft/empty/
  load-failure states are explicit and never leak private bodies.
- Current production catalogue remains its five chapter outlines; future
  CMS-published resource types automatically enter the relevant filters. No
  production catalogue, curriculum, API, database, storage adapter or ACL edit.

## Verification

Full regression: 386 tests passed; production build passed with the existing
bundle-size advisory. Isolated resource suite: 61 browser checks including
320–2560px layout/touch targets, actual highlights, combined filters/sorting/
pagination, reader/export/favorite/progress, guest/owner/revoked access and
empty/error/long-title states. Fixture accounts/resources/databases disposable
and never uploaded. The harness waits for a complete catalogue render rather
than racing a first-card mount. Isolated local preview opened for inspection.

Other isolated browser suites passed: tutor 96, project catalogue 57, course
study 170, workbench 171, commercial service 56. Total isolated browser checks:
611. Desktop/mobile screenshots inspected. No real model/payment/email/SMS
requests. No shared shell, backend/provider/OSS/pricing changes.

## Release controls

Frontend only, with protected-code/environment/manifests backup, consistent
database snapshot, expected live/staged entry hashes, retained prior assets,
atomic entry replacement and automatic rollback. Post-release exact HTTPS
entry/asset verification, live anonymous layout/reader/filter checks, account/
order/history/workspace privacy, existing account/private record/progress/order
identity preservation, immutable historical amounts, unchanged catalogue/
configuration/pricing/backend hashes and all running service processes.

Expected prior entry:
`529109c098ca192a55c1e84b19849fd4bbdd831c95f02df98ac1bfbec680f2df`.
New compiled entry:
`2d2cd18a0eab604b868d3b915beb6b3a9ad863f9d96ed583582479d8a519bed9`.

No migration, production fixtures, CMS/configuration/credential change, gateway
operation, service restart or new Git push.

## Published result

- Backup: `/var/backups/oneshowlearn/workbench-d8RNF7Qr`;
  staging: `/tmp/oneshowlearn-workbench-HLgbWj4u`.
  Frontend archive SHA256:
  `6aa3f1fcf0a757fccc6bfc8b69c9e1a899febb1797164896817b0633bccde05a`.
- Exact production entry matches the new hash above. Passed 39 HTTPS page
  hashes and 50 asset hashes, health/catalogues and anonymous privacy guards.
  Existing private-record/progress/order identities, historical amounts,
  catalogues/provider/pricing configuration, protected hashes and all service
  processes preserved. No restart or backend/database/configuration mutation.
- Live read-only browser acceptance passed: resource library 24, tutor 22,
  project catalogue 12 and course composer 15. Desktop/mobile resource captures
  inspected. Five existing outlines remain; authoritative ¥499 offer unchanged.
  No script errors, writes or provider calls. A tutor acceptance assertion now
  waits for the clicked mode's React render rather than racing it; tutor
  application code is unchanged.
- Source remains local, ready for a separately requested Git upload. No new
  commit/push performed for this deployment.
