import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, Users } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { listGroups, listVault } from '@/lib/data/vault';
import { can } from '@/lib/domain/permissions';
import { Banner, ButtonLink, PageHeader } from '@/components/ui';
import { VaultView } from './vault-view';
import s from './vault.module.css';

export const metadata = { title: 'Passwords & codes · Farm Project Tracker' };
export const dynamic = 'force-dynamic';

export default async function VaultPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!can(user, 'vault.use')) redirect('/');
  const [entries, groups] = await Promise.all([listVault(user), listGroups()]);
  const myGroups = groups.filter((g) => g.memberIds.includes(user.id) || can(user, 'people.manage'));

  return (
    <main className={s.wrap}>
      <PageHeader
        back={<Link href="/more" aria-label="Back" className={s.back}><ChevronLeft /></Link>}
        title="Passwords & codes"
        subtitle="Encrypted. Each person decides who sees what they add."
        actions={can(user, 'people.manage') ? <ButtonLink href="/vault/groups" size="sm" variant="ghost" icon={<Users />}>Groups</ButtonLink> : undefined}
      />
      {user.previewBy ? (
        <Banner tone="info" title="Hidden while previewing">Passwords and codes are never shown when previewing as someone else.</Banner>
      ) : (
        <VaultView
          entries={entries}
          groups={groups.map((g) => ({ id: g.id, name: g.name }))}
          shareGroups={myGroups.map((g) => ({ id: g.id, name: g.name }))}
          canCreate={can(user, 'vault.create')}
          isAdmin={can(user, 'people.manage')}
          onFarm={can(user, 'farm.view')}
        />
      )}
    </main>
  );
}
