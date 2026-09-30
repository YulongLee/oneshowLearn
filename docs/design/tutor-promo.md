# AI tutor promotional artwork

- Date: 2026-09-26
- Mode: built-in ImageGen; one generated image, no CLI or API fallback.
- Use case: `ads-marketing`.
- Reference: `docs/design/tutor-qa/promo-reference.png`, inspected as a composition/style reference; not an edit target.
- Output: `src/assets/tutor-promo-v1.png` and `src/assets/tutor-promo-v1.webp`.
- Final dimensions: 1320 × 800, aspect ratio 1.65:1, for a 314 × 190 display slot.
- Post-processing: PNG resized from native 1610 × 977 output to 1320 × 800; WebP encoded at quality 87. No illustration retouching or compositing.
- Original generated source: `/Users/liyulong/.codex/generated_images/01a0dd01-d4db-7a23-883a-b9b6ae70cc93/exec-41bb995f-c235-488a-ab37-c434fc60a085.png`.
- Intended composition: left side clear for actual HTML heading/benefits, robot and laptop on the right, only the handwritten “Build / Together” baked into the lower right. No Chinese copy or check icons.
- QA: inspected generated artwork; subject, clear left copy space, violet palette, two-line handwriting and absence of UI/card borders match the requested asset role. This is conceptual marketing illustration, not an actual tutor feature screenshot.

## Final prompt

```text
Use case: ads-marketing
Asset type: final standalone bitmap background for a compact OneShowLearn AI tutor promotional card, 314x190 display slot. Generate a landscape image about 1320x800, aspect ratio exactly 1.65:1.
Primary request: a premium violet 3D robot-with-laptop promotional illustration matching the composition and style of the small provided purple reference. Recreate its polished soft ceramic aesthetic as a new high-resolution asset, with the left 55% intentionally empty so real HTML heading and benefit copy can be overlaid.
Scene/backdrop: edge-to-edge rich deep violet and purple gradient, subtly lighter violet toward the upper right, refined very faint abstract light shapes only at the right, quiet luxurious SaaS editorial style.
Subject: one cute white and pale-violet ceramic robot, small rounded antenna, rounded ears, large glossy black face panel, two friendly luminous cyan eyes and very subtle smile. It sits behind one small open lilac laptop in the lower-right. Its head and body occupy the rightmost 36–40% of the canvas; laptop begins no farther left than 55% canvas width. Keep the robot's head fully inside the canvas. Its lower body and desk plane can be softly cropped at the bottom/right edges exactly like the reference.
Style/medium: premium high quality 3D studio render; soft ceramic surfaces with restrained glossy highlights, ambient occlusion, realistic soft shadows, gentle violet rim light.
Composition/framing: all subject detail tightly concentrated in rightmost 45%; leave left 55% absolutely clear purple space, no objects, text, lines, gradients of excessive contrast or foreground clutter there. Broad horizontal layout; robot looks slightly toward viewer; laptop at slight 3/4 angle.
Text (verbatim): the only text is tiny white handwritten "Build" above "Together" at bottom-right below the robot, loose lively script like the reference, slanted upward slightly.
Constraints: only robot, laptop, subtle ground plane and backdrop. No Chinese text. No check icons, no benefit labels, no headline, no logos, no extra text, no watermark, no border, no rounded corners, no UI card chrome. This is background artwork only, not a screenshot or complete webpage. Preserve the quiet empty left side.
```
