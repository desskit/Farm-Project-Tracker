'use client';

/**
 * Last-resort error page: shown when the root layout itself fails (so the
 * normal error.tsx, which renders inside the layout, can't). It must bring its
 * own <html>/<body> and can't rely on globals.css, hence the inline styles.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          background: '#f6f5f1',
          color: '#1f2a1f',
          padding: 16,
        }}
      >
        <main style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Something went wrong</h1>
          <p style={{ margin: '0 0 20px', lineHeight: 1.5 }}>
            The app hit an error it couldn&apos;t recover from. Your saved work is safe; try again, and if it keeps
            happening let the farm admin know.
          </p>
          {error.digest && (
            <p style={{ fontSize: 12, opacity: 0.7, margin: '0 0 20px' }}>Reference: {error.digest}</p>
          )}
          <button
            onClick={reset}
            style={{
              minHeight: 44,
              padding: '0 20px',
              borderRadius: 10,
              border: 0,
              background: '#2f5d3a',
              color: '#fff',
              fontSize: 16,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
          <p style={{ marginTop: 16 }}>
            <a href="/" style={{ color: '#2f5d3a' }}>
              Back to Today
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
