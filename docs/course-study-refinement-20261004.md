# Course study refinement — 2026-10-04

## Approved scope

Selected reference: `exec-cebac2ca-ca8a-4a4c-a6c1-dd41baef36d8.png`.
Owner requests development, self-test and production release. Course readers only;
the five-chapter curriculum, shell, purchase entry, permissions and project
experiment behavior remain unchanged.

- Compact actual lesson title/subtitle; course completion appears once in the directory.
- Labeled decorative demo cover before/after playback. Actual media uses the existing
  uncropped 16:9 player with `object-fit: contain`; source aspect ratios are preserved.
- Direct authorized courseware thumbnail, preview/download and selected-material reader.
- Courseware/private-notes tabs retain mounted drafts, autosave and conflict/departure guards.
- Two primary grounded AI actions; remaining tools and data-use explanation stay accessible.
  Course composer supports Enter / Shift+Enter with IME, repeat, capability and busy guards.
- Actual next-lesson navigation does not complete lessons or bypass access checks.
- Demo media remains explicitly labeled and cannot satisfy completion.

## Verification

- `npm test`: 372 tests passed, zero failures.
- Production build passed; existing large-bundle advisory remains.
- Isolated course browser suite: 93 checks passed, including authorized media,
  preview/download, selected materials, private notes, mocked AI/citations, keyboard
  and capability guards, demo/formal completion, trial/guest isolation, note-version
  conflict/departure protection, project experiment regression and 320–2560px layouts.
- Existing workbench browser suite: 171 checks passed.
- Existing commercial browser suite: 56 checks passed.
- Desktop/mobile screenshots reviewed. No script errors. Test AI is mocked; shared
  font imports are intercepted and no external provider requests are issued.
- Whitespace and release-script syntax checks passed.

## Release contract

Frontend only; no production content import, migration, backend/configuration edit,
gateway/order operation, real AI/SMS/email call, service restart or Git push.
Keep old assets, take recoverable frontend/protected-code/configuration/database
backups, guard the expected entry, and atomically replace it with automatic rollback
on failed verification. Verify HTTPS entries/assets, anonymous private-data guards,
existing records, pricing/provider/catalogue preservation and unchanged processes.

Expected previous entry: `2ab7a97e40926315b30f2d390931df566e80312fa1db15371002ba5ab50a71f8`.
Verified new entry: `540e2567889012983f7272aac7c7ac60954dab3fcfa08b6524edd1a4071ea9f6`.

## Published result

- Frontend release succeeded; 39 HTTPS entry hashes and 50 asset hashes matched.
- API health and anonymous private-data guards passed.
- Live anonymous first-preview browser smoke passed: updated cover and authorized
  thumbnail decoded, five chapters/two tabs/two AI actions/next lesson rendered,
  with zero script errors. Every write and external request was blocked.
- Existing accounts/private-record identities and historical order amounts preserved;
  provider configuration, pricing, catalogues, protected backend/environment hashes
  and all monitored service processes remained unchanged.
- Recoverable snapshot: `/var/backups/oneshowlearn/workbench-HRDSdqYW`.
- Verified staging: `/tmp/oneshowlearn-workbench-HnwQmgwS`.
