'use client';
import { useState } from 'react';
import type { Prefs } from '@/lib/data/prefs';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function NotificationsView({ prefs: initial, emailReady, pushReady }: { prefs: Prefs; emailReady: boolean; pushReady: boolean }) {
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

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

  return (
    <>
      {!emailReady && !pushReady && (
        <div className="notice">
          Email and push aren&apos;t configured on the server yet (SMTP / VAPID env). Your preferences are still saved
          and take effect once an admin turns those on.
        </div>
      )}

      <div className="card">
        <div className="field">
          <label>Email digest</label>
          <select value={prefs.email} onChange={(e) => save({ ...prefs, email: e.target.value as Prefs['email'] })}>
            <option value="off">Off</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly (Mondays)</option>
          </select>
        </div>
        <div className="field">
          <label>Digest time</label>
          <select value={prefs.digestHour} onChange={(e) => save({ ...prefs, digestHour: Number(e.target.value) })}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
              </option>
            ))}
          </select>
        </div>
        <label className="inline-check">
          <input type="checkbox" checked={prefs.push} onChange={(e) => save({ ...prefs, push: e.target.checked })} />
          Push notifications
        </label>
        <p className="subtle" style={{ marginTop: 8 }}>
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Changes save automatically.'}
        </p>
      </div>

      <div className="section-title">This device</div>
      <div className="card">
        <p className="subtle" style={{ marginTop: 0 }}>
          Enable push on each device you want alerts on (install the app to your home screen first for the best
          experience).
        </p>
        <button className="btn primary block" disabled={pushBusy} onClick={enablePush}>
          {pushBusy ? 'Enabling…' : '🔔 Enable push on this device'}
        </button>
        {pushMsg && <p className="subtle" style={{ marginTop: 8 }}>{pushMsg}</p>}
      </div>
    </>
  );
}
