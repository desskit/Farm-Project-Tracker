import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { can } from '@/lib/domain/permissions';

/**
 * Every farm screen lives in this group (URLs are unchanged). People without
 * farm access — renters — are sent to their own home instead, so no farm page
 * can be reached by typing its address.
 */
export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (user && !can(user, 'farm.view')) redirect('/');
  return children;
}
