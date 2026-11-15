import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, Users } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { listGroups, listVault, vaultPeople } from '@/lib/data/vault';
import { ASSIGNABLE_ROLES, ROLE_LABEL, can, resolveCaps } from '@/lib/domain/permissions';
import { todayISO } from '@/lib/domain/dates';
import { Banner, ButtonLink, PageHeader } from '@/components/ui';
import { VaultView } from './vault-view';
import s from './vault.module.css';

export const metadata = { title: 'Passwords & codes · Farm Project Tracker' };
export const dynamic = 'force-dynamic';

export default async function VaultPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!can(user, 'vault.use')) redirect('/');
  const [entries, groups, people] = await Promise.all([listVault(user), listGroups(), vaultPeople()]);
  const myGroups = groups.filter((g) => g.memberIds.includes(user.id) || can(user, 'people.manage'));

  return (
    <main className={s.wrap}>
      <PageHeader
        back={<Link href="/more" aria-label="Back" className={s.back}><ChevronLeft /></Link>}
        title="Passwords & codes"
        subtitle="Encrypted. Each person decides who sees what they add, who can edit it, and for how long."
        actions={can(user, 'people.manage') ? <ButtonLink href="/vault/groups" size="sm" variant="ghost" icon={<Users />}>Groups</ButtonLink> : undefined}
      />
      {user.previewBy ? (
        <Banner tone="info" title="Hidden while previewing">Passwords and codes are never shown when previewing as someone else.</Banner>
      ) : (
        <VaultView
          entries={entries}
          targets={{
            people: people.filter((p) => p.id !== user.id),
            groups: myGroups.map((g) => ({ id: g.id, name: g.name })),
            // Only roles that can use passwords at all are worth offering.
            roles: ASSIGNABLE_ROLES.filter((r) => resolveCaps(r, []).includes('vault.use')).map((r) => ({ id: r, name: ROLE_LABEL[r] })),
            onFarm: can(user, 'farm.view'),
          }}
          canCreate={can(user, 'vault.create')}
          isAdmin={can(user, 'people.manage')}
          today={todayISO()}
        />
      )}
    </main>
  );
}
