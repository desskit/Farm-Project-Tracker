import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { ChangePasswordForm } from './change-password-form';

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route

  return (
    <main className="view">
      <div className="sub-head">
        <Link href="/more" className="btn small ghost back-btn">
          ‹ More
        </Link>
        <h1>Account</h1>
      </div>

      <div className="card who-card">
        <span className="who-avatar">{(user.name || '?').charAt(0)}</span>
        <div className="who-main">
          <p className="who-name">{user.name}</p>
          <p className="who-role">
            {user.role} · {user.email}
          </p>
        </div>
        <a href="/api/auth/logout" className="btn small ghost">
          Log out
        </a>
      </div>

      <div className="section-title">Change password</div>
      <div className="card">
        <ChangePasswordForm />
      </div>
    </main>
  );
}
