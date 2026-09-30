// Run as root on the authorized server. Reuse only the explicitly selected mail keys.
// Do not alter the source product or print any password.
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { parseEnv } from "node:util";

if (process.getuid?.() !== 0) throw new Error("Root required");
const target = "/etc/oneshowlearn/oneshowlearn.env";
const source = parseEnv(readFileSync("/var/www/oneshowseo/.env.local", "utf8"));
const current = parseEnv(readFileSync(target, "utf8"));
const keys = ["EMAIL_PROVIDER", "EMAIL_SMTP_HOST", "EMAIL_SMTP_PORT", "EMAIL_SMTP_SECURE", "EMAIL_SMTP_USER", "EMAIL_SMTP_PASSWORD"];
for (const key of keys) {
  if (!source[key]) throw new Error(`Missing mail configuration: ${key}`);
  current[key] = source[key];
}
if (source.EMAIL_PROVIDER !== "smtp" || !source.EMAIL_FROM?.includes("noreply@mail.oneshowtools.com")) {
  throw new Error("Source is not the authorized OneShowTools SMTP channel");
}
current.EMAIL_FROM = "OneShowLearn <noreply@mail.oneshowtools.com>";
current.EMAIL_DAILY_LIMIT = "200";
current.REGISTRATION_ENABLED = "true";
current.ALLOW_DEV_EMAIL_DELIVERY = "false";
const temporary = `${target}.mail-update-${process.pid}`;
writeFileSync(temporary, Object.entries(current).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n", { mode: 0o600, flag: "wx" });
renameSync(temporary, target);
console.log("OneShowLearn mail configuration installed; source unchanged; secrets omitted");
