/** The invite and resent-invite emails. */
import { describe, expect, it } from 'vitest';
import { inviteAbilities, inviteEmail } from '@/lib/notify/templates';
import { htmlToText } from '@/lib/notify/email';

const base = { name: 'Laura Mae', email: 'laura@example.com', inviterName: 'Jacob', url: 'https://farm.example/invite/abc', siteUrl: 'https://farm.example', linkExpires: Date.parse('2026-11-28T12:00:00') };

describe('invite email', () => {
  it('welcomes a new person by first name, with one link, their sign-in and what they can do', () => {
    const m = inviteEmail({ ...base, role: 'worker' });
    expect(m.subject).toBe('Jacob invited you to the farm app');
    expect(m.html).toContain('Hi Laura,');
    expect(m.html).toContain('Welcome!');
    expect(m.html).toContain('https://farm.example/invite/abc');
    expect(m.html).toContain('laura@example.com');
    expect(m.html).toContain('November 28');
    expect(m.html).toContain('Add to Home Screen');
    expect(m.html).toContain('just ask Jacob');
    expect(inviteAbilities('worker').some((a) => /Today screen/.test(a))).toBe(true);
    expect(inviteAbilities('worker').some((a) => /Invite people/.test(a))).toBe(false);
    expect(inviteAbilities('admin').some((a) => /Invite people/.test(a))).toBe(true);
  });

  it('words a resend as a fresh link that replaces the old one', () => {
    const m = inviteEmail({ ...base, role: 'family', resend: true });
    expect(m.subject).toBe('Your new link to set up the farm app');
    expect(m.html).toContain('fresh link');
    expect(m.html).toContain('earlier link no longer works');
    expect(m.html).not.toContain('Welcome!');
  });

  it('gives renters the tenant portal, and guests their end date', () => {
    const r = inviteEmail({ ...base, role: 'renter' });
    expect(r.subject).toBe('Jacob set up your tenant portal');
    expect(r.html).toContain('tenant portal');
    expect(r.html).toContain('I paid');
    expect(r.html).not.toContain('Today screen');
    const g = inviteEmail({ ...base, role: 'guest', accessEnds: Date.parse('2026-12-31T12:00:00') });
    expect(g.html).toContain('December 31, 2026');
  });

  it('escapes names, and has a readable plain-text copy', () => {
    const m = inviteEmail({ ...base, name: '<b>Eve</b>', inviterName: 'A & B', role: 'worker' });
    expect(m.html).not.toContain('<b>Eve</b>');
    expect(m.html).toContain('A &amp; B');
    const text = htmlToText(m.html);
    expect(text).toContain('Set your password (https://farm.example/invite/abc)');
    expect(text).toContain('• See your jobs for the day');
    expect(text).toContain('A & B');
    expect(text).toContain('Hi <b>Eve</b>,'); // plain text shows the name as typed
    expect(text).not.toMatch(/<(p|li|ul|a|div|strong)\b/i);
  });
});
