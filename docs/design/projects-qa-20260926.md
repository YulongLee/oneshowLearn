# Practical projects /projects — visual QA

Source: `/var/folders/2c/sdg0hxmx3b5_x84y09b7hk1w0000gn/T/codex-clipboard-b6d08e91-ff26-4054-88ea-84ccb9a78ba9.png` (1312 × 1199).
Local implementation: `http://127.0.0.1:4176/projects`.
Isolated test implementation: `http://127.0.0.1:4187/projects`; temporary database and learner account, not real catalog data.
Previous route QA archived at `docs/design/learning-routes-qa-20260926.md`.

## Comparison history

### Iteration 1 — blocked

Same 1312 × 1199 CSS viewport; captures 1312 × 1199 pixels at 1:1 density, no browser chrome.
Evidence: `docs/design/projects-qa/initial-1312.png`, combined source/render `docs/design/projects-qa/comparison-initial.png`.

- P2 image fidelity: reused course illustrations did not match the reference's application-interface project covers. Generated matching web/mobile/AI application concept covers; CMS images remain authoritative.
- P2 spacing: right rail was taller than the source; long tutor introduction and spacing pushed the poster down. Shortened copy and reduced question/guide spacing, retaining visible preview disclosure.
- Functional review: preserve existing account context during a post-progress background refresh so opening/finishing a lesson does not dismiss the reader.

### Iteration 2 — desktop comparison

New interface covers and compact rail shown in `final-1312.png`; combined evidence `comparison-final.png` and `focus-final.png`. Both opened and inspected. Content/account substitutions intentional; no sample avatars, enrollments or fake online tutor.

### Wide-screen review — blocked

P2: at wide dimensions, scaling the shallow hero as a full-width cover crops the checklist and laptop. Evidence: `desktop-1920-before.png`. Fix: scale artwork by banner height, right-align it and softly blend its empty left edge; preserve artwork aspect ratio instead of cropping.

Narrow-screen follow-up: separate art/copy at 651–760px to prevent handwritten artwork touching the description. Explicitly bottom-anchor the mobile illustration after changing the shared desktop positioning; `mobile-320-before.png` revealed an overlap before that anchor fix. The revised `mobile-320.png` was opened and inspected: illustration begins at y499, heading ends at y322; no overlap or overflow.

Focused card refinement: increased metadata/tag/action text to 11/11/12px and title weight to 700. Shortened CMS format labels to 文档 / Prompt / 代码 so the larger text fits without clipping; no invented technology labels.

## Final comparison — passed

Source-left / implementation-right `comparison-final.png` was regenerated and inspected after the fixes, at exactly 1312 × 1199 CSS/pixel dimensions, scrollY 0. Focused `detail-cards.png` and `detail-hero.png` were also inspected at 1:1 scale. No remaining actionable P0/P1/P2 mismatches. The repeated fallback art is intentional: only CMS-provided images represent the actual project; generated illustrations indicate the broad project type, with a visible 界面示意 label.

## Required fidelity surfaces

- **Fonts/typography:** retains DM Sans / PingFang SC / Microsoft YaHei; 30px page title, 27px hero title, 14px/700 project title, 12px descriptions/actions, 11px metadata/tags. At wide desktop sizes project titles increase to 17px and body copy to 14px. Source font file is unavailable, so this is not an exact-font claim. Long CMS project titles use ellipsis and native full-title tooltips; mobile allows wrapping.
- **Spacing/layout rhythm:** 190px sidebar at reference width, compact 54px search/account bar, approximately 834px main / 242px rail with 20px gap; 258px banner, 4-column project grid with 14px column gaps, 104px card images. Main panels and actions follow the reference anatomy. Additional truthfulness disclosures and actual recent-project count explain rail-height differences. At <=1250 the rail moves below the catalog and project cards use two columns; phones <=440 use one column, with full-sized text.
- **Colors/tokens:** cool white background, subtle #ebeff7 hairlines, near-black headings, violet actions and selection, pastel progress cells. Progress and access states use text as well as color. Existing Phosphor icon set and supplied brandmark retained.
- **Image quality:** five optimized generated WebP assets (hero, mountain poster, web/mobile/agent covers), individually inspected, with source/prompt records under docs/design/projects-hero.md, projects-quote.md and project-*-cover.md. No handcrafted SVG/CSS illustration replacements. Right-aligned hero retains complete laptop, phone, annotation and checklist on 1920/2560 screens; phones separate copy and art. CMS cover URLs take precedence and broken/missing covers use labelled concept art.
- **Copy/content:** static hierarchy follows the screenshot. Published project titles, chapters, content types, durations and progress come from APIs. No fake enrollments, avatars, notification badge, online tutor or Pro subscription promises. 已学完 means learning-content completion, not verified project launch. Category facets classify existing CMS title/subtitle/path metadata without inserting records.

## Browser and functionality checks

- Local real account: six existing published CMS project packs, no writes to its learning progress or catalog. `local-1312.png` is the initial live-account state before the cover refinement; the local page was reopened after all changes and checked for complete images and the same six titles.
- Isolated test account: eight temporary project packs, four course entitlements. Final screenshot reflects the test actions (one in progress, two learned, one unstarted), not the screenshot's fabricated counts. All fixture data lives in a separate temporary database.
- Category filter (小程序), newest sorting, empty 其他项目 category and return to all eight entries verified.
- Continue project opens the next unfinished published item. Marking complete remains in the reader, persists after reload and updates aggregate progress. Favorite action verified as saved.
- Locked paid item shows an access explanation without exposing the body. Free preview opens. API tests additionally cover wrong-pack content IDs, unpublished content/chapter/pack/path, expired/future entitlements, user isolation and unsafe resource links.
- Tutor preview saves the question to the account's learning notes; verified on the notes page. No model-response behavior is claimed.
- Phone navigation drawer opens/closes. Phone project dialog fits the viewport (356px client/scroll width at 390px). Native modal focus/escape, semantic controls and visible focus styles retained. Not a formal accessibility certification.
- Responsive screenshots inspected: mobile-320.png, mobile-390.png, tablet-700.png, tablet-768.png, desktop-1440.png, desktop-1920.png, wide-2560.png. 1440 and 390 screenshots predate the final artwork anchor only; the corrected anchor is verified at 320/1312/1920/2560. No horizontal overflow at those measured widths; measurements saved in responsive-metrics.json plus tool observations for 390/700/1312.
- Final browser logs: zero application warnings/errors; zero broken images. Temporary viewport override reset. Temporary test browser closed; regular local preview left running.
- `npm test`: 46 passed (16 platform/model, 26 API/model, 4 packaging). Production build and post-build `test:sites` passed; existing bundle-size advisory is P3. `git diff --check` passed.
- No deployment, external server changes, production seeding, or unrelated product restarts. Public homepage, workbench, OPC and learning-route layouts were not redesigned. Protected hosting/worker files untouched.

## Remaining scope / P3

- Backend publication is still required for real project chapters, resources and project-specific screenshots; this task does not manufacture those learning products.
- AI tutor is an explicitly labelled question-to-note preview until a real model integration exists.
- Route-level code splitting remains a future performance improvement (existing bundle warning).

## Implementation checklist

- [x] Faithful project catalog, generated image assets and responsive layout.
- [x] CMS-backed discovery, account progress, details, reader, access checks and note/favorite persistence.
- [x] Full-view and focused source/render comparison, browser interaction tests, automated tests and build.
- [x] Preserve other pages and leave a local preview for review; no deployment requested this turn.

final result: passed
