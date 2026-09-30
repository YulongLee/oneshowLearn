import { createHmac } from "node:crypto";
import { config } from "./config.mjs";
import { row, run } from "./db.mjs";

export class AccountError extends Error {
  constructor(status, message, retryAfter = 0) { super(message); this.status = status; this.retryAfter = retryAfter; }
}

// Persist limits so restarting the API does not reset the abuse budget.
export function rateLimit(scope, value, maximum, seconds) {
  const now = Date.now();
  const key = createHmac("sha256", config.jwtSecret).update(`${scope}:${value}`).digest("hex");
  run("DELETE FROM auth_rate_limits WHERE expires_at <= ?", [now]);
  const current = row("SELECT hits,expires_at FROM auth_rate_limits WHERE key=?", [key]);
  if (current && current.hits >= maximum) {
    throw new AccountError(429, "操作过于频繁，请稍后再试", Math.max(1, Math.ceil((current.expires_at - now) / 1000)));
  }
  run(`INSERT INTO auth_rate_limits (key,hits,expires_at) VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET hits=hits+1`, [key, now + seconds * 1000]);
}

export function audit(actor, target, action, reason = "") {
  run("INSERT INTO account_audit (actor_id,target_id,action,reason) VALUES (?,?,?,?)", [actor, target, action, reason]);
}
