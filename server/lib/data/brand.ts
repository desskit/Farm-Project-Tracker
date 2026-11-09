/** The farm's chosen brand (an admin setting) and the viewer's light/dark choice (a cookie). */
import 'server-only';
import { requestCache } from '@/lib/request-cache';
import { cookies } from 'next/headers';
import { getSetting, setSetting } from './settings';
import { BRAND_SETTING_KEY, DEFAULT_BRAND, THEME_COOKIE, isBrandId, parseThemePref, type BrandId, type ThemePref } from '@/lib/domain/brand';
import type { SessionUser } from '@/lib/auth/session';
import { logActivity } from './activity';
import { DataError } from './errors';
import { can } from '@/lib/domain/permissions';

/** One settings read per request, shared by the layout and generateViewport. */
export const currentBrand = requestCache(async (): Promise<BrandId> => {
  try {
    const v = await getSetting<string>(BRAND_SETTING_KEY);
    return isBrandId(v) ? v : DEFAULT_BRAND;
  } catch {
    return DEFAULT_BRAND; // never let a bad setting take the whole app down
  }
});

export function currentThemePref(): ThemePref {
  return parseThemePref(cookies().get(THEME_COOKIE)?.value);
}

export async function setBrand(user: SessionUser, brand: unknown): Promise<BrandId> {
  if (!can(user, 'system.admin')) throw new DataError('Only an admin can change the brand.', 403);
  if (!isBrandId(brand)) throw new DataError('Unknown brand.', 400);
  await setSetting(BRAND_SETTING_KEY, brand);
  await logActivity(user.id, `switched the app brand to ${brand}`, { audience: 'system.admin' });
  return brand;
}
