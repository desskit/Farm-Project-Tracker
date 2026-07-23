'use client';
import { useState, type CSSProperties, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function InviteForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('worker');
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInviteUrl(null);
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, role }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || 'Something went wrong.');
      return;
    }
    setInviteUrl(data.inviteUrl);
    setName('');
    setEmail('');
    router.refresh();
  }

  return (
    <div>
      <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={fieldStyle}>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle}>
            <option value="worker">Worker</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? 'Adding…' : '+ Add & invite'}
        </button>
      </form>
      {error && <p style={{ color: '#c0392b' }}>{error}</p>}
      {inviteUrl && (
        <p style={{ marginTop: 12 }}>
          Invite link (email delivery isn&apos;t wired up yet — copy this and send it to them):
          <br />
          <code style={{ wordBreak: 'break-all' }}>{inviteUrl}</code>
        </p>
      )}
    </div>
  );
}

const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', fontSize: 13, gap: 4 };
const inputStyle: CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
};
const buttonStyle: CSSProperties = {
  padding: '9px 14px',
  borderRadius: 8,
  border: '1px solid var(--brand)',
  background: 'var(--brand)',
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 600,
};
