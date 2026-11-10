'use client';
import { useState } from 'react';
import { CalendarPlus, Copy } from 'lucide-react';
import { Banner, Button, Stack } from '@/components/ui';
import { useDialogs } from '@/components/ui/dialogs';
import s from './account.module.css';

/** Your own secret calendar link: add it once in the phone's calendar app and it stays up to date. */
export function CalendarLink({ exists }: { exists: boolean }) {
  const { confirm: askConfirm } = useDialogs();
  const [has, setHas] = useState(exists);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function make() {
    if (has && !(await askConfirm('Make a new link? The old one stops working, so calendars using it will need the new one.'))) return;
    setBusy(true);
    setError(null);
    const res = await fetch('/api/calendar/token', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || 'Could not make the link.');
    setUrl(data.url);
    setHas(true);
    setCopied(false);
  }
  async function off() {
    if (!(await askConfirm('Turn the calendar link off? Calendars using it stop updating.'))) return;
    setBusy(true);
    const res = await fetch('/api/calendar/token', { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) return setError('Could not turn it off.');
    setHas(false);
    setUrl(null);
  }

  return (
    <Stack>
      <p className={s.muted}>
        See what’s due in your phone’s own calendar. Make a link, then add it as a subscribed calendar
        (iPhone: Settings → Calendar → Accounts → Add Subscribed Calendar. Google Calendar: Other calendars → From URL).
        It shows only what you can see in the app.
      </p>
      {url && (
        <Banner tone="ok" title="Your link (shown once)">
          <code className={s.link}>{url}</code>
          <Button size="sm" variant="secondary" icon={<Copy />} onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(true), () => setCopied(false))}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </Banner>
      )}
      {error && <Banner tone="danger">{error}</Banner>}
      <div className={s.actions}>
        <Button icon={<CalendarPlus />} loading={busy} onClick={make}>{has ? 'Make a new link' : 'Make my calendar link'}</Button>
        {has && <Button variant="ghost" disabled={busy} onClick={off}>Turn off</Button>}
      </div>
      <p className={s.muted}>Treat the link like a password: anyone who has it can see your calendar.</p>
    </Stack>
  );
}
