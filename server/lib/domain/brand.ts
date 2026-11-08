/**
 * The farm's brand. The owner kept the original palette ("Classic"); the
 * colors live in app/tokens.css under [data-brand="classic"]. The plumbing
 * (a setting, data-brand on <html>) stays so another brand is a CSS block
 * and a list entry away. Client-safe, no server imports.
 */
export type BrandId = 'classic';
export type ThemePref = 'system' | 'light' | 'dark';

export type BrandInfo = {
  id: BrandId;
  name: string;
  tagline: string;
  /** Honest trade-offs, shown in the gallery next to each option. */
  notes: string[];
  /** Browser/OS chrome color (address bar, PWA title bar) per mode. */
  themeColor: { light: string; dark: string };
};

export const BRANDS: BrandInfo[] = [
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'Farm green and harvest gold on warm off-white — the original look.',
    notes: [],
    themeColor: { light: '#2f6f4f', dark: '#12160f' },
  },
];

export const DEFAULT_BRAND: BrandId = 'classic';
export const BRAND_SETTING_KEY = 'brand';
export const THEME_COOKIE = 'fpt-theme';

export function isBrandId(v: unknown): v is BrandId {
  return typeof v === 'string' && BRANDS.some((b) => b.id === v);
}

export function brandInfo(id: BrandId): BrandInfo {
  return BRANDS.find((b) => b.id === id) ?? BRANDS[0];
}

export function parseThemePref(v: string | undefined | null): ThemePref {
  return v === 'light' || v === 'dark' ? v : 'system';
}
