'use client';
import { useState } from 'react';
import { BellRing, Mail } from 'lucide-react';
import type { Prefs } from '@/lib/data/prefs';
import { Banner, Button, Card, Field, Select, Stack, Switch } from '@/components/ui';
import s from './notifications.module.css';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function NotificationsView({
  prefs: initial,
  emailReady,
  pushReady,
  isAdmin,
}: {
  prefs: Prefs;
  emailReady: boolean;
  pushReady: boolean;
  isAdmin: boolean;
}) {
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [pushTestMsg, setPushTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pushTestBusy, setPushTestBusy] = useState(false);

  async function sendTestEmail() {
    setTestBusy(true);
    setTestMsg(null);
    try {
      const res = await fetch('/api/admin/test-email', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      setTestMsg(
        res.ok
          ? { ok: true, text: `Sent to ${data.to}. Check your inbox (and spam).` }
          : { ok: false, text: data.error || 'Could not send the test email.' },
      );
    } finally {
      setTestBusy(false);
    }
  }

  async function sendTestPush() {
    setPushTestBusy(true);
    setPushTestMsg(null);
    try {
      const res = await fetch('/api/admin/test-push', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPushTestMsg({ ok: false, text: data.error || 'Could not send the test push.' });
        return;
      }
      const devices = `${data.delivered} device${data.delivered === 1 ? '' : 's'}`;
      // A partial success still matters — say which part worked.
      const extra = data.failed ? ` ${data.failed} other device(s) failed: ${data.error}` : '';
      setPushTestMsg({ ok: true, text: `Sent to ${devices}. Check your notifications.${extra}` });
    } finally {
      setPushTestBusy(false);
    }
  }

  async function save(next: Prefs) {
    setPrefs(next);
    setSaving(true);
    setSaved(false);
    const res = await fetch('/api/prefs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  }

  async function enablePush() {
    setPushBusy(true);
    setPushMsg(null);
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setPushMsg('This browser does not support push notifications.');
        return;
      }
      const keyRes = await fetch('/api/push/public-key');
      const { publicKey } = await keyRes.json();
      if (!publicKey) {
        setPushMsg('Push is not configured on the server yet.');
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setPushMsg('Notification permission was denied.');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      setPushMsg(res.ok ? 'Push notifications enabled on this device. ✅' : 'Could not save the subscription.');
    } catch {
      setPushMsg('Could not enable push on this device.');
    } finally {
      setPushBusy(false);
    }
  }

  const hours = Array.from({ length: 24 }, (_, h) => ({ h, label: h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM` }));
  return (
    <Stack gap={16}>
      {!emailReady && !pushReady && (
        <Banner tone="info">Email and push aren’t set up on the server yet. Your choices are saved and take effect once they are.</Banner>
      )}

      <Card title="What you get" action={<span className={s.saved}>{saving ? 'Saving…' : saved ? 'Saved ✓' : ''}</span>}>
        <Stack>
          <div className={s.two}>
            <Field label="Email digest" htmlFor="pref-email">
              <Select id="pref-email" value={prefs.email} onChange={(e) => save({ ...prefs, email: e.target.value as Prefs['email'] })}>
                <option value="off">Off</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly (Mondays)</option>
              </Select>
            </Field>
            <Field label="Digest time" htmlFor="pref-hour">
              <Select id="pref-hour" value={prefs.digestHour} onChange={(e) => save({ ...prefs, digestHour: Number(e.target.value) })}>
                {hours.map(({ h, label }) => <option key={h} value={h}>{label}</option>)}
              </Select>
            </Field>
          </div>
          <Switch label="Daily push summary" hint="What's overdue and due today, at your digest time." checked={prefs.push} onChange={(v) => save({ ...prefs, push: v })} />
          <Switch
            label="Push as things happen"
            hint="Work assigned to you, work sent back, someone joining your job, low supplies, request updates."
            checked={prefs.eventPush}
            onChange={(v) => save({ ...prefs, eventPush: v })}
          />
        </Stack>
      </Card>

      <Card title="This device">
        <Stack>
          <p className={s.muted}>Turn on push on each phone you want alerts on. Add the app to your home screen first for the best results.</p>
          <Button block icon={<BellRing />} loading={pushBusy} onClick={enablePush}>Enable push on this device</Button>
          {pushMsg && <Banner tone="info">{pushMsg}</Banner>}
          {isAdmin && (
            <>
              <p className={s.muted}>{pushReady ? 'Send yourself a test notification to check the server’s push setup.' : 'Push keys aren’t set up on this server, so no push will send.'}</p>
              <Button variant="secondary" block disabled={!pushReady} loading={pushTestBusy} onClick={sendTestPush}>Send test push</Button>
              {pushTestMsg && <Banner tone={pushTestMsg.ok ? 'ok' : 'danger'}>{pushTestMsg.text}</Banner>}
            </>
          )}
        </Stack>
      </Card>

      {isAdmin && (
        <Card title="Email delivery">
          <Stack>
            <p className={s.muted}>{emailReady ? 'Send yourself a test message to check email is working.' : 'Email isn’t set up on this server, so invites, resets and digests won’t send.'}</p>
            <Button variant="secondary" block icon={<Mail />} disabled={!emailReady} loading={testBusy} onClick={sendTestEmail}>Send test email</Button>
            {testMsg && <Banner tone={testMsg.ok ? 'ok' : 'danger'}>{testMsg.text}</Banner>}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
