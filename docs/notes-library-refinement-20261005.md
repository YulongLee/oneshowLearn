# Unified learning notes — 2026-10-05

Owner approved `exec-8c4c034d-4255-4a00-890b-f95fd7958ea5.png` and requested
implementation, self-test and publication. No new Git upload requested.

## Implementation

- Preserve persistent shared shell, branding, offer and all account-private
  records. Compact heading/private status, three blank personal-draft templates,
  unified all/course/project/personal filters, searchable list and broad reader.
  No illustrative notes, fabricated statistics or additional promotion/AI rail.
- Personal Markdown/tags/stars/checklists/import/export and rich course/project
  records retain their existing separate APIs. Read all bounded note pages;
  search full text, tags and actual course/project/chapter/lesson source.
  Published project stage metadata is read separately because course entry
  contains course placements only. Missing/archived sources remain truthful;
  saved private notes remain readable without repurchasing access.
- Real video timestamp/slide/source associations stay unchanged. Return link
  goes to the corresponding lesson; no unsupported timestamp-seeking promise.
  Rich export is explicitly plain text, not a lossless rich-note export.
- Manual versioned saves, soft trash/recovery and route/browser departure
  guards. Account-isolated current-tab drafts require explicit recovery and
  distinguish browser storage from saving to the account. Storage/save failures
  keep inputs. Reading another record cannot discard a recoverable draft;
  replacing one requires confirmation. Both lesson-version conflicts and stale
  personal snapshots retain input and prevent silent overwriting on retries.
- Bounded rendered list with all loaded records searchable, loading/partial
  read/retry and honest fresh-account/guest states. Content-width responsiveness,
  mobile list/detail/back/resume and wrapped editing controls. Mobile reader
  hides template starters until returning to the list, prioritizing content.
- Frontend only. No schema/backend/configuration change, model/payment/SMS/email
  request, CMS/private fixture import, new Git push or service restart.

## Verification

Production build passed (existing bundle-size advisory only). Full regression:
396 tests. Isolated notes suite: 87 checks covering full pagination/full-body
search, actual source/time, Markdown/rich preservation, manual saves, template
drafts, keyboard, explicit recovery, conflicts/retries/export, soft trash,
320–2560px/list/editor touch and reflow, anonymous/other-account/revoked account,
unavailable storage and partial-read/save failures. All accounts and notes are
temporary local fixtures, never production data. Desktop/mobile reader/editor
captures inspected and isolated local preview opened.

Other final-build isolated suites passed: resource library 61, official community
68, tutor studio 96, project catalogue 57, course study 170, workbench 171 and
commercial service 56. Including notes: 766 isolated browser checks. No real
providers or unexpected browser script errors.

## Release controls

Expected live entry:
`d4cf0d24776168e4a2d9a10f1f4ca2e6510165231d5f33e19950eabdec15ecf6`.
New compiled entry:
`a5fb331318c2dc925d4b52ae0a64adb7303f0920c4850ab62055270e2a6d9067`.

Frontend-only protected-file/environment/manifests and consistent database
snapshot, expected-live/staging hashes, retained prior assets, atomic entry
replacement and rollback on failed verification. Verify exact HTTPS entry and
assets, anonymous notes/account/orders/privacy, preserved record identities and
historical amounts, unchanged content/provider/pricing/settings and service
process identities. No authenticated production test records or mutation.

Local pending community/resource refinements remain preserved and compiled;
their already-published behavior is not reverted. No source Git push.

## Published result — 2026-10-05 (Asia/Shanghai)

- Recoverable backup: `/var/backups/oneshowlearn/workbench-VfGsqEKs`.
  Staging: `/tmp/oneshowlearn-workbench-aoEFrFqf`.
  Frontend archive SHA256:
  `419e4d050372725ddceb9166112bed686499bfd9f83038f2e278245e2013aa13`.
- Exact live entry matches the new hash above. Passed 39 HTTPS page hashes,
  49 asset hashes, API health/catalogue/privacy, preserved account/private-record
  and order identities/historical amounts, unchanged provider/content/pricing
  configuration and protected backend/environment hashes, unchanged service
  process identities. No restart/backend/database/configuration edit.
- Read-only live browser checks passed: notes 21, resources 24, community 16,
  tutor 22, projects 12, course composer 15 (110 total). New notes header,
  anonymous gate/import/login, mobile/touch/privacy and authoritative ¥499
  checked; zero script errors, mutations or provider operations. Authenticated
  editing/private-data cases tested only in disposable isolated accounts.
- Online `/notes` opened in Codex; local isolated preview stopped. No fixture
  upload, new Git commit/push, model/gateway operation or private record write.
