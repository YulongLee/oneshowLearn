# Official learning community refinement — 2026-10-04

Owner approved the official-content/learner-group mock and requested local
development and production release. No new Git upload was requested.

## Implementation

- Preserve shared navigation, branding and authoritative course offer. Compact
  community heading, shallow native book/laptop illustration, separate article
  covers and copy, actual pinned/recommended/latest feature, readable two-column
  editorial list, category/search/topic/sort/pagination and mobile reflow.
- Real published CMS records only. No sample articles, counts, testimonials,
  fake public forum or empty statistics. No expansion of anonymous access.
  No articles means an honest compact empty state and useful course/resource
  destinations. Actual topics/recommended resources appear only when available.
- One right-side group entry with audience-aware labels, manual joining rules,
  three FAQ disclosures and the existing official support destination. Refresh
  authenticated group metadata on every opening; remove stale QR data while
  loading, closing or failing. Respect configured audience, readiness, expiry
  and account entitlement. Viewing a QR is not treated as joining a group.
- Preserve custom published copy/hero, actual recommendations, article reader,
  private resource reader and admin management shortcuts. Safe HTTPS/public
  assets/issued private image tickets, failed-image fallback, guarded Markdown
  links and no raw private-file image expansion or HTML execution.
- Frontend only. No CMS publication/import, group/configuration change, database
  migration, fixture upload, payment/model/email/SMS call or service restart.

## Verification

Full regression: 390 tests passed; production build passed with the existing
bundle-size advisory. Isolated community browser suite: 68 checks covering
320–2560px layout/touch targets, real feature/cards/pagination/search/topic,
reader/image/link safety, custom settings, guest/paid/unpaid/revoked accounts,
expired/unconfigured/failing group entry, stale QR removal and fresh metadata.
Disposable accounts/articles/databases were never uploaded.

Other current-build isolated browser suites passed: resources 61, commercial
service 56, tutor 96, project catalogue 57, course study 170, workbench 171.
Total isolated browser checks: 679. Desktop/mobile captures inspected and local
preview opened. No script errors or unexpected external/provider requests.
Two existing test harnesses now wait for account/default-scope hydration before
asserting final state; no tutor/resource application change for those waits.

## Release controls

Expected prior entry:
`2d2cd18a0eab604b868d3b915beb6b3a9ad863f9d96ed583582479d8a519bed9`.
New compiled entry:
`d4cf0d24776168e4a2d9a10f1f4ca2e6510165231d5f33e19950eabdec15ecf6`.

Frontend-only release after protected-code/environment/manifests backup,
consistent database snapshot, live/staging hash guards, retained old assets and
atomic entry replacement with rollback. Verify exact HTTPS entry/assets,
anonymous article/group/account/order guards, preserved private record/order
identities and historical amounts, unchanged provider/pricing/catalogue/group
configuration and protected files, and unchanged service process identities.

No new Git commit/push. Prior locally pending resource-library source remains
preserved; its already-live functionality remains in the compiled frontend.

## Published result — 2026-10-05 (Asia/Shanghai)

- Recoverable backup: `/var/backups/oneshowlearn/workbench-z0FUjF2K`.
  Staging: `/tmp/oneshowlearn-workbench-Z2CTKdyu`.
  Frontend archive SHA256:
  `e74dba0cebb071ce32805a8ee8eb8a9e65b6b5bc53821fb7bd82a7f1289025fb`.
- Exact production entry matches the new hash above. Passed 39 HTTPS page
  entry hashes and 49 asset hashes, API health/catalogue/privacy checks,
  account/private-record/order identity preservation, unchanged historical
  amounts, catalogue/community/provider/pricing configuration, protected file
  hashes and service process identities. No backend/configuration edit or
  restart.
- Read-only live browser acceptance passed: community 16, resources 24, tutor
  22, projects 12 and course composer 15. Guest/mobile/login/private APIs and
  authoritative ¥499 checked; zero script errors, writes or provider calls.
  Authenticated article/group cases were tested in isolated databases, not by
  creating production accounts or exposing production private records.
- Live community destination opened in Codex. Local isolated preview stopped.
  No commit/push, production fixtures/content/configuration writes or migration.
