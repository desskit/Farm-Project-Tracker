import { getValidInvite } from '@/lib/auth/invites';
import { Banner } from '@/components/ui';
import { AuthShell } from '../../auth-shell';
import { SetPasswordForm } from './set-password-form';

export default async function InvitePage({ params }: { params: { token: string } }) {
  const invite = await getValidInvite(params.token);

  if (!invite) {
    return (
      <AuthShell title="This link has expired" footer={{ href: '/login', label: 'Go to sign in' }}>
        <Banner tone="warn">This invite link is invalid or has expired. Ask whoever invited you to send a new one.</Banner>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={`Welcome, ${invite.name.split(' ')[0]}`} lede={<>Choose a password for {invite.email} to finish setting up.</>}>
      <SetPasswordForm token={invite.token} email={invite.email} />
    </AuthShell>
  );
}
