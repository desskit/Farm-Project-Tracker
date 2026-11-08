// Kept separate from session.ts (which imports next/headers + the DB client)
// so that Edge middleware — which cannot bundle those — can still import just
// the cookie name for its lightweight presence check.
export const SESSION_COOKIE = 'fpt_session';
/**
 * Admin "preview as person": `<userId>.<expiresAtMs>`. Only honoured when the
 * real signed-in user is an admin, so the value needs no signature; while it's
 * set, middleware refuses every write.
 */
export const PREVIEW_COOKIE = 'fpt_preview';
export const PREVIEW_MS = 60 * 60 * 1000;
