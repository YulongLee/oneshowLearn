# Shared study player refinement — 2026-09-30

Originally implemented and verified locally. The owner subsequently explicitly requested deployment; the frontend was released on 2026-09-30. No CMS import, account migration or external service changes.

## Changes

- Course and project lessons share `LearningVideoPlayer`: dark integrated controls, real seeking and buffered range, play/pause, ±10 seconds, mute/volume, remembered valid playback speed, supported fullscreen, subtitles only when configured, keyboard shortcuts and touch-sized mobile controls.
- Controls fade after 2.8 seconds of playback inactivity; paused, error and keyboard-focused controls remain available. Signed media failure gets one automatic refresh followed by an explicit retry, retaining the local playback position.
- Existing five-second progress synchronization and pause/seek saving remain backed by the account API. Version conflicts remain blocking, with a persistent warning and explicit refresh action instead of allowing playback to overwrite the warning.
- Content is grouped into 课件 / 资料 / 实践. Materials filter all, articles, code, Codex prompts and attachments for both reader types. Practice retains tasks, operations and expected outcomes. Pending course states use the same three groups.
- Notes keep rich text, screenshots, private timestamp anchors, autosave, version conflicts and recoverable archive. Timestamp recording is primary; the large AI promotion is replaced with a compact functional entry. Unconfigured AI remains unavailable.
- No fake quality selector, generated AI response, catalog metrics or lesson media were introduced. Public website/admin/shared navigation remain unchanged.

## Verification

- `npm run build`: passed; existing large-bundle advisory remains.
- `npm test`: 111 passing tests (48 platform, 59 API, 4 Sites). Added time/seek/rate boundary checks and unified material-filter checks.
- Browser: local isolated preview on port 4179, both project workspace and `/opc`. Tested play/pause, keyboard, seek, volume/mute, 1.5× preference after reopening, fullscreen entry/exit, pause/progress persistence, copy Prompt, courseware, practice operations, private timestamp note save/reopen, and mobile notes/AI unavailable state.
- Timed browser check: after 3.2 seconds of active playback, `lp-quiet` was set and control opacity was 0; keyboard pause restored controls.
- Responsive checks at 390, 768, 1440, 1920, 2560 and 3440px: document width equals viewport width. Video expands from 358px (390 viewport) to 2428px (3440 viewport); ultrawide video height capped at 680px for the tested 1000px height. Desktop notes remain bounded at 280–400px; mobile notes open in the existing dialog.

Preview uses pre-existing isolated demonstration content, never production data. Adaptive streaming, source transcoding and multi-quality selection were not added; the player uses the configured real source. Subtitle rendering/error-path network fault injection and other browser engines have not been manually cross-browser tested.

## Production release

- Frontend-only publication to the existing mainland deployment at `https://oneshowlearn.com/opc` and project workspace routes. No database, course material, user progress, backend or environment configuration was uploaded or modified.
- Fresh build and all 111 tests passed before publication. Local-client verification against HTTPS passed 22 page-entry hashes, 36 asset hashes, API health/catalogue reads and anonymous access protection.
- Application service remained active, PID `3792799`, restart count `0`; no service restart was requested.
- Prior frontend backup: `/var/backups/oneshowlearn/frontend-u0BX11J9/client`.
- Staging: `/tmp/oneshowlearn-platforms-Nw4BMg1z`.
- Release archive SHA-256: `9e9b4f9d6f58416e57fe435ae5dc5b3c248a38cac183084ddd201f9993e822fb`.
- Entry SHA-256: `b35a8feff7af73ad45e0f7053a724039eb220b733ad6c052a9a9b9d4ee3310b6`.
- Assets: `index-aDEVvyS6.js`, `index-C_t4moEX.css`. Existing hashed assets remain for open tabs and rollback.
- Mac archive metadata sidecars copied by extraction were moved out of the served directory into the release backup's `archive-metadata` directory; actual web assets are unchanged and no material was deleted.
- Production verification is read-only HTTP/hash verification. Interactive player tests and responsive visual checks were completed in the isolated local preview, not by writing test progress to real production accounts.
