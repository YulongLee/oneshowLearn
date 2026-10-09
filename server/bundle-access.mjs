import {row} from './db.mjs';
// The active complete-course product includes the published practice catalogue.
// Existing independent grants remain intact; revoking the course removes only this derived access.
export function bundlePackId() {
  const record=row('SELECT settings FROM payment_configuration ORDER BY version DESC LIMIT 1');
  if(!record)return null;
  let id;try{id=JSON.parse(record.settings).productId;}catch{return null;}
  return row(`SELECT p.pack_id FROM products p JOIN project_packs c ON c.id=p.pack_id AND c.status='published'
    JOIN learning_paths lp ON lp.id=c.path_id AND lp.status='published' WHERE p.id=? AND p.status='active'`,[id||0])?.pack_id||null;
}
export function hasBundleAccess(user) {
  const pack=bundlePackId();
  return Boolean(user?.status!=='disabled'&&user&&pack&&row(`SELECT 1 FROM entitlements WHERE user_id=? AND pack_id=? AND status='active'
    AND julianday(starts_at)<=julianday('now') AND (expires_at IS NULL OR julianday(expires_at)>julianday('now'))`,[user.id,pack]));
}
