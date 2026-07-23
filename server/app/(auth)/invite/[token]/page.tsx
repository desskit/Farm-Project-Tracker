import { getValidInvite } from '@/lib/auth/invites';
import { SetPasswordForm } from './set-password-form';

export default async function InvitePage({ params }: { params: { token: string } }) {
  const invite = await getValidInvite(params.token);

  if (!invite) {
    return (
      <main className="auth-wrap">
        <p className="auth-brand">🌾 Farm Project Tracker</p>
        <div className="empty" style={{ marginTop: 20 }}>
          This invite link is invalid or has expired. Ask an admin to send a new one.
        </div>
      </main>
    );
  }

  return (
    <main className="auth-wrap">
      <p className="auth-brand">🌾 Farm Project Tracker</p>
      <p className="subtle">
        Welcome, <strong>{invite.name}</strong>. Set a password for {invite.email} to finish setting up your account.
      </p>
      <div className="card" style={{ marginTop: 20 }}>
        <SetPasswordForm token={invite.token} />
      </div>
    </main>
  );
}
