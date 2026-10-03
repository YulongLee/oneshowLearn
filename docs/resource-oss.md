# OneShowLearn private resource storage

## Production enabled 2026-10-02

Owner authorized deployment. Private CMS uploads now use the scoped OSS adapter in production; the backend status endpoint confirms the correct bucket/prefix. Existing local files are unchanged, and no old-file migration was performed.

- Backup: `/var/backups/oneshowlearn/resource-oss-LgC9UJA3` (server, client, previous environment, database and previous node_modules).
- Release scripts: `deploy/update-resource-storage.sh` and `deploy/check-resource-storage.mjs`; staging `/tmp/oneshowlearn-oss-deploy-gFEu57fO`.
- 279 local tests and build passed. Server-side rehearsal used a separate database copy and real OSS through CMS upload, protected download, Range and HEAD; anonymous object access returned 403. Its disposable remote probe was removed.
- HTTPS production checks: correct admin-only OSS status, three legacy protected attachments, 31 page entry hashes and 34 asset hashes. Public course/project/resource catalogues and login/commerce responses unchanged.
- Database integrity OK; all 56 pre-existing table row counts unchanged; zero cloud-asset records at release, so no test material or learner fixture was inserted into production.
- Only OneShowLearn restarted: active, PID 1126788, NRestarts 0. Other service processes and unrelated backend/configuration hashes unchanged. Proposed staging env was removed after install; secrets remain only in protected production config and its backup.
- Frontend SHA256: `e33f612ba4e7b6c40fa8f754435ff56e0109ff14e3e4c8601467dc91cb7e544e`.
- The initial clean-install precheck stopped before changing live files because npm had omitted the existing optional `@floating-ui/dom@1.8.0` lock entry. Restored the exact original entry; clean install then passed with all pre-existing dependency versions preserved.
- Corrected local release archive: `/tmp/oneshowlearn-oss-release-UMArA9tg/release.tar.gz`, SHA256 `9a9e06c611091a3dffe52dd5bba9c84cbb88653636c7578a6105aa819d72ba1c` (the server staging lock was patched with the same corrected content after the first precheck).

New CMS attachments can use the private `projects-yulong/oneshowlearn/resources/` prefix in Shanghai OSS. The public resource catalogue still comes from the CMS; metadata is not an OSS directory listing. External links are not copied to OSS.

## Server configuration

Set `ASSET_STORAGE=oss`, `OSS_BUCKET=projects-yulong`, `OSS_REGION=cn-shanghai`, `OSS_ENDPOINT=https://oss-cn-shanghai.aliyuncs.com`, `OSS_KEY_PREFIX=oneshowlearn/resources/`, and the two server-only `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` values. Never use VITE-prefixed keys or put secrets in Git. Prefer a dedicated RAM principal limited to this prefix; the owner currently permits using the existing RAM credentials.

The sample env defaults to local storage. Production was activated by the approved October 2 release above. Future deployments must back up the database/config/modules, install locked dependencies and preserve the protected service environment. Do not overwrite unrelated model, login or payment settings or automatically migrate old files.

## Compatibility and security

- Existing local and legacy public files are unchanged. New private uploads go through `/api/admin/cms/assets`; legacy public upload endpoints remain legacy, not private OSS uploads.
- Object names use the project prefix, year/month and a random UUID; original names stay in SQLite. Objects explicitly use private ACL without changing bucket permissions.
- CMS URLs remain `/api/materials/:id`. Every download validates ticket, current session, publication and entitlement before proxying OSS bytes. Byte ranges and HEAD support media playback; no public/signed OSS URL is returned.
- `asset_storage` stores provider, bucket, endpoint, object key, ETag and the server-read 12-byte header for community image validation. It contains no credentials. No remote row means legacy local storage.
- Failed uploads do not create database records. If a database insert fails after upload, only that newly uploaded object is removed. Timeout cases can leave an unreferenced object; never perform broad prefix cleanup automatically.
- Do not switch back to local-only settings after OSS uploads: remote assets require the cloud adapter. Rolling back code requires preserving remote-aware download support, or an explicit verified migration first.
- Admin `/api/admin/cms/storage` exposes only provider/location metadata; the attachment-list API returns `storage_provider` per file, and the admin screen shows the destination for new uploads. The existing single-file limit remains 50 MB.

## Verification

`node scripts/check-resource-oss.mjs <owner-supplied-env-path>` reads only the five OSS connection values from the original supplied env. It creates a private folder marker if absent, uploads one disposable documentation probe, verifies exact download bytes and a 10-byte range, checks anonymous denial, and deletes only its own probe. Credentials and signed URLs are never logged. No existing resources, bucket ACLs or other project prefixes are changed.

Automated isolated tests cover private upload/download, range/HEAD/416, unauthenticated and learner denial, session revocation, local-file compatibility, server-only metadata, real image signatures and upload failure cleanup. No test content is published to the live CMS.

## Verified 2026-10-01

- Created the private `oneshowlearn/resources/` folder marker in the existing bucket, with no changes to other folders or bucket ACL.
- Live OSS probe passed full-content checksum, byte-range 206 and anonymous 403; the disposable probe was removed. Only the requested folder marker remains from verification.
- 279 automated tests passed (134 platform, 131 API, 10 storage, 4 Sites); production build passed. Existing large-bundle warning remains unrelated.
- The isolated resource preview on port 4188 uses OSS via server-process environment loaded from the supplied attachment, without saving secret values in the repository. Admin attachment status was checked in the browser. Process-only credentials must be configured separately for any restart or deployment.
- Production configuration and existing production attachments have not changed. No application deployment or old-file migration was performed.
