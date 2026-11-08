/** Renters and guests stay out of team views; live updates follow capabilities. */
import { describe, expect, it } from 'vitest';
import { useTestDb, makeUser } from './db';
import { leaderboard } from '@/lib/data/leaderboard';
import { teamOverview } from '@/lib/data/team';
import { CHANGE_AUDIENCE } from '@/lib/realtime/bus';
import { can, canBeAssigned } from '@/lib/domain/permissions';

await useTestDb();

describe('audiences', () => {
  it('leaderboard and team list the farm team only', async () => {
    const crew = await makeUser('worker', 'Casey');
    const renter = await makeUser('renter', 'Rita');
    const guest = await makeUser('guest', 'Gus');
    const board = (await leaderboard('all')).map((r) => r.userId);
    expect(board).toContain(crew.id);
    expect(board).not.toContain(renter.id);
    expect(board).not.toContain(guest.id);
    const team = (await teamOverview()).people.map((p) => p.userId);
    expect(team).toContain(crew.id);
    expect(team).not.toContain(renter.id);
    expect(team).not.toContain(guest.id);
  });

  it('renters can be billed but never assigned work', () => {
    expect(canBeAssigned('renter')).toBe(false);
    expect(canBeAssigned('guest')).toBe(true);
  });

  it('renters only hear about rent changes', () => {
    const renter = { role: 'renter' as const };
    for (const [resource, cap] of Object.entries(CHANGE_AUDIENCE)) expect(can(renter, cap), resource).toBe(false);
    expect(CHANGE_AUDIENCE.rent).toBeUndefined();
  });
});
