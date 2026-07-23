'use client';
import { useState, type FormEvent } from 'react';

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
      <div className="field">
        <label>Current password</label>
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
      </div>
      <div className="field">
        <label>New password (at least 8 characters)</label>
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required autoComplete="new-password" />
      </div>
      <div className="field">
        <label>Confirm new password</label>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required autoComplete="new-password" />
      </div>
      {error && <p className="error-text">{error}</p>}
      {done && <p style={{ color: 'var(--brand)', fontWeight: 600 }}>Password updated. Other devices have been signed out.</p>}
      <button type="submit" disabled={loading} className="btn primary block">
        {loading ? 'Saving…' : 'Change password'}
      </button>
    </form>
  );
}
