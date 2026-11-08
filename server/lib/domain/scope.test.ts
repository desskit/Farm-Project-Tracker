import { describe, expect, it } from 'vitest';
import { canSeeWork } from './scope';

const item = (o: Partial<Parameters<typeof canSeeWork>[1]> = {}) => ({ open: false, assigneeIds: [] as string[], ...o });

describe('canSeeWork', () => {
  it('lets managers and family see everything', () => {
    expect(canSeeWork({ id: 'm', role: 'manager' }, item())).toBe(true);
    expect(canSeeWork({ id: 'f', role: 'family' }, item())).toBe(true);
  });
  it('shows crew their own and open work only', () => {
    const crew = { id: 'c', role: 'worker' as const };
    expect(canSeeWork(crew, item())).toBe(false);
    expect(canSeeWork(crew, item({ assigneeIds: ['c'] }))).toBe(true);
    expect(canSeeWork(crew, item({ open: true }))).toBe(true);
    expect(canSeeWork(crew, item({ sentBack: { worker: 'c' } }))).toBe(true);
    expect(canSeeWork({ ...crew, caps: ['work.viewAll'] }, item())).toBe(true);
  });
  it('shows guests only what they are on', () => {
    const guest = { id: 'g', role: 'guest' as const };
    expect(canSeeWork(guest, item({ open: true }))).toBe(false);
    expect(canSeeWork(guest, item({ assigneeIds: ['g'] }))).toBe(true);
  });
});
