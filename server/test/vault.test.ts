/** The vault's rules: encryption, who sees what, who changes what, and the log. */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { useTestDb, makeUser } from './db';
import { decrypt, encrypt } from '@/lib/vault/crypto';
import {
  accessLogFor, createEntry, deleteEntry, listVault, revealEntry, saveGroup, updateEntry,
} from '@/lib/data/vault';

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
    await createEntry(manager, { title: 'Max private', secret: 's1', visibility: 'private' });
    await createEntry(manager, { title: 'Shop login', username: 'shop@farm', secret: 's2', visibility: 'groups', groupIds: [family] });
    await createEntry(crew, { title: 'Barn wifi', secret: 's3', visibility: 'farm' });
    await createEntry(manager, { title: 'Gate code', secret: '4321', visibility: 'everyone' });

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
    await expect(createEntry(renter, { title: 'x', secret: 'y', visibility: 'private' })).rejects.toThrow(/not add/);
    await expect(createEntry(guest, { title: 'x', secret: 'y', visibility: 'private' })).rejects.toThrow(/not add/);
  });

  it('only the owner edits; the owner or an admin deletes', async () => {
    const id = await createEntry(crew, { title: 'Tractor PIN', secret: '1111', visibility: 'farm' });
    await expect(updateEntry(manager, id, { title: 'hijack', visibility: 'everyone' })).rejects.toThrow(/Only the person/);
    await updateEntry(crew, id, { title: 'Tractor PIN', visibility: 'private' }); // blank secret keeps it
    expect((await revealEntry(crew, id)).secret).toBe('1111');
    await expect(deleteEntry(crew2, id)).rejects.toThrow(/Only the person/);
    await deleteEntry(admin, id); // admin can remove it without being able to open it
    expect(await titles(crew)).not.toContain('Tractor PIN');
  });

  it('requires a group when sharing with groups, and only admins manage groups', async () => {
    await expect(createEntry(crew, { title: 'x', secret: 'y', visibility: 'groups', groupIds: [] })).rejects.toThrow(/at least one group/);
    await expect(saveGroup(manager, { name: 'Nope', memberIds: [] })).rejects.toThrow(/admins/);
  });
});
