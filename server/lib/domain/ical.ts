/**
 * A minimal iCalendar (.ics) writer for the "subscribe from your phone" feed:
 * all-day events only, with stable ids so a refresh updates rather than
 * duplicates. Pure.
 */
import { addDays } from './dates';

export type ICalItem = { id: string; date: string; title: string; url?: string; category?: string };

/** Escape per RFC 5545: backslash, semicolon, comma, newline. */
export function icalText(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold a content line at 75 octets, continuation lines start with a space. */
export function foldLine(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const ymd = (iso: string) => iso.replace(/-/g, '');

export function toICal(items: ICalItem[], opts: { name: string; host: string; now?: Date }): string {
  const stamp = (opts.now ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Farm Project Tracker//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icalText(opts.name)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ];
  for (const it of items) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${icalText(`${it.id}-${it.date}`)}@${opts.host}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(it.date)}`,
      `DTEND;VALUE=DATE:${ymd(addDays(it.date, 1))}`,
      `SUMMARY:${icalText(it.title)}`,
      ...(it.category ? [`CATEGORIES:${icalText(it.category)}`] : []),
      ...(it.url ? [`URL:${it.url}`] : []),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
