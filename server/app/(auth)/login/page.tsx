'use client';
import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
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
    <main className="auth-wrap">
      <p className="auth-brand">🌾 Farm Project Tracker</p>
      <p className="subtle">Sign in to your farm.</p>
      <div className="card" style={{ marginTop: 20 }}>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button type="submit" disabled={loading} className="btn primary block">
            {loading ? 'Signing in…' : 'Log in'}
          </button>
        </form>
      </div>
      <p className="subtle" style={{ marginTop: 14, textAlign: 'center' }}>
        <Link href="/forgot" className="chip-link">
          Forgot your password?
        </Link>
      </p>
    </main>
  );
}
