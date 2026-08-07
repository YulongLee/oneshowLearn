import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const config = {
  root,
  port: Number(process.env.API_PORT || 8787),
  appOrigin: process.env.APP_ORIGIN || "http://127.0.0.1:4173",
  databasePath: path.resolve(root, process.env.DATABASE_PATH || "data/oneshowlearn.db"),
  uploadDir: path.resolve(root, process.env.UPLOAD_DIR || "uploads"),
  jwtSecret: process.env.JWT_SECRET || "oneshowlearn-local-development-secret-change-me",
  adminEmail: process.env.ADMIN_EMAIL || "admin@oneshowlearn.com",
  adminPassword: process.env.ADMIN_PASSWORD || "OneShowLearn-Local-Admin-2026",
  isProduction: process.env.NODE_ENV === "production",
};

if (config.isProduction && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is required in production");
}

if (config.isProduction && !process.env.ADMIN_PASSWORD) {
  throw new Error("ADMIN_PASSWORD is required in production");
}
