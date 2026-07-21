/**
 * Next.js instrumentation hook. Runs once when the server boots.
 * The Node-only migration logic lives in ./lib/boot-migrate and is imported
 * only under the Node runtime so it never gets bundled for the Edge runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./lib/boot-migrate');
  }
}
