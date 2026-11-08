'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function RestoreForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, number> | null>(null);

  async function onRestore() {
    if (!file) return;
    if (!confirm('Replace all current farm data with this backup? This cannot be undone.')) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setError('That file is not valid JSON.');
        return;
      }
      const res = await fetch('/api/data/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Restore failed.');
        return;
      }
      setResult(data.counts || {});
      setConfirmed(false);
      setFile(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <p className="item-title">⬆︎ Restore from a backup</p>
      <p className="subtle">
        Replace the current farm data with a backup exported above. Existing accounts keep their passwords; anyone new
        to the backup comes in as pending. This cannot be undone — download a fresh backup first.
      </p>
      <div className="field" style={{ marginTop: 10 }}>
        <input type="file" accept="application/json,.json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <label className="inline-check" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        I understand this replaces all current data.
      </label>
      <button className="btn danger block" disabled={!file || !confirmed || busy} onClick={onRestore}>
        {busy ? 'Restoring…' : 'Restore backup'}
      </button>
      {error && <p className="error-text">{error}</p>}
      {result && (
        <p style={{ color: 'var(--brand)', fontWeight: 600, marginBottom: 0 }}>
          Restored: {Object.entries(result).map(([k, v]) => `${v} ${k}`).join(', ')}.
        </p>
      )}
    </div>
  );
}
