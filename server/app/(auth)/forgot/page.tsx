'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';

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
    <main className="auth-wrap">
      <p className="auth-brand">🌾 Farm Project Tracker</p>
      <p className="subtle">Reset your password.</p>
      <div className="card" style={{ marginTop: 20 }}>
        {sent ? (
          <>
            <p style={{ marginTop: 0 }}>
              If <strong>{email}</strong> is registered, a reset link is on its way. The link expires in 7 days.
            </p>
            <p className="subtle">Not seeing it? Check spam, or ask a farm admin to re-invite you.</p>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <p className="subtle" style={{ marginTop: 0 }}>
              Enter your email and we&apos;ll send a link to set a new password.
            </p>
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            {error && <p className="error-text">{error}</p>}
            <button type="submit" disabled={loading} className="btn primary block">
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}
      </div>
      <p className="subtle" style={{ marginTop: 14, textAlign: 'center' }}>
        <Link href="/login" className="chip-link">
          ‹ Back to sign in
        </Link>
      </p>
    </main>
  );
}
