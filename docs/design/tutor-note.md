# Tutor handwritten note

## Transparent revision (preferred for integration)

- Assets: `src/assets/tutor-note-v2.png` (1509 × 1042), `src/assets/tutor-note-v2.webp` (1000 × 691, approximately 68 KB).
- Created with a built-in ImageGen background-extraction edit of v1, to remove the visible pale rectangular background.
- Alpha validation: source PNG is RGBA with alpha range 0–255; 1,363,384 fully transparent pixels and all four corners alpha 0. WebP conversion preserves lossless alpha.
- v1 is retained non-destructively.

### Transparent revision prompt

Use case: background-extraction. Edit target: the attached handwritten note. Change ONLY the background: remove the entire pale blue/near-white backdrop and make it genuinely TRANSPARENT using a real alpha channel. Deliver a transparent PNG cutout containing only the black ink handwriting and the purple underline. Keep all three lines exactly intact: 'Ask Anything', 'Build Anything', 'Grow Faster'. Preserve their exact black handwritten letterforms, size, arrangement, line spacing, upward slopes, and the single violet underline. Preserve the original canvas composition and whitespace as transparent pixels. All open letter counters, gaps, surrounding empty areas, and corners must be alpha=0 transparent, not white, pale blue, checkerboard, gray, or any other painted background. Letter edges should have clean antialiasing with appropriate partial transparency, no colored fringes or opaque rectangular remnants. Do not redraw, reposition, add, remove, or recolor any ink strokes; do not add text or watermark.

## Initial version

- Assets: `src/assets/tutor-note-v1.png` (original), `src/assets/tutor-note-v1.webp` (web-optimized).
- Generation: built-in ImageGen, 2026-09-26.
- Dimensions: PNG 1509 × 1042 pixels; WebP 1000 × 691 pixels. Landscape ratio matches the intended 184 × 127 display slot.
- Reference: `docs/design/tutor-qa/note-reference.png` (lettering, placement, crop).
- Exact lettering verified: “Ask Anything”, “Build Anything”, “Grow Faster”.
- Treatment: casual upward-sloping black handwriting, violet underline, pale cool backdrop requested as `#f7f9ff`.
- Original retained: `/Users/liyulong/.codex/generated_images/01a0dd02-1321-75e3-ba55-a1c689d19ef3/exec-5dd19945-4c7b-40c2-a436-74ea1d059641.png`.

## Final generation prompt

Use case: ads-marketing. Asset type: compact decorative handwritten note for a tutor hero in an editorial SaaS website. Input image 1 is the composition and lettering reference. Create a clean high-resolution raster recreation of that note at approximately 1000x690 pixels, landscape aspect 184:127, matching the reference's compact crop and typography scale. Uniform very pale cool background exactly #f7f9ff, seamless and flat from edge to edge. ONLY three casually handwritten black-ink lines, exact verbatim wording and capitalization: first line 'Ask Anything'; second line 'Build Anything'; third line 'Grow Faster'. Lively natural thin black handwriting, each line has a slight upward slope from left to right, around 9 degrees like the reference. First line begins near the upper-left, second line indents slightly, third line indents further; retain generous but compact separation, filling most of the crop similarly to the reference. Add one delicate thin violet hand-drawn underline under 'Grow Faster', gently angled upward at right. Match the reference's lettering letter-by-letter, line count, line lengths, staggered alignment, and relaxed ink character. High readability when displayed at 184x127 CSS pixels. No other symbols, text, punctuation, decoration, watermark, border, card outline, paper texture, shadows, gradients, or objects. Background must be uniformly #f7f9ff. Do not include a cropped circle or corner mark.
