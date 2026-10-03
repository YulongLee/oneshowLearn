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
