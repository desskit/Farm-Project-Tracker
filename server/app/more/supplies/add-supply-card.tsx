'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function AddSupplyCard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Supplies');
  const [unit, setUnit] = useState('count');
  const [qty, setQty] = useState('0');
  const [reorderAt, setReorderAt] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!open) {
    return (
      <button className="btn primary block" style={{ marginBottom: 12 }} onClick={() => setOpen(true)}>
        + Add supply
      </button>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch('/api/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, unit, qty: Number(qty), reorderAt: Number(reorderAt) }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Something went wrong.');
      return;
    }
    setName('');
    setQty('0');
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="card">
      <form onSubmit={onSubmit}>
        <div className="field">
          <label>Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Chick starter" />
        </div>
        <div className="field">
          <label>Category</label>
          <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
        <div className="field">
          <label>Unit</label>
          <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="bags, gal, count…" />
        </div>
        <div className="field">
          <label>On hand</label>
          <input type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div className="field">
          <label>Reorder at</label>
          <input type="number" step="any" value={reorderAt} onChange={(e) => setReorderAt(e.target.value)} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="submit" disabled={loading} className="btn primary">
            {loading ? 'Saving…' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  );
}
