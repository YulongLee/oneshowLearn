# Public homepage card restoration — 2026-09-29

Status: implemented, tested and deployed on 2026-09-29 following the owner's explicit deployment request.

## Change

Restored the approved violet/blue/green/orange illustrations and reference copy. PublicHomepage reads separate `hotCourseCards` presentation data instead of mapping catalog titles and raw course covers into the public card design. The existing soft text fade and metadata row remain unchanged. The ICP footer is preserved.

Admin → 页面配置 → 官网首页 now edits four cards, each with a tag, title, description, image and optional explicit course association. These fields use the existing private draft, preview, version-conflict, publish and history workflow. No database migration or content seeding is required.

Unassociated or unpublished courses show a learning-direction action, not invented course availability/counts. Associated published courses provide only the destination and actual published resource count; their title/cover changes do not overwrite marketing presentation. Legacy page JSON receives the approved presentation defaults on read. Older clients omitting the new field retain existing draft card configuration.

## Verification

- `npm test`: 80 tests passed (34 frontend/model, 42 API, 4 Sites packaging).
- `npm run build`: passed; existing large-bundle warning remains.
- Added regression checks for legacy defaults, unrelated catalog changes, explicit association, unpublished associations, image/ID validation, draft isolation, publishing/history and stale updates.
- Browser: verified restored artwork/copy, all four images loaded, no horizontal/card overflow and text fits at 320, 390, 768, 1440, 1920 and 2560px. Layout reflows to 1/2/4 columns.
- Browser: inspected the admin card editor and actual unpublished homepage iframe preview, including the preserved ICP footer. No admin draft was saved during UI testing.
- Local preview: http://127.0.0.1:4176/#hot-courses (API 8799).

## Release scope

No production write, deployment, remote restart or course association was performed. For a future deployment, include both frontend and the updated page API/shared defaults modules so that admin editing is available; preserve the production database and page publication history. Do not seed course data or guess associations.

## Subsequent authorized production release

- Deployed frontend and exactly three server modules (`homepage-cards.mjs`, `site-defaults.mjs`, `platform-content.mjs`) to the existing Tencent Shanghai server `124.223.104.160` / `oneshowlearn.com`. All other server modules and the dependency lockfile matched production and were not replaced.
- Re-ran all 80 tests and the production build successfully. The existing bundle-size warning remains informational.
- Backup: `/var/backups/oneshowlearn/homecards-oGcXqt6p`, containing prior server code, frontend, environment copy and a consistent SQLite snapshot. Rollback restores code/entry only, never the live database; old hashed assets remain available.
- Archive: `/tmp/oneshowlearn-homecards-local-ptWfUhn5/release.tar.gz`, SHA-256 `5e6bb1287bd6868211aeed2d575e00d511566482d440b6cbad1e4cca1906ff90`.
- Remote staging: `/tmp/oneshowlearn-homecards-20260929-FBFSjWKf`.
- Entry SHA-256: `3bd8d52b8ab106fc713617d6acdc923df64d9d1b72e66a45ac721b78552d7cad`; bundles: `index-iSJ_j8qu.js`, `index-la8VV70H.css`.
- Server and independent local HTTPS verification passed for 21 page entries and 35 assets, health, catalogs and anonymous access guards. Public API returns the approved illustrations/copy with no guessed course associations.
- Production course, chapter, source-material, page draft/publication/history and learning-progress records were compared against the backup and remained unchanged; SQLite integrity passed. No seed, migration, test content, saved page draft or page publication occurred. Authenticated admin configuration read and private preview passed using existing credentials; login only produced normal authentication metadata.
- Only OneShowLearn restarted (PID `3509131`, active, zero abnormal restarts), still listening on `127.0.0.1:8791`. Nginx `543821`, OneShowSEO `1047623`, PocketLedger `2079556` remained active with unchanged PIDs. Environment, service unit and Nginx configuration checksums were preserved.
- Online in-app browser timed out; no online screenshot acceptance is claimed. Visual acceptance is based on the prior local responsive checks and exact production asset/API matching.
- No Git commit or push was performed.
