import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Tiny dropdown menu. Renders a trigger button; the panel (its children)
 * opens below-right and closes on outside-click or Escape.
 */
export default function Menu({
  label,
  primary = false,
  children,
}: {
  label: ReactNode;
  primary?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={root}>
      <button
        className={primary ? 'btn-primary' : undefined}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {label} <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="menu-panel" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}
