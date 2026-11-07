/**
 * React's per-request `cache()` exists only in the server-components build
 * Next.js bundles; under plain React (vitest, scripts) it's missing. Fall back
 * to calling straight through there, which is the correct behavior outside a
 * request anyway.
 */
import * as React from 'react';

type AnyFn = (...args: never[]) => unknown;
const reactCache = (React as unknown as { cache?: <F extends AnyFn>(fn: F) => F }).cache;

export function requestCache<F extends AnyFn>(fn: F): F {
  return reactCache ? reactCache(fn) : fn;
}
