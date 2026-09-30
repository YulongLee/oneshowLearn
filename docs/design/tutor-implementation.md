# AI 导师 /tutor — 2026-09-26

Visual source: `tutor-qa/reference.png` (1536×1024).

The selected image is implemented as a responsive learner screen, not a new public marketing page. Retains the existing account/session/search shell. The model integration check found no live tutor backend; the old canned-response implementation was removed instead of presented as a real assistant.

## Implemented

- 232px sidebar, learning-context/product rail, structured example conversation, editable prompt composer, right capabilities/questions.
- Current-account published/entitled course progress from `/me/workspace`; product from `/me/opc/product`.
- Prompt buttons fill the composer. Submitting saves a private note with a snapshot of context through the existing versioned workspace API. Refresh preserves the note; account switching remounts the tutor to clear unsaved private state.
- Example conversation is static, labeled and separate from saved questions. No external AI calls or invented generated answers.
- Attachments, screenshot understanding and web search are disabled and labeled unavailable. No Pro or live-model promise.
- No production writes, deployments, remote credential use or catalog seeds.

## Artwork

Built-in ImageGen assets (prompts/provenance in linked sibling documents):

- `../../src/assets/tutor-robot-v2.webp` — [robot generation](tutor-robot.md), transparent cutout.
- `../../src/assets/tutor-note-v2.webp` — [handwritten note](tutor-note.md), transparent background.
- `../../src/assets/tutor-promo-v1.webp` — [violet poster](tutor-promo.md), editable UI copy is rendered in HTML.

## Not live

Real streamed AI answers, file/image analysis and web search require a separate provider integration, server-side credentials, usage/permission controls and privacy review. The page makes this limitation visible next to the heading, chat controls and composer.
