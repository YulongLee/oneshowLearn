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

### October 4 right-rail whitespace follow-up — local only

- The owner reports blank space below the right tools when the main column is longer. Keep all selected-mock cards/content and use a bounded sticky rail on two-column desktop layouts; its measured height determines the offset, so tall rails scroll naturally before their bottom follows the viewport. The parent grid bounds it at the main-column end instead of leaving an empty right-hand tail.
- ResizeObserver remeasures asynchronous card changes and header size; viewport resize recalculates the offset. Mobile/tablet stacked rails remain static. Existing cards, inputs and dialogs remain mounted; no new filler, data, API request, persistence or animation is introduced.
- Production build and all 364 regression tests passed. The isolated workbench browser suite passed 89 checks, including new/returning bottom alignment, visible rail bottom, mobile static positioning and task keyboard focus, in addition to the existing private-record/task/AI/offer/access checks. Bottom screenshots are ignored artifacts under `artifacts/workbench-refinement/rail-bottom-{fresh,returning}-1536.png`.
- This follow-up is not committed/pushed or deployed. Production still runs the verified selected-mock release above; release requires the owner's next explicit approval and new expected-entry guards.

### October 4 project rotation follow-up — local only

- Replace the three static “从学习，走向实战” cards with a native horizontally scrolling, snap-aligned strip. Load up to twelve actual published project recommendations, prioritizing CMS-selected IDs and then the other returned published records. Existing cover precedence, demonstration labels, project routes and the complete-catalogue entry remain intact; no project record or private learning state is created by browsing.
- Desktop shows three cards, narrower main columns two, and phones one. Every eight seconds advance one card, gently reversing direction at the last window instead of jumping to the first. All cards remain mounted at a shared natural height. One/two-project desktop lists use their available width without duplicate filler; two-project mobile lists remain manually browsable.
- Provide previous/next and pause/resume controls. Autoplay pauses for hover, keyboard interaction, touch, hidden document and an offscreen strip; reduced-motion preference disables autoplay and smooth scrolling. Offscreen cards are inert/hidden from accessibility navigation. Resizing retains the logical current project and keeps any focused card visible.
- Final production build passed. Complete regression passed all 366 tests; the isolated workbench browser suite passed 114 checks, covering automatic advance, hover/focus/manual pause/resume, native scroll settlement, real project navigation, reduced motion, one/two-project catalogues, mobile overflow, current/focused-project retention during resizing and the preceding right-rail fix. No script errors or provider calls. Desktop/mobile carousel screenshots were visually inspected under ignored `artifacts/workbench-refinement/project-carousel-{next-1440,mobile-390}.png`.
- The carousel and preceding rail follow-up are local and uncommitted/undeployed. Production remains on the selected-mock release; prices, backend, settings, accounts, content and running services were not changed.

### October 4 project rotation and right-rail production release

- Owner subsequently explicitly approved deployment of both verified frontend follow-ups. Re-ran all 366 regression tests, production build and 114 isolated browser checks successfully before publication. Existing bundle-size advisory remains; no new dependency/backend changes.
- Expected live entry `15c4d7d8460829a5f7beb466d1ccc3ca261990af39231105360ddb9eb478bea0` matched. Compiled frontend entry `112f647824fcab4341046b59c1bae143f5870353f4075bd4fe716572c72ce308` published atomically; all 37 HTTPS routes and 50 staged assets match exact release hashes, with old assets retained and no rollback required.
- Recoverable backup: `/var/backups/oneshowlearn/workbench-oXet5fFv`, including frontend, protected server/environment/dependency manifests and consistent database snapshot. API health/public catalogues/private anonymous guards passed. Existing account/private-record identities and all historical order identities/amounts preserved; provider/pricing/CMS records and protected backend/configuration hashes unchanged. All monitored service PIDs/restart counts remained equal.
- No production fixture write, migration, configuration save, gateway request, order operation, service restart or new Git push. Local built-version screenshots/browser checks provide visual/interaction acceptance; production acceptance here is exact-file HTTPS and privacy/data/service verification, not an authenticated production screenshot claim.

### October 4 continuous-flow correction — local only

