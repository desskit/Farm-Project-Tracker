import Link from 'next/link';
import s from './patterns.module.css';

export type Tile = { label: string; value: string | number; tone?: 'bad' | 'warn' | 'good'; href?: string };

/** A row of number tiles ("3 overdue", "$1,200 collected"). */
export function StatTiles({ tiles }: { tiles: Tile[] }) {
  const cls = (t: Tile) => `${s.tile} ${t.tone === 'bad' ? s.tileBad : t.tone === 'warn' ? s.tileWarn : t.tone === 'good' ? s.tileGood : ''}`;
  return (
    <div className={s.tiles}>
      {tiles.map((t) =>
        t.href ? (
          <Link key={t.label} href={t.href} className={cls(t)}><span className={s.tileVal}>{t.value}</span><span className={s.tileLbl}>{t.label}</span></Link>
        ) : (
          <div key={t.label} className={cls(t)}><span className={s.tileVal}>{t.value}</span><span className={s.tileLbl}>{t.label}</span></div>
        ),
      )}
    </div>
  );
}
