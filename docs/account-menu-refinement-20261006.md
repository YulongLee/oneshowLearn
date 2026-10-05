# Shared learner account menu

Approved reference: `exec-cdc07fbe-9ec3-4071-865b-69039c2b1a64.png`.

## Implementation

Refines only the account trigger and dropdown in the persistent learner shell:
280px bounded white card, actual saved identity/avatar, left-aligned icons,
grouped course/plan/settings/orders/support/home actions, distinct current-browser
logout and the existing role-gated administration entry. No reference background
content, membership claims, private identity fields or account-quality scores.

Guest/loading/error states never display a stale authenticated identity or private
actions. Natural tab navigation, optional arrow/Home/End shortcuts, Escape with
trigger-focus restoration, outside-pointer/focus dismissal, 44px targets and
short-screen internal scrolling are included. Search and user controls shrink
without overflowing narrow desktop widths; other shell geometry stays intact.

Orders open the existing read-only settings section. On an already mounted
settings page, account-bound section events preserve profile/password drafts and
respect pending-save locks. From other pages, normal navigation runs the existing
manual-note/learning-save guards before opening settings. Logout opens the
existing confirmation dialog; selection never clears a token. Confirmed current
logout only removes this browser's session, never revokes other devices. All-device
revocation remains a separate action in login/security settings.

## Verification

- Full regression: 420 tests passed, zero failures; production build passed.
- 122 isolated browser checks: 62 settings checks plus 60 menu checks covering
  320–2560px, short screens, actual identity/role/guest/expired states, keyboard,
  focus, destinations, orders deep links, mounted profile drafts, cancelled
  logout, manual note departure protection and explicit local-only logout.
- Desktop/mobile screenshots under ignored `artifacts/account-refinement/` and
  native in-app isolated-account preview inspected.
- Isolated external typography requests were blocked. No payment, AI, SMS or
  email provider request was attempted. No production fixture/data mutation.

## Release

Owner explicitly requests Git upload and deployment. Commit reviewed source only,
excluding secrets, database/uploads, QA artifacts and generated mock images.
Reuse the existing frontend-only guarded settings release workflow: consistent
backups, expected old/new entry hashes, retained assets, atomic entry replacement
and code-only rollback. Verify HTTPS/query destinations/assets, owner-only account
and order GETs, anonymous privacy, schema/record identities/historical amounts,
unchanged pricing/provider/catalogue/protected code/environment and all service
process identities. No backend/environment/configuration/schema change, service
restart, real provider or production profile/order write.

Publication results will be recorded after verification.
