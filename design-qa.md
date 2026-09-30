# Resources and personal learning pages — Design QA

final result: passed for the local UI and account-persistence scope

Date: September 26, 2026. Subsequently deployed at the owner's request; see `deploy/README.md` for production verification and rollback details. Local visual checks and production HTTP/API checks are distinct; online browser inspection timed out.

## Reference and evidence

- Source: `docs/design/resources/reference.png` and `docs/design/personal/{community,notes,favorites,achievements}-reference.png`.
- Final personal captures: matching `*-1536-final.png` (1536×1024), with 1:1 `*-comparison.png`. See `desktop-contact.png` and `mobile-contact.png`. Mechanical assembly: `scripts/personal-compare.py`.
- Resource final: `docs/design/resources/implementation-final-1536.png`; earlier comparisons and focused crops retained.
- Populated screenshots use an opt-in temporary database (`tests/fixtures/personal-preview.mjs`), not real data. Test data was never seeded into the user's database.
- Actual local preview: http://127.0.0.1:4176/achievements ; live empty-account capture `docs/design/personal/live-empty.png`. Existing API port 8799 remains running.
- Geometry checked at 320, 390, 768, 1440, 1920, 2560 CSS px: no horizontal overflow or broken loaded images on the four personal routes. Measurements: `responsive-checks.json`.
- Initial very-early resize/loading frames are not visual pass evidence. Final 390px contact sheet, recaptured 320/768 images and 1536px comparisons were used for visual evaluation.
- Previous tutor report preserved at `docs/design/tutor-qa-20260926.md`.

## Resolved findings

1. P2: Mobile community art was washed out behind heading text. Moved the full-opacity illustration below copy at narrow widths; verified in final mobile capture.
2. P2: Excess desktop spacing above achievement metrics. Tightened the action-row spacing without crowding mobile controls.
3. P2: Sidebar image/copy contrast. Limited headline width and added a scoped subtle violet gradient; copy stays editable HTML.
4. P1: Native discard-confirm blocked the embedded browser. Replaced application discard prompts with accessible in-page dialogs. Verified “继续编辑” retains note text and “放弃修改” is required before navigating away. Native before-unload protection remains for browser refresh/close.
5. P2: Legacy note edits would invent a creation date. Preserve absent legacy creation dates; only new records get real timestamps.
6. Earlier resource QA resolved phone/tablet artwork cropping, active-tab treatment and filter/card density; see v1/v2 and final resource captures.

## Verified behavior

- Notes: create/save, refresh persistence, Markdown checklist update, star/unstar, recoverable trash/restore, search/tags, unsaved-input navigation guard. Editor toolbar, text/Markdown import and Markdown export implemented. Markdown uses safe React text, not injected HTML.
- Favorites: real saved account courses/projects, live starred notes and published resource bookmarks; category counts, search, tags, sort, grid/list switch, note/resource detail readers and cancellation without deleting content.
- Resource bookmarks: cancel/add and refresh verified in browser; paid body/attachment access still uses existing entitlement checks.
- Achievements: private create/edit, category/search, HTTP(S) link validation, archive/restore, honest metrics and milestones. No fabricated certificates, views or comments.
- Community: labeled discussion-layout examples and composer saving private learning-note drafts. No public posting, comments, following or fake users.
- Resource center: CMS publication filtering, category/tag searches, sorting, reader/export/copy/completion and guest/entitlement checks covered by prior browser QA and API tests.
- Automated tests: 54 pass (20 models/platforms, 30 API, 4 Sites). New regressions cover legacy state compatibility, persistence, account isolation, version conflicts, trash/restore, duplicates and unsafe URL/certificate rejection.
- Build passed. Required dist/client/index.html, dist/server/index.js, dist/.openai/hosting.json emitted. Protected Sites source files unchanged. Final checked views have no console errors.

## Scope and remaining limitations

- Public homepage and existing workbench/OPC/paths/projects/tutor layouts were not redesigned. Shared “我的成果” now links to /achievements; /courses remains the course library. Deleted notes no longer count or appear in global note search/tutor history.
- Community data, reference people, certificates and popularity metrics are not real records. Actual empty accounts show honest empty states. Generic cover art is labeled “分类示意”.
- Public community publishing/moderation, real AI responses/summarization/voice transcription, official certificates and public outcome sharing still need backend/product work. No payment or subscription integration was added.
- Nonblocking P3: the existing single application bundle exceeds Vite's 500KB warning threshold (about 711KB uncompressed). Route splitting remains future work.
- Built-in ImageGen provided project-bound illustrations. Final saved paths and prompt set: `docs/design/personal/generated-assets.md`; resource prompts remain under `docs/design/resources/`.
