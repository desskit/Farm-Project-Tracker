'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function AddProjectCard() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('idea');
  const [targetDate, setTargetDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, status, targetDate: targetDate || null }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Something went wrong.');
      return;
    }
    setName('');
    setDescription('');
    setTargetDate('');
    router.refresh();
  }

  return (
    <div className="card">
      <form onSubmit={onSubmit}>
        <div className="field">
          <label>Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Build run-in shed" />
        </div>
        <div className="field">
          <label>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="idea">Idea</option>
            <option value="planned">Planned</option>
            <option value="in_progress">In progress</option>
            <option value="on_hold">On hold</option>
            <option value="done">Done</option>
          </select>
        </div>
        <div className="field">
          <label>Target date (optional)</label>
          <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={loading} className="btn primary block">
          {loading ? 'Saving…' : 'Create project'}
        </button>
      </form>
    </div>
  );
}
