import Link from 'next/link';
import p from './print.module.css';
import s from '../farm/animals/animals.module.css';

/** This year / last year links above a record book. Hidden on paper. */
export function YearPicker({ base, year, thisYear }: { base: string; year: number; thisYear: number }) {
  return (
    <div className={`${p.bar} no-print`}>
      {[thisYear, thisYear - 1, thisYear - 2].map((y) => (y === year ? <strong key={y}>{y}</strong> : <Link key={y} href={`${base}?year=${y}`} className={s.fileBtn}>{y}</Link>))}
    </div>
  );
}

export function pickYear(raw: string | undefined, thisYear: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 2020 && n <= thisYear ? n : thisYear;
}
