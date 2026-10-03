# Workbench product-focused reference — 2026-10-01

Scope: local development of /app from the owner's reference 9a5080f8. No production deployment or production data changes.

## Composition

- Compact personal greeting; pale violet hero with five-stage learning progress, owned-course continuation and a separately labeled current practical-project card.
- Personal AI product comes from the latest non-archived product achievement. Its manually recorded stage is not inferred from lesson completion.
- Published project recommendations are three compact rows. Recent learning and account outcomes sit beneath.
- Right rail: daily tasks, capability-aware AI tutor, real-month calendar, restrained inspiration artwork.
- Persistent workspace sidebar/header and purchase card are unchanged. Empty, loading and error states remain explicit. Decorative project imagery is labeled as an illustration.
- Below 1050px usable content width the rail moves below. Below 800px main-column width the hero and content cards stack. On phones the five-stage strip scrolls horizontally without shrinking labels.

## Verification

- Production build passes; existing bundle-size advisory remains.
- 118 platform/model/UI-contract tests, 129 API tests and 4 Sites packaging tests pass (251 total).
- Browser checked at 1440, 1920, 2560, 768 and 390 CSS-pixel widths. No document horizontal overflow; responsive right-rail conflict corrected. No broken image elements at desktop and no captured console errors.
- Local preview account: course continuation reaches video/courseware; project continuation reaches the shared reader with Codex materials; personal-product entry reaches achievements.
- Calendar date selection changes the displayed task day and resets to today.
- AI entry carries an unsent question draft into the tutor. No live model request was sent during these checks.
- No mock product, task, progress, income or AI advice was inserted to match the reference. Existing isolated preview data was retained.

## October 4 approved refinement (supersedes the composition above)

- Lesson-first lavender hero with real current lesson, server-derived course access and actual completed/total lesson count. Explicit previews do not become owned courses. The five existing CMS chapters remain unchanged and are presented separately.
- Recent learning/current project/personal product appear only when the current account has records. Three cover-led project discovery cards and a compact product/outcome entry replace repeated empty cards and zero metrics.
- Supporting rail is suggested-or-actual daily tasks, course-context AI shortcuts, compact learning record/calendar entry and quiet brand copy. Suggestions are saved only by an explicit action; AI shortcuts never send automatically. Existing unsent tutor drafts require an explicit replacement choice.
- Persistent shell remains intact. Offered-course ownership changes the sidebar to unlocked/continue; management access is explicitly distinct from purchase. Successful checkout refreshes the account library. Background revalidation keeps the previous successful offer without route flicker.
- Available content width determines 3/2/1 project columns and stacked rails. Text is not page-scaled. Guest, loading, data failure and cross-account states remain explicit.

### Isolated verification

- `npm test`: 361 tests passed (144 platform/model/UI, 158 API, 10 storage, 17 diagnostics, 11 Alipay page-flow, 17 commercial, 4 Sites).
- `npm run build`: passed; existing >500 KB main-bundle advisory remains. No unrelated optimization or dependency update was bundled into this release.
- `node scripts/check-workbench-ui.mjs`: 59 checks passed; fresh/returning/trial/admin/guest states, true 3-column desktop cards, 320/390/768/1024/1440/1920/2560 px, expanded/360px/icon/hidden sidebars, saved tasks/notes, current lesson and phase navigation, account switch, AI scope/draft preservation, unavailable services and failed price revalidation. No script errors or provider requests.
- `node scripts/check-commercial-ui.mjs`: 56 regression checks passed for public/login/legal/support/community/admin loading and responsive pages; no script errors.
- Fixtures use newly created temporary databases and invalid-domain identities. Screenshots/temp media remain ignored in `artifacts/`; no test records, credentials or local database are uploaded.

### Release plan

- Archive prior platform development as `82bf8fc`; current refinement is a separate commit. Owner explicitly requests pushing both to the existing Git remote.
- Deploy only `dist/client` through `deploy/update-workbench-refinement.sh`, guarded by prior entry SHA-256 `0d2b24d02c35cd5a6e794d07d13340a9fb85974dc7e9a5c639af7a7b6fed3bae` and new entry `1319a6903030297682b3169644c5760f4f8a111b8aecb2dad75e19f095a83030`.
- Recoverable frontend/backend/environment/dependency-manifest backup plus consistent database snapshot before replacement. Keep old content-addressed assets; replace only the entry atomically and restore it automatically on verification failure.
- Verify exact HTTPS entries/assets, anonymous account/order guards, unchanged server/provider settings/pricing/catalogues, existing record identities/historical amounts, and unchanged service PIDs/restart counts. No backend/configuration mutation, fixtures, gateway calls or service restart.
