'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { ClipboardList, ListChecks, Package, Repeat, Search as SearchIcon, Tractor, User, Wrench } from 'lucide-react';
import type { SearchResult } from '@/lib/data/search';
import { Card, EmptyState, Input, ListRow, Skeleton, Stack } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import s from './search.module.css';

const KIND_ICON: Record<string, ReactNode> = {
  chore: <Repeat />, asset: <Tractor />, maintenance: <Wrench />, project: <ClipboardList />, task: <ListChecks />, inventory: <Package />, person: <User />,
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
    <Screen title="Search" back="/more">
      <label className={s.search}>
        <SearchIcon aria-hidden />
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chores, projects, equipment, supplies…" autoFocus autoComplete="off" aria-label="Search" />
      </label>
      {loading && <Card><Stack gap={8}><Skeleton h={16} w="60%" /><Skeleton h={12} w="40%" /></Stack></Card>}
      {!loading && searched && results.length === 0 && <Card><EmptyState title={`No matches for “${q.trim()}”`} /></Card>}
      {!loading && results.length > 0 && (
        <Card flush>
          {results.map((r) => <ListRow key={`${r.kind}-${r.id}`} href={r.href} lead={KIND_ICON[r.kind]} title={r.title} meta={r.sub} />)}
        </Card>
      )}
    </Screen>
  );
}
