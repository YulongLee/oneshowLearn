# Resources hero asset — v1

- Created: 2026-09-26.
- Generator: built-in `image_gen` tool; no API/CLI fallback.
- Use case: `stylized-concept`.
- Visual reference inspected: `docs/design/resources/reference-hero.png` (style and composition reference, not copied UI artwork).
- Selected original: `src/assets/resources-hero-v1-original.png` (2033 × 773).
- Production asset: `src/assets/resources-hero-v1.webp` (1536 × 366, approximately 4.2:1; 22,036 bytes).
- Generated source: `/Users/liyulong/.codex/generated_images/01a0dd1c-151b-7bb0-8014-c53a96f7de62/exec-0e519f0a-a30d-4bfe-a932-6a3db399e8d0.png`.
- Mechanical processing only after generation: crop rectangle x=0, y=145, width=2033, height=484; proportion-preserving resize to 1536 × 366; WebP quality 91. No painted, composited, or programmatically synthesized elements.

## Initial generation prompt

Use case: stylized-concept.
Asset type: production website hero banner background, no website UI.
Primary request: Create a wide 4.2:1 horizontal hero banner background, approximately 1536x368 pixels, for a premium AI learning resources library. The whole left 64 percent must be completely clear negative space for HTML copy, with no text, no objects, no shadows crossing into it. Background is seamless soft pale lavender (#efedff at left), gradually transitioning to very pale periwinkle blue at right (#dbe1ff), subtle soft ambient bloom.
Subject and composition: Place a compact elegant floating 3D cluster ONLY within the rightmost 31 percent, with comfortable margins on all sides. Three chunky rounded-square tiles at slightly varying angles: upper-left of cluster a glossy black tile bearing a clean white six-loop interwoven OpenAI-like knot; upper-center/right a larger pale-lilac rounded square bearing a vivid violet </> code bracket symbol; far-right and slightly lower a smaller white rounded square bearing a black serif boxed N Notion mark. In front at the bottom-left of cluster, a small tilted rounded-rectangle purple-to-blue plaque with crisp white bold text on two lines, exactly “Build Faster” and “Ship Sooner”. All four objects are fully visible and floating, never clipped. Cluster should occupy about 80 percent of banner height. Plaque perspective only mildly tilted; text very legible.
Style/medium: elegant premium SaaS 3D studio render, smooth lightly glossy ceramic/plastic tiles with soft bevels, gentle diffuse shadows, airy white-lavender atmosphere, restrained realistic depth.
Text (verbatim): only “Build Faster” on line one and “Ship Sooner” on line two on the plaque, plus the code symbol and N logo. No other words or numbers.
Constraints: no person, no Chinese text, no UI labels, no buttons, no badge, no metrics, no border, no outer rounded rectangle, no gradients with banding, no watermark, no extra props. Left two thirds remain blank. Output one finished image.

## Targeted refinement prompt

Edit the generated hero background. Preserve its pale lavender/periwinkle background, every object, logos, exact plaque text, materials and rendering style. Change ONLY the scale and placement of the entire right-side cluster: make all four objects and their shadows 68% of their current size, with the cluster centered around horizontal 82% and vertical 50% of the canvas. Critical: the complete art including shadows must fit within the horizontal 68%-97% and vertical 22%-78% region of the full image. This permits a later wide panoramic crop. Left 65% stays entirely blank soft pale lavender. No extra text, no new props. Plaque must continue to say exactly "Build Faster" and "Ship Sooner". Output one image with the same background and canvas framing.

## Visual QA

Inspected the original and production WebP. Left approximately 65% is blank for HTML content. Black knot tile, lilac code tile, white N tile and purple-blue plaque are all fully visible with soft shadows. Plaque reads exactly “Build Faster” / “Ship Sooner”. No Chinese interface copy, badge, controls, metrics or person are baked into the asset. The final panoramic crop retains comfortable margins and does not distort tile proportions. Use as conceptual decorative artwork, not evidence of a connected integration.
