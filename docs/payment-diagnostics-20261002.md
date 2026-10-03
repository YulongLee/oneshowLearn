# Payment connection diagnostics

## Alipay configuration-probe parameter correction

- Owner reported version 8 passing key validation but failing the connection button. Bounded read-only inspection reproduced HTTP 400 / `INVALID_PARAMETER` with the zero-offset request. Changing only offset to the official SDK example's `20` returned HTTP 200 with SDK-verified response signature using the same saved credentials. No orders, QR codes, charges or merchant-setting changes were made. This establishes basic interface connectivity, not face-to-face payment permission, callback delivery or course fulfillment.
- Corrected the diagnostic probe's fixed offset, preserving its read-only endpoint and signature requirements. Added a static, sanitized Alipay parameter-error explanation; distinguish DNS and network failures without returning arbitrary upstream messages/codes or sensitive responses. The existing administration UI renders these messages without a frontend change.
- Regression now checks the actual probe body through the official SDK with signed success and invalid-signature fixtures, exact positive offset, parameter/network failure classifications, no sensitive error echoes and unchanged business records. Full local suite: 296 passed (134 platform, 131 API, 10 storage, 17 diagnostics, 4 Sites); production build passed with the existing bundle-size advisory.
- New `alipay-probe` release mode publishes only `payment-providers.mjs` and `payment-diagnostics.mjs`; it does not replace frontend entries/assets, configuration/schema/dependencies or any other backend module. Expected-live hashes, protected backup, isolated server tests, HTTPS checks, independent-save authorization/version/scope guards, immutable payment/business snapshots and unrelated service preservation remain enforced. Configured live gateways are not invoked by the release verification.
- Production release completed after 30 isolated server payment tests. Protected backup: `/var/backups/oneshowlearn/payment-diagnostics-wULxYEL3`; remote staging: `/tmp/oneshowlearn-paytest-deploy-kCA0Fd1O`. The expected old provider and frontend hashes were checked before release. Installed modules match staging: providers SHA-256 `f71adcc4e35b4690c65206d7bf795747164b85f5920623f5bf9fc5d74579dacd`, diagnostics `0c86480ee9ec8bc67fff3092cc54a94968465ca368918173cf111ee98d760ada`.
- Release reached its post-HTTPS resource verification service snapshot; unrelated service snapshots matched. Independently re-ran the owner/version/cross-section protections, payment configuration/history/business-table preservation, database integrity, unchanged protected-file hashes, full frontend-tree equality against backup and HTTPS health checks, all passed. Only OneShowLearn restarted: PID 1272854, active, zero restarts. All existing saved prices/keys/switches remained unchanged. No valid production settings save, gateway request, order/QR/charge or Git push occurred during deployment. The earlier successful live read-only diagnosis is separate from this release's verification.

## Alipay raw-key compatibility correction

Production release approved and completed October 2:

- Re-ran 295 local tests/build; server rehearsal passed all 29 payment tests using isolated fixtures and the production dependency runtime. Released compiled frontend and only `payment-configuration`, `payment-providers`, `payment-routes`, `payment-diagnostics`; no dependency/environment/schema changes or content import.
- Protected backup: `/var/backups/oneshowlearn/payment-diagnostics-P2NuT3b5`. Expected-live and unchanged-file hashes passed. Only OneShowLearn restarted (PID 1251476, active, zero restarts); nginx and unrelated product services were preserved.
- HTTPS independent-save owner/version/cross-section guards passed without any valid production save. Missing Alipay fields were diagnosed without a gateway call; configured WeChat gateway was deliberately not invoked. Payment configuration/history, products/packs, prices, orders/items/payments/checkouts and entitlements matched the consistent backup; database integrity passed.
- Verified 31 HTTPS page hashes, 34 application asset hashes, current module contents, API health and anonymous access controls. Frontend SHA-256: `0082739cd53c7bd7d5c7f7a1491f23797ed1c7de91ef2cb1d0e442e3a159e011`.
- Packaging created 34 AppleDouble sidecar metadata files absent from the pre-release assets. Checked their magic bytes, corresponding originals and exact staged/live equality, then recoverably archived only these generated sidecars under the protected backup's `release-metadata/`; no application/user asset was removed. Final resource verification uses the intended 34 files. Future macOS archives should use `COPYFILE_DISABLE=1` to exclude packaging metadata.
- Alipay real connectivity is not claimed by this code release: the owner still needs to save the actual configuration and run its independent connection test. No production keys/prices/switches were changed, and no payment orders, QR codes or charges were created.

