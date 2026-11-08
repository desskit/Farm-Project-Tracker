/**
 * Who can do what — the single source of truth.
 *
 * Code never asks "is this a manager?"; it asks `can(user, 'work.manage')`.
 * Each role gets a default set of capabilities from MATRIX below, and an
 * admin can switch some of them per person (the TOGGLEABLE ones). Client-safe:
 * the nav and buttons use it too.
 *
 * Stored role values never change meaning: 'worker' is shown as "Crew".
 */

export const ROLES = ['admin', 'manager', 'family', 'worker', 'guest', 'renter'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  family: 'Family',
  worker: 'Crew',
  guest: 'Guest',
  renter: 'Renter',
};

export const ROLE_BLURB: Record<Role, string> = {
  admin: 'Everything, including people, backups and server updates.',
  manager: 'Runs the farm: plans and assigns work, supplies, money.',
  family: 'Sees and does everything on the farm; money and managing work are optional.',
  worker: 'Hired or seasonal help: does their own work and anything up for grabs.',
  guest: 'Volunteers and short visits: only what they’re assigned, until their access ends.',
  renter: 'Tenants: their rent, documents and requests — not the farm.',
};

export const CAPS = [
  'farm.view',
  'work.viewAll',
  'work.do',
  'work.claim',
  'work.manage',
  'supplies.use',
  'supplies.manage',
  'finance.view',
  'finance.manage',
  'requests.create',
  'requests.manage',
  'people.directory',
  'team.view',
  'people.manage',
  'system.admin',
  'ai.use',
] as const;
export type Cap = (typeof CAPS)[number];

export const CAP_LABEL: Record<Cap, string> = {
  'farm.view': 'Use the farm app',
  'work.viewAll': 'See all work, not just their own and up-for-grabs',
  'work.do': 'Complete and log their work',
  'work.claim': 'See and pick up work that’s up for grabs',
  'work.manage': 'Create, assign and edit work, assets and upkeep',
  'supplies.use': 'Log supplies used',
  'supplies.manage': 'Add and edit supplies',
  'finance.view': 'See money: rent, spending, budgets',
  'finance.manage': 'Manage rent and record expenses for others',
  'requests.create': 'Send maintenance requests',
  'requests.manage': 'Handle maintenance requests',
  'people.directory': 'See everyone’s names and contact',
  'team.view': 'See the team page and everyone’s hours',
  'people.manage': 'Invite people and change access',
  'system.admin': 'Backups, server updates and settings',
  'ai.use': 'Use AI suggestions',
};

/** true = always; 'on'/'off' = per-person switch defaulting on/off; false = never. */
type Grant = true | 'on' | 'off' | false;
type Row = [admin: Grant, manager: Grant, family: Grant, crew: Grant, guest: Grant, renter: Grant];

const MATRIX: Record<Cap, Row> = {
  //                    admin manager family  crew   guest  renter
  'farm.view':        [true, true,   true,  true,  true,  false],
  'work.viewAll':     [true, true,   true,  'off', false, false],
  'work.do':          [true, true,   true,  true,  true,  false],
  'work.claim':       [true, true,   true,  true,  false, false],
  'work.manage':      [true, true,   'on',  'off', false, false],
  'supplies.use':     [true, true,   true,  true,  'off', false],
  'supplies.manage':  [true, true,   true,  'off', false, false],
  'finance.view':     [true, true,   'off', false, false, false],
  'finance.manage':   [true, true,   false, false, false, false],
  'requests.create':  [true, true,   true,  true,  false, true],
  'requests.manage':  [true, true,   'off', false, false, false],
  'people.directory': [true, true,   true,  false, false, false],
  'team.view':        [true, true,   true,  'off', false, false],
  'people.manage':    [true, false,  false, false, false, false],
  'system.admin':     [true, false,  false, false, false, false],
  'ai.use':           [true, true,   'off', false, false, false],
};

function grant(role: Role, cap: Cap): Grant {
  return MATRIX[cap][ROLES.indexOf(role)] ?? false;
}

export function isRole(v: unknown): v is Role {
  return typeof v === 'string' && (ROLES as readonly string[]).includes(v);
}

/** Capabilities an admin may switch on or off for someone with this role. */
export function toggleable(role: Role): Cap[] {
  return CAPS.filter((c) => {
    const g = grant(role, c);
    return g === 'on' || g === 'off';
  });
}

export type CapOverride = { cap: string; allow: boolean };

/**
 * The role's defaults with this person's switches applied. Overrides for
 * anything the role can't toggle are ignored — so changing someone's role
 * can never leave behind a stray grant from the old one.
 */
export function resolveCaps(role: Role, overrides: CapOverride[] = []): Cap[] {
  const set = new Set<Cap>();
  for (const c of CAPS) {
    const g = grant(role, c);
    if (g === true || g === 'on') set.add(c);
  }
  for (const o of overrides) {
    const g = grant(role, o.cap as Cap);
    if (g !== 'on' && g !== 'off') continue;
    if (o.allow) set.add(o.cap as Cap);
    else set.delete(o.cap as Cap);
  }
  return CAPS.filter((c) => set.has(c));
}

/**
 * Anything with a role, optionally with resolved caps (a signed-in user always
 * has them). Without caps, the role's defaults apply — used for people other
 * than the viewer, e.g. picking notification recipients.
 */
export type Subject = { role: Role; caps?: readonly Cap[] };

export function can(subject: Subject | null | undefined, cap: Cap): boolean {
  if (!subject) return false;
  const caps = subject.caps ?? resolveCaps(subject.role);
  return caps.includes(cap);
}

/**
 * Part of the farm team: can be assigned work and shows on the leaderboard
 * and team page. Renters never are; guests can be assigned work but aren't
 * counted as team.
 */
export function canBeAssigned(role: Role): boolean {
  return can({ role }, 'work.do');
}
export function onTeam(role: Role): boolean {
  return can({ role }, 'work.claim');
}

/** Roles an admin can hand out today. Renter and guest wait for their screens. */
export const ASSIGNABLE_ROLES: Role[] = ['admin', 'manager', 'family', 'worker'];
