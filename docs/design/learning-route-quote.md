# Learning route — mountain quote asset

- Tool: built-in `image_gen` (no CLI/API fallback).
- Reference: `codex-clipboard-6ba6d1eb-9d0f-4a7b-b4d8-630405ccac64.png`, bottom-right motivational poster, approximately x1008 / y992 / 196×252.
- Source PNG: `src/assets/learning-route-quote-v1.png`.
- Web asset: `src/assets/learning-route-quote-v1.webp`, optimized to 784px wide with its original portrait aspect ratio preserved.
- Intended display: portrait 7:9 card, preserve full composition with no crop. The quote and attribution are intentionally baked into the asset to match the reference.
- Visual QA: inspected generated output. Chinese quote is correct, both OneShowLearn attributions have correct capitalization, pale cream/blush/lavender sky, slate snowy mountains, no people or stray UI.

## Final generation prompt

Use case: ads-marketing. Generate a single finished portrait motivational poster asset for a premium Chinese learning dashboard, 784 x 1008 px or same 7:9 aspect ratio. Use only the bottom-right mountain quote poster in the supplied screenshot as composition and style reference, not the rest of the UI. Asset must be edge-to-edge rectangular poster, no frame, no UI, no surrounding webpage. Upper 50% is clean pale cream sky grading to very pale blush pink/lavender at upper right, subtle warm dawn light. Lower 50% is beautiful photorealistic detailed jagged slate-gray and lavender snow-covered mountain peaks, central snowy high peak, atmospheric receding pale lavender ridges and darker rocky foreground at bottom-right. No people. Calm minimal premium editorial art. Exact Chinese quote baked into top-left, two bold modern black Chinese sans-serif lines with generous leading, positioned 8% from left and 8% from top, occupy about half width: line 1 “最好的时机， line 2 就是现在。” Include opening curly quote before 最 and closing curly quote after full stop. A small violet attribution reading exactly — OneShowLearn is right-aligned under quote, about 33% from top and 8% from right. A second small white attribution reading exactly — OneShowLearn appears bottom-right 5% above bottom with 7% right margin. Brand capitalization must be exactly O n e S h o w L e a r n with no spaces. No extra text, no logo, no watermark. Keep text crisp and accurately spelled. Mountain scene begins around 47% down and fills the bottom edge.

## Accessibility copy

Recommended image alt: “最好的时机，就是现在。— OneShowLearn。晨光中的雪山。”
