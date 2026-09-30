# Mobile project conceptual cover

- Created: 2026-09-26.
- Method: built-in `image_gen`, one new image generation. No API/CLI generation fallback.
- Purpose: a reusable fallback thumbnail for mobile-app project cards. Consuming UI must label it `界面示意`; it is not a screenshot of a shipped product or a learner's actual project.
- Reference: the mobile-app thumbnails in the first row of the owner-selected projects page at `/var/folders/2c/sdg0hxmx3b5_x84y09b7hk1w0000gn/T/codex-clipboard-b6d08e91-ff26-4054-88ea-84ccb9a78ba9.png`.
- Generated original: `/Users/liyulong/.codex/generated_images/01a0dcdc-4d3b-78e0-ae1e-e3612d88e351/exec-47f7f843-9848-459f-9b40-79d8b26178e9.png`.
- Project PNG: `src/assets/project-mobile-cover-v1.png` (1200 × 630).
- Web asset: `src/assets/project-mobile-cover-v1.webp` (1200 × 630, quality 86).
- Post-processing: target-size export using macOS `sips`, then WebP optimization with `cwebp`. No compositional edits.
- Visual QA: three dark-framed phones, central mint interface, side white/lavender interfaces, pastel cyan/lavender background, clear device outlines and app-style activity/calendar/list cards. No title, badge, logo, person, or claim of real data. UI glyphs are intentionally illustrative, not functional.

## Final generation prompt

```text
Use case: product-mockup
Asset type: reusable MOBILE APP PROJECT thumbnail for a premium AI-native learning website, intended to display at small card scale with a visible HTML label '界面示意' outside the artwork.
Primary request: Generate one polished wide landscape bitmap, aspect ratio 1.9:1, target 1200x630. Show THREE modern smartphones arranged as a compact product showcase, matching the selected OneShowLearn reference's mobile-app course cover visual language. Full artwork only, no website card frame or surrounding UI.
Scene/backdrop: clean pastel background, pale cyan blending gently into pale lavender, bright subtle studio lighting with restrained soft shadows.
Subject: three sleek dark-framed smartphones in a staggered arrangement, each nearly frontal with a slight three-quarter angle for depth. A taller central phone and two slightly lower side phones. Devices occupy the middle and right 85 percent of frame, clean visual margins, lower phone edges may be naturally cropped by the bottom of the composition. One screen has a beautiful mint-green utility-app interface, others have bright white/light-violet utility-app interfaces. Screens use believable minimal app layouts: small calendar strip, activity overview, rounded task or expense cards, restrained pastel icons and compact list rows. No real product brand, no copied trademarks.
Style/medium: sharp commercial product mockup, highly crafted photorealistic 3D device rendering with crisp UI structure, cool soft studio reflections, modern minimal SaaS editorial style, visually clear when reduced to a roughly 220px-wide thumbnail.
Color palette: mint green UI, white and light violet UI, dark navy device edges, pale cyan/lavender background.
Composition/framing: landscape 1.9:1; simple clean scene; screens are the focal point; device group fills image height. No big text, no headings, no badges, no course title or subtitle, no logos, no watermark. Tiny UI glyphs may appear but avoid legible promotional copy, money/learner statistics, or realistic personal names. No extra objects or hands. This is clearly conceptual app artwork, not evidence of a real published product.
```
