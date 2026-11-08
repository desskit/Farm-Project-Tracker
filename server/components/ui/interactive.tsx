'use client';
/** Stateful UI kit pieces: Switch, Segmented, Dialog/BottomSheet. */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './primitives';
import s from './ui.module.css';

export function Switch({
  label, checked, onChange, disabled, hint,
}: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; hint?: ReactNode }) {
  return (
    <label className={s.switch}>
      <span>
        <span className={s.switchLabel}>{label}</span>
        {hint && <span className={s.hint}>{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className={s.switchInput}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={s.switchTrack} aria-hidden />
    </label>
  );
}

export function Segmented<T extends string>({
  label, options, value, onChange,
}: { label: string; options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  const name = useId();
  return (
    <fieldset className={s.segmented} aria-label={label}>
      {options.map((o) => (
        <label key={o.value} className={s.segment}>
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

/**
 * Native <dialog> as a centered dialog or, on phones, a bottom sheet. Gets
 * focus trapping, Esc-to-close and the backdrop from the browser for free.
 */
export function Dialog({
  open, onClose, title, children, sheet,
}: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; sheet?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`${s.dialog} ${sheet ? s.sheet : ''}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // tap on the backdrop
      }}
    >
      {sheet && <div className={s.grabber} aria-hidden />}
      <div className={s.dialogHead}>
        <h2 id={titleId} className={s.dialogTitle}>{title}</h2>
        <IconButton label="Close" onClick={onClose}><X /></IconButton>
      </div>
      <div className={s.dialogBody}>{children}</div>
    </dialog>
  );
}

/** − value + with big touch targets; typing works too. */
export function NumberStepper({
  value, onChange, min = 0, step = 1, label, unit,
}: { value: number; onChange: (v: number) => void; min?: number; step?: number; label: string; unit?: string }) {
  const set = (v: number) => onChange(Math.max(min, Math.round(v * 1000) / 1000));
  return (
    <div className={s.stepper} role="group" aria-label={label}>
      <button type="button" className={s.stepBtn} onClick={() => set(value - step)} disabled={value - step < min} aria-label={`Less ${label}`}>
        −
      </button>
      <input
        className={s.stepInput}
        inputMode="decimal"
        value={Number.isFinite(value) ? String(value) : ''}
        onChange={(e) => {
          const n = Number(e.target.value.replace(',', '.'));
          if (Number.isFinite(n)) set(n);
        }}
        aria-label={label}
      />
      {unit && <span className={s.stepUnit}>{unit}</span>}
      <button type="button" className={s.stepBtn} onClick={() => set(value + step)} aria-label={`More ${label}`}>
        +
      </button>
    </div>
  );
}
