'use client';

export function PrintButton() {
  return (
    <button className="btn primary block" onClick={() => window.print()}>
      🖨 Print sticker
    </button>
  );
}
