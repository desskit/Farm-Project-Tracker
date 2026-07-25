import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { emailConfigured, sendMail, verifyTransport } from '@/lib/notify/email';
import { testEmail } from '@/lib/notify/templates';
import { errorResponse } from '@/lib/api/errors';

/** Verifies SMTP settings and sends a test message to the signed-in admin. */
export async function POST() {
  try {
    const admin = await requireAdmin();
    if (!emailConfigured()) {
      return NextResponse.json(
        { error: 'SMTP is not configured on this server. Set SMTP_HOST and restart.' },
        { status: 400 },
      );
    }
    const problem = await verifyTransport();
    if (problem) return NextResponse.json({ error: `SMTP check failed: ${problem}` }, { status: 502 });

    const ok = await sendMail(admin.email, 'Farm Tracker test email', testEmail(admin.name));
    if (!ok) return NextResponse.json({ error: 'The SMTP server accepted the connection but the send failed.' }, { status: 502 });
    return NextResponse.json({ ok: true, to: admin.email });
  } catch (e) {
    return errorResponse(e);
  }
}
