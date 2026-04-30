import nodemailer from 'nodemailer';
import ejs from 'ejs';
import path from 'path';

const provider = process.env.MAIL_PROVIDER ?? 'mailgun';

const transporter = provider === 'local'
  ? nodemailer.createTransport({ host: 'localhost', port: 1025, secure: false })
  : nodemailer.createTransport({
      host: process.env.MAILGUN_SMTP_HOST || 'smtp.mailgun.org',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: process.env.MAILGUN_SMTP_USER
        ? { user: process.env.MAILGUN_SMTP_USER, pass: process.env.MAILGUN_SMTP_PASSWORD }
        : undefined,
    });

export async function renderTemplate(template: string, data: Record<string, unknown>): Promise<string> {
  const templatePath = path.join(process.cwd(), 'src', 'mail-views', `${template}.ejs`);
  return ejs.renderFile(templatePath, data);
}

export async function sendMail({ to, subject, html, fromName }: { to: string; subject: string; html: string; fromName?: string }) {
  return transporter.sendMail({
    from: `"${fromName ?? 'Hunt Hub'}" <${process.env.MAIL_FROM}>`,
    to,
    subject,
    html,
  });
}

export default transporter;
