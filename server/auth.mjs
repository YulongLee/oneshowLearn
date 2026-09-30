import jwt from "jsonwebtoken";
import { row } from "./db.mjs";
import { config } from "./config.mjs";

export function signUser(user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email, ver: Number(user.token_version || 0) }, config.jwtSecret, { expiresIn: "7d" });
}

export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = row("SELECT id,email,name,role,status,email_verified,token_version FROM users WHERE id = ?", [Number(payload.sub)]);
    if (req.user && (req.user.status !== "active" || !req.user.email_verified || Number(payload.ver || 0) !== Number(req.user.token_version || 0))) req.user = null;
  } catch {
    req.user = null;
  }
  next();
}

export function requireAuth(req, res, next) {
  optionalAuth(req, res, () => {
    if (!req.user || req.user.status !== "active") return res.status(401).json({ error: "请先登录" });
    next();
  });
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user || !["admin", "editor"].includes(req.user.role)) return res.status(403).json({ error: "没有管理权限" });
    next();
  });
}

export function requireOwner(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== "admin") return res.status(403).json({ error: "仅管理员可以管理用户和邮件" });
    next();
  });
}
