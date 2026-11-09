import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { listGroups } from '@/lib/data/vault';
import { listUsers } from '@/lib/data/users';
import { can, ROLE_LABEL } from '@/lib/domain/permissions';
import { PageHeader } from '@/components/ui';
import { GroupsView } from './groups-view';
import s from '../vault.module.css';

export const dynamic = 'force-dynamic';

/** Admins: who's in each sharing group, and the vault's recovery key. */
export default async function VaultGroupsPage() {
  const user = await getSessionUser();
  if (!user || !can(user, 'people.manage')) notFound();
  const [groups, people] = await Promise.all([listGroups(), listUsers()]);
  return (
    <main className={s.wrap}>
      <PageHeader back={<Link href="/vault" aria-label="Back" className={s.back}><ChevronLeft /></Link>} title="Sharing groups" subtitle="People pick these when they share a password or code." />
      <GroupsView
        groups={groups}
        people={people.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name, role: ROLE_LABEL[p.role] }))}
        isSystemAdmin={can(user, 'system.admin')}
      />
    </main>
  );
}
