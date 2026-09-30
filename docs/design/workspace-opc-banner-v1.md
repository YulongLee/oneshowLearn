# Workspace OPC Banner v1

- Mode: built-in `image_gen`; not CLI/API fallback.
- Use case: `photorealistic-natural`; final targeted reframing edit: `precise-object-edit`.
- Intended use: signed-in workspace hero, CSS `background-size: cover` / centered `object-fit: cover` at approximately 964 × 234.
- Final files: `src/assets/workspace-opc-banner-v1.png` (original), `src/assets/workspace-opc-banner-v1.webp` (quality 86 WebP).
- Dimensions: 1983 × 793 pixels. WebP: 94,346 bytes (92 KiB). PNG: approximately 1.6 MiB.
- Reference: selected dashboard screenshot, hero region approximately x253,y158,w964,h234. Used as visual composition/mood guidance; no webpage UI was embedded.
- Framing: clean lavender left half; rear-view developer and dusk workspace on right. Final image contains extra sky and lower room to support the shallow centered CSS crop. Critical hoodie text and window notes remain inside the crop.
- Fidelity note: this is a newly generated photographic scene, not a pixel-identical extraction. The final generated canvas is taller than the final banner and relies on centered cover crop. Window note/checklist placement and desk details vary slightly from reference. All Chinese headings, badges and actions must be live HTML.

## Final generation prompt

```text
Generate one ultra-wide panoramic photographic banner background. Use case: photorealistic-natural. Target aspect ratio 4.12:1. The left 48% is flat, nearly-white pale lavender (#f2efff), entirely empty for later HTML copy. On the right, softly fading in at the middle, show a very WIDE SHOT, photographed from several meters behind a young developer at a desk, rear-view black hoodie, dusk rose/lavender city skyline through a window, several code monitors, laptop, a notebook and black mug.
IMPORTANT FRAMING: this is a distant wide-angle scene, not a close-up portrait. Make the developer SMALL in the canvas, centered at x78%, with the TOP OF THEIR HAIR at 30% image height and the BOTTOM OF THE VISIBLE TORSO at 77% image height. Their head must be no more than 16% of the image height. Scene should have ample extra plain sky ABOVE the person and extra desk/floor BELOW so it can be safely cropped to a thin middle panorama. Monitors extend around the person at mid-height.
The hoodie has three small but legible soft-lavender lines exactly: "Build", "Your Ideas", "With AI", all located between 57% and 73% image height. Small black handwriting on the window left of the head reading "Good Ideas / Real Products / A Better You" lies entirely between 27% and 49% height. Far right a tiny black checked list "Idea", "Build", "Launch", "Monetize", "Grow" lies entirely between 27% and 53% height. These are small in-world scene details only.
Style: natural editorial technology photograph, authentic soft fabric, tousled dark hair, dim screens, soft lavender pink sunset. A gentle pale glow dissolves the scene into empty left lavender half. No Chinese headings, no buttons, no badge, no UI, no borders, no rounded card corners, no watermark.
```

## Final targeted edit prompt

```text
Use case: precise-object-edit. Edit only the developer and their chair in the provided photograph. Increase the developer and chair to 150% of their current size around the fixed hip position. The top of the hair should now be at 25% image height, and the bottom of the three complete hoodie text lines should be at 67% image height. Keep person centered horizontally at the same position (75% image width). Keep all three complete exact hoodie text lines "Build", "Your Ideas", "With AI", legible and on the hoodie. Retain realistic body and head proportions. Do NOT change the window, dusk skyline, desktop, monitors, left lavender blank area, handwritten notes or checklist. No new content.
```

## Validation

Inspected the generated output visually. Subject is rear-facing in black hoodie; large pale lavender negative space is intact; dusk skyline, multiple monitors, notebook and mug are present; in-world English text is legible. No Chinese text, webpage chrome, card frame or watermark. The final image was converted to WebP with cwebp; no pixel edits were performed outside the built-in image tool.
