import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LockKeyhole } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { listUsers } from '@/lib/data/users';
import { can } from '@/lib/domain/permissions';
import { PageHeader } from '@/components/ui';
import { InviteForm } from './invite-form';
import { PersonRow } from './person-row';
import s from './people.module.css';

export default async function PeoplePage() {
  const user = await getSessionUser();
  if (!user || !can(user, 'people.manage')) notFound();
  const people = await listUsers();
  const active = people.filter((p) => p.active);
  const inactive = people.filter((p) => !p.active);

  return (
    <main className={s.wrap}>
      <PageHeader
        title="People"
        subtitle={`${active.length} with access${inactive.length ? ` · ${inactive.length} deactivated` : ''}`}
        actions={<Link href="/more/access" className={s.whoLink}><LockKeyhole aria-hidden /> Who sees what</Link>}
      />
      <div className={s.list}>
        {active.map((p) => <PersonRow key={p.id} person={p} isSelf={p.id === user.id} />)}
      </div>
      <InviteForm />
      {inactive.length > 0 && (
        <details className={s.inactiveList}>
          <summary>Deactivated ({inactive.length})</summary>
          <div className={s.list}>
            {inactive.map((p) => <PersonRow key={p.id} person={p} isSelf={p.id === user.id} />)}
          </div>
        </details>
      )}
    </main>
  );
}
