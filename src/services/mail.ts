import nodemailer from 'nodemailer';
import mailgunTransport from 'nodemailer-mailgun-transport';
import ejs from 'ejs';
import path from 'path';

const provider = process.env.MAIL_PROVIDER ?? 'mailgun';

const transporter = provider === 'local'
  ? nodemailer.createTransport({ host: 'localhost', port: 1025, secure: false })
  : nodemailer.createTransport(mailgunTransport({
      auth: {
        api_key: process.env.MAILGUN_API_KEY!,
        domain: process.env.MAILGUN_DOMAIN!,
      },
    }));

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