- Owner's screenshot confirms the stepped release is visible, but rejects both its status/count/controls footer and stop/start motion. Replace that version locally with constant horizontal movement at 24 px/second, accumulated with fractional precision on animation frames. Cycle through matching copies of the same published cards; wrap by one exact group width so the visible arrangement continues seamlessly, without reversal, blank padding or waiting eight seconds between steps.
- Remove the full footer, page counter and arrows. A normally clipped pause/resume control remains available to screen readers and becomes visible only on keyboard focus; the normal visual presentation contains project cards only. Hover, focus, touch, hidden-document and offscreen conditions pause movement. Native horizontal scrolling remains available; reduced-motion users and desktop catalogues fitting the available width have static, keyboard/scroll-accessible originals without seam copies.
- Seam copies remain pointer-operable and excluded from the keyboard sequence/accessibility tree; the same real project routes are used. Keyboard focus on originals stops animation and remains visible during resizing. Retain three/two/one responsive widths, real covers/labels, all private functionality and the published right-rail fix. No new records, service/provider requests or backend changes.
- Production build and all 366 regressions passed. Isolated workbench browser suite passed 119 checks, including displacement measured over consecutive one-second intervals, hover/manual pause and resume, cycle crossing, hidden footer, reduced motion, original/copy project navigation, small catalogues, focused mobile resizing and prior rail/access/private-state checks. No script errors or provider calls. Desktop/mobile screenshots were visually inspected at ignored `artifacts/workbench-refinement/project-flow-{desktop-1440,mobile-390}.png`.
- This new correction is local only and has not been pushed or deployed. Compiled entry is `fa8e3a407db13fb173aebba232dcf3fd62eeb3d6a8eed5ab0db1155623dc8972`; production still has stepped entry `112f647824fcab4341046b59c1bae143f5870353f4075bd4fe716572c72ce308`. A new owner deployment request and refreshed release guards are required before publishing it.

### October 4 continuous-flow production release

- Owner subsequently explicitly approved publishing this correction. All 366 regressions, production build and 119 isolated workbench browser checks passed again before release. Updated live-entry guard matched stepped entry `112f647824fcab4341046b59c1bae143f5870353f4075bd4fe716572c72ce308`.
- Frontend-only atomic entry replacement succeeded at `https://oneshowlearn.com/app`: new entry `fa8e3a407db13fb173aebba232dcf3fd62eeb3d6a8eed5ab0db1155623dc8972` verified on all 37 HTTPS routes and independently from the local client; all 50 staged frontend asset hashes matched. Old assets retained; no rollback required.
- Recoverable backup `/var/backups/oneshowlearn/workbench-FxWAbKvZ` contains the prior frontend, protected server/environment/dependency manifests and a consistent database snapshot. API health, public catalogues and anonymous private-endpoint guards passed. Existing account/private-record identities and historical order identities/amounts preserved; pricing/provider/CMS configuration and protected backend/environment/service hashes unchanged. All monitored service PIDs/restart counts remained equal.
- No production fixture writes, migrations, configuration saves, gateway/order operations, service restart or new Git push. Visual/interaction acceptance uses the isolated built-version browser suite; production verification is exact-file HTTPS plus privacy/data/configuration/process checks, without claiming an authenticated production screenshot.

### October 4 final inspiration-card alignment — local only

- Owner asks for the right mountain card to extend to the left content bottom instead of leaving an empty tail. Supersede the earlier sticky-rail workaround with equal-height desktop columns: task/tutor/calendar rows retain natural heights and only the final inspiration row fills the remaining height. Align the left final product/outcome entry to the same bottom when the tools are taller. Remove the unused sticky-height observer; normal page scrolling and all mounted private functionality remain intact.
- Stacked tablet/mobile layouts reset the rail to natural rows; no desktop filler height carries over. Retain the approved continuous project flow, shared branding/sidebar offer, actual content, access rules and existing API behavior.
- Production build, all 366 regression tests and 123 isolated workbench browser checks passed. Desktop new/returning-account bottom alignment and mobile layout screenshots were visually inspected; no script errors or provider calls. Existing bundle-size advisory remains. Screenshot artifacts are isolated fixture renderings, not authenticated production pages.
- Local implementation only: no new deployment, Git push, production data/configuration write or service restart. Production remains on continuous-flow entry `fa8e3a407db13fb173aebba232dcf3fd62eeb3d6a8eed5ab0db1155623dc8972`; publication requires a subsequent explicit owner request and refreshed release guards.

### October 4 final-card alignment production release

