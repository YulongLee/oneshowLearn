import jwt from "jsonwebtoken";
import { row } from "./db.mjs";
import { config } from "./config.mjs";

export function signUser(user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, config.jwtSecret, { expiresIn: "7d" });
}

export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = row("SELECT id,email,name,role,status FROM users WHERE id = ?", [Number(payload.sub)]);
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
