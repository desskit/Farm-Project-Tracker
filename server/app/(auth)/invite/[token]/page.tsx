import type { CSSProperties } from 'react';
import { getValidInvite } from '@/lib/auth/invites';
import { SetPasswordForm } from './set-password-form';

export default async function InvitePage({ params }: { params: { token: string } }) {
  const invite = await getValidInvite(params.token);

  if (!invite) {
    return (
      <main style={mainStyle}>
        <p style={titleStyle}>🌾 Farm Project Tracker</p>
        <p style={{ marginTop: 16 }}>
          This invite link is invalid or has expired. Ask an admin to send a new one.
        </p>
      </main>
    );
  }

  return (
    <main style={mainStyle}>
      <p style={titleStyle}>🌾 Farm Project Tracker</p>
      <p style={{ marginTop: 8 }}>
        Welcome, <strong>{invite.name}</strong>. Set a password for {invite.email} to finish setting up your account.
      </p>
      <SetPasswordForm token={invite.token} />
    </main>
  );
}

const mainStyle: CSSProperties = { maxWidth: 360, margin: '80px auto', padding: '0 20px' };
const titleStyle: CSSProperties = { fontSize: 22, fontWeight: 800 };
