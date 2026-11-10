'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, X } from 'lucide-react';
import type { GuideParentType } from '@/db/schema';
import { Banner, Button, Card, IconButton, ListRow, Select } from '@/components/ui';
import s from './guides-card.module.css';

type G = { id: string; title: string; summary?: string };

/**
 * How-to guides attached to this chore / machine / group / place. Hidden when
 * there are none and the viewer can't attach any.
 */
export function GuidesCard({ parentType, parentId, linked, all, canManage }: { parentType: GuideParentType; parentId: string; linked: G[]; all: G[]; canManage: boolean }) {
  const router = useRouter();
  const [pick, setPick] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rest = all.filter((g) => !linked.some((l) => l.id === g.id));
  if (!linked.length && !(canManage && all.length)) return null;

  async function set(guideId: string, on: boolean) {
    setError(null);
    const res = await fetch(`/api/guides/${guideId}/links`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentType, parentId, on }) });
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error || 'Could not change that.');
    setPick('');
    router.refresh();
  }

  return (
    <Card title="How-to" flush>
      {linked.map((g) => (
        <div key={g.id} className={s.row}>
          <div className={s.grow}><ListRow href={`/more/guides/${g.id}`} lead={<BookOpen />} title={g.title} meta={g.summary || undefined} /></div>
          {canManage && <IconButton label={`Detach ${g.title}`} onClick={() => set(g.id, false)}><X /></IconButton>}
        </div>
      ))}
      {canManage && rest.length > 0 && (
        <div className={s.add}>
          <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Guide to attach">
            <option value="">Attach a guide…</option>
            {rest.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </Select>
          <Button size="sm" variant="secondary" disabled={!pick} onClick={() => set(pick, true)}>Attach</Button>
        </div>
      )}
      {error && <Banner tone="danger">{error}</Banner>}
    </Card>
  );
}
