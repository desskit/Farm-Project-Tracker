/**
 * Email via Nodemailer + user-supplied SMTP. Entirely no-op (returns false)
 * when SMTP_* env is unset, so the app runs fine without email configured.
 *
 * Everything user-supplied that lands in an email body must go through
 * escapeHtml() — chore names, project names, and people's names are all free
 * text, and an unescaped angle bracket or apostrophe would corrupt the message.
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
  const port = Number(process.env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    // Bound every stage so an unreachable or hung SMTP server can't wedge the
    // hourly digest cron or hold a web request open indefinitely.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

export function emailConfigured(): boolean {
  return !!process.env.SMTP_HOST;
}

/** Escapes text for safe interpolation into an HTML email body. */
export function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Shared wrapper so every message the farm sends looks like it came from the
 * same app. `bodyHtml` is already-escaped markup built by a template.
 */
export function emailLayout(bodyHtml: string): string {
  return `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1c221e;line-height:1.5;max-width:560px">
      <p style="font-size:18px;font-weight:700;margin:0 0 16px">🌾 Farm Project Tracker</p>
      ${bodyHtml}
      <p style="color:#6b7269;font-size:12px;margin-top:24px;border-top:1px solid #e2e5e0;padding-top:12px">
        Sent by your farm's Project Tracker. Change what you receive under More → Notifications.
      </p>
    </div>`;
}

/** A branded call-to-action button, with the raw URL beneath as a fallback. */
export function emailButton(label: string, url: string): string {
  const safeUrl = escapeHtml(url);
  return `
    <p style="margin:20px 0">
      <a href="${safeUrl}" style="background:#2f6f4f;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;display:inline-block;font-weight:600">${escapeHtml(label)}</a>
    </p>
    <p style="color:#6b7269;font-size:12px;word-break:break-all">Or paste this into your browser:<br>${safeUrl}</p>`;
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

/**
 * Checks the SMTP connection and credentials without sending anything.
 * Returns null on success, or a human-readable reason on failure.
 */
export async function verifyTransport(): Promise<string | null> {
  const t = getTransport();
  if (!t) return 'SMTP is not configured on this server (SMTP_HOST is unset).';
  try {
    await t.verify();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not connect to the SMTP server.';
  }
}
