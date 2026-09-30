# Learner sidebar typography — 2026-09-29

Implemented and deployed on 2026-09-29 following the owner's explicit request.

- Shared menu and settings: 16px text, 24px line height, 48px minimum rows. Group headings: 13px, 20px line height, medium weight and darker #59657d. Menu/settings icons: 22px.
- Selected/unselected items retain identical font sizes. Icon-only mode keeps 48px targets. No overall page scaling, backend change or public/admin redesign; existing resizing, hidden state and browser preferences remain intact.
- `npm run test:platforms`: 37 passed, including the new typography regression. Build and 4 Sites tests passed; existing bundle-size warning remains informational. `git diff --check` passed. Backend tests were not rerun for this CSS-only adjustment.
- Browser computed style checks confirm all nine items use 16px / 48px / 22px, headings 13px and settings 16px. Active/inactive sizes remain equal after navigation.
- Expanded sidebar at 1001, 1440, 1920, 2560px and mobile drawer at 320, 390, 768, 1000px: no page or menu overflow. Icon mode remains 72px with >=48px rows; width adjustment to 360px, reset to 228px, hide and restore work.
- Desktop and 390px mobile screenshots visually inspected. No console errors. Existing local API 8799/Vite 4176 reused; preview returned to `/app`, expanded 228px, viewport override cleared. No production deployment or account/content write.

## Subsequent authorized deployment

- Frontend only, with no data/backend/configuration changes or service restart. Re-ran 37 platform tests, build, 4 Sites tests and whitespace checks successfully.
- Server and independent local HTTPS checks verified 21 page entries and 35 assets against the exact release, plus health, catalog, anonymous access protection and the preserved homepage-card API.
- Backup: `/var/backups/oneshowlearn/frontend-2kPm8bJP/client`; old assets retained for index rollback.
- Stage: `/tmp/oneshowlearn-platforms-type-20260929-M3sfFiwz`.
- Archive: `/tmp/oneshowlearn-type-release-7pkyl6Re/frontend.tar.gz`, SHA-256 `f0c88ef19114e0d83724d0f2a8dbebfa4fe85bb1a371692f654ee875f71d2c72`.
- Published HTML SHA-256: `86513abc4d3443c6d6d9b1c4aa86cc5d1ee86a628237c813bec692ee75190f5e`.
- OneShowLearn PID 3509131 and Nginx PID 543821 remained active, unchanged, zero abnormal restarts. No seed, credentials/data upload, Git commit or push.
- Visual evidence remains local browser QA above; production acceptance used exact HTTPS content/API checks rather than a new browser screenshot.
