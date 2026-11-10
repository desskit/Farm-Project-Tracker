/**
 * @mentions in notes and comments. "@Sam" or "@Sam Reed" names a person; a
 * first name only counts when exactly one person has it. Pure.
 */

export type Mentionable = { id: string; name: string };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function findMentions(body: string, people: Mentionable[]): string[] {
  if (!body.includes('@')) return [];
  const found = new Set<string>();
  const firstCount = new Map<string, number>();
  for (const p of people) {
    const f = p.name.trim().split(/\s+/)[0]?.toLowerCase();
    if (f) firstCount.set(f, (firstCount.get(f) ?? 0) + 1);
  }
  // Longest names first, so "@Sam Reed" isn't taken as just "@Sam".
  for (const p of [...people].sort((a, b) => b.name.length - a.name.length)) {
    const full = p.name.trim();
    if (!full) continue;
    const first = full.split(/\s+/)[0];
    const end = "(?![\\p{L}\\p{N}'’-])";
    if (new RegExp(`@${esc(full)}${end}`, 'iu').test(body)) found.add(p.id);
    else if (firstCount.get(first.toLowerCase()) === 1 && new RegExp(`@${esc(first)}${end}`, 'iu').test(body)) {
      // Not if the text spells out someone else's full name starting the same way.
      const other = people.some((o) => o.id !== p.id && new RegExp(`@${esc(o.name.trim())}${end}`, 'iu').test(body) && o.name.trim().toLowerCase().startsWith(first.toLowerCase()));
      if (!other) found.add(p.id);
    }
  }
  return people.filter((p) => found.has(p.id)).map((p) => p.id);
}

/** The partial name being typed after an "@" at the end of the text, if any. */
export function mentionQuery(text: string): string | null {
  const m = /(?:^|\s)@([\p{L}\p{N}'’-]*(?: [\p{L}\p{N}'’-]*)?)$/u.exec(text);
  return m ? m[1] : null;
}
