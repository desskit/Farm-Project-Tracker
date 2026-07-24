'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { SearchResult } from '@/lib/data/search';

const KIND_ICON: Record<string, string> = {
  chore: '🔁',
  asset: '🚜',
  maintenance: '🔧',
  project: '📋',
  task: '☑️',
  inventory: '📦',
  person: '🧑‍🌾',
};

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json().catch(() => ({ results: [] }));
        setResults(Array.isArray(data.results) ? data.results : []);
        setSearched(true);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <main className="view">
      <div className="sub-head">
        <Link href="/more" className="btn small ghost back-btn">
          ‹ More
        </Link>
        <h1>Search</h1>
      </div>

      <div className="field">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search chores, projects, equipment, supplies…"
          autoFocus
          autoComplete="off"
        />
      </div>

      {loading && <p className="subtle">Searching…</p>}
      {!loading && searched && results.length === 0 && <div className="empty">No matches for “{q.trim()}”.</div>}

      {results.map((r) => (
        <Link href={r.href} key={`${r.kind}-${r.id}`} className="card search-hit">
          <span className="search-ico">{KIND_ICON[r.kind] ?? '•'}</span>
          <div className="item-main">
            <p className="item-title">{r.title}</p>
            <p className="item-sub">{r.sub}</p>
          </div>
          <span className="search-chev">›</span>
        </Link>
      ))}
    </main>
  );
}
