'use client';
import { useRouter } from 'next/navigation';
import { CONTRAST_COOKIE, SIMPLE_COOKIE, TEXT_COOKIE, THEME_COOKIE, type ContrastPref, type LayoutPref, type TextPref, type ThemePref } from '@/lib/domain/brand';
import { Field, Segmented, Stack } from '@/components/ui';

const YEAR = 31536000;
function setCookie(name: string, value: string | null) {
  document.cookie = value == null ? `${name}=; Path=/; Max-Age=0; SameSite=Lax` : `${name}=${value}; Path=/; Max-Age=${YEAR}; SameSite=Lax`;
}

/** Layout, light / dark, text size and contrast, remembered on this device. */
export function Appearance({ theme, text, layout, contrast }: { theme: ThemePref; text: TextPref; layout: LayoutPref; contrast: ContrastPref }) {
  const router = useRouter();
  return (
    <Stack>
      <Field label="Layout" hint={layout === 'simple' ? 'A plain home screen with big buttons for rent, your chores and codes. Menu still has everything.' : 'Simple shows only the essentials, with big buttons.'}>
        <Segmented<LayoutPref>
          label="Layout"
          value={layout}
          onChange={(l) => { setCookie(SIMPLE_COOKIE, l === 'simple' ? 'simple' : null); router.refresh(); }}
          options={[{ value: 'full', label: 'Full' }, { value: 'simple', label: 'Simple' }]}
        />
      </Field>
      <Field label="Colors">
        <Segmented<ThemePref>
          label="Colors"
          value={theme}
          onChange={(t) => { setCookie(THEME_COOKIE, t === 'system' ? null : t); router.refresh(); }}
          options={[{ value: 'system', label: 'Match phone' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
        />
      </Field>
      <Field label="Text size">
        <Segmented<TextPref>
          label="Text size"
          value={text}
          onChange={(t) => { setCookie(TEXT_COOKIE, t === 'large' ? 'large' : null); router.refresh(); }}
          options={[{ value: 'normal', label: 'Normal' }, { value: 'large', label: 'Large' }]}
        />
      </Field>
      <Field label="Contrast" hint="High makes text darker and outlines stronger. Match phone follows your phone’s contrast setting.">
        <Segmented<ContrastPref>
          label="Contrast"
          value={contrast}
          onChange={(c) => { setCookie(CONTRAST_COOKIE, c === 'system' ? null : c); router.refresh(); }}
          options={[{ value: 'system', label: 'Match phone' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }]}
        />
      </Field>
    </Stack>
  );
}
