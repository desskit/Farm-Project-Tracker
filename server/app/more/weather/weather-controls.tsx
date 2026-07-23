'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function WeatherControls({
  isManager,
  hasLocation,
  current,
}: {
  isManager: boolean;
  hasLocation: boolean;
  current: { lat: number | null; lon: number | null; label: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lat, setLat] = useState(current.lat != null ? String(current.lat) : '');
  const [lon, setLon] = useState(current.lon != null ? String(current.lon) : '');
  const [label, setLabel] = useState(current.label || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div style={{ marginTop: 12 }}>
      <div className="row-actions" style={{ flexWrap: 'wrap' }}>
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
      </div>
      {error && <p className="error-text">{error}</p>}

      {open && isManager && (
        <div className="card" style={{ marginTop: 10 }}>
          <div className="notice">
            Used only to fetch your local forecast from open-meteo.com (no API key, no account).
          </div>
          <button type="button" className="btn block" style={{ marginBottom: 10 }} onClick={useMyLocation}>
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
