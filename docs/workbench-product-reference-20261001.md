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

### Production publication result — October 4

- Platform archive `82bf8fc` and refinement `bebeb5f` pushed to `origin/main`; remote head verified. All previously uncommitted platform development is now maintained in Git; secrets/databases/generated temporary media are excluded.
- Frontend-only release succeeded on `https://oneshowlearn.com/app`. Exact entry SHA-256 `1319a6903030297682b3169644c5760f4f8a111b8aecb2dad75e19f095a83030` verified on all 37 HTTPS routes; all 45 staged frontend assets match their local hashes.
- Recoverable backup: `/var/backups/oneshowlearn/workbench-1grFGVVX` (frontend, server, environment, manifests and consistent database snapshot). No rollback was required. Old assets are retained.
- API health, public offer/login status/resource/course/project metadata and anonymous account/identity/order/project-run guards verified. Existing account/private-record identities and historical order identities/amounts preserved; provider configurations, pricing, content and CMS settings equal the backup.
- Backend/environment/package/nginx/systemd hashes and service PIDs/restart counts match before release. OneShowLearn/nginx/OneShowSEO/PocketLedger remained active without restart. No authenticated production save, order creation/closure, SMS/email/AI/payment gateway call, fixture upload or database migration was performed.
- In-app browser navigation did not complete its accessibility inspection within the tool timeout; this is not counted as a successful visual production check. Release acceptance is based on the exact HTTPS entry/asset checks and the isolated built-version visual/interaction regressions above.

## October 4 selected mock fidelity (supersedes the plain refinement)

Owner approval: richer workbench based on selected mock `exec-a57373fb-91ba-4995-b9be-364290304c6a.png`, then self-test, Git push and frontend-only production publication.

- Keep the persistent learner shell and all existing private learning/task/product/tutor actions. Use a lavender hero with a clear brand headline, actual current lesson and server-derived progress, plus a naturally proportioned dark course preview. Generated artwork is not a playable teaching video or evidence of completion.
- Five tinted chapter cards have distinct icons and real course status. Compact recent learning is rendered only for actual account records. Three project cards use distinct interview/directory/mobile illustrations, actual metadata and explicit demonstration labels; generic artwork never becomes a real delivered project.
- Prefer real CMS cover URLs, including future uploaded OPC course covers. Substitute only absent/failed covers or explicitly identified generic demo project assets. No CMS record is edited to introduce the artwork.
- Restore a deep-violet sidebar offer across roles. The current server offer is ¥499 / original ¥999; no hard-coded price replaces it. Administrators see a labeled price preview, not purchase evidence. Owned courses show unlocked/continue without another purchase demand. Last successful offers remain visible during failed route revalidation.
- Supporting tools retain explicit suggested tasks, course-context AI drafts (never automatic requests), private learning records and quiet mountain artwork. Small-screen and wide-sidebar layouts reflow without scaling text.

### Artwork provenance and final prompts

Mode: built-in `image_gen`, three separate generation jobs; no CLI/API fallback. Outputs were visually inspected and mechanically converted to quality-84 WebP without cropping or image content edits. These are generic classification illustrations; brand text, prices and progress remain real HTML and data.

Final workspace assets:

- `src/assets/workbench-course-preview-v1.webp` — 46,484 bytes.
- `src/assets/workbench-interview-v1.webp` — 47,180 bytes.
- `src/assets/workbench-directory-v1.webp` — 30,318 bytes.

Final prompt — course preview:

> Use case: product-mockup. Asset type: landscape 16:9 course-cover background for OneShowLearn AI product teaching. Dark navy-to-electric-violet studio backdrop, premium naturally proportioned silver laptop on the RIGHT half showing softly luminous code editor, purple ambient lighting, tiny restrained four-point sparkle near upper right. LEFT 50% clean dark navy negative space for real HTML course title. Straight horizon, laptop not stretched. No words, letters, logos, numbers, text, buttons or play icon anywhere. Buildable teaching preview artwork, elegant, high contrast, not neon sci-fi, no people.

