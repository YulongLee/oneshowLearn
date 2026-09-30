# Learning routes — visual and functional QA

Date: 2026-09-26. Local route: http://127.0.0.1:4176/paths/.
Previous course-page report: docs/design/opc-learning-qa-20260926.md.

## Source, state and normalization

- Source visual truth: /var/folders/2c/sdg0hxmx3b5_x84y09b7hk1w0000gn/T/codex-clipboard-6ba6d1eb-9d0f-4a7b-b4d8-630405ccac64.png.
- Durable source: docs/design/learning-route-qa/reference.png, 1223 × 1286.
- Final populated implementation: docs/design/learning-route-qa/populated-final.png, 1223 × 1352 pixels; CSS viewport 1223 × 1352, DPR 1, scrollY 0. Source is top-aligned on a padded comparison canvas, without rescaling. Extra height accommodates the tutor disclaimer and actual content count.
- Regular local account: docs/design/learning-route-qa/desktop-final.png, 1223 × 1286 viewport capture; poster continues below the viewport.
- Populated state uses the isolated temporary QA database: 13 published items, 3 completed, 1 completed phase, overall 23%; second phase has 2 of 9 completed (22%). Only one project exists in this fixture; the regular local account shows four actual CMS projects. No fixture records were added to the regular local database.
- Current calendar, actual account identity, task count and content availability intentionally replace the reference's illustrative data.

## Comparison evidence

Source is left, implementation right. Combined artifacts were opened and inspected.

- Full view: docs/design/learning-route-qa/comparison-final.png.
- Focused hero and stage-card typography: docs/design/learning-route-qa/detail-final.png; additional focus-final.png.
- Initial comparison: comparison-before.png, focus-before.png, desktop-before.png in the same directory.
- Responsive evidence: mobile-320.png, mobile-390.png, tablet-768.png, desktop-1440.png, desktop-1920.png, wide-2560.png. These are viewport screenshots.
- DOM measurements: responsive-metrics.json, plus 390/768 checks. Widths 320, 390, 768, 1024, 1223, 1440, 1920, 2560 had no horizontal content overflow.

## Findings and comparison history

### First comparison — blocked

1. **P2 — small/low-contrast supporting text.** Stage goals, calendar, metadata and tutor prompts were weaker than the reference. Increased sizes and darkened slate colors. Final focused evidence shows readable 12px list text and subordinate metadata.
2. **P2 — benefit text over busy landscape.** Shortened supporting descriptions, reduced gaps and added a lower-left image mask, preserving the top handwritten annotation. Final full/detail evidence shows benefit copy in the pale area outside the person.

### Responsive review — blocked, then fixed

3. **P2 — 1440px cover cropping clipped the top annotation.** Evidence: desktop-1440-before.png. Capped the intermediate-width artwork at 780px and anchored it right; wide screens retain proportional contain treatment. desktop-1440.png shows the complete annotation and subject; 1920/2560 captures also preserve the subject.

### Final comparison — passed

Re-captured and inspected the combined source/implementation after typography, mask and sequence-palette fixes. The later 780px cap does not change reference-width layout; its 1440px result was separately inspected. No remaining actionable P0/P1/P2 findings.

## Required fidelity surfaces

- **Typography:** existing DM Sans / PingFang SC / Microsoft YaHei stack; 29px page heading, 34px hero heading, 18px section heading at reference width. Source font file is unavailable; this is not an exact-font claim. Long CMS titles truncate within cards with full native tooltip and course destination. Phone title keeps the Chinese phrase together.
- **Spacing/layout:** 190px sidebar, 54px topbar, approximately 775px main / 216px rail / 16px gap, 205px hero. Five stages, sequence strip, projects and calendar/tasks/tutor/poster follow source anatomy. Real empty states and additional-item count explain modest height differences. Tablet moves the rail below; mobile reflows cards and separates hero text/photo rather than scaling the page.
- **Colors:** cool white canvas, light borders, near-black headings, violet selection and pastel green/violet/blue/amber/pink stages. Sequence icons follow violet/blue/pink/green/violet. State is expressed with labels and numbers, not color alone.
- **Imagery:** generated rear-view mountain traveler and mountain quote poster follow reference direction, not pixel-identical copies. Optimized WebP assets remain sharp. Existing brandmark and installed Phosphor icons retained; no custom SVG/CSS illustration substitutes. Provenance: docs/design/learning-route-hero.md and docs/design/learning-route-quote.md. Actual CMS covers remain intact; fallback artwork is labelled 界面示意.
- **Copy/content:** five-phase hierarchy and panel copy follow the reference. No fabricated progress, account portrait, notification badge, Pro promises or tutor-online state. Unpublished phases explain planned goals and show 内容待发布. Stage outcomes replace unlaunched community-support claims.

## Functional and regression checks

- Phase/sequence buttons open /opc/phase/1 through /opc/phase/5. Phase 3 exercised in-browser and stayed selected after reload.
- Unit tests cover empty curriculum, real aggregation, accessible next phase and valid deep links.
- Adding a task and checking it persisted after reload. All test writes used the isolated fixture account.
- Calendar previous-month and return-to-today worked. Existing tasks/check-ins provide markers; selected dates filter tasks.
- Tutor preview saved a question; resulting personal note verified on the notes page. No model answer is claimed.
- Full learning map displayed all six existing published learning directions. Original category detail routes remain reachable.
- Project card opened its actual /packs/:slug destination.
- Mobile drawer opened and closed with labelled controls. Native dialogs, input labels, selected-date ARIA and focus indicators retained; not a formal accessibility certification.
- Post-interaction browser logs showed no application warnings/errors; no broken images observed.
- npm test: 44 passed (16 model/platform, 24 API, 4 packaging). Build and post-build packaging checks passed. Existing bundle-size advisory is P3.
- Public homepage hashes unchanged. No workbench redesign; OPC only gains initial-phase deep-link support. Hosting/worker files intact. No production connection, deployment, real-database seed or other-product restart.

## Remaining scope / P3

- Real chapters and materials still require CMS configuration/publication; no catalog was seeded to match the screenshot.
- AI tutor remains a question-to-note preview until a live model service is connected.
- Consider route-level bundle splitting.

## Implementation checklist

- [x] Reference layout, two generated assets and responsive states.
- [x] CMS/account data, task persistence, phase links and six original learning directions.
- [x] Browser interactions, combined source comparisons, tests and build.
- [x] Preserve unrelated pages and leave regular local preview running; no deployment this turn.

final result: passed
