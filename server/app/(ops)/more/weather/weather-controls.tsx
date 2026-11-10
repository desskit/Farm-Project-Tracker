'use client';
import w from './weather.module.css';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function WeatherControls({
  isManager,
  hasLocation,
  current,
  thresholds,
}: {
  isManager: boolean;
  hasLocation: boolean;
  current: { lat: number | null; lon: number | null; label: string };
  thresholds: { frostF: number; heatF: number; rainIn: number };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lat, setLat] = useState(current.lat != null ? String(current.lat) : '');
  const [lon, setLon] = useState(current.lon != null ? String(current.lon) : '');
  const [label, setLabel] = useState(current.label || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [th, setTh] = useState({ frostF: String(thresholds.frostF), heatF: String(thresholds.heatF), rainIn: String(thresholds.rainIn) });

  async function saveThresholds(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/weather/thresholds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frostF: Number(th.frostF), heatF: Number(th.heatF), rainIn: Number(th.rainIn) }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error || 'Could not save.');
    setAlertsOpen(false);
    router.refresh();
  }

  async function refresh() {
    setBusy(true);
    setError(null);
    const res = await fetch('/api/weather/refresh', { method: 'POST' });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'Could not refresh.');
      return;
    }
    router.refresh();
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError('Geolocation not available on this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(String(pos.coords.latitude.toFixed(4)));
        setLon(String(pos.coords.longitude.toFixed(4)));
      },
      () => setError('Location permission denied.'),
    );
  }

  async function saveLocation(e: FormEvent) {
    e.preventDefault();
    if (lat === '' || lon === '') {
      setError('Enter latitude and longitude.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch('/api/weather/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: Number(lat), lon: Number(lon), label }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'Could not save.');
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className={w.wrap}>
      <div className={w.row}>
        {hasLocation && (
          <button className="btn small" disabled={busy} onClick={refresh}>
            {busy ? 'Refreshing…' : '↻ Refresh forecast'}
          </button>
        )}
        {isManager && (
          <button className="btn small ghost" onClick={() => setOpen((v) => !v)}>
            {hasLocation ? 'Change location' : 'Set location'}
          </button>
        )}
        {isManager && hasLocation && (
          <button className="btn small ghost" onClick={() => setAlertsOpen((v) => !v)}>
            Alert settings
          </button>
        )}
      </div>
      {error && <p className="error-text">{error}</p>}

      {alertsOpen && isManager && (
        <div className={`card ${w.card}`}>
          <div className="notice">
            People get a notification when the forecast crosses these: frost to those who see the land (when something
            is growing), heat to those who see the animals, heavy rain and high fire danger to whoever manages the work.
          </div>
          <form onSubmit={saveThresholds}>
            <div className="field">
              <label>Warn of frost at or below (°F)</label>
              <input type="number" step="1" value={th.frostF} onChange={(e) => setTh({ ...th, frostF: e.target.value })} />
            </div>
            <div className="field">
              <label>Warn of heat at or above (°F)</label>
              <input type="number" step="1" value={th.heatF} onChange={(e) => setTh({ ...th, heatF: e.target.value })} />
            </div>
            <div className="field">
              <label>Warn of rain at or above (inches in a day)</label>
              <input type="number" step="0.1" min="0.1" value={th.rainIn} onChange={(e) => setTh({ ...th, rainIn: e.target.value })} />
            </div>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setAlertsOpen(false)}>Cancel</button>
              <button type="submit" disabled={busy} className="btn primary">{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}

      {open && isManager && (
        <div className={`card ${w.card}`}>
          <div className="notice">
            Used only to fetch your local forecast from open-meteo.com (no API key, no account).
          </div>
          <button type="button" className={`btn block ${w.locate}`} onClick={useMyLocation}>
            📍 Use my current location
          </button>
          <form onSubmit={saveLocation}>
            <div className="field">
              <label>Label (optional)</label>
              <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Home farm" />
            </div>
            <div className="field">
              <label>Latitude</label>
              <input type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="e.g. 44.56" />
            </div>
            <div className="field">
              <label>Longitude</label>
              <input type="number" step="any" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="e.g. -123.26" />
            </div>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" disabled={busy} className="btn primary">
                {busy ? 'Saving…' : 'Save & fetch'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
