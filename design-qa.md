# OneShowLearn Homepage Responsive Design QA

- Source visual truth:
  - `/var/folders/2c/sdg0hxmx3b5_x84y09b7hk1w0000gn/T/codex-clipboard-15354c07-33db-4730-b031-7776c41cbe20.png`
  - `/var/folders/2c/sdg0hxmx3b5_x84y09b7hk1w0000gn/T/codex-clipboard-9d35eeaa-463f-46d1-9247-d3951599e556.png`
  - `/Users/liyulong/Documents/ChatGPT/OneshowLearn/audit-home-1440-before.png`
  - `/Users/liyulong/Documents/ChatGPT/OneshowLearn/audit-home-1024-before.png`
  - `/Users/liyulong/Documents/ChatGPT/OneshowLearn/audit-home-390-before.png`
- Implementation screenshots:
  - `/Users/liyulong/Documents/ChatGPT/OneshowLearn/audit-home-panorama-1440.png`
  - `/Users/liyulong/Documents/ChatGPT/OneshowLearn/audit-home-panorama-390.png`
  - `/Users/liyulong/Documents/ChatGPT/OneshowLearn/audit-home-cutout-1440.png`
  - `/Users/liyulong/Documents/ChatGPT/OneshowLearn/audit-home-cutout-390.png`
  - `/Users/liyulong/Documents/ChatGPT/OneshowLearn/audit-home-1440-after.png`
  - `/Users/liyulong/Documents/ChatGPT/OneshowLearn/audit-home-1024-after.png`
  - `/Users/liyulong/Documents/ChatGPT/OneshowLearn/audit-home-768-after.png`
  - `/Users/liyulong/Documents/ChatGPT/OneshowLearn/audit-home-390-after.png`
- Combined comparison evidence:
  - `/Users/liyulong/Documents/ChatGPT/OneshowLearn/audit-home-panorama-comparison.png`
  - `/Users/liyulong/Documents/ChatGPT/OneshowLearn/audit-home-cutout-focused-comparison.png`
  - `/Users/liyulong/Documents/ChatGPT/OneshowLearn/audit-home-1440-comparison.png`
  - `/Users/liyulong/Documents/ChatGPT/OneshowLearn/audit-home-1024-comparison.png`
  - `/Users/liyulong/Documents/ChatGPT/OneshowLearn/audit-home-390-comparison.png`
- Viewports: 1440 × 900, 1024 × 768, 768 × 900, and 390 × 844 CSS pixels.
- Pixel density: screenshots equal CSS viewport dimensions at device scale factor 1; no density normalization was required.
- State: signed-out public homepage, navigation closed in final captures.

## Full-view comparison evidence

The before and after captures were placed side by side at matching viewport sizes. They show the intentional change from a fixed-height dashboard-like hero to a natural marketing flow. The new hierarchy remains stable across desktop, compact desktop/tablet and mobile without overlapping the subject, clipping persistent controls or creating horizontal overflow.

Focused crops were not required for the initial responsive pass because the matched viewport comparisons keep the navigation, headline, primary actions, hero image, proof points and first value row legible.

The latest panorama iteration uses the clarified reference as visual truth: the person, room, table and laptop remain one continuous photographic scene, while the left-side wash creates a quiet surface for the headline.

## Required fidelity surfaces

- Typography: the Manrope/PingFang hierarchy remains consistent; heading size now scales with `clamp()` and wraps predictably across breakpoints.
- Spacing and layout: fixed 960px hero height, absolute utility cards and bottom-anchored path strip were removed. The new grid and normal document flow preserve rhythm at all tested widths.
- Colors and tokens: warm neutral canvas, near-black actions and violet accents remain consistent with the established product language.
- Image quality: the dedicated hero image remains sharp and is presented as a full-bleed scene on desktop, then reflows below the copy without horizontal overflow on mobile.
- Copy and content: personalized progress content was removed from the public homepage. Public copy now explains audience fit, learning method and project outcomes.
- Accessibility and behavior: mobile navigation exposes correct open/close labels; semantic navigation and buttons remain keyboard reachable; no horizontal overflow or console errors were found.

## Comparison history

### Iteration 1

- [P1][information architecture] Public homepage displayed signed-in workspace content: AI Tutor quick action, today's goal and continue-learning progress.
- [P1][responsive layout] At 1024px the absolute utility cards covered the hero subject and the path strip was clipped by the viewport.
- [P2][mobile hierarchy] At 390px the hero image disappeared while a personalized continue-learning card remained, making the page feel like an incomplete workspace.
- Fixes: removed personalized widgets, simplified the public navigation, rebuilt the hero as a responsive two-column/stacked grid, retained the real learning image on mobile, and moved paths into natural document flow.
- Post-fix evidence: the three combined comparison images listed above show the corrected hierarchy and reflow.

### Iteration 2

- [P2][image treatment] The bounded rectangular lifestyle photograph weakened the full-person foreground depth that the selected reference established.
- Fix: removed the UI overlay from the person asset, generated a clean chroma-key foreground, converted it to a transparent alpha PNG, and placed the full person, notebook and laptop directly on the hero canvas.
- Post-fix evidence: `audit-home-cutout-focused-comparison.png`, `audit-home-cutout-1440.png`, and `audit-home-cutout-390.png` show the restored silhouette effect without reintroducing personalized workspace progress.

### Iteration 3

- [P2][reference interpretation] The isolated transparent person treatment did not match the clarified target, whose depth comes from a continuous room, desk and learner photograph rather than a cutout.
- Fix: restored the complete lifestyle scene as the full hero canvas, added a left-to-right warm wash for readable copy, retained one generic project-learning label, and floated the public value strip over the lower edge of the scene.
- Responsive fix: desktop preserves the panoramic composition; tablet and phone place the uncropped scene after the copy so the learner and environment stay visible.
- Post-fix evidence: `audit-home-panorama-comparison.png`, `audit-home-panorama-1440.png`, and `audit-home-panorama-390.png`.

## Verification

- Responsive overflow checks: passed at 1440, 1024, 768 and 390 widths.
- Mobile menu open/close labels and visibility: passed.
- Full-scene crop, text contrast and responsive reflow: passed.
- Console errors: none.
- Production build: passed.
- Sites packaging tests: 4 passed, 0 failed.

## Findings

No actionable P0, P1 or P2 issue remains in the tested homepage states.

final result: passed
