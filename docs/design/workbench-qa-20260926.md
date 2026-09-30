# Signed-in workbench — visual and functional QA

Date: 2026-09-26. Route: `/app`. Local preview: http://127.0.0.1:4176/app

## Source and state

- Visual truth: `/var/folders/2c/sdg0hxmx3b5_x84y09b7hk1w0000gn/T/codex-clipboard-9460e2d0-b8d8-4041-8d73-dc88fda785fc.png`.
- Durable source copy: `docs/design/workbench-qa/reference.png` (1536 × 1024).
- Final implementation: `docs/design/workbench-qa/final-1536.png` (1536 × 1057 full document), captured from the rendered browser with a 1536 × 1024 CSS viewport and devicePixelRatio 1.
- Comparison crops use the top 1536 × 1024 pixels at 1:1 density, without rescaling either source or implementation. No browser chrome/device frame is included.
- State: signed in as the existing **local test administrator**, with real CMS courses, zero course progress, no recent learning, no tasks, notes or favorites. The screenshot's Yulong identity, enrolled AI OPC course, lesson history, 32% progress, sample tasks and October 2024 dates are not real account data and were not seeded.
- This visual QA was completed locally without production changes. A subsequent explicit user request authorized deployment; see the deployment addendum below.

## Comparison evidence

Source is on the left; implementation is on the right in every paired image.

- Full composition: `docs/design/workbench-qa/comparison-final.png`.
- Banner typography and artwork: `docs/design/workbench-qa/comparison-hero.png`.
- Progress, route and project details: `docs/design/workbench-qa/comparison-details.png`.
- Tutor, tasks, calendar and mountain card: `docs/design/workbench-qa/comparison-rail.png`.
- Responsive captures: `docs/design/workbench-qa/final-{320,390,768,1024,1440,1536,1920,2560}.png`.
- Tutor interaction: `docs/design/workbench-qa/tutor-dialog.png`.

The full view and focused pairs were opened together as combined images and visually reviewed, not judged solely from code or separate screenshots. Early rapid viewport-switch captures included stale-painted frames; final named captures were replaced after each viewport change had rendered, and visually inspected.

## Findings and iteration history

### Initial comparison — blocked

Evidence: `comparison-initial.png`, `desktop-1536-initial-full.png`.

1. **P2 — small UI text lacked the reference hierarchy.** Increased desktop navigation to 15px, greeting to 26px, section headings to 18px, course title to 15px, hero body to 15px, and tutor/task text to 13px. Preserved the compact reference density and established Chinese font stack.
2. **P2 — calendar pushed the mountain panel too far down.** Moved check-in into the panel heading and tightened month rows. The calendar now occupies approximately the reference height while retaining actual dates and account check-in marks.

### Responsive/interaction review — blocked

Evidence: `responsive-320.png`, earlier wide captures; mobile navigation interaction.

3. **P2 — phone hero text overlapped the photo.** Created a separate lower photo region, intentional two-line title, and full-width copy region on phones. Final 320/390 captures show readable text and unobstructed buttons.
4. **P2 — center crop clipped the subject's head on wide screens.** Changed the desktop image crop to 30% vertical positioning and refined the copy-side fade. Final 1440/1920/2560 captures retain the head and visual subject.
5. **P2 — mobile scrim's hit area extended underneath the sidebar.** Restricted the scrim to the exposed area; collapsed navigation is now hidden from tab/accessibility navigation. Opening and closing the mobile menu were verified through real button clicks.
6. **P2 — narrow sidebar heading and tablet phase copy wrapped awkwardly.** Tightened the access-card heading on narrow desktops and used vertical phase anatomy on tablets. Final 1024/768 captures show clear labels without overlap.

### Final comparison — passed

Earlier findings were checked again against the recaptured full and focused pairs. No remaining actionable P0/P1/P2 differences in the implemented scope.

## Required fidelity surfaces

