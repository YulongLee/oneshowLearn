# Course assistant alignment — 2026-10-04

## Approved scope

Reference: `exec-030a514f-71de-4764-98a1-59c8a9ced74a.png`.
Owner requests implementation, self-test, uploading current code to Git and release.
Earlier pending source changes are included; credentials, databases, uploads,
generated media and local QA captures remain excluded.

## Implementation

- Course-only desktop columns stretch to equal height. Directory retains natural
  height; the assistant fills the remaining rail and aligns with the actual reading
  footer, including the final lesson without a next-lesson card.
- Existing grounded loading/errors/answers/citations/private-note save/copy actions
  move above the composer into a focusable, keyboard-scrollable answer region.
- Size containment keeps long responses from enlarging the desktop page; the empty
  state is clearly a prompt, never a fabricated AI response.
- Composer keeps a normal height at the bottom. Two primary actions share a row;
  other tools and disclosure remain accessible.
- Stacked/mobile layouts reset to natural flow with a bounded answer region.
- Mounted video/AI drafts, progress, private-note autosave/conflict/departure guards,
  directory toggles/resizing, permissions, demo-completion restrictions, projects,
  shared branding/navigation/offer and the five-chapter curriculum are preserved.

## Verification

- Full regression: 373 tests, zero failures.
- Isolated course browser suite: 147 checks, including default/short/final-lesson
  footer alignment, narrow/wide screens, directory/assistant toggles, long answer
  containment and keyboard scrolling, busy/error/draft preservation, private notes,
  feature/access/demo completion guards, projects and 320–2560px layouts.
- Existing workbench browser suite: 171 checks; commercial suite: 56 checks.
- Desktop/mobile screenshots reviewed. No script errors or real AI/payment/email/SMS
  calls. Shared font imports are intercepted by the course test.
- Production build passed; existing large-bundle advisory remains.

## Release contract

Frontend only, after source safety review and Git push. Recoverable frontend,
protected backend/environment/manifests and consistent database backups; expected
entry hash guard; old content-addressed assets retained; atomic entry replacement
with automatic rollback on failed verification. Verify exact HTTPS entries/assets,
anonymous privacy guards, preserved private-record/order identities and historical
amounts, unchanged configuration/pricing/catalogues/protected hashes/services.
No production fixtures/migrations/backend/configuration edits/provider operations
or service restart.

Expected previous entry: `540e2567889012983f7272aac7c7ac60954dab3fcfa08b6524edd1a4071ea9f6`.
Verified new entry: `3801736586eb64344da0ff0f51d5784e655069dfc83058fdc7e6f5cd9125d2bb`.

## Published result

- Source commit `9db04e499001d2fff7dbf0672730478323f5dd4a` pushed to `origin/main`,
  including the reviewed pending learner UI source changes. Staged-file checks
  excluded environment/database/private-media files and found no credential material.
- Frontend publication passed 39 HTTPS entry and 50 asset hash checks, API health,
  anonymous privacy checks, preserved record identities/historical order amounts,
  unchanged configuration/pricing/catalogues/protected hashes and service processes.
- Independent live anonymous browser smoke verified the exact entry, desktop footer
  alignment, normal composer, actual cover/thumbnail, five chapters and 390px mobile
  response height/overflow. Zero script errors or attempted writes; external requests
  were blocked and no AI/payment/email/SMS calls were issued.
- Recoverable snapshot: `/var/backups/oneshowlearn/workbench-I13CZLFb`.
- Verified staging: `/tmp/oneshowlearn-workbench-FQCOQLrg`.
