# Learner sidebar interaction — 2026-09-29

Implemented and deployed on 2026-09-29 following the owner's explicit request.

- Shared WorkspaceShell supports expanded (default 228px, draggable to 360px), icon-only (72px) and hidden modes. Persistent header controls restore navigation without page reload; all learning routes use the same component/state.
- Drag the right border to resize. Focus the separator and use left/right arrows to adjust by 16px; Home/Enter or double-click resets to 228px, End selects 360px. Pointer cancellation restores the starting width. Bounds prevent the sidebar from crowding reading space excessively.
- Preferences persist on this browser under `oneshowlearn.sidebar.v1`, not in account/course data. Malformed/unavailable storage falls back safely. No backend or public/admin page changes.
- At 1000px and below the regular 228px drawer remains independent of desktop modes and saved width. Route changes close the drawer. Returning to desktop restores the prior desktop choice.

## Checks

- `npm test`: 82 passed (36 frontend/model, 42 API, 4 Sites packaging). Added bounds/mode/storage and shared control regression tests.
- `npm run build`: passed; existing bundle-size warning remains. `git diff --check`: passed.
- Browser pointer drag from 228 to 325px; collapse and route navigation retain icon mode; hide and reload retain hidden mode; restore returns to 325px; End sets 360px; double-click resets 228px.
- Nine learner routes (`/app`, `/opc`, `/projects`, `/tutor`, `/resources`, `/community`, `/notes`, `/favorites`, `/achievements`) × 1001/1440/1920px at maximum 360px width: 27 checks, no page/header overflow.
- All nine routes at 1440px in icon mode: correct 72px sidebar and no page overflow.
- Mobile 320/390/768/1000px while desktop preference is hidden: no page overflow, drawer trigger visible. At 390px open drawer retains full labels and 228px width; selecting 学习课程 navigates to `/opc` and closes it.
- No browser console errors. Preview left at default expanded 228px on `/app`, viewport override cleared.
- Existing local API 8799 and Vite 4176 reused. No production deployment, server restart, learning-record mutation or Git commit.

## Subsequent authorized deployment

- Frontend-only release to the existing `oneshowlearn.com` Tencent Shanghai server. No backend/configuration/database changes, dependency install, seed, service reload or restart.
- Re-ran 82 tests and the build successfully. Server-side and independent local HTTPS checks passed: 21 page entries, 35 asset hashes, API health/catalog/anonymous guards and approved public home-card configuration.
- Backup: `/var/backups/oneshowlearn/frontend-gF4B5Ojp/client`. Previous hashed assets retained; restore the backed-up index to roll back without changing data.
- Remote stage: `/tmp/oneshowlearn-platforms-sidebar-20260929-fCG2w8Wy`.
- Archive: `/tmp/oneshowlearn-sidebar-release-1uOvlEYq/frontend.tar.gz`, SHA-256 `a53751a69ac78326e981364deb8ca8a8919ae29c9cd343e5b2c1e2956d891975`.
- Published index SHA-256 `61a3dd2f5a4483c7a98236dffe71ff8f9dbb95db944524981be99ae3c8c5a248`; bundles `index-BHe24BF2.js` / `index-BwYDvqtq.css`.
- All 18 server module hashes remained unchanged. OneShowLearn PID 3509131, Nginx 543821, OneShowSEO 1047623, PocketLedger 2079556 remained active, unchanged, with zero abnormal restarts.
- Visual/interaction verification is the local QA above; production verification is exact HTTPS content/API checks, not a new online visual acceptance. No Git commit or push.
