'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function AddAssetCard() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Equipment');
  const [meterUnit, setMeterUnit] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch('/api/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, meterUnit: meterUnit || null, notes }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Something went wrong.');
      return;
    }
    setName('');
    setNotes('');
    setMeterUnit('');
    router.refresh();
  }

  return (
    <div className="card">
      <form onSubmit={onSubmit}>
        <div className="field">
          <label>Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Kubota tractor" />
        </div>
        <div className="field">
          <label>Category</label>
          <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Equipment, Vehicle, Structure…" />
        </div>
        <div className="field">
          <label>Meter unit (optional — for usage-based upkeep)</label>
          <input type="text" value={meterUnit} onChange={(e) => setMeterUnit(e.target.value)} placeholder="hours, miles… (blank = none)" />
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={loading} className="btn primary block">
          {loading ? 'Saving…' : 'Add asset'}
        </button>
      </form>
    </div>
  );
}
