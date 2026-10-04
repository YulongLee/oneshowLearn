# Course-aware tutor studio — 2026-10-04

Owner approved concept `exec-2b46c481-182f-421c-adeb-1224eac88915.png`,
implementation, self-test, Git upload and production publication.

## Implementation

- Compact welcome, restrained native book illustration, one authorized course
  selector above the composer, four contextual draft-only shortcuts and two actual
  owner-filtered recent conversations. Shared branding/sidebar/offer unchanged.
- The latest actual readable course lesson supplies the learning-position hint;
  absent history uses a readable starting lesson, not invented progress. Clarify
  that retrieval covers the chosen course, not just the displayed chapter.
- Preserve account-owned scope, historical revoked-course selection, incoming
  workbench questions, drafts, durable conversations, stop/retry/recovery, source
  citations and private note saving. Loading/error/empty/guest/unavailable states
  do not pretend to have records or capabilities.
- General advice is not blocked by unavailable web search. Web mode explicitly
  excludes private course/product context; grounded mode identifies sources.
  Enter sends, Shift+Enter wraps; IME confirmation does not send. Escape dismisses
  FAQ/history and restores the corresponding trigger focus.
- No upload, online code execution, chapter-only retrieval, model-selection,
  unlimited-use or private-note-search promises. The approved five-chapter course
  content, payment configuration and backend remain unchanged.

## Verification and release

Isolated disposable accounts/CMS/databases and an in-process mock model only;
no real AI/payment/email/SMS requests or production content/configuration writes.
Full regression: 381 tests passed; production build passed with the existing
bundle-size advisory. Isolated tutor suite: 96 checks covering 320–2560px layouts,
actual scope/history, drafts/keyboard/IME, citations/private notes, retry/stop/
recovery, network privacy and guest/error/unavailable/revoked-scope/owner states.
Workbench/course/project/commercial browser suites: 171/170/57/56 checks, all
passed. Total isolated browser checks: 550. Desktop/mobile captures inspected.
The catalogue harness now waits for responsive layout to settle after resizing,
instead of racing the resize observer; application catalogue code is unchanged.

Release only compiled frontend: recoverable backup, expected live-entry guard,
old asset retention, atomic replacement and automatic rollback on failed HTTPS
verification. Verify account/order/conversation privacy, exact entry/assets,
unchanged private-record/order identities, historical amounts, catalogue/provider/
pricing configuration, backend hashes and service processes. No migrations,
fixture uploads, provider operations or restart.

Expected prior live entry:
`b83e20b9318c049c7f91f7d2287d4ef9ca49decd48553496d96028b493632a10`.
New compiled entry:
`529109c098ca192a55c1e84b19849fd4bbdd831c95f02df98ac1bfbec680f2df`.

## Published result

- Source commit `18ee132401c74837a50682fba728c0a061c7f929` pushed to
  `origin/main`. Credentials, databases, media and QA captures excluded.
- Backup: `/var/backups/oneshowlearn/workbench-BlRSSBlm`;
  staging: `/tmp/oneshowlearn-workbench-YvJinTtu`.
  Frontend archive SHA256:
  `6f9fbac3c091584fcd9609b271d7b621893f97ca3097917ebd1f923c8959627f`.
- Exact live entry matches the new hash above. Release verification passed:
  39 HTTPS entry hashes, 50 asset hashes, health/public output and anonymous
  account/order/conversation privacy guards.
- Existing private-record/conversation/turn identities, historical order amounts,
  provider/pricing/catalogue configuration, backend hashes and service processes
  preserved. Only compiled frontend changed; no restart or production mutation.
- Read-only live browser checks: tutor 22, project catalogue 12, course composer
  15, all passed without script errors, mutation attempts or provider calls.
  Live desktop/mobile captures inspected; authoritative ¥499 offer unchanged.
- Actual authenticated answering is exercised with the isolated mock model, not
  a release-time paid model call; existing production provider controls retained.
