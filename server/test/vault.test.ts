/** The vault's rules: encryption, who sees what, who changes what, and the log. */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { useTestDb, makeUser } from './db';
import { decrypt, encrypt } from '@/lib/vault/crypto';
import {
  accessLogFor, createEntry, deleteEntry, deleteGroup, listVault, revealEntry, saveGroup, updateEntry,
} from '@/lib/data/vault';
import { addDays, todayISO } from '@/lib/domain/dates';

const { db, schema } = await useTestDb();

const admin = await makeUser('admin', 'Ada');
const manager = await makeUser('manager', 'Max');
const crew = await makeUser('worker', 'Cass');
const crew2 = await makeUser('worker', 'Cole');
const renter = await makeUser('renter', 'Rae');
const guest = await makeUser('guest', 'Gil');

const titles = async (u: typeof admin) => (await listVault(u)).map((e) => e.title).sort();

describe('vault crypto', () => {
  it('round-trips, never repeats ciphertext, and rejects tampering', () => {
    const a = encrypt('hunter2');
    const b = encrypt('hunter2');
    expect(a).not.toBe(b);
    expect(a).not.toContain('hunter2');
    expect(decrypt(a)).toBe('hunter2');
    const raw = Buffer.from(a.slice(3), 'base64');
    raw[raw.length - 1] ^= 1;
    expect(() => decrypt(`v1:${raw.toString('base64')}`)).toThrow();
    expect(encrypt('')).toBe('');
  });
});

describe('vault visibility', () => {
  it('follows each owner’s choice — and private means private, even from admins', async () => {
    const family = await saveGroup(admin, { name: 'Shop', memberIds: [crew2.id] });
    await createEntry(manager, { title: 'Max private', secret: 's1', shares: [] });
    await createEntry(manager, { title: 'Shop login', username: 'shop@farm', secret: 's2', shares: [{ type: 'group', target: family }] });
    await createEntry(crew, { title: 'Barn wifi', secret: 's3', shares: [{ type: 'farm' }] });
    await createEntry(manager, { title: 'Gate code', secret: '4321', shares: [{ type: 'everyone' }] });

    expect(await titles(manager)).toEqual(['Barn wifi', 'Gate code', 'Max private', 'Shop login']);
    expect(await titles(admin)).toEqual(['Barn wifi', 'Gate code']); // not in Shop, can't see private
    expect(await titles(crew2)).toEqual(['Barn wifi', 'Gate code', 'Shop login']);
    expect(await titles(crew)).toEqual(['Barn wifi', 'Gate code']);
    expect(await titles(renter)).toEqual(['Gate code']); // renters only get "everyone"
    expect(await titles(guest)).toEqual(['Barn wifi', 'Gate code']); // guests are on the farm

    const shop = (await listVault(crew2)).find((e) => e.title === 'Shop login')!;
    expect(shop.username).toBe('shop@farm');
    const priv = (await listVault(manager)).find((e) => e.title === 'Max private')!;
    await expect(revealEntry(admin, priv.id)).rejects.toThrow(/No such entry/);
  });

  it('stores secrets encrypted and logs every reveal', async () => {
    const gate = (await listVault(renter)).find((e) => e.title === 'Gate code')!;
    const row = (await db.select().from(schema.vaultEntries).where(eq(schema.vaultEntries.id, gate.id)))[0];
    expect(row.secretEnc).not.toContain('4321');
    expect((await revealEntry(renter, gate.id)).secret).toBe('4321');
    const log = await accessLogFor(manager, gate.id);
    expect(log[0]).toMatchObject({ who: 'Rae', action: 'reveal' });
    await expect(accessLogFor(renter, gate.id)).rejects.toThrow(); // only owner/admin see the log
  });

  it('hides everything while an admin previews someone', async () => {
    expect(await listVault({ ...crew, previewBy: { id: admin.id, name: 'Ada', until: Date.now() + 1000 } })).toEqual([]);
  });
});

describe('who can change what', () => {
  it('renters and guests can view but not add', async () => {
    await expect(createEntry(renter, { title: 'x', secret: 'y', shares: [] })).rejects.toThrow(/not add/);
    await expect(createEntry(guest, { title: 'x', secret: 'y', shares: [] })).rejects.toThrow(/not add/);
  });

  it('only the owner (or someone they let edit) edits; the owner or an admin deletes', async () => {
    const id = await createEntry(crew, { title: 'Tractor PIN', secret: '1111', shares: [{ type: 'farm' }] });
    await expect(updateEntry(manager, id, { title: 'hijack', shares: [{ type: 'everyone' }] })).rejects.toThrow(/Only the person/);
    await updateEntry(crew, id, { title: 'Tractor PIN', shares: [] }); // blank secret keeps it
    expect((await revealEntry(crew, id)).secret).toBe('1111');
    await expect(deleteEntry(crew2, id)).rejects.toThrow(/Only the person/);
    await deleteEntry(admin, id); // admin can remove it without being able to open it
    expect(await titles(crew)).not.toContain('Tractor PIN');
  });

  it('refuses a group that doesn’t exist, and only admins manage groups', async () => {
    await expect(createEntry(crew, { title: 'x', secret: 'y', shares: [{ type: 'group', target: 'vg-gone' }] })).rejects.toThrow(/no longer exists/);
    await expect(saveGroup(manager, { name: 'Nope', memberIds: [] })).rejects.toThrow(/admins/);
  });
});

