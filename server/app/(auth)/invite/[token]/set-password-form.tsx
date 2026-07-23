'use client';
import { useState, type CSSProperties, type FormEvent } from 'react';
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
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14, marginTop: 24, maxWidth: 320 }}>
      <label style={{ display: 'grid', gap: 4 }}>
        New password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
          autoFocus
          style={inputStyle}
        />
      </label>
      {error && <p style={{ color: '#c0392b', margin: 0 }}>{error}</p>}
      <button type="submit" disabled={loading} style={buttonStyle}>
        {loading ? 'Saving…' : 'Set password & sign in'}
      </button>
    </form>
  );
}

const inputStyle: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: 15,
};
const buttonStyle: CSSProperties = {
  padding: '11px 14px',
  borderRadius: 8,
  border: '1px solid var(--brand)',
  background: 'var(--brand)',
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: 15,
};
