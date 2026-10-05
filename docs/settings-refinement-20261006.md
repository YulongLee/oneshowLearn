# Settings center refinement

Approved reference: `exec-85dbce75-f0b7-4b24-8d34-9c5bfa456fce.png`.

## Scope

Only learner settings content is refined: compact heading, four existing sections,
actual saved identity/avatar, narrower labels with field-local helpers, truthful
sync/manual-save feedback, inline nickname validation, and a shared support link.
Shared branding/navigation and permission-aware course offer remain intact.
Login instructions now use the actual “登录与安全” section name.

Avatar selection uses the existing bounded browser-local center-crop pipeline;
selection/removal is a draft until explicit versioned save. It is not an OSS or
public upload. No new crop editor, email/phone replacement, device inventory,
automatic refunds, invoicing or automatic profile saves are claimed.

Existing private profile/password/order APIs, mounted profile/password drafts,
departure guards and conflict refusal are preserved. Pending saves lock inputs;
failures retain them. Success feedback distinguishes account persistence from
account-menu refresh. Browser preferences remain local; recent order reads do
not initiate payment or alter settlement/entitlements.

## Verification

- Full regression: 417 tests passed, no failures.
- Production build passed (existing bundle-size advisory remains).
- 62 disposable-database browser checks: 320–2560px, four sections, accurate save
  states, inline validation/focus, delayed/failed save, CAS conflicts and reload
  confirmation, draft/departure retention, avatars, browser-only preferences,
  both logout confirmation scopes, actual support navigation, owner privacy,
  failed initial-read retry and unchanged private workspace/pricing.
- Desktop/mobile screenshots reviewed under ignored `artifacts/account-refinement/`.
- Native in-app browser preview inspected using an explicitly isolated account.

## Publication constraints

The owner explicitly requests Git upload and production deployment. Review and
push the pending already-published source separately from this settings change;
exclude credentials, databases, uploads, artifacts and generated mock images.
Publish compiled frontend only with expected old/new entry hashes, source/assets
manifest, consistent backup and atomic frontend entry replacement. Keep old
assets and restore only the old entry if verification fails; never restore a
live database over current business activity.

Verify HTTPS entries/assets, owner-only profile/version/masked identities and
bounded order GETs, anonymous private access, schema/record identities/historical
amounts and unchanged provider/pricing/catalogue/backend/environment/dependencies
and all service process identities. No production profile/password/order/config
writes, fixtures, migrations, gateway/AI/SMS/email requests or service restarts.

## Completed release

- Published source upload: `ee624f1`; settings implementation: `10cf0ba`.
- Exact live frontend entry: `301dba19901fc5a2d284c7ed5ef0df4ea88c2b842ac55b22ba6f6ad2b9161dee`.
- Recoverable backup: `/var/backups/oneshowlearn/settings-refinement-JjQs8tT0`.
- Passed 39 HTTPS route entries, 45 exact asset hashes, 64-table/schema/private
  identity/configuration and historical order-amount preservation checks.
- Current-owner profile/version, masked identities and recent-order GETs pass;
  anonymous private endpoints remain gated. Live browser confirms new heading,
  guest privacy and authoritative ¥499 offer.
- Protected backend/environment/dependency/site hashes and all four service
  process snapshots are unchanged. No production writes/providers or restart.
