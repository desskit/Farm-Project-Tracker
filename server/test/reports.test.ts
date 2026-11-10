/** Phase 6: year in review, record books, what's new, setup checklist, webhooks. */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { useTestDb, makeUser } from './db';
import { medicineBook, sprayRecord, yearReview } from '@/lib/data/review';
import { createGroup, logEvent, logProduction } from '@/lib/data/livestock';
import { addSale } from '@/lib/data/sales';
import { dismissSetup, markNewsSeen, newsForUser, setupChecklist } from '@/lib/data/setup';
import { addWebhook, listWebhooks, testWebhook, updateWebhook } from '@/lib/data/webhooks';
import { deliver, emitEvent, signBody } from '@/lib/notify/webhooks';
import { todayISO } from '@/lib/domain/dates';

const { db, schema } = await useTestDb();
const T = todayISO();
const Y = Number(T.slice(0, 4));

describe('year in review', () => {
  it('shows each section only to people who may see it', async () => {
    const mgr = await makeUser('manager');
    const crew = await makeUser('worker');
    await db.insert(schema.inventory).values({ id: 'inv-r', name: 'Wormer', unit: 'ml', qty: 50, meatWithdrawalDays: 7 });
    const flock = await createGroup(mgr, { name: 'Layers', species: 'chicken', headCount: 10 });
    await logProduction(mgr, flock, { kind: 'eggs', amount: 8 });
    await logEvent(mgr, flock, { type: 'birth', count: 4 });
    await logEvent(mgr, flock, { type: 'treatment', inventoryId: 'inv-r', qtyUsed: 5, notes: 'whole flock' });
    await addSale(mgr, { kind: 'eggs', amount: 20 });

    const full = await yearReview(mgr, Y);
    expect(full.production?.[0]).toMatchObject({ kind: 'eggs', total: 8 });
    expect(full.production?.[0].months[Number(T.slice(5, 7)) - 1]).toBe(8);
    expect(full.herd?.births).toBe(4);
    expect(full.money?.income).toBe(20);

    const limited = await yearReview(crew, Y);
    expect(limited.money).toBeNull();
    expect(limited.hours).toEqual([]);
    expect((await yearReview(mgr, Y - 1)).production).toEqual([]);

    const book = await medicineBook(mgr, Y);
    expect(book).toHaveLength(1);
    expect(book[0]).toMatchObject({ group: 'Layers', animal: 'Whole group', product: 'Wormer', qty: '5 ml' });
    expect(book[0].meatUntil).toBeTruthy();
    expect(await sprayRecord(mgr, Y)).toEqual([]);
    const renter = await makeUser('renter');
    await expect(medicineBook(renter, Y)).rejects.toThrow();
    await expect(yearReview(renter, Y)).rejects.toThrow();
  });
});

describe("what's new and setup", () => {
  it('is dismissed per person; the checklist ticks from the data', async () => {
    const admin = await makeUser('admin');
    const crew = await makeUser('worker');
    expect(await newsForUser(crew)).not.toBeNull();
    await markNewsSeen(crew);
    expect(await newsForUser(crew)).toBeNull();
    expect(await newsForUser(admin)).not.toBeNull();

    expect(await setupChecklist(crew)).toBeNull();
    const steps = (await setupChecklist(admin))!;
    expect(steps.find((s) => s.key === 'people')?.done).toBe(true);
    expect(steps.find((s) => s.key === 'animals')?.done).toBe(true);
    expect(steps.find((s) => s.key === 'frost')?.done).toBe(false);
    await expect(dismissSetup(crew)).rejects.toThrow();
    await dismissSetup(admin);
    expect(await setupChecklist(admin)).toBeNull();
  });
});

describe('webhooks', () => {
  it('are admin-only, https-only and never reach the local network', async () => {
    const admin = await makeUser('admin');
    const mgr = await makeUser('manager');
    await expect(addWebhook(mgr, { name: 'x', url: 'https://example.com/h' })).rejects.toThrow(/admin/);
    await expect(listWebhooks(mgr)).rejects.toThrow(/admin/);
    await expect(addWebhook(admin, { name: 'Barn', url: 'http://example.com/h' })).rejects.toThrow(/https/);
    await expect(addWebhook(admin, { name: 'Barn', url: 'https://192.168.1.20/h' })).rejects.toThrow(/local network/);

    const id = await addWebhook(admin, { name: 'Barn', url: 'https://example.com/h', events: ['stock.low', 'made.up'] });
    const [h] = await listWebhooks(admin);
    expect(h.events).toEqual(['stock.low']);
    expect(h.secret).toHaveLength(48);
    await expect(updateWebhook(admin, id, { url: 'https://localhost/h' })).rejects.toThrow(/local/);

    // Even a row that slipped in some other way is refused at send time, without touching the network.
    await db.update(schema.webhooks).set({ url: 'https://127.0.0.1/h' }).where(eq(schema.webhooks.id, id));
    expect(await testWebhook(admin, id)).toMatch(/local network/);
    expect((await listWebhooks(admin))[0].lastStatus).toMatch(/local network/);
    expect(await deliver({ url: 'https://[::1]/h', secret: 's' }, 'test', { title: 't', body: 'b' })).toMatch(/local network/);

    // Emitting never throws, whatever the hooks do.
    await updateWebhook(admin, id, { url: 'https://example.com/h', active: false });
    await expect(emitEvent('stock.low', { title: 'Running low', body: 'x' })).resolves.toBeUndefined();
    expect(signBody('secret', '{"a":1}')).toMatch(/^sha256=[0-9a-f]{64}$/);
  });
});
