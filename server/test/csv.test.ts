/** CSV exports: right columns, defused formulas, gated by permission. */
import { describe, expect, it } from 'vitest';
import { useTestDb, makeUser } from './db';
import { csvCell, datasetCsv, datasetsFor, DATASETS } from '@/lib/data/csv';
import { todayISO, addDays } from '@/lib/domain/dates';

const { db, schema } = await useTestDb();
const T = todayISO();

describe('csv export', () => {
  it('escapes and defuses cells', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(null)).toBe('');
  });

  it('every dataset runs, and rent shows the unit', async () => {
    const r = await makeUser('renter', 'Pat');
    await db.insert(schema.rentalUnits).values({ id: 'ru-csv', name: 'Cabin' });
    await db.insert(schema.leases).values({ id: 'ls-csv', unitId: 'ru-csv', startDate: T, rent: 700 });
    await db.insert(schema.rentCharges).values({ id: 'rc-csv', userId: r.id, leaseId: 'ls-csv', month: T.slice(0, 7), amount: 700, dueDate: T });
    for (const k of Object.keys(DATASETS) as (keyof typeof DATASETS)[]) {
      const csv = await datasetCsv(k, addDays(T, -30), T);
      expect(csv.startsWith('﻿')).toBe(true);
    }
    const rent = (await datasetCsv('rent', addDays(T, -1), T)).split('\r\n');
    expect(rent[0]).toContain('Unit');
    expect(rent[1]).toContain('Cabin');
    expect(rent[1]).toContain('Pat');
  });

  it('offers each person only what they can already see', async () => {
    const keys = async (role: Parameters<typeof makeUser>[0]) => datasetsFor(await makeUser(role)).map((d) => d.key);
    expect(await keys('renter')).toEqual([]);
    expect(await keys('worker')).not.toContain('rent');
    expect(await keys('worker')).toContain('production');
    expect(await keys('manager')).toContain('rent');
  });
});
