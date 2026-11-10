'use client';
import { useRouter } from 'next/navigation';
import { TEXT_COOKIE, THEME_COOKIE, type TextPref, type ThemePref } from '@/lib/domain/brand';
import { Field, Segmented, Stack } from '@/components/ui';

const YEAR = 31536000;
function setCookie(name: string, value: string | null) {
  document.cookie = value == null ? `${name}=; Path=/; Max-Age=0; SameSite=Lax` : `${name}=${value}; Path=/; Max-Age=${YEAR}; SameSite=Lax`;
}

/** Light / dark and text size, remembered on this device. */
export function Appearance({ theme, text }: { theme: ThemePref; text: TextPref }) {
  const router = useRouter();
  return (
    <Stack>
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
    </Stack>
  );
}