Implementation and local verification:

- Reproduced the raw Base64 rejection before both configuration save and SDK initialization. Normalize RSA 2048+ application PKCS1/PKCS8 private keys and SPKI/PKCS1 platform public keys from raw text or PEM; export canonical PKCS8/SPKI PEM. Reject invalid Base64, non-RSA/weak keys, private keys in the public field, and application public keys substituted for the Alipay platform key. Historical configurations also normalize on SDK reads, with no database rewrite.
- Added owner-only version-guarded `PUT /api/admin/payments/{wechat,alipay,pricing}`. Each strict schema rejects other section fields/secrets. Provider saves neither validate nor alter the opposite provider and do not write product prices/timestamps; pricing saves preserve all credentials. Blank private fields retain encrypted saved values. Legacy full-save API remains compatible.
- Administration has independent save controls and per-provider dirty/test states. Saving a section retains the other unsubmitted drafts and clears version-stale test results. Errors identify the relevant field/platform without echoing key material or appending irrelevant WeChat instructions.
- Full regression: 295 passed (134 platform, 131 API, 10 storage, 16 diagnostics, 4 Sites), targeted payment tests 29 passed; build passed. New coverage includes raw PKCS1/PKCS8 signing, SDK response verification, callback verification, invalid/weak/wrong-type keys, scope authorization/version guards, cross-platform write rejection, unchanged enabled WeChat secrets/product prices/timestamps/history, and precise Alipay failures.
- Isolated browser preview at `http://127.0.0.1:4190/admin/payments`: saving an Alipay draft retained unsubmitted WeChat and pricing drafts. Direct read-only fixture database inspection confirmed only Alipay persisted, both channels stayed off and no orders were created. Alipay testing while other sections remained dirty returned only the missing Alipay fields. Screenshot: `/tmp/oneshowlearn-alipay-preview-T76zlxiQ/alipay-config.jpg`.
- During local development no production configuration, price, credential, order or service was changed, and no real gateway request was made. Deployment was subsequently separately authorized as recorded above.

Admin payment/pricing now has separate WeChat and Alipay connection buttons. Only saved configuration is tested; editing disables the buttons and hides obsolete results. Saving/reloading clears results. Each result includes configuration version, check time, duration, configuration check, remote check and explicit unverified scope. Tests never automatically enable payment channels.

## Backend

- Owner-only `POST /api/admin/payments/:provider/test`, empty body and mandatory current `If-Match` configuration version. Reject secrets, arbitrary URLs, stale versions and unknown providers.
- Three attempts per owner/platform per minute, ten globally per platform, and a single in-flight test per platform. Upstream timeouts are 12 seconds. Version is rechecked on completion; stale results are discarded.
- Missing/invalid provider fields short-circuit before any network call. Opposite platform configuration does not block this platform's test; no purchase product selection is needed just to test the interface.
- WeChat queries a random 32-character, never-created merchant order number. Only a verified signed `ORDER_NOT_EXIST` is considered a successful probe. Existing transaction creation and callback behavior are unchanged; request error metadata is sanitized.
- Alipay uses its official Node SDK's documented read-only configuration check `/v3/alipay/user/deloauth/detail/query`. The SDK validates signed success responses. Platform responses and business data are not returned to the browser; raw errors, private keys, signatures and merchant identifiers are never logged/displayed by diagnostics.
- No business records, prices, merchant configurations or entitlements are written. Only existing abuse counters are updated. The diagnostic result is transient UI state, not a persistent certification.

## Boundaries

A successful connection test does not establish Native/face-to-face product permission, AppID or seller binding, APIv3 decryption, callback delivery, receipt of funds or course fulfillment. Those require separately authorized end-to-end acceptance. No live payment or new live gateway request was made while developing this feature because production configuration had not yet been supplied.

## References

- WeChat signed order query and `ORDER_NOT_EXIST`: https://pay.wechatpay.cn/doc/v3/merchant/4012791900
- Alipay official SDK configuration verification: https://github.com/alipay/alipay-sdk-nodejs-all (also inspected installed 4.14.0 README and SDK signature handling).

Originally implemented locally; production release was subsequently explicitly authorized by the owner. No merchant-setting changes are implied.

