import Link from 'next/link';

/**
 * Styled placeholder for a section whose UI shell exists but whose feature
 * isn't wired up yet. Keeps the app chrome consistent so the skeleton feels
 * complete while features land one by one.
 */
export function ComingSoon({
  title,
  icon,
  blurb,
  backHref,
  backLabel,
}: {
  title: string;
  icon?: string;
  blurb?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <main className="view">
      {backHref ? (
        <div className="sub-head">
          <Link href={backHref} className="btn small ghost back-btn">
            ‹ {backLabel ?? 'Back'}
          </Link>
          <h1>{title}</h1>
        </div>
      ) : (
        <div className="view-head">
          <h1>
            {icon ? `${icon} ` : ''}
            {title}
          </h1>
        </div>
      )}
      <div className="empty">
        {blurb ?? 'This section is coming soon.'}
        <div className="subtle" style={{ marginTop: 6 }}>
          The screen is ready — the feature is being wired up next.
        </div>
      </div>
    </main>
  );
}
