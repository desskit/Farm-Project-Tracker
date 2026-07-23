import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { getWeather, dayFire, weatherEmoji } from '@/lib/data/weather';
import { WeatherControls } from './weather-controls';

const FIRE_RANK: Record<string, number> = { low: 0, mod: 1, high: 2, vhigh: 3, extreme: 4 };

export default async function WeatherPage() {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route
  const isManager = user.role === 'manager' || user.role === 'admin';
  const w = await getWeather();

  const days = (w.forecast ?? []).slice(0, 7);
  const fires = days.map(dayFire);
  const today = fires[0];
  let peakIdx = 0;
  if (today) fires.forEach((f, i) => { if (f && today && f.rank > (fires[peakIdx]?.rank ?? -1)) peakIdx = i; });
  const peak = fires[peakIdx];
  const ago = w.fetchedAt ? Math.round((Date.now() - w.fetchedAt) / 3600000) : null;

  return (
    <main className="view">
      <div className="sub-head">
        <Link href="/more" className="btn small ghost back-btn">
          ‹ More
        </Link>
        <h1>Weather</h1>
      </div>

      {!w.lat || !w.forecast ? (
        <div className="card">
          <p className="item-title">🌤️ Weather</p>
          <p className="subtle">
            {isManager ? 'Set your farm location for a 7-day forecast.' : 'A manager needs to set the farm location.'}
          </p>
        </div>
      ) : (
        <div className="card wx-card">
          <div className="wx-head">
            <span>🌤️ {w.label || '7-day forecast'}</span>
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
          {today && (
            <div className={`wx-fire-banner fire-${today.key}`}>
              <span>
                🔥 Fire danger: <strong>{today.label}</strong>
                {peak && peak.rank > today.rank && days[peakIdx] ? (
                  <>
                    {' · '}
                    <strong>{peak.label}</strong> by {days[peakIdx].dow}
                  </>
                ) : null}
              </span>
              <span className="wx-fire-est" title="Estimated from temperature, humidity & wind (Fosberg index). Not an official warning.">
                est.
              </span>
            </div>
          )}
          <p className="subtle" style={{ marginTop: 6 }}>
            {ago != null ? `Updated ${ago === 0 ? 'just now' : `${ago}h ago`}` : ''}
          </p>
        </div>
      )}

      <WeatherControls
        isManager={isManager}
        hasLocation={w.lat != null}
        current={{ lat: w.lat, lon: w.lon, label: w.label }}
      />

      <p className="subtle" style={{ marginTop: 12 }}>
        Fire danger is an estimate from temperature, humidity, and wind — not an official warning. Check local
        authorities for red-flag warnings and burn bans.
      </p>
    </main>
  );
}
