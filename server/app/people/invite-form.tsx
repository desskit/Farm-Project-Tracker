'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function InviteForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('worker');
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInviteUrl(null);
    setCopied(false);
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
    <div className="card">
      <form onSubmit={onSubmit}>
        <div className="field">
          <label>Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="worker">Worker</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={loading} className="btn primary block">
          {loading ? 'Adding…' : '+ Add & invite'}
        </button>
      </form>

      {inviteUrl && (
        <div className="notice" style={{ marginTop: 12 }}>
          <strong>Invite link</strong> — email delivery isn&apos;t wired up yet, so copy this and send it to them:
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <code style={{ wordBreak: 'break-all', flex: 1 }}>{inviteUrl}</code>
            <button
              type="button"
              className="btn small"
              onClick={() => {
                navigator.clipboard?.writeText(inviteUrl).then(
                  () => setCopied(true),
                  () => setCopied(false),
                );
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
