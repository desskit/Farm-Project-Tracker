/** Taking turns on a chore: who's next, in name order. Pure. */

export type Turner = { id: string; name: string };

const inOrder = (people: Turner[]) => [...people].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

/** Whose turn it should be now: the current person if they're still on it, else the first by name. */
export function currentTurn(people: Turner[], current: string | null | undefined): string | null {
  if (!people.length) return null;
  return people.some((p) => p.id === current) ? current! : inOrder(people)[0].id;
}

/** Who has it after `current` (wraps round; someone no longer on it hands to the first by name). */
export function nextTurn(people: Turner[], current: string | null | undefined): string | null {
  const order = inOrder(people);
  if (!order.length) return null;
  const i = order.findIndex((p) => p.id === current);
  return order[(i + 1) % order.length].id;
}
