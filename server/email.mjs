import nodemailer from "nodemailer";
import { config, emailConfigured } from "./config.mjs";
import { run } from "./db.mjs";

function message(code, kind = "register") {
  const reset = kind === "reset";
  return {
    subject: `${code} 是你的 OneShowLearn ${reset ? "密码重置" : "注册"}验证码`,
    text: `${reset ? "你正在重置 OneShowLearn 登录密码。" : "欢迎注册 OneShowLearn。"}\n\n你的验证码是：${code}\n\n验证码 10 分钟内有效，请勿转发给他人。若非本人操作，请忽略本邮件。`,
    html: `<div style="font-family:Arial,'PingFang SC',sans-serif;max-width:560px;margin:auto;padding:32px;color:#171815"><h1 style="font-size:24px">${reset ? "重置登录密码" : "验证你的邮箱"}</h1><p>${reset ? "请在密码重置页面输入下面的验证码：" : "欢迎注册 OneShowLearn，请在注册页面输入下面的验证码："}</p><div style="font-size:34px;font-weight:800;letter-spacing:8px;background:#f2edff;color:#6843dd;border-radius:14px;padding:20px;text-align:center;margin:24px 0">${code}</div><p style="color:#6d6a63">验证码 10 分钟内有效，请勿转发给他人。若非本人操作，请忽略本邮件。</p></div>`,
  };
}

async function sendCode(to, code, kind) {
  const content = message(code, kind);
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

export const sendVerificationCode = (to, code) => sendCode(to, code, "register");
export const sendPasswordResetCode = (to, code) => sendCode(to, code, "reset");