- **Typography:** retained DM Sans/PingFang SC/Microsoft YaHei fallback, near-black semibold hierarchy, smaller slate metadata and violet actions. Reference font identity is not supplied, so no claim of exact font matching. Real long CMS titles may use two lines instead of the mock's shorter labels.
- **Spacing/layout:** 228px desktop sidebar, 58px topbar, 26px content/rail gap, 276px rail at the reference viewport, shallow approximately 234px banner, 9–10px vertical panel gaps, 11px corner radius and very light borders. The last main panel extends approximately 33px below the reference viewport due to actual content wrapping; natural document scroll keeps everything available. Tablet rail becomes a two-column lower section; phones use one column and drawer navigation.
- **Color/tokens:** cool white canvas, white panels, pale lavender banner, violet primary accents, pastel green/violet/blue/amber/pink phases. Neutral empty states replace fabricated successful states. Text-side image fade was increased for contrast.
- **Images:** new ImageGen photographic rear-view developer and purple mountain scene match the reference's subject, direction and text-safe composition. These are new assets, not identical source pixels; desk/window details and silhouette size intentionally differ. Existing course covers come from CMS data. The real brandmark is retained. UI symbols use the installed Phosphor icon library.
- **Copy/content:** structure and labels follow the chosen reference. Unsupported claims about 80+ lessons, 10+ cases, 500+ templates, AI online status and unlimited Pro features are omitted. Learning data, course titles and destinations remain account/CMS-derived. The five-phase strip is a route overview, not invented completion status.

## Functional checks

- Created one local task, completed it, and refreshed: completion and `1/1` persisted.
- Favorited the current course and refreshed: favorite persisted.
- Checked in today and refreshed: disabled “今天已打卡” persisted.
- Tutor question opened a clearly labeled not-live dialog. Saving the question created a personal note; it remained after reload and appeared in search.
- Calendar next month, return to current month and selecting a different day updated task filtering correctly.
- Primary learning action opened the real `/packs/cursor-first-site` detail with its configured content.
- Account menu retains courses, settings/logout, plan, admin switching and return-to-public actions.
- Mobile drawer opening/closing passed after the scrim fix.
- No application console errors or warnings were observed in the final preview.
- Test-created task, note, favorite and check-in were removed through the versioned **local** account-state API; no original learning content or production data was removed.
- Width checks: 320, 390, 768, 1024, 1440, 1536, 1920 and 2560 CSS pixels; document width equaled viewport width at each, with no broken images. Final desktop captures use 1536×1024, 1440×1024, 1920×1080 and 2560×1440; smaller captures use 1024/768×1024 and 390/320×844.
- `npm run build` passed. `npm test` passed: 14 platform/dashboard/calendar tests, 19 API tests and 4 packaging tests (37 total). Backend tests use isolated temporary databases.
- SHA-256 checks confirm `PublicHomepage.jsx`, `homepage.css`, `LearningPathFeature.jsx` and `learning-path.css` are unchanged from the start of this task.

## Scope / follow-up

- This is the signed-in homepage implementation, not completion of paid membership, realtime AI tutoring, community or certificates. Those remain explicitly unavailable/preview where applicable.
- The visual-design turn left the public homepage, production server and database unchanged. Deployment was a separate user decision after preview, subsequently authorized as recorded below.
- P3: replace repetitive existing CMS project covers with actual differentiated course artwork when course material is ready. Do not invent product catalog records to imitate the mock.
- P3: the source art's handwritten notes are larger than those in the generated image; current artwork preserves the intended atmosphere and leaves the functional HTML copy crisp.
- Prompt/asset records: `docs/design/workspace-opc-banner-v1.md` and `docs/design/workspace-mountain-v1.md`.

final result: passed

## Deployment addendum — 2026-09-26

Following the user's explicit “部署到线上吧”, this verified frontend was published to https://oneshowlearn.com/app on the existing domestic server. Build and all 37 tests passed again. HTTPS entry files and all 18 assets match the release; authenticated workspace and management API checks passed. Public-home source files, backend code, database contents and mail configuration were not replaced; no service restart was performed. Backup: `/var/backups/oneshowlearn/frontend-rmrVtZgW/client`. Full deployment record: `deploy/README.md`, section “参考图三栏工作台上线”. Online browser capture timed out, so this is not a claim of online visual screenshot verification.
