import nodemailer from "nodemailer";
import { config, emailAvailable, emailConfigured } from "./config.mjs";
import { row, run } from "./db.mjs";
import { AccountError, rateLimit } from "./account-security.mjs";

let transport;
function smtp() {
  return transport ||= nodemailer.createTransport({
    host: config.smtpHost, port: config.smtpPort, secure: config.smtpSecure,
    requireTLS: config.isProduction && !config.smtpSecure,
    tls: { minVersion: "TLSv1.2" },
    auth: { user: config.smtpUser, pass: config.smtpPassword },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
  });
}

function contentFor(code, purpose) {
  if (purpose === "test") return {
    subject: "OneShowLearn 邮件服务测试",
    text: "这是一封由 OneShowLearn 管理后台发出的测试邮件。收到此邮件说明本次邮件已送达。无需回复。",
    html: "<h2>OneShowLearn 邮件服务测试</h2><p>收到此邮件说明本次邮件已送达。无需回复。</p>",
  };
  const reset = purpose === "reset";
  return {
    subject: `OneShowLearn · ${reset ? "密码重置" : "邮箱注册"}验证码`,
    text: `${reset ? "你正在重置 OneShowLearn 登录密码。" : "欢迎注册 OneShowLearn。"}\n\n你的验证码是：${code}\n\n验证码 10 分钟内有效，请勿转发给他人。若非本人操作，请忽略本邮件。`,
    html: `<div style="font-family:Arial,'PingFang SC',sans-serif;max-width:560px;margin:auto;padding:32px;color:#171815"><h1 style="font-size:24px">${reset ? "重置登录密码" : "验证你的邮箱"}</h1><p>请在 OneShowLearn 页面输入下面的验证码：</p><div style="font-size:34px;font-weight:800;letter-spacing:8px;background:#f2edff;color:#6843dd;border-radius:14px;padding:20px;text-align:center;margin:24px 0">${code}</div><p>验证码 10 分钟内有效，请勿转发给他人。若非本人操作，请忽略本邮件。</p></div>`,
  };
}

export function emailStatus() {
  return {
    configured: emailConfigured, available: emailAvailable,
    mode: config.allowDevEmail && !config.isProduction ? "development" : config.emailProvider,
    sender: config.emailFrom, host: config.emailProvider === "smtp" ? config.smtpHost : "",
    port: config.emailProvider === "smtp" ? config.smtpPort : null,
    registrationEnabled: config.registrationEnabled && emailAvailable,
    dailyLimit: config.emailDailyLimit,
    sentToday: row("SELECT COUNT(*) total FROM email_deliveries WHERE created_at >= datetime('now','-1 day')").total,
  };
}

export async function verifyEmailTransport() {
  if (!emailConfigured) throw new AccountError(503, "真实邮件服务尚未配置");
  if (config.emailProvider !== "smtp") return { ok: true, message: "请通过测试邮件验证发信 API。" };
  try { await smtp().verify(); return { ok: true, message: "SMTP 安全连接和身份验证通过，实际收件请发送测试邮件确认。" }; }
  catch { throw new AccountError(503, "邮件服务器连接或身份验证失败，请检查服务器发信配置"); }
}

export async function sendEmail(to, code, purpose) {
  if (!emailAvailable) throw new AccountError(503, "邮件服务尚未配置");
  rateLimit("mail-global", "all", config.emailDailyLimit, 86400);
  const dev = config.allowDevEmail && !config.isProduction;
  const provider = dev ? "development" : config.emailProvider;
  const content = contentFor(code, purpose);
  // Never store verification codes, body text or credentials in production delivery logs.
  run("DELETE FROM email_deliveries WHERE created_at < datetime('now','-30 days')");
  const { lastInsertRowid } = run("INSERT INTO email_deliveries (recipient,purpose,provider) VALUES (?,?,?)", [to, purpose, provider]);
  try {
    let messageId = "";
    if (dev) {
      run("INSERT INTO email_outbox (recipient,subject,text,status) VALUES (?,?,?,?)", [to, content.subject, content.text, "delivered-dev"]);
    } else if (config.emailProvider === "smtp") {
      const info = await smtp().sendMail({ from: config.emailFrom, to, ...content });
      if (!info.accepted?.length) throw new Error("RECIPIENT_REJECTED");
      messageId = info.messageId || "";
    } else {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST", signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${config.emailApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: config.emailFrom, to: [to], ...content }),
      });
      if (!response.ok) throw new Error("PROVIDER_REJECTED");
      messageId = (await response.json()).id || "";
    }
    const status = dev ? "development" : "accepted";
    run("UPDATE email_deliveries SET status=?,message_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", [status, String(messageId).slice(0, 255), lastInsertRowid]);
    return { provider, status };
  } catch (error) {
    const safeCode = ["EAUTH", "ECONNECTION", "ETIMEDOUT", "ESOCKET", "EENVELOPE"].includes(error.code) ? error.code : "DELIVERY_FAILED";
    run("UPDATE email_deliveries SET status='failed',error_code=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", [safeCode, lastInsertRowid]);
    throw new AccountError(503, "邮件暂时发送失败，请稍后重试或联系管理员");
  }
}

export const sendVerificationCode = (to, code) => sendEmail(to, code, "register");
export const sendPasswordResetCode = (to, code) => sendEmail(to, code, "reset");
