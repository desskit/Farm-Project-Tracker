/**
 * Weather — server-side fetch + cache from Open-Meteo (keyless), with the
 * per-day Fosberg fire-danger estimate. The forecast is cached in settings so
 * the client just reads it (works behind the farm firewall — the server has
 * internet, phones may not reach open-meteo directly).
 */
import { getSetting, setSetting } from './settings';
import { fireDanger, weatherEmoji, type FireDanger } from '@/lib/domain/weather';
import { DEFAULT_THRESHOLDS, alertsFor, type WeatherAlert, type WeatherThresholds } from '@/lib/domain/weather-alerts';
import type { SessionUser } from '@/lib/auth/session';
import { DataError } from './errors';
import { can } from '@/lib/domain/permissions';

export type ForecastDay = { date?: string; dow: string; code: number; hi: number; lo: number; precip: number | null; rainIn?: number | null; rh: number | null; wind: number | null };
export type WeatherSettings = { lat: number | null; lon: number | null; label: string; forecast: ForecastDay[] | null; fetchedAt: number | null };

const KEY = 'weather';
const EMPTY: WeatherSettings = { lat: null, lon: null, label: '', forecast: null, fetchedAt: null };


export async function getWeather(): Promise<WeatherSettings> {
  return (await getSetting<WeatherSettings>(KEY)) ?? EMPTY;
}

export async function setWeatherLocation(user: SessionUser, lat: number, lon: number, label: string): Promise<void> {
  if (!can(user, 'work.manage')) throw new DataError('Only managers and admins can set the farm location.', 403);
  const w = await getWeather();
  await setSetting(KEY, { ...w, lat, lon, label: label || '' });
}

/** Fetches Open-Meteo (daily temps/precip + hourly humidity/wind) and caches it. */
export async function refreshForecast(): Promise<WeatherSettings> {
  const w = await getWeather();
  if (w.lat == null || w.lon == null) throw new DataError('Set the farm location first.', 400);

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${w.lat}&longitude=${w.lon}` +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum' +
    '&hourly=relative_humidity_2m,wind_speed_10m' +
    '&timezone=auto&forecast_days=7&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch';

  let json: any;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    json = await res.json();
  } catch {
    throw new DataError('Could not reach the weather service.', 502);
  }
  if (!json?.daily) throw new DataError('Weather service returned no data.', 502);

  const hr = json.hourly || {};
  function dayExtremes(dateStr: string): { rh: number | null; wind: number | null } {
    let minRH: number | null = null;
    let maxW: number | null = null;
    if (hr.time) {
      for (let k = 0; k < hr.time.length; k++) {
        if (String(hr.time[k]).indexOf(dateStr) !== 0) continue;
        const rh = hr.relative_humidity_2m ? hr.relative_humidity_2m[k] : null;
        const wd = hr.wind_speed_10m ? hr.wind_speed_10m[k] : null;
        if (rh != null && (minRH === null || rh < minRH)) minRH = rh;
        if (wd != null && (maxW === null || wd > maxW)) maxW = wd;
      }
    }
    return { rh: minRH, wind: maxW };
  }

  const dd = json.daily;
  const forecast: ForecastDay[] = [];
  for (let i = 0; i < dd.time.length; i++) {
    const ext = dayExtremes(dd.time[i]);
    forecast.push({
      date: dd.time[i],
      rainIn: dd.precipitation_sum ? dd.precipitation_sum[i] : null,
      dow: new Date(dd.time[i] + 'T00:00').toLocaleDateString(undefined, { weekday: 'short' }),
      code: dd.weather_code[i],
      hi: dd.temperature_2m_max[i],
      lo: dd.temperature_2m_min[i],
      precip: dd.precipitation_probability_max ? dd.precipitation_probability_max[i] : null,
      rh: ext.rh,
      wind: ext.wind,
    });
  }

  const updated: WeatherSettings = { ...w, forecast, fetchedAt: Date.now() };
  await setSetting(KEY, updated);
  return updated;
}

const THRESHOLDS_KEY = 'weather-thresholds';

/** When to warn about frost, heat and heavy rain (defaults: 34°F, 95°F, 1 in). */
export async function getWeatherThresholds(): Promise<WeatherThresholds> {
  return { ...DEFAULT_THRESHOLDS, ...((await getSetting<Partial<WeatherThresholds>>(THRESHOLDS_KEY)) ?? {}) };
}

export async function setWeatherThresholds(user: SessionUser, t: WeatherThresholds): Promise<void> {
  if (!can(user, 'work.manage')) throw new DataError('Only managers and admins can change weather alerts.', 403);
  await setSetting(THRESHOLDS_KEY, t);
}

/** The alerts in force right now, for the Today banner and the weather page. */
export async function currentWeatherAlerts(): Promise<WeatherAlert[]> {
  const w = await getWeather();
  if (!w.forecast) return [];
  return alertsFor(w.forecast, await getWeatherThresholds());
}

/** Render helpers reused by the UI (kept here so both server + client agree). */
export function dayFire(d: ForecastDay): FireDanger | null {
  return fireDanger(d.hi, d.rh, d.wind);
}
export { weatherEmoji };
