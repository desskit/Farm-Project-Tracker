import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/session';
import { exportKey, keyFilePath, keyFingerprint } from '@/lib/vault/crypto';
import { logActivity } from '@/lib/data/activity';
import { errorResponse } from '@/lib/api/errors';

/** Shows the vault key to an admin so they can keep a safe copy. Logged. */
export async function POST() {
  try {
    const admin = await requireAdmin();
    await logActivity(admin.id, 'viewed the vault recovery key');
    return NextResponse.json(
      { key: exportKey(), fingerprint: keyFingerprint(), file: process.env.VAULT_KEY ? null : keyFilePath() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
