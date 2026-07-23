import Link from 'next/link';
import { getWeather, dayFire, weatherEmoji } from '@/lib/data/weather';

/**
 * Compact 7-day forecast + fire-danger strip for the top of the dashboard,
 * mirroring the prototype's placement. Reads the server-side weather cache and
 * links through to the full weather page. Renders nothing until a farm
 * location has been set (a manager does that from More → Weather).
 */
export async function WeatherWidget() {
  const w = await getWeather();
  if (!w.lat || !w.forecast) return null;

  const days = w.forecast.slice(0, 7);
  const fires = days.map(dayFire);
  const today = fires[0];

  return (
    <Link href="/more/weather" className="card wx-card wx-widget">
      <div className="wx-head">
        <span>🌤️ {w.label || '7-day forecast'}</span>
        {today && <span className={`wx-fire-pill fire-${today.key}`}>🔥 {today.label}</span>}
      </div>
      <div className="wx-row">
        {days.map((d, i) => {
          const fire = fires[i];
          return (
            <div className="wx-day" key={i}>
              <div className="wx-dow">{d.dow}</div>
              <div className="wx-emoji">{weatherEmoji(d.code)}</div>
              <div className="wx-hi">{Math.round(d.hi)}°</div>
              <div className="wx-lo">{Math.round(d.lo)}°</div>
              {d.precip != null && <div className="wx-precip">💧{Math.round(d.precip)}%</div>}
              {fire && <div className={`wx-fire fire-${fire.key}`} title={`Fire danger: ${fire.label}`} />}
            </div>
          );
        })}
      </div>
    </Link>
  );
}
