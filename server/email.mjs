import nodemailer from "nodemailer";
import { config, emailConfigured } from "./config.mjs";
import { run } from "./db.mjs";

function message(code) {
  return {
    subject: `${code} 是你的 OneShowLearn 注册验证码`,
    text: `欢迎注册 OneShowLearn。\n\n你的验证码是：${code}\n\n验证码 10 分钟内有效，请勿转发给他人。若非本人操作，请忽略本邮件。`,
    html: `<div style="font-family:Arial,'PingFang SC',sans-serif;max-width:560px;margin:auto;padding:32px;color:#171815"><h1 style="font-size:24px">验证你的邮箱</h1><p>欢迎注册 OneShowLearn，请在注册页面输入下面的验证码：</p><div style="font-size:34px;font-weight:800;letter-spacing:8px;background:#f2edff;color:#6843dd;border-radius:14px;padding:20px;text-align:center;margin:24px 0">${code}</div><p style="color:#6d6a63">验证码 10 分钟内有效，请勿转发给他人。若非本人操作，请忽略本邮件。</p></div>`,
  };
}

export async function sendVerificationCode(to, code) {
  const content = message(code);
  if (config.allowDevEmail && !config.isProduction) {
    run("INSERT INTO email_outbox (recipient,subject,text,status) VALUES (?,?,?,?)", [to, content.subject, content.text, "delivered-dev"]);
    return { provider: "development" };
  }
  if (!emailConfigured) throw new Error("EMAIL_NOT_CONFIGURED");
  if (config.emailProvider === "smtp") {
    const transport = nodemailer.createTransport({
      host: config.smtpHost, port: config.smtpPort, secure: config.smtpSecure,
      auth: { user: config.smtpUser, pass: config.smtpPassword },
    });
    await transport.sendMail({ from: config.emailFrom, to, ...content });
    return { provider: "smtp" };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.emailApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: config.emailFrom, to: [to], ...content }),
  });
  if (!response.ok) throw new Error("EMAIL_DELIVERY_FAILED");
  return { provider: "resend" };
}
