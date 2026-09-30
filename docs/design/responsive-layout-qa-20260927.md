# Signed-in responsive layout review — 2026-09-27

## Scope

Local learner workspace only: `/app`, `/opc`, `/paths`, `/projects`, `/tutor`, `/resources`, `/community`, `/notes`, `/favorites`, `/achievements`.
No deployment, production data changes, public homepage changes, or admin redesign.

## Design decisions

- Keep the persistent sidebar and account/search shell. Establish one content container-query contract in `src/workspace-responsive.css`, loaded after page and shell styles.
- Measure the available content width after navigation and padding. Below 1200px of content space, auxiliary rails move below the primary content. Notes and tutor need more working space, so use a 1400px threshold.
- Keep the content centered at a maximum 1840px. Avoid page-wide scaling; retain readable headings, body text and controls.
- Course/project/resource cards use 4, 3, 2 or 1 columns according to primary-panel space. Outcome cards use at most 3 columns. Preserve list mode for favorites.
- Give desktop banners, section gaps and cards more room. Phone workbench uses a shallow, readable banner instead of reserving empty artwork space.
- Keep honest empty states and actual account/CMS content. Do not create sample progress, lessons, outcomes or testimonials.

## Browser checks

Tested local Vite app at `http://127.0.0.1:4176`, using the signed-in local test account. Waited for the account and page loading before the final geometry pass.

All 10 routes checked at 320, 390, 768, 1024, 1440, 1536, 1920 and 2560 CSS pixels (80 combinations): zero document horizontal overflow and no visible main headings/buttons/inputs outside the viewport.

Project catalog measurements:

| Screen | Primary width | Card columns | Auxiliary rail |
| --- | --- | --- | --- |
| 320 | 292 | 1 | Below |
| 390 | 362 | 1 | Below |
| 768 | 732 | 2 | Below |
| 1024 | 755 | 2 | Below |
| 1440 | 1154 | 4 | Below |
| 1536 | 923 | 3 | Right, 300px |
| 1920 | 1291 | 4 | Right, 300px |
| 2560 | 1436 | 4 | Right, 300px |

Visual checks: workbench at 1366/1920 and phone; projects at 390/1536; tutor and note editing at 1536; resources at 768; AI OPC at 1366; learning-route cards at 1536. Checked the mobile drawer opens and closes on navigation. Opened and cancelled an unsaved blank note without saving test data.

Limitations: OPC lesson list currently has no locally configured phase content, so visual checks cover its honest empty state rather than a populated list. Favorites/outcomes/notes use actual empty local-account states; this is not a substitute for production content acceptance testing. AI and other explicitly unavailable features remain unavailable.

## Verification

`npm run build` and `npm test` pass (58 tests including the new responsive contract regression guard). Existing Vite bundle-size advisory remains; no new build errors.

This is a responsive UI refinement, not certification that payments, AI integration, content operations and all other commercial launch requirements are complete.
