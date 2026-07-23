/**
 * Email via Nodemailer + user-supplied SMTP. Entirely no-op (returns false)
 * when SMTP_* env is unset, so the app runs fine without email configured.
 */
import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';

let transporter: Transporter | null = null;
let checked = false;

function getTransport(): Transporter | null {
  if (checked) return transporter;
  checked = true;
  const host = process.env.SMTP_HOST;
  if (!host) return (transporter = null);
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transporter;
}

export function emailConfigured(): boolean {
  return !!process.env.SMTP_HOST;
}

export async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  const t = getTransport();
  if (!t) return false;
  try {
    await t.sendMail({ from: process.env.SMTP_FROM || 'Farm Tracker <farm@example.com>', to, subject, html });
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[email] send failed', e);
    return false;
  }
}
