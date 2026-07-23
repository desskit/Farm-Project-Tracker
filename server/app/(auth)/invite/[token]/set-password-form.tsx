'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function SetPasswordForm({ token }: { token: string }) {
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
    <form onSubmit={onSubmit}>
      <div className="field">
        <label>New password (at least 8 characters)</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required autoFocus />
      </div>
      {error && <p className="error-text">{error}</p>}
      <button type="submit" disabled={loading} className="btn primary block">
        {loading ? 'Saving…' : 'Set password & sign in'}
      </button>
    </form>
  );
}
