'use client';
import { useState } from 'react';
import { Copy, Printer } from 'lucide-react';
import type { ShoppingLine } from '@/lib/data/inventory';
import { Button, Card, ListRow } from '@/components/ui';
import s from '../../../farm/animals/animals.module.css';

export function ShoppingList({ lines }: { lines: ShoppingLine[] }) {
  const [copied, setCopied] = useState(false);
  const vendors = [...new Set(lines.map((l) => l.lastVendor ?? 'Anywhere'))];
  const total = lines.reduce((n, l) => n + (l.estCost ?? 0), 0);
  const text = vendors
    .map((v) => `${v}:\n${lines.filter((l) => (l.lastVendor ?? 'Anywhere') === v).map((l) => `  [ ] ${l.buy || '?'} ${l.unit} ${l.name}`).join('\n')}`)
    .join('\n\n');

  return (
    <>
      <div className={`${s.actions} no-print`}>
        <Button variant="secondary" icon={<Copy />} onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true), () => setCopied(false))}>{copied ? 'Copied' : 'Copy as text'}</Button>
        <Button variant="secondary" icon={<Printer />} onClick={() => window.print()}>Print</Button>
      </div>
      {vendors.map((v) => (
        <Card key={v} title={v} flush>
          {lines.filter((l) => (l.lastVendor ?? 'Anywhere') === v).map((l) => (
            <ListRow
              key={l.id}
              href={`/more/supplies/${l.id}`}
              title={`${l.buy ? `${l.buy} ${l.unit} ` : ''}${l.name}`}
              meta={[
                `${l.qty} ${l.unit} on hand`,
                l.daysLeft != null ? `about ${l.daysLeft} day${l.daysLeft === 1 ? '' : 's'} left` : '',
                l.lastUnitPrice != null ? `$${l.lastUnitPrice.toFixed(2)}/${l.unit} last time` : '',
                l.estCost ? `≈ $${l.estCost.toFixed(2)}` : '',
              ].filter(Boolean).join(' · ')}
            />
          ))}
        </Card>
      ))}
      {total > 0 && <p className={s.muted}>About ${total.toFixed(2)} in all, at last prices. After buying, open the supply and restock it with what you paid.</p>}
    </>
  );
}
