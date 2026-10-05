# 收藏资料库精修 · 2026-10-05

Owner-approved preview: `exec-c90417e7-38d5-48b7-99a1-1f4b908b7191.png`.

## Scope and behavior

- Content-only refinement: quiet heading/privacy/discovery, one category/search/tag/sort/view toolbar, equal cover-separated cards and compact first-use guidance to resources/courses/notes.
- Actual categories: courses, resources, documents, tools and starred personal notes. Formal chapter outlines remain learning resources. No claim that independent practical-project favorites, official community-article favorites or rich lesson-note stars are connected.
- Preserve actual safe CMS course artwork; missing/broken covers and resource/note illustrations use sharp native CSS/vector compositions explicitly labeled classification illustrations. No third-party sample brands or sample bookmarks imported.
- Accurate source and resource access labels; actions distinguish course detail, resource/outline/document/tool reading, locked learning rights and exact personal-note opening. Existing reader/copy/export/download/access enforcement remains authoritative.
- Search the full current-account personal note text and available resource summaries/source metadata, not only the 130-character card excerpt. Resource private bodies are not automatically retrieved for search.
- `/notes?note=<id>` opens only the current account's live personal record for reading. Refresh retains selection; missing/trashed/foreign references show a truthful warning. A recoverable opt-in editor draft is retained and never restored, replaced or saved merely by opening a bookmark.
- Recent sorting uses available resource save timestamps, personal note update times and old course insertion order. Missing course-save timestamps are not fabricated or migrated; the sort control explains this limitation.
- Versioned removal requires confirmation, affects only the selected reference/star and preserves original content. Failed saves/retries/409 keep newer account state and never delete underlying notes/documents.
- Browser-local grid/list preferences fail safely if storage is disabled. True initial empty state omits irrelevant toolbar controls; guest/loading/failure/archived/locked states never invent records.
- Shared brand/navigation/offer, five-chapter curriculum, production records/settings and provider behavior stay unchanged. No Git upload requested or performed.

## Verification

- Build succeeds; existing bundle-size advisory remains.
- `npm test`: 400 tests pass, zero failures.
- Isolated browser checks on the final build: favorites 69; notes 87; resources 61; community 68; tutor 96; course study 170; project catalogue 57; workbench 171; commercial/support/admin 56. Total 835 checks pass.
- Coverage includes 320/390/768/1024/1440/1920/2560px, readable separate covers, 44px actions, full-text search, exact note selection/refresh/private draft retention, actual reader/course routes, view storage, cancellation/removal/retry/409, guest/other-account/revoked access and real empty/error/unpublished references.
- Disposable local databases/accounts only; intercepted external provider requests. No test identity, bookmark or catalogue imported into production.

## Frontend-only release

- Expected prior entry SHA256: `a5fb331318c2dc925d4b52ae0a64adb7303f0920c4850ab62055270e2a6d9067`.
- New entry SHA256: `7c979f30cc71dfc4e2dfe28882a93bf76526aa8f258bf6bbf5aa275dc3bb0684`.
- Archive: `/tmp/oneshowlearn-favorites-20261005.tar.gz`; SHA256 `7ae74e0a847d4c29c03141dd34a190b021cb15878ebf3078e81a8d1829eedf61`.
- Remote staging: `/tmp/oneshowlearn-workbench-zqcjSW1Y`.
- Recoverable frontend/protected backend/configuration/dependency/environment/database backup: `/var/backups/oneshowlearn/workbench-a95H9Pit`.
- Three release locks, exact expected-entry guards, consistent snapshot, old asset retention and atomic frontend entry replacement with verification rollback. No backend/module/configuration update, migration, service restart or provider operation.
- Release completed successfully: all 39 HTTPS page entries and 47 exact asset hashes, API health/public catalogues and anonymous private guards pass. Existing account/private-record/order identities and historical order amounts preserved; provider/pricing/catalogue/configuration tables and protected backend/environment/dependency hashes unchanged. Service PID/restart/state comparisons identical; no restart.
- Post-release read-only browser verification: favorites 25, notes 21, resources 24, community 16, tutor 22, projects 12 and course composer 15 (135 total checks pass). Exact new entry and authoritative ¥499 verified; no account creation, production/private write, provider request or browser script error.
- QA screenshots under ignored `artifacts/favorites-library/` (320–2560px isolated coverage and live anonymous desktop/mobile captures). No QA fixtures/images imported to production or Git.
