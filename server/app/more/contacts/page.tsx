import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { canEditContacts, listContacts } from '@/lib/data/contacts';
import { can } from '@/lib/domain/permissions';
import { Screen } from '@/components/patterns/screen';
import { ContactList } from './contact-list';

export const metadata = { title: 'Contacts · Farm Project Tracker' };

/** Vet, farrier, suppliers, emergency numbers. Tenants see only the ones marked for them. */
export default async function ContactsPage() {
  const user = await getSessionUser();
  if (!user) notFound();
  const list = await listContacts(user);
  return (
    <Screen title="Contacts" subtitle="Who to call" back={can(user, 'farm.view') ? '/more' : '/'}>
      <ContactList contacts={list} canEdit={canEditContacts(user)} />
    </Screen>
  );
}
