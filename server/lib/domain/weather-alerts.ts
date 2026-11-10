/**
 * Turns the forecast into the few alerts worth interrupting someone for:
 * frost, heat, heavy rain and high fire danger over the next couple of days.
 * Pure — the notify job decides who hears about each and remembers what it sent.
 */
import { fireDanger } from './weather';

export type AlertKind = 'frost' | 'heat' | 'rain' | 'fire';
export type WeatherThresholds = { frostF: number; heatF: number; rainIn: number };
export const DEFAULT_THRESHOLDS: WeatherThresholds = { frostF: 34, heatF: 95, rainIn: 1 };

export type AlertDay = { date?: string; dow: string; hi: number; lo: number; rainIn?: number | null; rh: number | null; wind: number | null };
export type WeatherAlert = { kind: AlertKind; date: string; when: string; title: string; detail: string };

const WHEN = ['today', 'tomorrow'];

/**
 * Alerts for the first `horizon` days of the forecast (today first). A day's
 * low is its early-morning low, so "frost tomorrow" means tonight into tomorrow.
 */
export function alertsFor(days: AlertDay[], t: WeatherThresholds = DEFAULT_THRESHOLDS, horizon = 3): WeatherAlert[] {
  const out: WeatherAlert[] = [];
  days.slice(0, horizon).forEach((d, i) => {
    if (!d.date) return; // forecasts cached before dates were stored
    const when = WHEN[i] ?? d.dow;
    if (i > 0 && d.lo <= t.frostF) {
      out.push({ kind: 'frost', date: d.date, when, title: d.lo <= 32 ? 'Frost coming' : 'Near-frost coming', detail: `Low of ${Math.round(d.lo)}°F ${i === 1 ? 'tonight into tomorrow' : `into ${d.dow}`}.` });
    }
    if (d.hi >= t.heatF) {
      out.push({ kind: 'heat', date: d.date, when, title: 'Heat', detail: `${Math.round(d.hi)}°F ${when}.` });
    }
    if (d.rainIn != null && d.rainIn >= t.rainIn) {
      out.push({ kind: 'rain', date: d.date, when, title: 'Heavy rain', detail: `About ${Math.round(d.rainIn * 10) / 10} in ${when}.` });
    }
    const fire = fireDanger(d.hi, d.rh, d.wind);
    if (fire && fire.rank >= 3) {
      out.push({ kind: 'fire', date: d.date, when, title: `${fire.label} fire danger`, detail: `${fire.label} fire danger ${when}: hot, dry and windy.` });
    }
  });
  return out;
}
