/** Renders docs/permissions.md from the permission table (see scripts/permissions-doc.ts). */
import { CAPS, CAP_LABEL, ROLES, ROLE_BLURB, ROLE_LABEL, accessOf } from './permissions';

const MARK = { yes: '✓', 'switch-on': 'on\\*', 'switch-off': 'off\\*', no: '—' } as const;

export function permissionsMarkdown(): string {
  const head = `| Capability | ${ROLES.map((r) => ROLE_LABEL[r]).join(' | ')} |`;
  const sep = `|---|${ROLES.map(() => ':-:').join('|')}|`;
  const rows = CAPS.map((c) => `| ${CAP_LABEL[c]} (\`${c}\`) | ${ROLES.map((r) => MARK[accessOf(r, c)]).join(' | ')} |`);
  return [
    '# Who sees what',
    '',
    '<!-- Generated from lib/domain/permissions.ts by `npx tsx scripts/permissions-doc.ts`. Do not edit by hand. -->',
    '',
    'Access is decided by capabilities, never by role names. Each role has defaults;',
    'capabilities marked \\* can be switched per person (People → Access), on or off',
    'by default as shown. Admins can see this table in the app at More → Who sees what.',
    '',
    head,
    sep,
    ...rows,
    '',
    '## Roles',
    '',
    ...ROLES.map((r) => `- **${ROLE_LABEL[r]}** (\`${r}\`): ${ROLE_BLURB[r]}`),
    '',
    '## Rules that sit on top of the table',
    '',
    '- **Work visibility:** with “See all work” you see everything; otherwise what you are on, what was sent back to you, and (with “pick up work that is up for grabs”) open work. Upkeep is shared.',
    '- **Rent:** anyone with a rent assignment sees their own charges and documents, whatever their role.',
    '- **Files** are visible according to what they are attached to (rental papers: that renter and money people; receipts: money people or the uploader; other farm files: the farm app; unattached: only the uploader).',
    '- **Access end dates** stop sign-in, sessions and notifications after that day. Admins cannot have one.',
    '- **Preview as person** (admins) shows the app exactly as someone sees it, read-only, for an hour.',
    '',
  ].join('\n');
}
