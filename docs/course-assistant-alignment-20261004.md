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

## Composer focus follow-up

The owner subsequently reported nested focus outlines and requested optimization.
Initially verified locally only; a subsequent explicit publication request approved
the frontend-only release recorded below. No new Git commit or push was requested.

- Course composer now has one visible outer focus ring for pointer and keyboard
  input. Only its inner textarea outline/resize handle are suppressed; other forms,
  project and standalone AI inputs retain their existing styles.
- The textarea grows from 68px to 132px, then scrolls internally. Shortened questions
  shrink again; width changes and panel restoration recalculate wrapping without
  changing the draft. The separate send toolbar does not overlap text.
- Full regression: 374 tests, zero failures; build passed with the existing bundle
  size advisory. Course browser suite: 170 checks, including actual mouse/Tab focus,
  whitespace disabled state, multiline growth/shrink, width reflow, mobile scrolling,
  hide/restore drafts and all preceding learning flows. Workbench: 171 checks;
  commercial: 56 checks. Total browser checks: 397, zero script errors.
- Focused desktop/mobile composer screenshots inspected. All API writes, users,
  notes and AI answers used isolated fixtures/mocks; no production records,
  configuration or real provider calls were involved.

### Composer publication

- Repeated full regression/build and all 397 isolated browser checks against the
  exact release build. All passed; existing bundle-size advisory unchanged.
- Live entry guarded from
  `3801736586eb64344da0ff0f51d5784e655069dfc83058fdc7e6f5cd9125d2bb` to
  `9fd4de7bfd16387e634281785347f99627e751935ca41e62bab05304f35ae143`.
  Compiled frontend only; prior content-addressed assets retained and entry
  replaced atomically with automatic rollback on failed verification.
- Recoverable frontend/protected backend/environment/manifests/database snapshot:
  `/var/backups/oneshowlearn/workbench-CrDKp9nO`. Staging:
  `/tmp/oneshowlearn-workbench-DVZLtLc7`. Local package:
  `/tmp/oneshowlearn-composer-release-k6TdfCOi/frontend.tar.gz`, SHA-256
  `76dd5d482c83d0b31302e046a66e6ebc7fb63edcc5a57694e600f08b22488942`.
- 39 exact HTTPS entry checks, 50 asset hashes, API health and anonymous privacy
  guards passed. Existing private-record/order identities and historical amounts,
  catalogue/provider/pricing configuration, protected backend hashes and service
  processes verified unchanged. No production fixtures, migration or restart.
- `deploy/check-course-composer-live.mjs`: 15 anonymous production checks passed
  against an actual published preview. Pointer/Tab focus, single ring, bounded
  multiline growth/shrink, preserved local drafts and 390px mobile overflow were
  verified; focused desktop/mobile screenshots reviewed. Zero script errors,
  attempted writes or AI/payment/email/SMS calls; external requests blocked.
- No new Git commit/push; scoped source remains in the working tree.
