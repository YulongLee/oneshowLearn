# AI OPC homepage hero artwork — 2026-09-25

Scope correction: the owner clarified that the supplied mockup targets the signed-in learner homepage `/app`, not the public website `/`. The same scene asset is used in `WorkspaceLanding.jsx`; the public homepage was restored without this redesign.

## Generation record

- Skill: `imagegen`; read the complete skill and shared prompting guide before generation.
- Mode: built-in `image_gen`, new-image generation (not CLI/API fallback; no model override).
- Reference role: the user’s homepage mockup guided scene, composition and mood, not an edit target. Inspected using `view_image` before generating.
- Source mockup: `/var/folders/2c/sdg0hxmx3b5_x84y09b7hk1w0000gn/T/codex-clipboard-519a3e98-ea72-47f2-af28-92d11a32d183.png`.
- Built-in original: `/Users/liyulong/.codex/generated_images/01a0d466-1d13-71d0-9feb-0182996ab3bc/exec-d0da8ea3-e36a-4442-977c-42c35ccbde66.png`.
- Project original: `src/assets/opc-home-hero-v1.png` (1672 × 941).
- Web delivery asset: `src/assets/opc-home-hero-v1.webp`; WebP encoding at quality 88, same dimensions, no crop or visual edit.
- Existing artwork was not overwritten.

## Visual review

The delivered image has the requested black-knit subject, natural skin and fabric texture, full hair, silver unbranded laptop, warm wooden desk, charcoal mug, white book stack and lightly handwritten planning board. Subject and useful detail sit on the right; the left has soft near-white negative space for real HTML text. There are no website controls or embedded promotional claims. The whiteboard words are legible; all five happen to have check marks, with the final smiley also present. This small decorative difference is acceptable. One hand is visible, the other is naturally occluded by the laptop. No extra image editing was needed.

## Final prompt

```text
Use case: photorealistic-natural
Asset type: full-width photographic hero background for OneShowLearn's AI OPC course landing page; this is ONLY the scene photo, NOT a website mockup.
Primary request: A high-quality natural editorial photograph of a focused young adult East Asian man in a black knit sweater working on an unbranded silver laptop at a light warm wooden desk in a bright white-gray home studio. His wavy black hair is fully visible. He looks down toward the laptop screen, hands naturally resting on the laptop keyboard. Real skin texture, realistic hands, visible fabric weave, candid believable posture.
Composition/framing: Wide landscape 16:9 composition, medium-wide frontal three-quarter view, eye-level 50mm-lens feeling. The person, laptop and desk occupy the RIGHT 60% of the image. Keep the LEFT 40% nearly white and visually empty as clean negative space for HTML headline copy; the studio naturally fades into this bright negative space with no hard dividing edge. Show his full head, torso, both hands, laptop base and the front strip of the desk; no cropped hair, no cut-off laptop. His face should be around 68% from the left and 38% from the top.
Scene/backdrop: Tall softly lit white curtains/windows behind the left of the subject, a subtle indoor green plant near the back, a whiteboard on the rear RIGHT. A single dark charcoal ceramic mug on the desk in front of him, a neat small stack of white books at the far right edge. Keep all physical props in the right half so the left side stays usable for live webpage text.
Whiteboard text only: lightly handwritten dark-gray checklist, exactly five lines: "Idea", "Build", "Launch", "Growth", "Freedom". Small hand-drawn checkmarks next to the first four words and a small smiley next to Freedom. The board is naturally slightly out of focus but the words are not garbled. No other in-image text.
Lighting/mood: Large soft natural window light, airy off-white environment, gentle authentic shadows, calm productive and aspirational. Black-and-white neutral palette with warm wood and only a barely perceptible lavender undertone in highlights, not purple color grading.
Constraints: Generate the photographic scene only. No website UI, no buttons, no cards, no header or footer, no page headline, no floating quote, no brand logo, no watermark. Laptop, mug and books must be unbranded and have no writing. Keep the clean negative-space composition; avoid busy furniture, awkward limbs, plastic skin or over-retouching.
```
