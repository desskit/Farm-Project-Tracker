import { describe, expect, it } from 'vitest';
import { isPrivateAddress, webhookBody, webhookUrlProblem } from './webhooks';
import { byMonth, dueDatesBetween } from './review';
import { newsFor } from '@/lib/whats-new';

describe('webhook addresses', () => {
  it('refuses private, loopback and link-local addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.9', '172.31.255.1', '192.168.1.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd12::1', '::ffff:10.0.0.1', '::ffff:7f00:1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '192.0.32.7', '2606:4700::1111', '::ffff:8.8.8.8']) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it('accepts only public https URLs', () => {
    expect(webhookUrlProblem('https://maker.ifttt.com/trigger/frost/with/key/abc')).toBeNull();
    expect(webhookUrlProblem('http://example.com/hook')).toMatch(/https/);
    expect(webhookUrlProblem('https://localhost/hook')).toMatch(/local/);
    expect(webhookUrlProblem('https://192.168.1.5/hook')).toMatch(/local network/);
    expect(webhookUrlProblem('https://[::1]/hook')).toMatch(/local network/);
    expect(webhookUrlProblem('https://nas.local/hook')).toMatch(/local network/);
    expect(webhookUrlProblem('https://user:pw@example.com/')).toMatch(/sign-in/);
    expect(webhookUrlProblem('not a url')).toMatch(/web address/);
  });

  it('carries IFTTT-style values', () => {
    const b = webhookBody('stock.low', { title: 'Running low', body: 'Layer feed is down to 2 bags', url: '/more/supplies' }, '2026-11-10T08:00:00Z', 'https://farm.example');
    expect(b).toMatchObject({ event: 'stock.low', value1: 'Running low', value2: 'Layer feed is down to 2 bags', value3: 'https://farm.example/more/supplies' });
  });
});

describe('year in review helpers', () => {
  it('totals by month within the year', () => {
    const m = byMonth([{ date: '2026-01-05', amount: 10 }, { date: '2026-01-20', amount: 2.5 }, { date: '2026-12-31', amount: 4 }, { date: '2025-12-31', amount: 99 }], 2026);
    expect(m[0]).toBe(12.5);
    expect(m[11]).toBe(4);
    expect(m.reduce((a, b) => a + b, 0)).toBe(16.5);
  });

  it('walks a schedule across the week', () => {
    expect(dueDatesBetween({ type: 'daily' } as never, '2026-11-10', '2026-11-10', '2026-11-12')).toEqual(['2026-11-10', '2026-11-11', '2026-11-12']);
    expect(dueDatesBetween({ type: 'everyNDays', n: 3 } as never, '2026-11-08', '2026-11-10', '2026-11-16')).toEqual(['2026-11-11', '2026-11-14']);
    expect(dueDatesBetween({ type: 'once' } as never, '2026-11-12', '2026-11-10', '2026-11-16')).toEqual(['2026-11-12']);
  });
});

describe("what's new", () => {
  const entries = [{ id: '2026-11-10', title: 'New', items: [{ text: 'Money', cap: 'finance.view' as const }, { text: 'For all' }] }, { id: '2026-10-01', title: 'Old', items: [{ text: 'x' }] }];
  it('shows the newest entry once, with only the lines that apply', () => {
    expect(newsFor('', () => false, entries)?.items.map((i) => i.text)).toEqual(['For all']);
    expect(newsFor('2026-10-01', () => true, entries)?.items).toHaveLength(2);
    expect(newsFor('2026-11-10', () => true, entries)).toBeNull();
    // Nothing for you in the newest note: the older one you haven't seen still shows.
    const onlyMoney = [{ id: '2026-12-01', title: 'Money', items: [{ text: 'm', cap: 'finance.view' as const }] }, ...entries];
    expect(newsFor('', () => false, onlyMoney)?.id).toBe('2026-11-10');
  });
});
