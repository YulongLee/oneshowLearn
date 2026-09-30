# AI OPC learning space — visual and functional QA

Date: 2026-09-26. Local route: http://127.0.0.1:4176/opc. Admin: /admin/opc.

The earlier workbench report is archived in docs/design/workbench-qa-20260926.md. This report covers the dedicated course route, not a redesign of /app or /.

## Source and state

- Source visual truth: /var/folders/2c/sdg0hxmx3b5_x84y09b7hk1w0000gn/T/codex-clipboard-e32aceaa-2d7a-4478-9615-243d82647d5e.png.
- Durable source: docs/design/opc-qa/reference.png, 1223 × 1286 pixels.
- Final implementation: docs/design/opc-qa/course-1223-final.png, 1223 × 1333 pixels, CSS viewport 1223 × 1333, DPR 1, scrollY 0. Extra 47px capture the natural bottom of the resource panel. Neither image is rescaled; the source is top-aligned on a padded comparison canvas.
- Populated comparison uses an isolated temporary database: explicit test account/product, nine stage-2 items, two completed and one started. Computed 22% replaces the reference's inconsistent 32% / 3 of 9. No test course or account data was inserted into the regular local or production database.
- Regular local account's unconfigured state: empty-1223-final.png.

## Comparison evidence

Source is left, implementation right; both were opened together and visually inspected.

- Full: docs/design/opc-qa/comparison-final.png.
- Focused hero, phases, typography and first lessons: docs/design/opc-qa/focus-final.png.
- Prior valid comparison: comparison-v2.png and focus-v2.png in the same folder. Version 1 had a scroll-offset mismatch and was excluded.
- Responsive: mobile-320.png, mobile-390-final.png, tablet-768.png, desktop-1024.png, desktop-1440.png, desktop-1920.png, desktop-2560.png. Wide desktop files are viewport captures, not claims that all lower content is visible at once.
- Interactions: reader.png, admin-mapping.png.

## Findings and fixes

### Initial comparison — blocked

1. **P2 — density:** lessons and auxiliary panels were too tall. Tightened lesson padding, tutor spacing and product checklist rows. Final comparison shows the course panel at y516 versus reference y519, with similar dense rows and lower-panel alignment.
2. **P2 — hierarchy:** main title and phase symbols were weak. Increased reference-width title to 31px and applied filled semantic phase circles. Final focused evidence shows the corrected hierarchy.

### Responsive review — blocked, then fixed

3. **P2 — tablet:** inherited hidden sidebar left an empty grid track. Changed the shell to block layout at the drawer breakpoint. tablet-768.png now has a 742px content area and no overflow.
4. **P2 — drawer control:** the drawer covered the topbar close button. Added a close control inside the AI OPC drawer. Real clicks verified opening and closing without navigation.
5. **P2 — 1024px:** three columns caused hero text/photo overlap. Rail moves below the course at widths up to 1150px. desktop-1024.png has an 808px hero with readable copy.
6. **P2 — phone:** faded cover photo weakened text clarity; title split inside the Chinese phrase. Separated text/photo vertically and kept “一个人的产品公司” together. Post-fix 320/390 captures have no clipped controls or horizontal overflow.
7. **P2 — wide desktop:** cover crop cut off the subject's head. At 1600px+ the right-side image retains its aspect ratio with a soft left mask. Final 1920/2560 captures preserve the full subject without a hard asset seam.

### Final comparison — passed

Recaptured the complete comparison after fixes with the same test-account/phase state and zero scroll offset. No remaining actionable P0/P1/P2 findings in this scope.

## Required fidelity surfaces

- **Typography:** existing DM Sans / PingFang SC / Microsoft YaHei stack; bold near-black heading, medium row titles, slate metadata, violet actions. Reference font file is not available, so this is not an exact-font claim. Long CMS descriptions truncate in rows and remain available in the reader. Phone title phrase stays together.
- **Spacing/layout:** 190px sidebar, 54px topbar, 737px central area, 256px rail, 14px gap and 262px hero at the reference width. A disclaimer, extra actual resource row and honest product metadata add modest natural height. The ultrawide content width is bounded without shrinking the page.
- **Colors:** cool white canvas, light borders, pale lavender hero, violet primary actions and green/violet/blue/amber/pink phases. Selection has an outline; progress and availability use labels as well as color. Dark CTA and focus styles are retained.
- **Imagery:** generated daytime rear-view developer follows reference direction, lighting and text-safe composition, but is not a pixel-identical photograph. Desk, whiteboard and sweatshirt text differ. Sharp 72KB WebP from generated PNG; quote remains HTML. Existing brandmark and installed Phosphor icons, no custom SVG/CSS illustration substitutes. Provenance: docs/design/opc-learning-hero.md.
- **Copy/content:** phase names and anatomy follow the reference. Fake counts, portrait, notification badge, “导师在线”, downloads and automatic-review/Pro promises are intentionally omitted. Real content types replace decorative extra badges; product milestones and lesson progress are separate account records.

## Functional checks

- Stage selection changes heading, lessons, goals and tutor context.
- Actual CMS reader opens; started/completed progress persists across reload.
- Product edits, milestone state and stage outcome persist across reload. API tests cover account isolation, strict validation and stale-version conflicts.
- Tutor opens a clearly labelled preview; saving creates a personal note verified on the notes page.
- Admin creates a chapter, moves its phase, changes a published chapter to draft, verifies learner exclusion and republishes it. All writes used the isolated fixture database.
- New content APIs enforce publication and preview/entitlement access including expired/future entitlements. Progress writes use matching checks.
- Regular local empty state and admin entry load correctly. A stale error from development-server restart was recovered through the visible reload action; final page is not left in error.
- Native dialogs, labelled fields, alt text, selected-stage ARIA, focus indicators and mobile drawer controls were exercised; this is not a formal WCAG certification.
- Widths: 320, 390, 768, 1024, 1223, 1440, 1920, 2560. Document width equals viewport width, no broken images observed. Post-flow console returned no application warnings/errors.
- npm test: 42 passed (14 platform/dashboard, 24 API, 4 packaging). Build and post-build Sites packaging tests passed. Existing ~553KB bundle-size advisory remains.
- Public homepage source hashes unchanged. No production connection, deployment, seed, or unrelated service restart.

## Scope and P3 follow-up

- Actual course material still needs CMS configuration/publication; empty state is intentional.
- AI tutor is a question-to-note preview, not a live model. Automated review, payments and private video/file delivery are not claimed complete.
- P3: route-split the large application bundle and extract smaller reader/product components as functionality grows.
- P3: structured document rendering after selecting a content format; current body is safe plain text.

## Checklist

- [x] Dedicated /opc layout and generated hero
- [x] CMS mapping and chapter edit/publish
- [x] Course access and persisted learning progress
- [x] Account-private product/milestones/outcomes
- [x] Responsive and browser interaction checks
- [x] Same-canvas source/rendered comparisons
- [x] Build and regression tests
- [ ] Production deployment — not requested this turn

final result: passed