## Self-test results

- 287 automated tests passed: 134 platform, 131 API, 10 storage, 8 diagnostics, 4 Sites; production build passed with the pre-existing bundle-size advisory only.
- New tests cover owner-only access, stale/missing version, secret input rejection, missing/invalid configuration short-circuit, independent disabled-channel testing, exact signed read-only WeChat query, SDK-verified Alipay response, signature/auth/timeout errors, rate limits, overlapping tests and configuration changes during requests. Business table snapshots remain unchanged.
- Local browser on `http://127.0.0.1:4188/admin/payments`: both buttons render and return independent missing-configuration results; editing disables both tests and hides obsolete results; restoring the field restores the saved-config view. Test edits were not saved. Screenshot inspection confirmed readable result cards and existing sticky save actions.
- Local preview API session was restarted on port 18839 with existing isolated database and OSS process configuration preserved. No live credentials or production payment settings were used or modified.

## Production release — October 2

- Explicit owner approval received; reran all 287 tests and production build successfully. Rehearsed 21 payment/diagnostics tests on the production host against an isolated database and mocked gateways before switching the application.
- Released compiled frontend and only `payment-providers.mjs`, `payment-routes.mjs`, `payment-diagnostics.mjs`; no dependency or schema migration. Backup: `/var/backups/oneshowlearn/payment-diagnostics-IuG82A45` (protected server, frontend, environment and consistent database snapshot).
- Verified 31 HTTPS page entry hashes and 34 assets, API health, public catalog and anonymous access protection. Live diagnostics passed anonymous rejection, required/current configuration-version guards and missing-configuration short circuits for both providers. No live gateway invocation was made.
- Verified payment configuration, products, project packs, orders, order items, payments, checkouts and entitlements unchanged against the backup; offer unchanged at ¥499 / original ¥999. Database integrity passed. Other backend modules, environment, dependencies, service/nginx configuration and unrelated service processes remained unchanged.
- Only OneShowLearn restarted; active with zero restarts. Published frontend SHA-256: `b4b875533b024acb5a5f120c8365266c4af8fd6a5c5c8fb420b27cef73eabd2f`.
- This releases connection-test functionality, not a claim that either payment channel is configured or that an end-to-end payment succeeded.

## WeChat configuration follow-up

- Inspected saved production version 3 using read-only requests. WeChat returned HTTP 404 / `ORDER_NOT_EXIST`, full signature headers, matching public-key ID and approximately one-second clock skew. The configured platform public key equaled the public key derived from the merchant private key; signature validation failed. A separate reproduced unsigned HTTP 401 showed the original diagnostic also conflated absent signature headers with invalid cryptographic signatures, but that was not the cause of this live response.
- The existing downloaded `pub_key.pem` and `pub_key (1).pem` contain the same public key. Verified that this public key validates a fresh WeChat response using the already configured public-key ID. No keys or merchant identifiers were emitted.
- Following the owner's continuation, backed up the database to `/var/backups/oneshowlearn/wechat-public-key-gwBqTwJK/before.db` and used a version-protected management API write to replace only `wechat.publicKey`, creating configuration version 4. Verified prices, switches, merchant secrets, Alipay fields, historical configuration and business records preserved (the existing save path refreshes selected product/course timestamps). Live HTTPS WeChat connection diagnostics passed. No orders or payment QR codes were created.
- Added same-key preflight rejection for enabled WeChat saves and independent diagnostics; separate errors for unsigned HTTP 401, missing/malformed headers, stale response timestamp, public-key ID mismatch, certificate mode and deliberate probe signatures. Unsigned error bodies remain untrusted and can never pass a connection test or settle an order.
- Added public-key/merchant-private-key usage and download-location instructions. Full suite: 290 passed; targeted payment tests: 24 passed. Verified local admin page with a fresh isolated test account and no real payment configuration.
- Published the compiled frontend and scoped `payment-configuration`, `payment-providers`, `payment-diagnostics` refinement after 24 isolated server tests. Backup: `/var/backups/oneshowlearn/payment-diagnostics-jVbLCZFQ`. Verified 31 HTTPS routes, 34 assets, preserved configuration/business records and unrelated services. Frontend SHA-256: `cce65cfa2f399976659626b954242999dc7aaa928c4b63e3e1b1786f93afecb9`.
