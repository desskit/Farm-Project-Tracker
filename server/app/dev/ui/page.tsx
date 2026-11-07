import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { currentBrand, currentThemePref } from '@/lib/data/brand';
import { Gallery } from './gallery';

export const metadata = { title: 'Design gallery · Farm Project Tracker' };

/**
 * Admin-only design gallery: the brand options side by side, and every UI kit
 * component in the brand in use. Not linked from the nav; open /dev/ui.
 */
export default async function DevUiPage() {
  const user = await getSessionUser();
  if (user?.role !== 'admin') notFound();
  return <Gallery current={await currentBrand()} theme={currentThemePref()} />;
}
