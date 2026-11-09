import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { LogoutButton } from '@/app/_components/logout-button';
import { ROLE_BLURB, ROLE_LABEL } from '@/lib/domain/permissions';
import { Card, PageHeader } from '@/components/ui';
import { ChangePasswordForm } from './change-password-form';
import s from './account.module.css';

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route

  return (
    <main className={s.wrap}>
      <PageHeader back={<Link href="/more" aria-label="Back" className={s.back}><ChevronLeft /></Link>} title="Account" />
      <Card>
        <div className={s.who}>
          <span className={s.avatar} aria-hidden>{(user.name || '?').charAt(0)}</span>
          <div className={s.main}>
            <strong>{user.name}</strong>
            <span className={s.muted}>{user.email}</span>
            <span className={s.muted}>{ROLE_LABEL[user.role]} — {ROLE_BLURB[user.role]}</span>
          </div>
        </div>
        <div className={s.signout}><LogoutButton className="btn small ghost" /></div>
      </Card>
      <Card title="Change password">
        <ChangePasswordForm />
      </Card>
    </main>
  );
}
