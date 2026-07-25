import nodemailer from "nodemailer";
import { env } from "../config/env.js";

export interface AuthEmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const gmailSmtpConfig = {
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
};

const smtpConfig =
  env.SMTP_PROVIDER === "gmail"
    ? gmailSmtpConfig
    : env.SMTP_HOST
      ? {
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
        }
      : null;

const transporter = smtpConfig
  ? nodemailer.createTransport({
      ...smtpConfig,
      auth:
        env.SMTP_USER && env.SMTP_PASS
          ? {
              user: env.SMTP_USER,
              pass: env.SMTP_PASS,
            }
          : undefined,
    })
  : null;

export const sendAuthEmail = async (message: AuthEmailMessage) => {
  if (env.AUTH_EMAIL_MODE === "console") {
    console.info(
      [
        "\n[Cocomama auth email]",
        `To: ${message.to}`,
        `Subject: ${message.subject}`,
        "Body:",
        message.text,
        "[/Cocomama auth email]\n",
      ].join("\n"),
    );
    return;
  }

  if (!transporter) {
    throw new Error("SMTP is not configured for authentication email delivery");
  }

  if (env.SMTP_PROVIDER === "gmail" && (!env.SMTP_USER || !env.SMTP_PASS)) {
    throw new Error("Gmail SMTP requires SMTP_USER and SMTP_PASS");
  }

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
};
