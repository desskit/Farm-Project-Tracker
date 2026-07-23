// Kept separate from session.ts (which imports next/headers + the DB client)
// so that Edge middleware — which cannot bundle those — can still import just
// the cookie name for its lightweight presence check.
export const SESSION_COOKIE = 'fpt_session';
