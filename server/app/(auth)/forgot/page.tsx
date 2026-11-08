'use client';
import { useState, type FormEvent } from 'react';
import { Banner, Button, Field, Input } from '@/components/ui';
import { AuthShell } from '../auth-shell';
import s from '../auth.module.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Something went wrong. Try again.');
      return;
    }
    setSent(true);
  }

  return (
    <AuthShell
      title="Reset your password"
      lede={sent ? undefined : 'Enter your email and we’ll send a link to set a new one.'}
      footer={{ href: '/login', label: '‹ Back to sign in' }}
    >
      {sent ? (
        <Banner tone="ok" title="Check your email">
          If {email} has an account, a reset link is on its way (it works for 7 days). Not seeing it? Check spam, or ask a
          farm admin to re-invite you.
        </Banner>
      ) : (
        <form onSubmit={onSubmit} className={s.form}>
          <Field label="Email" htmlFor="forgot-email">
            <Input id="forgot-email" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </Field>
          {error && <Banner tone="danger">{error}</Banner>}
          <Button type="submit" block loading={loading}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