Final prompt — interview:

> Use case: ui-mockup. Asset type: landscape 16:9 generic illustration for an AI interview assistant demonstration project cover. Premium periwinkle-blue and violet background, large naturally proportioned white conversational interview app window on RIGHT side, chat bubbles and tiny round generic portrait icon, abstract blank lines in bubbles, restrained subtle shadow. LEFT third has two floating chat bubbles with microphone/speech icons. Distinct interview scene not a dashboard. No text, words, letters, numbers, progress percentages, logos or watermarks. Crisp polished SaaS product illustration, fully contained composition.

Final prompt — directory:

> Use case: ui-mockup. Asset type: landscape 16:9 generic demonstration cover for AI tools directory project. Dark navy-violet premium product backdrop, front-facing naturally proportioned dark tool catalogue window on RIGHT two-thirds, broad search input bar and 3x2 tool tiles with distinct violet blue pink orange green simple abstract tool glyphs, no brand logos, no text letters numbers anywhere. LEFT third soft navy negative space and one tasteful glowing purple folder/card shape. Clearly a searchable tools directory, not interview chat or business analytics dashboard. Restrained ambient light, elegant commercial SaaS illustration, fully contained.

### Final verification and publication guard

- Complete regression: 363 tests passed. Production build passed; existing main-bundle size advisory remains, and no dependency/backend changes are included.
- Workbench browser suite: 79 checks passed; covers fresh/returning/trial/admin/guest identities, 320–2560 px, sidebar modes, actual lesson/progress, private account changes, task save/completion, AI context/draft preservation without provider calls, unavailable/route-failure states, restored pricing, distinct cover assets, cover brand contrast and real CMS cover precedence.
- Commercial browser regression: 56 checks passed. Disposable fixture databases only; no production fixture upload, provider request or merchant configuration write.
- Visual checks: final screenshots for 390/1440/1536/1920 px, plus in-app local preview. Corrected the cover wordmark's inherited dark color and removed the tagline at thumbnail size. Screenshots remain ignored under `artifacts/workbench-refinement/`.
- Frontend-only release expects live entry `1319a6903030297682b3169644c5760f4f8a111b8aecb2dad75e19f095a83030`, new entry `15c4d7d8460829a5f7beb466d1ccc3ca261990af39231105360ddb9eb478bea0`. Reuse backup/version-lock/atomic replacement/rollback and exact HTTPS verification. Preserve all production data, pricing, configuration, backend hashes and running services.

### Selected-mock production result — October 4

- Implementation `ed8ba4c8f17a88717256c45eab7ab92081e89246` pushed to `origin/main`, remote head verified. Only the approved frontend and release/test/provenance documentation are part of this change.
- Published at `https://oneshowlearn.com/app`: all 37 HTTPS page entry hashes match new entry `15c4d7d8460829a5f7beb466d1ccc3ca261990af39231105360ddb9eb478bea0`; all 50 staged frontend assets match their local hashes. API health, public catalogues and anonymous private-endpoint guards passed.
- Recoverable backup: `/var/backups/oneshowlearn/workbench-mZc7NeMp`, including frontend/server/environment/dependency manifests and a consistent database snapshot. Atomic entry replacement succeeded; no rollback required, and old assets retained.
- Existing account/private-record identities and all historical order identities/amounts preserved. Payment/login/model/service configuration, pricing and course/project/CMS records unchanged. Backend/environment/nginx/systemd hashes and all monitored service PIDs/restart counts equal their before-release values. No production configuration save, test data import, database migration, provider call, order operation or service restart.
- Final local built-version visual checks and browser suites passed. The additional in-app production tab inspection timed out; it is explicitly not counted as a successful production visual check. HTTPS exact-file verification succeeded independently. Final shown screenshot is labeled as an isolated test-account rendering, not a production learner's private page.
