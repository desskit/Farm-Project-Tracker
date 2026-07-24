'use client';
import { useEffect } from 'react';

/**
 * Registers the service worker on load so the app shell is cached for offline
 * use (and push, once the user opts in). Registration is idempotent — the
 * notifications screen registers the same worker when enabling push.
 */
export function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onLoad = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });
    return () => window.removeEventListener('load', onLoad);
  }, []);
  return null;
}
