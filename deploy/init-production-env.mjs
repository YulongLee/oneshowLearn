// First-install only. Run as root on the target server; never print secrets.
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

if (process.getuid?.() !== 0) throw new Error("Production configuration must be created by root");
const env = {
  NODE_ENV: "production",
  API_PORT: "8791",
  APP_ORIGIN: "https://oneshowlearn.com",
  APP_URL: "https://oneshowlearn.com",
  DATABASE_PATH: "/var/www/oneshowlearn/data/oneshowlearn.db",
  UPLOAD_DIR: "/var/www/oneshowlearn/uploads",
  JWT_SECRET: randomBytes(48).toString("hex"),
  ADMIN_EMAIL: "liyulong19950316@163.com",
  ADMIN_PASSWORD: randomBytes(24).toString("base64url"),
  REGISTRATION_ENABLED: "false",
  ALLOW_DEV_EMAIL_DELIVERY: "false",
};
writeFileSync("/etc/oneshowlearn/oneshowlearn.env", Object.entries(env).map(([key, value]) => `${key}=${value}`).join("\n") + "\n", { mode: 0o600, flag: "wx" });
console.log("Created isolated production configuration (secrets omitted)");
