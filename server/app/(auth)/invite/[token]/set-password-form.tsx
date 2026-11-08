'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Banner, Button, Field, Input } from '@/components/ui';
import s from '../../auth.module.css';

export function SetPasswordForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/invite/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Something went wrong.');
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className={s.form}>
      {/* Lets password managers save the new password against the right account. */}
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <Field label="New password" htmlFor="invite-password" hint="At least 8 characters.">
        <Input
          id="invite-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
          autoFocus
        />
      </Field>
      {error && <Banner tone="danger">{error}</Banner>}
      <Button type="submit" block loading={loading}>
        Set password & sign in
      </Button>
    </form>
  );
}
