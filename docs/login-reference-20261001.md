# Learner login reference — 2026-10-01

Local redesign of standalone learner authentication from reference 16c22227. No deployment or provider configuration changes.

- White form column, lavender brand showcase, three-line headline, four capabilities and a tilted, explicitly illustrative workspace.
- Existing email/password, registration, recovery and phone-code APIs retained. Added an accessible, non-submitting password visibility control.
- Commercial presentation is opt-in; embedded purchase authentication and administrator presentation retain their defaults.
- No fake social-login providers, remember-me behavior, policy destinations, account progress or learner totals.
- At 960px and below the decoration is removed; inputs remain 16px with large touch targets.

Verification: production build, 121 platform/UI/model tests, 129 isolated API tests and 4 Sites tests passed (254 total). Existing bundle-size advisory remains. Browser checked 1536px reference, 1440px, 1920px, 2560px, 768px and 390px layouts without document horizontal overflow. Tested password reveal/hide, email/phone switching, register/recovery navigation and successful local preview-admin email login to /app. No live SMS, registration email or password-reset email sent; no production account or content modified.

## Follow-up: front-facing product illustration

The owner rejected the tilted perspective in screenshot 8dd16c34. The previous angled treatment is superseded: the product window is now upright, width-constrained and aligned with the headline. Removed compound 3D rotation, negative horizontal inset and overflowing width; reduced the decorative brand mark and used a restrained shadow. Restored natural internal spacing without stretching the preview to fill the page. Left form, authentication code, management and embedded authentication remain unchanged.

Verified this local-only revision with a production build, 122 platform tests and 4 Sites tests (126 passing). Browser checks at 1536px, 1024px and 1920px confirmed no document/preview overflow, an untransformed window and full containment in the right panel. At 390px the illustration stays hidden, inputs remain 16px, and email/phone switching works. No console errors observed. No real SMS/email sent and no new deployment performed. The existing bundle-size advisory remains.

Subsequent explicit release approval: deployed on October 1 after rebuilding and repeating all 126 tests. Verified 31 production entry hashes, 35 asset hashes, API health/permissions, unchanged login/commerce availability and unchanged backend/config/service processes. External HTTPS also confirms the exact upright CSS. Backup: `/var/backups/oneshowlearn/frontend-NTAuwmf3/client`. See `deploy/README.md` for the release hashes. No production browser screenshot was used as release evidence.
