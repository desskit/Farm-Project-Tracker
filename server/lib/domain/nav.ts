/**
 * The app's navigation, from one place, driven by capabilities (never by
 * role names). Client-safe: the shell renders it, tests check it.
 */
import { can, type Subject } from './permissions';

export type IconName =
  | 'today' | 'work' | 'add' | 'farm' | 'more' | 'me' | 'chores' | 'projects' | 'upkeep'
  | 'supplies' | 'assets' | 'note' | 'timer' | 'rent' | 'docs' | 'requests';

export type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: IconName;
  /** Path prefixes that make this tab active ('/' matches only the root). */
  match: string[];
  badge?: 'overdue';
};

export function primaryNav(v: Subject): NavItem[] {
  if (!can(v, 'farm.view')) {
    // Renters get their own portal (rent, documents, requests).
    return [{ key: 'home', label: 'Home', href: '/', icon: 'today', match: ['/'] }, more(v)];
  }
  const items: NavItem[] = [
    { key: 'today', label: 'Today', href: '/', icon: 'today', match: ['/'], badge: 'overdue' },
    { key: 'work', label: 'Work', href: '/chores', icon: 'work', match: ['/chores', '/projects', '/maintenance', '/work'] },
  ];
  if (quickActions(v).length) items.push({ key: 'log', label: 'Log', href: '#quick-log', icon: 'add', match: [] });
  if (can(v, 'supplies.use') || can(v, 'work.manage')) {
    items.push({ key: 'farm', label: 'Farm', href: '/farm', icon: 'farm', match: ['/farm', '/more/supplies', '/more/assets'] });
  }
  items.push(more(v));
  return items;
}

function more(v: Subject): NavItem {
  // Crew and guests mostly need their own things there; managers get the farm's.
  const label = can(v, 'team.view') ? 'More' : 'Me';
  return { key: 'more', label, href: '/more', icon: label === 'Me' ? 'me' : 'more', match: ['/more', '/people'] };
}

/** The Work tab's sections. */
export function workSections(v: Subject): { key: string; label: string; href: string; icon: IconName }[] {
  if (!can(v, 'farm.view')) return [];
  return [
    { key: 'chores', label: 'Chores', href: '/chores', icon: 'chores' },
    { key: 'projects', label: 'Projects', href: '/projects', icon: 'projects' },
    { key: 'upkeep', label: 'Upkeep', href: '/maintenance', icon: 'upkeep' },
  ];
}

/** What the (+) button offers. */
export function quickActions(v: Subject): { key: string; label: string; hint: string; href: string; icon: IconName }[] {
  const out: { key: string; label: string; hint: string; href: string; icon: IconName }[] = [];
  if (can(v, 'supplies.use')) out.push({ key: 'supplies', label: 'Use supplies', hint: 'Feed, fuel, parts', href: '/more/supplies', icon: 'supplies' });
  if (can(v, 'work.do')) out.push({ key: 'upkeep', label: 'Log upkeep', hint: 'Service, reading', href: '/maintenance', icon: 'upkeep' });
  if (can(v, 'work.manage')) {
    out.push({ key: 'chore', label: 'New chore', hint: 'One-off or repeating', href: '/chores#new', icon: 'chores' });
    out.push({ key: 'project', label: 'New project', hint: 'With tasks', href: '/projects#new', icon: 'projects' });
  }
  return out;
}

export function isActive(item: NavItem, pathname: string): boolean {
  return item.match.some((m) => (m === '/' ? pathname === '/' : pathname === m || pathname.startsWith(`${m}/`)));
}
