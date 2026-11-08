'use client';
/**
 * Log supplies used in two taps: pick the item (recently used first), tap
 * "Use". The amount defaults to 1 and can be changed with the stepper. Works
 * offline: the item list is cached on the device, and the change queues.
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Search } from 'lucide-react';
import { Banner, Button, Input, NumberStepper, Stack } from '@/components/ui';
import { useMutation } from '@/lib/client/mutate';
import s from './patterns.module.css';

type Item = { id: string; name: string; unit: string; qty: number; reorderAt: number | null };

const LIST_KEY = 'fpt-supplies-cache';
const RECENT_KEY = 'fpt-supplies-recent';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or full — the list just won't be remembered */
  }
}

export function SupplyQuickLog({ onDone }: { onDone: () => void }) {
  const [items, setItems] = useState<Item[]>(() => read<Item[]>(LIST_KEY, []));
  const [recent, setRecent] = useState<string[]>(() => read<string[]>(RECENT_KEY, []));
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Item | null>(null);
  const [amount, setAmount] = useState(1);
  const [offlineList, setOfflineList] = useState(false);
  const m = useMutation();

  useEffect(() => {
    fetch('/api/inventory', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { inventory: Item[] }) => {
        setItems(d.inventory);
        write(LIST_KEY, d.inventory.map(({ id, name, unit, qty, reorderAt }) => ({ id, name, unit, qty, reorderAt })));
        setOfflineList(false);
      })
      .catch(() => setOfflineList(true));
  }, []);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rank = (i: Item) => {
      const r = recent.indexOf(i.id);
      return r === -1 ? 999 : r;
    };
    return items
      .filter((i) => !needle || i.name.toLowerCase().includes(needle))
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
      .slice(0, 30);
  }, [items, q, recent]);

  async function use() {
    if (!picked || !(amount > 0)) return;
    const ok = await m.run({
      url: `/api/inventory/${picked.id}/adjust`,
      body: { delta: -amount, reason: 'Used' },
      label: `Used ${amount} ${picked.unit} ${picked.name}`,
    });
    if (ok) {
      const next = [picked.id, ...recent.filter((id) => id !== picked.id)].slice(0, 8);
      setRecent(next);
      write(RECENT_KEY, next);
      onDone();
    }
  }

  if (picked) {
    return (
      <Stack>
        <button type="button" className={s.back} onClick={() => setPicked(null)}>
          <ChevronLeft aria-hidden /> All supplies
        </button>
        <div>
          <strong className={s.pickName}>{picked.name}</strong>
          <div className={s.pickMeta}>{picked.qty} {picked.unit} on hand</div>
        </div>
        <NumberStepper label="Amount used" value={amount} onChange={setAmount} min={0} unit={picked.unit} />
        {m.error && <Banner tone="danger">{m.error}</Banner>}
        <Button block onClick={use} loading={m.busy} disabled={!(amount > 0)}>
          Use {amount} {picked.unit}
        </Button>
      </Stack>
    );
  }

  return (
    <Stack>
      <label className={s.search}>
        <Search aria-hidden />
        <Input placeholder="Find a supply" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a supply" />
      </label>
      {offlineList && items.length > 0 && <Banner tone="info">Offline — showing the list from last time.</Banner>}
      {!items.length && <p className={s.pickMeta}>{offlineList ? 'Can’t load supplies while offline.' : 'Loading…'}</p>}
      <div className={s.pickList}>
        {shown.map((i) => {
          const low = i.reorderAt != null && i.reorderAt > 0 && i.qty <= i.reorderAt;
          return (
            <button
              key={i.id}
              type="button"
              className={s.pickItem}
              onClick={() => {
                setPicked(i);
                setAmount(1);
              }}
            >
              <span>{i.name}</span>
              <span className={low ? s.low : s.pickMeta}>
                {i.qty} {i.unit}
              </span>
            </button>
          );
        })}
      </div>
    </Stack>
  );
}
