/**
 * "What's new": a short note shown once on Today after an update. Add a new
 * entry at the top with today's date as its id; people who dismissed an
 * older one will see it. Each line can be limited to people with a capability.
 */
import type { Cap } from '@/lib/domain/permissions';

export type NewsItem = { text: string; href?: string; cap?: Cap };
export type NewsEntry = { id: string; title: string; items: NewsItem[] };

export const WHATS_NEW: NewsEntry[] = [
  {
    id: '2026-11-11',
    title: 'New: loans',
    items: [
      { text: 'Sell to someone on the farm on a payment plan: turn on “Pay over time” when recording a sale.', href: '/more/sales', cap: 'finance.manage' },
      { text: 'Borrowers get reminders and tap “I paid”; you confirm each payment under More → Loans.', href: '/more/loans', cap: 'finance.manage' },
    ],
  },
  {
    id: '2026-11-10',
    title: 'New on the farm tracker',
    items: [
      { text: 'Every animal has its own page: photo, weight chart, family and history.', href: '/farm/animals', cap: 'animals.view' },
      { text: 'Set eggs in the incubator and get candling, lockdown and hatch-day reminders.', href: '/farm/animals', cap: 'animals.log' },
      { text: 'Planting calendar: what to sow now, from the farm’s frost dates.', href: '/farm/land/calendar', cap: 'land.view' },
      { text: 'Record sales and see who still owes.', href: '/more/sales', cap: 'sales.log' },
      { text: 'Profit by herd, garden and rentals, and a tax-year pack for the accountant.', href: '/more/profit', cap: 'finance.view' },
      { text: 'A year in review, and printable chore sheets and record books.', href: '/more/review', cap: 'farm.view' },
      { text: 'How-to guides, a notice board and a contacts page.', href: '/more/guides', cap: 'farm.view' },
      { text: 'Larger text and a dark-mode switch under Account.', href: '/more/account' },
      { text: 'Subscribe to your farm calendar from your phone’s calendar app.', href: '/more/account' },
    ],
  },
];

/**
 * The newest entry this person hasn't dismissed that has something for them,
 * with only the lines that apply to them.
 */
export function newsFor(seen: string, has: (cap: Cap) => boolean, entries: NewsEntry[] = WHATS_NEW): NewsEntry | null {
  for (const e of [...entries].sort((a, b) => b.id.localeCompare(a.id))) {
    if (e.id <= seen) return null;
    const items = e.items.filter((i) => !i.cap || has(i.cap));
    if (items.length) return { ...e, items };
  }
  return null;
}
