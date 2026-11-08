/** Preview-as is time-limited and strictly read-only. */
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { parsePreview } from '@/lib/auth/session';
import { PREVIEW_COOKIE, SESSION_COOKIE } from '@/lib/auth/constants';

const req = (method: string, path: string, preview = true) =>
  new NextRequest(`https://farm.test${path}`, {
    method,
    headers: {
      cookie: `${SESSION_COOKIE}=abc${preview ? `; ${PREVIEW_COOKIE}=u1.${Date.now() + 60_000}` : ''}`,
      origin: 'https://farm.test',
      host: 'farm.test',
      'sec-fetch-site': 'same-origin',
    },
  });

describe('preview', () => {
  it('parses only live preview cookies', () => {
    expect(parsePreview(`u1.${Date.now() + 1000}`)?.userId).toBe('u1');
    expect(parsePreview(`u1.${Date.now() - 1}`)).toBeNull();
    expect(parsePreview('garbage')).toBeNull();
    expect(parsePreview(undefined)).toBeNull();
  });

  it('blocks every write while previewing, except ending it or signing out', async () => {
    expect(middleware(req('POST', '/api/chores/c1/complete')).status).toBe(403);
    expect(middleware(req('DELETE', '/api/notes/n1')).status).toBe(403);
    expect(middleware(req('POST', '/api/preview/stop')).status).not.toBe(403);
    expect(middleware(req('POST', '/api/auth/logout')).status).not.toBe(403);
    expect(middleware(req('GET', '/chores')).status).not.toBe(403);
    expect(middleware(req('POST', '/api/chores/c1/complete', false)).status).not.toBe(403);
  });
});
