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
export const TEXT_COOKIE = 'fpt-text';
/** Simple layout (a stripped-down home for occasional users), remembered per phone. */
export const SIMPLE_COOKIE = 'fpt-simple';
/** High contrast: 'high' forces it, 'normal' turns it off even if the phone asks for more contrast. */
export const CONTRAST_COOKIE = 'fpt-contrast';
export type LayoutPref = 'full' | 'simple';
export type ContrastPref = 'system' | 'normal' | 'high';
export function parseLayoutPref(v: string | undefined | null): LayoutPref {
  return v === 'simple' ? 'simple' : 'full';
}
export function parseContrastPref(v: string | undefined | null): ContrastPref {
  return v === 'high' || v === 'normal' ? v : 'system';
}
export type TextPref = 'normal' | 'large';
export function parseTextPref(v: string | undefined | null): TextPref {
  return v === 'large' ? 'large' : 'normal';
}

export function isBrandId(v: unknown): v is BrandId {
  return typeof v === 'string' && BRANDS.some((b) => b.id === v);
}

export function brandInfo(id: BrandId): BrandInfo {
  return BRANDS.find((b) => b.id === id) ?? BRANDS[0];
}

export function parseThemePref(v: string | undefined | null): ThemePref {
  return v === 'light' || v === 'dark' ? v : 'system';
}
