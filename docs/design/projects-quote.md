# Projects mountain quote artwork

- Created: 2026-09-26.
- Method: built-in `image_gen` tool, one new generation; no API/CLI fallback.
- Purpose: the small mountain motivational poster in the projects-page right rail.
- Composition reference: `docs/design/projects-qa/source-quote.png`, a 238 × 199 crop of the owner-selected full-page reference at `/var/folders/2c/sdg0hxmx3b5_x84y09b7hk1w0000gn/T/codex-clipboard-b6d08e91-ff26-4054-88ea-84ccb9a78ba9.png`.
- Generated original: `/Users/liyulong/.codex/generated_images/01a0dcdc-4d3b-78e0-ae1e-e3612d88e351/exec-1d26f32b-759b-4510-97f3-b03ae1dec84a.png` (1371 × 1147).
- Project PNG: `src/assets/projects-quote-v1.png` (1190 × 995).
- Optimized web asset: `src/assets/projects-quote-v1.webp` (1190 × 995, quality 86).
- Post-processing: proportional target-size export using macOS `sips`, then WebP compression with `cwebp`; no compositional or text editing.
- Visual QA: exact two-line Chinese title and `— OneShowLearn` attribution verified visually. The pale lavender/peach sky, blue-violet mountains and solitary rear-view figure are present. Relative to the reference crop, this interpretation is more photorealistic and the figure is slightly lower; it preserves the reference's overall hierarchy and calm editorial mood.
- Content note: this is AI-generated conceptual scenery and product-brand motivational copy, not learner feedback or a real-person testimonial.

## Final generation prompt

```text
Use case: ads-marketing
Asset type: small commercial editorial mountain quote poster for the right sidebar of OneShowLearn, a learning workspace. Generate ONE finished standalone bitmap artwork, not a screenshot of a website.
Primary request: Recreate the inspected mountain motivational poster's composition faithfully at high resolution, target 1190 x 995 pixels, landscape aspect ratio 1.196:1. The entire image is artwork edge-to-edge without border or external whitespace. Do not include the surrounding UI.
Scene/backdrop: Upper half quiet clean sky, pale lavender at the top, softly blending into a pale peach-pink sunset near the horizon. Lower half layered jagged alpine mountains, sharp blue and muted violet snow-streaked rock ridges, a prominent peak at about one third from left, atmospheric layers extending to the right, foreground dark violet rocky ridge.
Subject: One small solitary person in dark outdoor clothing standing on the right foreground ridge, seen from behind, full body visible, gazing into mountains. Their scale and position should match the reference: head around 55 percent down, body extends to about 88 percent down, x about 77 percent across. No other people.
Style/medium: Calm cinematic editorial poster, premium commercial SaaS art, semi-realistic painted landscape with sharp mountain facets, clean smooth sky, restrained texture, atmospheric and quietly motivational, not cartoon, not glossy 3D.
Composition: Mountains occupy lower half; uncluttered pale sky provides clear typography space. Black bold modern Chinese sans-serif title at upper left, large and legible but with generous margin. Render EXACTLY these two lines, line break between them: '把想法变成产品' and '让 AI 放大你的创造力'. Start x about 7.5 percent, y about 10 percent, use same left alignment. Main text width about 69 percent of canvas and total two-line height about 22 percent. Small muted blue-gray attribution aligned near right-center of the sky at about x54 percent and y40 percent, exactly '— OneShowLearn'.
Text accuracy: These three strings are the only text in the image. Preserve all Chinese characters and Latin capitalization verbatim. Main copy must be two lines only. The attribution is not a logo.
Constraints: Only the artwork, no webpage, no cards, no controls, no buttons, no UI labels, no other text, no icons, no badges, no watermark. Avoid extra objects, bright saturated colors, large human portrait, snowy white washout, or text placed over dark mountains.
```
