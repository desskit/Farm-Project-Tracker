/**
 * Server-safe UI kit pieces (no hooks): usable from server and client
 * components alike. Interactive pieces that need state live in
 * interactive.tsx ('use client').
 */
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, Info, CalendarClock, CircleDot, XCircle } from 'lucide-react';
import s from './ui.module.css';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* ---------- Button ---------- */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type ButtonLook = { variant?: ButtonVariant; size?: 'md' | 'sm'; block?: boolean; icon?: ReactNode };

function look({ variant = 'primary', size = 'md', block }: ButtonLook, className?: string) {
  return cx(s.btn, s[variant], size === 'sm' && s.sm, block && s.block, className);
}

export function Button({
  variant, size, block, icon, loading, children, className, disabled, type = 'button', ...rest
}: ButtonLook & { loading?: boolean } & ComponentProps<'button'>) {
  return (
    <button
      type={type}
      className={look({ variant, size, block }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className={s.spinner} aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant, size, block, icon, children, className, ...rest
}: ButtonLook & ComponentProps<typeof Link>) {
  return (
    <Link className={look({ variant, size, block }, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

/** Icon-only button. `label` is required: it's the only name a screen reader gets. */
export function IconButton({ label, children, className, type = 'button', ...rest }: { label: string } & ComponentProps<'button'>) {
  return (
    <button type={type} aria-label={label} title={label} className={cx(s.iconBtn, className)} {...rest}>
      {children}
    </button>
  );
}

/* ---------- Card ---------- */
export function Card({
  title, action, children, flush, className, as: Tag = 'section',
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  /** No body padding — for lists of ListRows. */
  flush?: boolean;
  className?: string;
  as?: 'section' | 'div' | 'article';
}) {
  return (
    <Tag className={cx(s.card, className)}>
      {(title || action) && (
        <header className={s.cardHead}>
          {title && <h2 className={s.cardTitle}>{title}</h2>}
          {action}
        </header>
      )}
      <div className={flush ? s.cardFlush : s.cardBody}>{children}</div>
    </Tag>
  );
}

/* ---------- ListRow ---------- */
export function ListRow({
  title, meta, lead, trail, href, onClick, chevron = !!href, wrap,
}: {
  title: ReactNode;
  /** Let a long title run onto more lines instead of being cut off with "…". */
  wrap?: boolean;
  meta?: ReactNode;
  lead?: ReactNode;
  trail?: ReactNode;
  href?: string;
  onClick?: () => void;
  chevron?: boolean;
}) {
  const inner = (
    <>
      {lead && <span className={s.rowLead}>{lead}</span>}
      <span className={s.rowMain}>
        <span className={cx(s.rowTitle, wrap && s.rowTitleWrap)}>{title}</span>
        {meta && <span className={s.rowMeta}>{meta}</span>}
      </span>
      {(trail || chevron) && (
        <span className={s.rowTrail}>
          {trail}
          {chevron && <ChevronRight aria-hidden />}
        </span>
      )}
    </>
  );
  if (href) return <Link href={href} className={s.row}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={s.row}>{inner}</button>;
  return <div className={s.row}>{inner}</div>;
}

/* ---------- Status ---------- */
export type Tone = 'overdue' | 'today' | 'upcoming' | 'done' | 'info' | 'neutral';
const TONE_ICON: Record<Tone, ReactNode> = {
  overdue: <AlertTriangle aria-hidden />,
  today: <Clock aria-hidden />,
  upcoming: <CalendarClock aria-hidden />,
  done: <CheckCircle2 aria-hidden />,
  info: <Info aria-hidden />,
  neutral: <CircleDot aria-hidden />,
};

/** Status is never color alone: each tone carries an icon and a word. */
export function StatusPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={cx(s.pill, s[`t-${tone}`])}>
      {TONE_ICON[tone]}
      {children}
    </span>
  );
}

export function Badge({ count, quiet, label }: { count: number; quiet?: boolean; label?: string }) {
  if (count <= 0) return null;
  return (
    <span className={cx(s.badge, quiet && s.badgeQuiet)} aria-label={label ?? `${count}`}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

/* ---------- Banner ---------- */
const BANNER_ICON = {
  info: <Info aria-hidden />,
  warn: <AlertTriangle aria-hidden />,
  danger: <XCircle aria-hidden />,
  ok: <CheckCircle2 aria-hidden />,
};
export function Banner({
  tone = 'info', title, children, action,
}: { tone?: keyof typeof BANNER_ICON; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={cx(s.banner, s[`b-${tone}`])} role={tone === 'danger' ? 'alert' : 'status'}>
      {BANNER_ICON[tone]}
      <div className={s.bannerBody}>
        {title && <div className={s.bannerTitle}>{title}</div>}
        {children}
      </div>
      {action}
    </div>
  );
}

/* ---------- EmptyState ---------- */
export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={s.empty}>
      {icon}
      <h3 className={s.emptyTitle}>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

/* ---------- AvatarStack ---------- */
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}
export function AvatarStack({ names, max = 3 }: { names: string[]; max?: number }) {
  if (!names.length) return null;
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <span className={s.avatars} aria-label={names.join(', ')} title={names.join(', ')}>
      {shown.map((n, i) => (
        <span key={i} className={s.avatar} aria-hidden>{initials(n)}</span>
      ))}
      {extra > 0 && <span className={s.avatar} aria-hidden>+{extra}</span>}
    </span>
  );
}

/* ---------- Skeleton ---------- */
export function Skeleton({ w = '100%', h = 16, radius }: { w?: number | string; h?: number | string; radius?: number }) {
  return <span className={s.skeleton} style={{ width: w, height: h, borderRadius: radius }} aria-hidden />;
}

/* ---------- Form fields ---------- */
export function Field({
  label, hint, error, htmlFor, children,
}: { label: ReactNode; hint?: ReactNode; error?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className={s.field}>
      <label className={s.label} htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className={s.error} role="alert">{error}</span> : hint && <span className={s.hint}>{hint}</span>}
    </div>
  );
}
export function Input({ className, ...rest }: ComponentProps<'input'>) {
  return <input className={cx(s.control, className)} {...rest} />;
}
export function Textarea({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea className={cx(s.control, className)} {...rest} />;
}
export function Select({ className, children, ...rest }: ComponentProps<'select'>) {
  return <select className={cx(s.control, className)} {...rest}>{children}</select>;
}

/* ---------- Layout ---------- */
export function PageHeader({ title, subtitle, back, actions }: { title: ReactNode; subtitle?: ReactNode; back?: ReactNode; actions?: ReactNode }) {
  return (
    <header className={s.pageHeader}>
      {back}
      <div className={s.pageTitles}>
        <h1 className={s.pageTitle}>{title}</h1>
        {subtitle && <p className={s.pageSub}>{subtitle}</p>}
      </div>
      {actions && <div className={s.pageActions}>{actions}</div>}
    </header>
  );
}

export function Stack({ children, gap }: { children: ReactNode; gap?: number }) {
  return <div className={s.stack} style={gap != null ? { gap } : undefined}>{children}</div>;
}

export function Fab({ label, children, className, ...rest }: { label: string } & ComponentProps<'button'>) {
  return (
    <button type="button" aria-label={label} title={label} className={cx(s.fab, className)} {...rest}>
      {children}
    </button>
  );
}