describe('granular sharing', () => {
  const T = todayISO();
  const find = async (u: typeof admin, title: string) => (await listVault(u)).find((e) => e.title === title);

  it('shares with chosen people, view-only or able to edit', async () => {
    const id = await createEntry(manager, {
      title: 'Feed store login', secret: 'f1',
      shares: [{ type: 'user', target: crew.id, canEdit: true }, { type: 'user', target: crew2.id }],
    });
    expect((await find(crew, 'Feed store login'))?.access).toBe('edit');
    expect((await find(crew2, 'Feed store login'))?.access).toBe('view');
    expect(await find(admin, 'Feed store login')).toBeUndefined();

    // An editor changes the password, but can't change who it's shared with.
    await updateEntry(crew, id, { title: 'Feed store login', secret: 'f2', shares: [{ type: 'everyone' }] });
    expect((await revealEntry(crew2, id)).secret).toBe('f2');
    expect(await find(renter, 'Feed store login')).toBeUndefined();
    await expect(updateEntry(crew2, id, { title: 'nope' })).rejects.toThrow(/Only the person/);
    expect((await accessLogFor(manager, id)).some((l) => l.who === 'Cass' && l.action === 'update')).toBe(true);

    // Only the owner sees the share list; others see their own access.
    expect((await find(manager, 'Feed store login'))?.shares.map((x) => x.label).sort()).toEqual(['Cass', 'Cole']);
    expect((await find(crew, 'Feed store login'))?.shares).toEqual([]);
  });

  it('shares with everyone in a role', async () => {
    await createEntry(manager, { title: 'Crew radio', secret: 'r1', shares: [{ type: 'role', target: 'worker' }] });
    expect(await find(crew, 'Crew radio')).toBeDefined();
    expect(await find(crew2, 'Crew radio')).toBeDefined();
    expect(await find(admin, 'Crew radio')).toBeUndefined();
    expect(await find(renter, 'Crew radio')).toBeUndefined();
    await expect(createEntry(manager, { title: 'x', secret: 'y', shares: [{ type: 'role', target: 'pirate' }] })).rejects.toThrow(/role/);
  });

  it('stops sharing after the last day', async () => {
    const id = await createEntry(manager, { title: 'Contractor gate', secret: '9999', shares: [{ type: 'user', target: guest.id, expiresOn: T }] });
    const mine = await find(guest, 'Contractor gate');
    expect(mine?.until).toBe(T);
    // Move the end date into the past: gone for them, still the owner's.
    await updateEntry(manager, id, { title: 'Contractor gate', shares: [{ type: 'user', target: guest.id, expiresOn: addDays(T, -1) }] });
    expect(await find(guest, 'Contractor gate')).toBeUndefined();
    await expect(revealEntry(guest, id)).rejects.toThrow(/No such entry/);
    const owner = await find(manager, 'Contractor gate');
    expect(owner?.shares[0].expired).toBe(true);
    expect(owner?.summary).toBe('Only me (shares ended)');
  });

  it('never lets edit ride on a whole-farm or everyone share, and refuses people who can’t use passwords', async () => {
    const id = await createEntry(manager, { title: 'Office wifi', secret: 'w', shares: [{ type: 'farm', canEdit: true }] });
    expect((await find(crew, 'Office wifi'))?.access).toBe('view');
    await expect(updateEntry(crew, id, { title: 'hijack' })).rejects.toThrow(/Only the person/);
    await expect(createEntry(manager, { title: 'x', secret: 'y', shares: [{ type: 'user', target: 'u_nobody' }] })).rejects.toThrow(/can’t use passwords/);
  });

  it('drops a deleted group’s share lines, making those entries private again', async () => {
    const g = await saveGroup(admin, { name: 'Temp', memberIds: [crew.id] });
    const id = await createEntry(manager, { title: 'Temp login', secret: 't', shares: [{ type: 'group', target: g }] });
    expect(await find(crew, 'Temp login')).toBeDefined();
    await deleteGroup(admin, g);
    expect(await find(crew, 'Temp login')).toBeUndefined();
    expect((await db.select().from(schema.vaultShares).where(eq(schema.vaultShares.entryId, id)))).toHaveLength(0);
  });
});
