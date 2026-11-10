/** Phase 4: sales, buying supplies, profit by enterprise, tax pack, deposits. */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createWriteStream, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { eq } from 'drizzle-orm';
import { useTestDb, makeUser } from './db';
import { addSale, deleteSale, listSales, setSalePaid } from '@/lib/data/sales';
import { adjustStock, shoppingList } from '@/lib/data/inventory';
import { createGroup, deleteEvent, logEvent, logProduction } from '@/lib/data/livestock';
import { addChore, completeChore } from '@/lib/data/chores';
import { profitReport } from '@/lib/data/profit';
import { taxPack } from '@/lib/data/tax-pack';
import { tarGzEntries } from '@/lib/data/tar';
import { addDepositEntry, createLease, createRentalUnit, depositLedger } from '@/lib/data/rentals';
import { todayISO } from '@/lib/domain/dates';

const { db, schema } = await useTestDb();
const T = todayISO();
const Y = Number(T.slice(0, 4));

describe('sales', () => {
  it('are private to whoever recorded them unless you see finances; animal sales flow in', async () => {
    const mgr = await makeUser('manager');
    const fam = await makeUser('family');
    const crew = await makeUser('worker');
    await expect(addSale(crew, { kind: 'eggs', amount: 5 })).rejects.toThrow(/can’t record sales/);
    const s1 = await addSale(fam, { kind: 'eggs', item: '3 dozen', qty: 3, unit: 'dozen', amount: 15, buyer: 'Neighbour', paid: false });
    await addSale(mgr, { kind: 'hay', amount: 200 });
    expect((await listSales(fam)).map((s) => s.amount)).toEqual([15]);
    expect(await listSales(mgr)).toHaveLength(2);
    expect((await listSales(mgr, { owedOnly: true })).map((s) => s.id)).toEqual([s1]);
    await setSalePaid(fam, s1, true);
    expect(await listSales(mgr, { owedOnly: true })).toHaveLength(0);

    const herd = await createGroup(mgr, { name: 'Wethers', species: 'goat', headCount: 3 });
    const ev = await logEvent(mgr, herd, { type: 'sale', count: 2, cost: 300 });
    const [row] = (await listSales(mgr)).filter((s) => s.animalEventId === ev);
    expect([row.kind, row.amount, row.groupId, row.qty]).toEqual(['animal', 300, herd, 2]);
    await expect(deleteSale(mgr, row.id)).rejects.toThrow(/animal sale/);
    await deleteEvent(mgr, ev);
    expect((await listSales(mgr)).some((s) => s.animalEventId === ev)).toBe(false);
  });
});

describe('buying supplies', () => {
  it('averages the cost per unit and builds a shopping list', async () => {
    const mgr = await makeUser('manager');
    await db.insert(schema.inventory).values({ id: 'buy', name: 'Layer pellets', unit: 'bags', qty: 2, reorderAt: 3, unitCost: 20 });
    await adjustStock(mgr, 'buy', 2, 'restock', { cost: 60, vendor: 'Co-op' }); // 2 @ $20 + 2 @ $30
    const [it] = await db.select().from(schema.inventory).where(eq(schema.inventory.id, 'buy'));
    expect([it.qty, it.unitCost]).toEqual([4, 25]);
    await adjustStock(mgr, 'buy', -2, 'fed');
    const line = (await shoppingList()).find((l) => l.id === 'buy')!;
    expect([line.lastVendor, line.lastUnitPrice]).toEqual(['Co-op', 30]);
    expect(line.buy).toBeGreaterThan(0);
  });
});

describe('profit by enterprise', () => {
  it('charges feed to the flock that ate it and works out cost per dozen', async () => {
    const mgr = await makeUser('manager');
    await db.insert(schema.inventory).values({ id: 'pf', name: 'Feed', unit: 'lb', qty: 100, unitCost: 0.5 });
    const flock = await createGroup(mgr, { name: 'Profit hens', species: 'chicken', headCount: 10 });
    const c = await addChore(mgr, { name: 'Feed profit hens', schedule: { type: 'daily' }, link: { type: 'animal_group', id: flock }, supplies: [{ inventoryId: 'pf', qty: 20 }], assigneeIds: [mgr.id] });
    await completeChore(mgr, c.id); // $10 of feed
    await logEvent(mgr, flock, { type: 'treatment', cost: 14, notes: 'vet' });
    await logProduction(mgr, flock, { kind: 'eggs', amount: 48 });
    await addSale(mgr, { kind: 'eggs', amount: 40, groupId: flock });
    const r = (await profitReport(`${Y}-01-01`, T)).rows.find((x) => x.key === `g:${flock}`)!;
    expect([r.income, r.costs, r.net]).toEqual([40, 24, 16]);
    expect(r.lines.map((l) => [l.label, l.amount])).toEqual([['Vet, treatments & purchases', 14], ['Feed & supplies used', 10]]);
    expect(r.unit).toBe('$6.00 per dozen eggs (48 eggs)');
  });
});

describe('tax pack', () => {
  it('lists income and paid expenses and opens with tar', async () => {
    const pack = await taxPack(Y);
    expect(pack.income).toBeGreaterThan(0);
    const expenses = String(pack.entries.find((e) => e.name === 'expenses.csv')!.content);
    expect(expenses).toContain('Supplies bought');
    expect(expenses).toContain('Co-op');
    expect(expenses).not.toContain('Feed profit hens'); // supplies used aren't a paid expense
    const dir = mkdtempSync(path.join(tmpdir(), 'fpt-tax-'));
    try {
      const out = path.join(dir, 't.tar.gz');
      await pipeline(tarGzEntries(pack.entries, `farm-records-${Y}`), createWriteStream(out));
      mkdirSync(path.join(dir, 'x'));
      execFileSync('tar', ['-xzf', out, '-C', path.join(dir, 'x')]);
      expect(readFileSync(path.join(dir, 'x', `farm-records-${Y}`, 'income.csv'), 'utf8')).toContain('Sales');
      expect(readFileSync(path.join(dir, 'x', `farm-records-${Y}`, 'README.txt'), 'utf8')).toContain(`Farm records for ${Y}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('deposits', () => {
  it('start from the lease, take deductions with a reason, and never go below zero', async () => {
    const mgr = await makeUser('manager');
    const r = await makeUser('renter');
    const unit = await createRentalUnit(mgr, { name: 'Deposit flat' });
    const lease = await createLease(mgr, unit, { tenantIds: [r.id], startDate: T, rent: 900, deposit: 900 });
    expect((await depositLedger(lease)).balance).toBe(900);
    await expect(addDepositEntry(mgr, lease, { kind: 'deduction', amount: 100 })).rejects.toThrow(/what the deduction is for/);
    await addDepositEntry(mgr, lease, { kind: 'deduction', amount: 120, reason: 'Move-out inspection: Kitchen' });
    await expect(addDepositEntry(mgr, lease, { kind: 'refund', amount: 800 })).rejects.toThrow(/Only \$780\.00/);
    await addDepositEntry(mgr, lease, { kind: 'refund', amount: 780 });
    expect((await depositLedger(lease)).balance).toBe(0);
  });
});
