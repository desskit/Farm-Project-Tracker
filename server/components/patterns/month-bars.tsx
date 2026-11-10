import s from './month-bars.module.css';

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Twelve bars, one per month. Each bar carries its value as a tooltip and the chart has a text summary. */
export function MonthBars({ values, unit, caption }: { values: number[]; unit: string; caption?: string }) {
  const max = Math.max(...values, 1);
  const best = values.indexOf(Math.max(...values));
  const total = Math.round(values.reduce((a, b) => a + b, 0) * 10) / 10;
  return (
    <div className={s.wrap}>
      {caption && <p className={s.caption}>{caption}</p>}
      <svg className={s.chart} viewBox="0 0 120 40" preserveAspectRatio="none" role="img" aria-label={`${total} ${unit} over the year; the most in ${NAMES[best]} (${values[best]}).`}>
        {values.map((v, i) => {
          const h = v > 0 ? Math.max(1, (v / max) * 38) : 0;
          return <rect key={i} x={i * 10 + 1.5} y={40 - h} width={7} height={h} rx={1}><title>{`${NAMES[i]}: ${v} ${unit}`}</title></rect>;
        })}
      </svg>
      <div className={s.axis} aria-hidden>{MONTHS.map((m, i) => <span key={i}>{m}</span>)}</div>
    </div>
  );
}