- Owner subsequently explicitly approved publication. Re-ran production build, all 366 regressions and 123 isolated workbench browser checks successfully. Expected current continuous-flow entry matched before release; compiled frontend entry `6051d0985e33f8b825de0d9bf5f78f216e0189293e5c75d11ec6eff74d9f32c2` replaced it atomically, retaining old assets. No rollback required.
- All 37 HTTPS page entries and 50 staged asset hashes verified, plus an independent local HTTPS `/app` entry comparison. API health/catalogues and anonymous private-route guards passed. Visual/interaction acceptance remains the isolated built-version suite, not an authenticated production screenshot claim.
- Recoverable backup `/var/backups/oneshowlearn/workbench-2XwMgWzk` preserves previous frontend, protected backend/environment/dependency manifests and consistent database snapshot. Existing account/private-record identities and all historical order identities/amounts preserved. Provider/pricing/content configuration, protected code/environment/service hashes and monitored service PIDs/restart counts unchanged.
- No production fixture imports, migrations, configuration saves, gateway/order operations, service restart or new Git push. Frontend-only release complete.

### October 4 mountain clarity correction — verification

- Owner accepts current card geometry and explicitly requests correcting the washed-out mountain and then publishing. Preserve the same flexible card/column alignment. Reuse the unchanged 1000×500 artwork; remove 35% opacity and the second tinted overlay, fade only its top 32%, and frame toward the right-side mountain/person. Bound the decorative layer to 380px and the available space below a 96px text-safe area; long returning-account content no longer enlarges the landscape without limit. No actual blur/sharpen filter, new image or functionality change.
- Production build, all 367 regression tests and 134 isolated browser checks passed. Added full-opacity/no-filter/bounded-layer assertions and text-safe-area checks at 320–2560px; all prior continuous-flow/private-state/responsive/bottom-alignment checks remain. Final fresh/returning desktop mountain screenshots and mobile layout were visually inspected. No script errors/provider calls; existing bundle-size advisory remains.
- Approved release expects live entry `6051d0985e33f8b825de0d9bf5f78f216e0189293e5c75d11ec6eff74d9f32c2` and new compiled entry `078f74dfd4be0a871a9dc5cd8e95fcfdcc9f8a8d51878e7e694e4e660d6562cb`. Only compiled frontend is staged; backup/atomic/rollback and privacy/data/configuration/service verification remain mandatory. No Git push authorized.

### October 4 mountain clarity production result

- Expected live entry matched and frontend-only atomic replacement succeeded. All 37 HTTPS page entry hashes and 50 staged asset hashes matched; independent local HTTPS `/app` comparison also matched new entry `078f74dfd4be0a871a9dc5cd8e95fcfdcc9f8a8d51878e7e694e4e660d6562cb`. Old assets retained, no rollback required.
- Recoverable backup `/var/backups/oneshowlearn/workbench-hJxTJJN7` contains the prior frontend, protected backend/environment/manifests and consistent database snapshot. Health/catalogue/privacy checks passed; account/private-record identities and historical order identities/amounts preserved. Provider/pricing/content configuration, protected backend/environment/service hashes and monitored service PIDs/restart counts unchanged.
- No production fixture imports, migration, configuration save, gateway/order operation, service restart or Git push. Visual acceptance is the isolated built-version screenshot suite, not an authenticated production screenshot claim. Release complete.

### October 4 selected AI-tutor sidebar course card — implementation/self-test

- Owner selected preview `exec-251abe7b-7f4c-4fa9-bd52-451c7c4d18e2.png` and explicitly requests implementation then publication. Preserve the shared shell and unlocked/management/guest distinctions. Rich violet invitation now leads with the AI OPC course identity and value, actual offered-course chapter/lesson counts, three benefits including a highlighted tutor row, authoritative price/original price, one-time billing, full-course navigation and a separate actual-preview action. Remove trial/savings clutter; payment note lists only available server-reported channels, otherwise tells the user to check the cashier.
- Derive counts and first preview route from matching published offered-course metadata, never hard-code 5/40/2 or reuse another course's catalogue. Retained metadata excludes progress and entitlement/private fields; failed route revalidation preserves the last successful offer/catalogue and obsolete requests are ignored. Purchased learners keep unlocked/continue without prices/preview/repurchase marketing. No orders, payments or AI requests are initiated by these buttons.
- Adapt at existing 228–360px sidebar widths. Short viewports simplify secondary copy without hiding AI/primary/preview; extreme short-height cards allow bounded native scrolling, and keyboard focus reveals its target. Existing menu scroll, icon/hidden modes and mobile drawer behavior preserved. Existing mountain artwork only; generated mock is not a rendered website screenshot or production asset.
- Final build and all 369 regressions passed. Workbench isolated browser suite passed 165 checks, including catalogue counts, disabled/available payment labels, metadata revalidation failure, original preview reader navigation, purchased refresh, 320×480 keyboard target containment, drawer/sidebar geometry and prior private-state/flow/bottom-alignment regressions. Commercial browser suite passed 56 additional checks; zero script errors or provider calls. Visual inspection covered narrow/wide card and mobile screenshots under ignored artifacts. Existing main-bundle-size advisory remains.
- Frontend-only release expects live entry `078f74dfd4be0a871a9dc5cd8e95fcfdcc9f8a8d51878e7e694e4e660d6562cb`, new entry `2de880f016f7dcca757809d04dcb670701b08ce088e8abb68ee48820400fb5e1`. Back up, guard, retain assets, atomically publish/rollback and verify HTTPS/privacy/data/settings/process preservation. No backend/configuration change, migration, fixture upload, gateway/order operation, restart or Git push authorized.

