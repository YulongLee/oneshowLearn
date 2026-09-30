# Shared learner workspace — September 27, 2026

Status: implemented and verified locally; subsequently deployed on September 27 at the owner's explicit request. See `deploy/README.md` for production HTTP/API checks and rollback backup. Visual verification below was performed locally.

## Cause and fix

- A shared component still switched between legacy and grouped menus, while page-specific CSS set 190/224/228/232px sidebars, different headers, hidden group labels and conflicting mobile breakpoints.
- App now mounts one persistent learner shell around the routed page content. Personal and resource pages no longer create their own shells. Search contexts and note navigation guards are supplied centrally.
- Navigation, header, brand, footer and common insets use `workspace-shell.css`. Page styles no longer contain shell overrides. Desktop sidebar 228px, header 58px, one drawer breakpoint at 1000px. Content max-width 1840px is consistently centered on very wide displays.
- Deep links resolve to the corresponding active navigation item. Legacy course library, plan, membership and pack detail keep the same grouped menu; the course/plan entries remain available in the account menu. Public site, authentication, management and the pre-existing focused `/learn/cursor` reader are not redesigned.
- OPC progress updates now refresh the persistent shell's account model, so returning to the workbench does not rely on a remount to refresh progress.

## Verification

- Production build and 57 automatic tests pass (23 platform/model, 30 API, 4 Sites packaging). Added regressions for route normalization/highlighting, a single shell mount point, and preventing page CSS from overriding shell layout.
- Browser clicked all ten main navigation items at 1440px. Every menu label, row position, row height and font size matched; sidebar 228px and header 58px remained unchanged.
- Repeated navigation at 320, 390, 768, 1000, 1001, 1920 and 2560px: 70 more measurements, no horizontal overflow, consistent content offset and header height within each width. 2560px content offset is 474px because of the shared centered 1840px content maximum; this is intentional, not a sidebar-width change.
- Mobile drawer opens, navigation changes the page and closes it. Restored viewport override after testing.
- Account menu course library, course pack detail, learning plan and membership checked through actual UI clicks; same menu/header retained. Management entry remains present for the local admin.
- Notes draft tested without saving: leaving via sidebar asks for confirmation, Continue Editing retains the draft, Discard navigates to resources. No test note persisted.
- Resource header search updates the resource list and side search field; clear restores results.
- Browser error log empty. Build retains the existing non-blocking large-bundle warning.
- Backend code/config/database and all production services unchanged. Protected Sites source files untouched. Local preview remains at http://127.0.0.1:4176/app.
