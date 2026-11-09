import type { ReactNode } from 'react';
import { Fence, Flower2, Sprout, Trees, Wheat } from 'lucide-react';
import type { UnitSummary } from '@/lib/data/land';
import { LAND_KINDS } from '@/lib/domain/garden';
import { fmtDate } from '@/lib/domain/dates';
import { StatusPill } from '@/components/ui';
import s from '../animals/animals.module.css';

export const KIND_ICON: Record<string, ReactNode> = {
  garden: <Flower2 />, bed: <Sprout />, pasture: <Fence />, paddock: <Fence />, orchard: <Trees />, field: <Wheat />, other: <Sprout />,
};

export function unitPills(u: UnitSummary) {
  return (
    <span className={s.pills}>
      {u.phiUntil && <StatusPill tone="today">No harvest till {fmtDate(u.phiUntil)}</StatusPill>}
      {u.ready > 0 && <StatusPill tone="done">{u.ready} ready</StatusPill>}
      {u.grazing?.state === 'occupied' && <StatusPill tone="info">Grazing</StatusPill>}
      {u.grazing?.state === 'resting' && <StatusPill tone="upcoming">Resting · {u.grazing.rested}d</StatusPill>}
      {u.grazing?.state === 'ready' && <StatusPill tone="done">Ready to graze</StatusPill>}
    </span>
  );
}

export function unitMeta(u: UnitSummary, children: UnitSummary[]): string {
  const bits: string[] = [LAND_KINDS[u.kind].label];
  if (u.area) bits.push(`${u.area} ${u.areaUnit === 'acre' ? 'ac' : 'sq ft'}`);
  const kid = LAND_KINDS[u.kind].child;
  if (kid) bits.push(`${children.length} ${kid}${children.length === 1 ? '' : 's'}`);
  const growing = u.growing + children.reduce((n, c) => n + c.growing, 0);
  if (growing) bits.push(`${growing} growing`);
  if (u.perennials) bits.push(`${u.perennials} plants`);
  const here = [...u.groupsHere, ...children.flatMap((c) => c.groupsHere)];
  if (here.length) bits.push(here.map((g) => g.name).join(', '));
  return bits.join(' · ');
}

