import { useCallback, useEffect, useRef } from 'react';

const KEY = 'wf:panelW';
const MIN = 340;
const MAX = 900;
const DEFAULT = 476;

const clamp = (n: number) => Math.min(MAX, Math.max(MIN, n));

/** Remembered width of the step panel, applied before the first paint. */
export function usePanelWidth() {
  useEffect(() => {
    const saved = Number(localStorage.getItem(KEY));
    if (saved) document.documentElement.style.setProperty('--panel-w', `${clamp(saved)}px`);
  }, []);
}

/**
 * Drag handle between the step editor and the diagram. Filling in บฟ. fields
 * wants a wide left panel; checking the flow wants a wide diagram — so let the
 * split move instead of picking one.
 */
export default function Splitter() {
  const dragging = useRef(false);

  const apply = useCallback((px: number) => {
    const w = clamp(px);
    document.documentElement.style.setProperty('--panel-w', `${w}px`);
    return w;
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    document.body.classList.add('is-resizing');
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    apply(e.clientX);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.classList.remove('is-resizing');
    localStorage.setItem(KEY, String(apply(e.clientX)));
  };

  return (
    <div
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      title="ลากเพื่อปรับขนาด · ดับเบิลคลิกเพื่อรีเซ็ต"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => {
        apply(DEFAULT);
        localStorage.setItem(KEY, String(DEFAULT));
      }}
    >
      <span className="splitter-grip" />
    </div>
  );
}