### October 4 AI-tutor sidebar card production result

- Expected live guard matched; frontend-only atomic entry replacement succeeded, retaining prior assets. All 37 HTTPS page entries and 50 staged asset hashes matched new entry `2de880f016f7dcca757809d04dcb670701b08ce088e8abb68ee48820400fb5e1`, also independently verified from local HTTPS `/app`. No rollback required.
- Recoverable backup `/var/backups/oneshowlearn/workbench-J7amGbyw` includes the previous frontend, protected backend/environment/dependency manifests and a consistent database snapshot. Health/catalogues/private anonymous guards passed. Existing account/private-record identities and historical order identities/amounts preserved; pricing/provider/content settings and protected backend/environment/service hashes unchanged. All monitored service PIDs/restart counts equal before-release values.
- No production fixture import, migration, configuration save, gateway/order operation, service restart or Git push. Visual acceptance uses isolated narrow/wide/mobile screenshots, not an authenticated production screenshot claim. Release complete.

### October 4 simplified course-card refinement — verified

- Owner selects the quieter preview `exec-0a035500-5970-4718-a088-4f76c9f8bc36.png` and requests implementation/publication. Remove the eyebrow, count pill, tutor box and outlined secondary button. Keep a course heading/value/plain actual chapter/lesson metadata, three identical check-led benefits, authoritative price/one-time billing, one white primary button and a secondary text-style preview. Shorten the courseware benefit to “课件 · Prompt 模板” so the default 228px sidebar never splits the word 模板. Mountains are faint and confined to the bottom 74px, rather than competing behind pricing.
- Preserve purchased/management/checking states, real counts/preview routes, available-channel labels and no-flicker/stale-response protections. Preview retains a 44px touch target, keyboard focus and native short-card scrolling; navigation and all private functionality remain unchanged. No new image/dependency/backend changes. Generated design is a reference, not an actual website render.
- Production build and all 370 regression tests passed. The final isolated workbench suite passed 171 checks, with new assertions for uniform benefits/plain metadata/text preview/bounded artwork and unbroken narrow labels; prior account/flow/navigation/320–2560px checks retained. The final commercial suite passed 56 checks. Narrow/wide/mobile screenshots visually inspected; zero script errors/provider calls. Existing main-bundle-size advisory remains.
- Expected live entry `2de880f016f7dcca757809d04dcb670701b08ce088e8abb68ee48820400fb5e1` verified read-only. New compiled entry `2ab7a97e40926315b30f2d390931df566e80312fa1db15371002ba5ab50a71f8` is ready for frontend-only backup/guard/atomic publication with old assets and rollback. No production fixture upload, migration, configuration save, gateway/order operation, restart or Git push authorized.

### October 4 simplified course-card production result

- Guard matched and atomic frontend-only publication succeeded. All 37 HTTPS page entries and 50 asset hashes matched the verified build; local independent `/app` HTTPS comparison also matched entry `2ab7a97e40926315b30f2d390931df566e80312fa1db15371002ba5ab50a71f8`. Previous assets retained; no rollback required.
- Recoverable backup `/var/backups/oneshowlearn/workbench-cij0mTFM` includes prior frontend, protected backend/environment/dependency manifests and consistent database snapshot. Health/catalogues and anonymous private guards passed; existing account/private-record identities and historical order amounts/identities preserved. Pricing/provider/content configuration, protected code/environment/service hashes and running-service PIDs/restart counts unchanged.
- No production fixture import, migration, configuration save, gateway/order operation, restart or Git push. Visual/interaction acceptance uses final isolated browser screenshots; production verification is exact-file HTTPS and data/privacy/process checks, not an authenticated production screenshot claim.
