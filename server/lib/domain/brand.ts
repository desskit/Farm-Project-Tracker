/**
 * Brand options for the redesign. The colors themselves live in
 * app/tokens.css under [data-brand="<id>"]; this list is what the app and the
 * /dev/ui gallery need to know about them (client-safe, no server imports).
 */
export type BrandId = 'meadow' | 'barnyard' | 'fieldnotes';
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
    id: 'meadow',
    name: 'Meadow',
    tagline: 'Forest green with a terracotta accent on warm cream. Calm and familiar.',
    notes: [
      'Closest to what people use today, so the switch feels like a refresh, not a new app.',
      'Green also means "on track", so the brand color and the good-news color sit close together.',
    ],
    themeColor: { light: '#2e6b4a', dark: '#121612' },
  },
  {
    id: 'barnyard',
    name: 'Barnyard',
    tagline: 'Oxblood barn red and harvest gold on oat. Warm, bold, very "farm".',
    notes: [
      'The most distinctive of the three; reads as a farm brand at a glance.',
      'Red brand next to red "overdue" — overdue switches to a brighter vermilion with an icon so the two stay apart.',
    ],
    themeColor: { light: '#8f2a2a', dark: '#171312' },
  },
  {
    id: 'fieldnotes',
    name: 'Field Notes',
    tagline: 'Deep slate-teal and harvest gold on cool paper. Crisp and utilitarian.',
    notes: [
      'Status colors (red / amber / green) stand out most against a neutral brand.',
      'Feels more like a tool than a farm; the gold accent carries the warmth.',
    ],
    themeColor: { light: '#1f4e5f', dark: '#0f1517' },
  },
];

export const DEFAULT_BRAND: BrandId = 'meadow';
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
