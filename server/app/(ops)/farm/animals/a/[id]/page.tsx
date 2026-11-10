import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { animalDetail, groupDetail, listGroups } from '@/lib/data/livestock';
import { listInventory } from '@/lib/data/inventory';
import { DataError } from '@/lib/data/errors';
import { can } from '@/lib/domain/permissions';
import { SPECIES } from '@/lib/domain/livestock';
import { fmtDate, todayISO } from '@/lib/domain/dates';
import { Banner, Card, ListRow, StatusPill } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import { StatTiles, type Tile } from '@/components/patterns/stat-tiles';
import { HistoryCard, LogCard } from '../../[id]/group-client';
import { AnimalActions } from './animal-client';
import s from '../../animals.module.css';

function age(birth: string | null, today: string): string | null {
  if (!birth) return null;
  const months = (Number(today.slice(0, 4)) - Number(birth.slice(0, 4))) * 12 + Number(today.slice(5, 7)) - Number(birth.slice(5, 7)) - (today.slice(8) < birth.slice(8) ? 1 : 0);
  return months < 1 ? 'newborn' : months < 24 ? `${months} months` : `${Math.floor(months / 12)} years`;
}

/** One animal: its record, weight over time, family, and everything logged against it. */
export default async function AnimalPage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user || !can(user, 'animals.view')) notFound();
  const d = await animalDetail(params.id).catch((e) => {
    if (e instanceof DataError && e.status === 404) notFound();
    throw e;
  });
  const { animal, group } = d;
  const manage = can(user, 'animals.manage');
  const log = can(user, 'animals.log');
  const today = todayISO();
  const [supplies, groups, mates] = await Promise.all([
    log ? listInventory() : Promise.resolve([]),
    manage ? listGroups() : Promise.resolve([]),
    manage ? groupDetail(group.id).then((g) => g.animals) : Promise.resolve([]),
  ]);
  const last = d.weights.at(-1);
  const first = d.weights[0];
  const tiles: Tile[] = [];
  if (age(animal.birthDate, today)) tiles.push({ label: 'Age', value: age(animal.birthDate, today)! });
  if (last) tiles.push({ label: `Weight (${fmtDate(last.date)})`, value: `${last.weight} lb` });
  if (last && first && last !== first) tiles.push({ label: 'Since first weigh-in', value: `${last.weight - first.weight >= 0 ? '+' : ''}${Math.round((last.weight - first.weight) * 10) / 10} lb` });
  if (d.offspring.length) tiles.push({ label: 'Offspring', value: d.offspring.length });

  // Weight chart: a line through the weigh-ins, scaled to their range.
  const W = 300;
  const H = 90;
  const ws = d.weights;
  const min = Math.min(...ws.map((w) => w.weight));
  const max = Math.max(...ws.map((w) => w.weight));
  const pts = ws.map((w, i) => `${ws.length === 1 ? W / 2 : (i / (ws.length - 1)) * (W - 12) + 6},${H - 8 - ((w.weight - min) / (max - min || 1)) * (H - 20)}`);

  return (
    <Screen
      title={d.label}
      subtitle={[SPECIES[d.species].single, animal.sex !== 'unknown' ? animal.sex : '', animal.breed, animal.tag && animal.name ? `#${animal.tag}` : ''].filter(Boolean).join(' · ')}
      back={`/farm/animals/${group.id}`}
      actions={manage ? <AnimalActions animal={animal} others={mates.filter((a) => a.id !== animal.id)} groups={groups.map((g) => ({ id: g.id, label: g.name }))} /> : undefined}
    >
      {animal.status !== 'active' && <Banner tone="info">Marked {animal.status}. The record is kept for history.</Banner>}
      {d.meatClear && <Banner tone="warn" title="Meat withdrawal">Not for butchering before <strong>{fmtDate(d.meatClear)}</strong>.</Banner>}
      {animal.photoId && (
        <a href={`/api/attachments/${animal.photoId}`} target="_blank" rel="noopener">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={s.portrait} src={`/api/attachments/${animal.photoId}`} alt={d.label} />
        </a>
      )}
      {tiles.length > 0 && <StatTiles tiles={tiles} />}
      {animal.notes && <p>{animal.notes}</p>}

      {ws.length > 0 && (
        <Card title="Weight">
          <svg className={s.chart} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Weight from ${ws[0].weight} to ${ws.at(-1)!.weight} lb`}>
            {ws.length > 1 && <polyline className={s.line} points={pts.join(' ')} />}
            {pts.map((p, i) => <circle key={i} className={s.dot} cx={p.split(',')[0]} cy={p.split(',')[1]} r={3}><title>{`${fmtDate(ws[i].date)}: ${ws[i].weight} lb`}</title></circle>)}
          </svg>
          <div className={s.chartAxis}><span>{fmtDate(ws[0].date)} · {ws[0].weight} lb</span><span>{fmtDate(ws.at(-1)!.date)} · {ws.at(-1)!.weight} lb</span></div>
        </Card>
      )}

      {log && animal.status === 'active' && (
        <LogCard
          groupId={group.id}
          animals={[{ id: animal.id, label: d.label, sex: animal.sex }]}
          supplies={supplies.map((i) => ({ id: i.id, name: i.name, unit: i.unit, qty: i.qty, meatDays: i.meatWithdrawalDays, milkDays: i.milkWithdrawalDays }))}
          breedings={d.breedings.filter((b) => b.status === 'bred' || b.status === 'confirmed').map((b) => ({ id: b.id, label: `Bred ${fmtDate(b.bredOn)}` }))}
          canManage={manage}
          today={today}
          preselect={animal.id}
        />
      )}

      <Card title="Family" flush>
        <ListRow href={`/farm/animals/${group.id}`} title={group.name} meta="Group" />
        {d.dam && <ListRow href={`/farm/animals/a/${d.dam.id}`} title={d.dam.label} meta="Mother" />}
        {d.sire && <ListRow href={`/farm/animals/a/${d.sire.id}`} title={d.sire.label} meta="Father" />}
        {animal.birthDate && <ListRow title={fmtDate(animal.birthDate)} meta="Born" />}
        {d.breedings.filter((b) => b.status === 'bred' || b.status === 'confirmed').map((b) => (
          <ListRow key={b.id} title={`Due around ${b.dueOn ? fmtDate(b.dueOn) : '?'}`} meta={`Bred ${fmtDate(b.bredOn)}${b.sire ? ` × ${b.sire}` : ''}`} trail={<StatusPill tone="upcoming">{b.status === 'confirmed' ? 'Confirmed' : 'Bred'}</StatusPill>} />
        ))}
        {d.offspring.map((o) => (
          <ListRow key={o.id} href={`/farm/animals/a/${o.id}`} title={o.label} meta={`Offspring${o.birthDate ? ` · born ${fmtDate(o.birthDate)}` : ''}`} trail={o.status !== 'active' ? <StatusPill tone="neutral">{o.status}</StatusPill> : undefined} />
        ))}
      </Card>

      <HistoryCard events={d.events} canManage={manage} />
      <p className={s.muted}>Treatments given to the whole group are on <Link href={`/farm/animals/${group.id}`}>{group.name}</Link>.</p>
    </Screen>
  );
}
