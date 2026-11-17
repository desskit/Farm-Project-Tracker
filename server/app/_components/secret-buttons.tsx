'use client';
import { useEffect, useState } from 'react';
import { Copy, Eye, EyeOff, KeyRound } from 'lucide-react';
import { Banner, Button } from '@/components/ui';
import s from './simple-home.module.css';

/** Opens a vault entry's secret. The server logs every call. */
export async function reveal(id: string): Promise<{ secret: string; notes: string }> {
  const res = await fetch(`/api/vault/${id}/reveal`, { method: 'POST' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not open it.');
  return data;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A code or password with big Show and Copy buttons; a shown secret hides again after 30 seconds. */
export function CodeCard({ id, title, username }: { id: string; title: string; username: string }) {
  const [shown, setShown] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), 30_000);
    return () => clearTimeout(t);
  }, [shown]);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2500);
    return () => clearTimeout(t);
  }, [msg]);

  async function onShow() {
    setErr(null);
    if (shown) return setShown(null);
    try {
      setShown((await reveal(id)).secret);
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Could not open it.');
    }
  }
  async function onCopy() {
    setErr(null);
    try {
      const secret = shown ?? (await reveal(id)).secret;
      setMsg((await copyText(secret)) ? 'Copied' : 'Couldn’t copy. Tap Show instead.');
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Could not open it.');
    }
  }

  return (
    <div className={s.code}>
      <div className={s.codeHead}>
        <KeyRound aria-hidden />
        <strong>{title}</strong>
      </div>
      {username && <div className={s.codeUser}>{username}</div>}
      <div className={s.codeValue} aria-live="polite">{shown ?? '••••••'}</div>
      <div className={s.bigActions}>
        <Button variant="secondary" icon={shown ? <EyeOff /> : <Eye />} onClick={onShow}>{shown ? 'Hide' : 'Show'}</Button>
        <Button variant="secondary" icon={<Copy />} onClick={onCopy}>Copy</Button>
      </div>
      {msg && <span className={s.ok} role="status">{msg}</span>}
      {err && <Banner tone="danger">{err}</Banner>}
    </div>
  );
}
