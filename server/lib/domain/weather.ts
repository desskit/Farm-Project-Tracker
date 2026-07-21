/**
 * Weather helpers, ported from js/app.js:1020-1063.
 *
 * `fireDanger` computes the Fosberg Fire Weather Index (FFWI) from temperature
 * (°F), relative humidity (%), and wind (mph) — a keyless estimate we compute
 * server-side from the cached Open-Meteo forecast. Not an official warning.
 */

export type FireLevel = 'low' | 'mod' | 'high' | 'vhigh' | 'extreme';
export type FireDanger = { index: number; key: FireLevel; label: string; rank: number };

const FIRE_RANK: Record<FireLevel, number> = { low: 0, mod: 1, high: 2, vhigh: 3, extreme: 4 };

export function fireDanger(t: number | null, h: number | null, u: number | null): FireDanger | null {
  if (t == null || h == null || u == null) return null;
  let m: number;
  if (h <= 10) m = 0.03229 + 0.281073 * h - 0.000578 * h * t;
  else if (h <= 50) m = 2.22749 + 0.160107 * h - 0.014784 * t;
  else m = 21.0606 + 0.005565 * h * h - 0.00035 * h * t - 0.483199 * h;
  const mr = m / 30;
  const eta = 1 - 2 * mr + 1.5 * mr * mr - 0.5 * mr * mr * mr;
  let idx = Math.round((eta * Math.sqrt(1 + u * u)) / 0.3002);
  idx = Math.max(0, Math.min(100, idx));
  const lv: { key: FireLevel; label: string } =
    idx < 15 ? { key: 'low', label: 'Low' }
      : idx < 30 ? { key: 'mod', label: 'Moderate' }
        : idx < 45 ? { key: 'high', label: 'High' }
          : idx < 60 ? { key: 'vhigh', label: 'Very High' }
            : { key: 'extreme', label: 'Extreme' };
  return { index: idx, key: lv.key, label: lv.label, rank: FIRE_RANK[lv.key] };
}

export function weatherEmoji(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code >= 45 && code <= 48) return '🌫️';
  if (code >= 51 && code <= 67) return '🌧️';
  if (code >= 71 && code <= 77) return '❄️';
  if (code >= 80 && code <= 82) return '🌦️';
  if (code >= 85 && code <= 86) return '🌨️';
  if (code >= 95) return '⛈️';
  return '🌡️';
}
