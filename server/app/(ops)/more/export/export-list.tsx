'use client';
import { useState } from 'react';
import { Download } from 'lucide-react';
import { Card, Field, Input, ListRow } from '@/components/ui';
import s from '../../farm/animals/animals.module.css';

export function ExportList({ sets, from: f0, to: t0 }: { sets: { key: string; label: string; about: string }[]; from: string; to: string }) {
  const [from, setFrom] = useState(f0);
  const [to, setTo] = useState(t0);
  const q = `?from=${from}&to=${to}`;
  return (
    <>
      <Card>
        <div className={s.two}>
          <Field label="From" htmlFor="ex-from"><Input id="ex-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To" htmlFor="ex-to"><Input id="ex-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <p className={s.muted}>Opens in Excel, Numbers or Google Sheets.</p>
      </Card>
      <Card flush>
        {sets.map((d) => (
          <a key={d.key} href={`/api/data/csv/${d.key}${q}`} download className={s.rowLink}>
            <ListRow lead={<Download />} title={d.label} meta={d.about} />
          </a>
        ))}
      </Card>
    </>
  );
}
