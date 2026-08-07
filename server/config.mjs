import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const config = {
  root,
  port: Number(process.env.API_PORT || 8787),
  appOrigin: process.env.APP_ORIGIN || "http://127.0.0.1:4173",
  appUrl: (process.env.APP_URL || process.env.APP_ORIGIN || "http://127.0.0.1:4173").replace(/\/$/, ""),
  databasePath: path.resolve(root, process.env.DATABASE_PATH || "data/oneshowlearn.db"),
  uploadDir: path.resolve(root, process.env.UPLOAD_DIR || "uploads"),
  jwtSecret: process.env.JWT_SECRET || "oneshowlearn-local-development-secret-change-me",
  adminEmail: process.env.ADMIN_EMAIL || "liyulong19950316@163.com",
  adminPassword: process.env.ADMIN_PASSWORD || "OneShowLearn-Local-Admin-2026",
  emailProvider: String(process.env.EMAIL_PROVIDER || (process.env.EMAIL_SMTP_HOST ? "smtp" : "resend")).toLowerCase(),
  emailFrom: process.env.EMAIL_FROM || "",
  emailApiKey: process.env.EMAIL_API_KEY || "",
  smtpHost: process.env.EMAIL_SMTP_HOST || "",
  smtpPort: Number(process.env.EMAIL_SMTP_PORT || 465),
  smtpSecure: process.env.EMAIL_SMTP_SECURE !== "false",
  smtpUser: process.env.EMAIL_SMTP_USER || "",
  smtpPassword: process.env.EMAIL_SMTP_PASSWORD || "",
  allowDevEmail: process.env.ALLOW_DEV_EMAIL_DELIVERY === "true",
  registrationEnabled: process.env.REGISTRATION_ENABLED !== "false",
  isProduction: process.env.NODE_ENV === "production",
};

if (config.isProduction && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is required in production");
}

if (config.isProduction && !process.env.ADMIN_PASSWORD) {
  throw new Error("ADMIN_PASSWORD is required in production");
}

export const emailConfigured = config.emailProvider === "smtp"
  ? Boolean(config.smtpHost && config.smtpUser && config.smtpPassword && config.emailFrom)
  : Boolean(config.emailApiKey && config.emailFrom);

if (config.isProduction && config.registrationEnabled && !emailConfigured) {
  throw new Error("Email provider is required when registration is enabled in production");
}
