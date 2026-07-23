'use client';
import { Suspense, useState, type CSSProperties, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginPage() {
  // useSearchParams() needs a Suspense boundary for the App Router build.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Invalid email or password.');
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <main style={mainStyle}>
      <p style={titleStyle}>🌾 Farm Project Tracker</p>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 14, marginTop: 24 }}>
        <label style={fieldStyle}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            style={inputStyle}
          />
        </label>
        <label style={fieldStyle}>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle}
          />
        </label>
        {error && <p style={errorStyle}>{error}</p>}
        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? 'Signing in…' : 'Log in'}
        </button>
      </form>
    </main>
  );
}

const mainStyle: CSSProperties = { maxWidth: 360, margin: '80px auto', padding: '0 20px' };
const titleStyle: CSSProperties = { fontSize: 22, fontWeight: 800 };
const fieldStyle: CSSProperties = { display: 'grid', gap: 4 };
const errorStyle: CSSProperties = { color: '#c0392b', margin: 0 };
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
