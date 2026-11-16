/** Money maths shared by screens and reports. Pure. */

export const SALE_KIND_LABEL = { eggs: 'Eggs', milk: 'Milk', produce: 'Produce', animal: 'Animals', hay: 'Hay', other: 'Other' } as const;
export const SALE_UNITS: Record<keyof typeof SALE_KIND_LABEL, string[]> = {
  eggs: ['dozen', 'eggs'], milk: ['gal', 'qt', 'lb'], produce: ['lb', 'bunches', 'each', 'boxes'], animal: ['head'], hay: ['bales', 'tons'], other: ['each'],
};

/** Offered when typing a category of your own; anything else can be typed. */
export const CATEGORY_SUGGESTIONS = ['Equipment', 'Firearms', 'Firewood', 'Meat', 'Tools', 'Vehicles', 'Services', 'Household'];
/** Offered when typing a unit for a category of your own. */
export const COMMON_UNITS = ['each', 'set', 'lb', 'dozen', 'bale', 'gal', 'cord', 'hr', 'box'];

/** What a sale is called in lists: your own category if given, else the built-in kind. */
export function saleKindLabel(s: { kind: keyof typeof SALE_KIND_LABEL; category?: string | null }): string {
  return s.category?.trim() || SALE_KIND_LABEL[s.kind] || 'Other';
}

/** Categories to offer: the suggestions plus ones already used, no duplicates (ignoring case). */
export function categoryChoices(used: string[]): string[] {
  const seen = new Map<string, string>();
  for (const c of [...used, ...CATEGORY_SUGGESTIONS]) {
    const k = c.trim().toLowerCase();
    if (k && !seen.has(k)) seen.set(k, c.trim());
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Round to cents. */
export const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * New cost per unit after buying more: the average of what's on the shelf (at
 * its old cost) and what was just bought (at what was paid). With nothing on
 * the shelf, or no earlier cost, it's simply what was paid per unit.
 */
export function weightedUnitCost(onHand: number, oldUnitCost: number | null, added: number, paid: number): number | null {
  if (!(added > 0) || !(paid >= 0)) return oldUnitCost;
  const have = Math.max(0, onHand);
  if (oldUnitCost == null || have === 0) return Math.round((paid / added) * 10000) / 10000;
  return Math.round(((have * oldUnitCost + paid) / (have + added)) * 10000) / 10000;
}

/** How much to buy: enough for `days` at the recent rate, or back up to twice the reorder point, whichever is more. */
export function suggestedBuy(qty: number, reorderAt: number, perDay: number | null, days = 30): number {
  const toRate = perDay && perDay > 0 ? perDay * days - qty : 0;
  const toPoint = reorderAt > 0 ? reorderAt * 2 - qty : 0;
  return Math.max(0, Math.ceil(Math.max(toRate, toPoint)));
}

export type DepositKind = 'received' | 'deduction' | 'refund';
/** What's still held: received minus deductions and refunds. */
export function depositBalance(entries: { kind: DepositKind; amount: number }[]): number {
  return cents(entries.reduce((n, e) => n + (e.kind === 'received' ? e.amount : -e.amount), 0));
}

/** Cost per unit of output ("$2.10 a dozen"), or null when nothing was produced. */
export function unitCost(costs: number, output: number): number | null {
  return output > 0 ? cents(costs / output) : null;
}
