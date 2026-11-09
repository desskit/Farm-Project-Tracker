'use client';
import { useState, type FormEvent } from 'react';
import { Banner, Button, Field, Input, Stack } from '@/components/ui';

export function ChangePasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (next !== confirm) {
      setError('The new passwords don’t match.');
      return;
    }
    setLoading(true);
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Could not change your password.');
      return;
    }
    setCurrent('');
    setNext('');
    setConfirm('');
    setDone(true);
  }

  return (
    <form onSubmit={onSubmit}>
      <Stack>
        <Field label="Current password" htmlFor="pw-current">
          <Input id="pw-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
        </Field>
        <Field label="New password" htmlFor="pw-new" hint="At least 8 characters.">
          <Input id="pw-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required autoComplete="new-password" />
        </Field>
        <Field label="Confirm new password" htmlFor="pw-confirm">
          <Input id="pw-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required autoComplete="new-password" />
        </Field>
        {error && <Banner tone="danger">{error}</Banner>}
        {done && <Banner tone="ok">Password updated. Other devices have been signed out.</Banner>}
        <Button type="submit" block loading={loading}>Change password</Button>
      </Stack>
    </form>
  );
}
