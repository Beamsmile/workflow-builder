import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useStore } from '../store';
import { computeLayout } from '../domain/layout';
import Diagram from './Diagram';
import { Maximize, Minus, Plus } from './icons';

const MIN = 0.2;
const MAX = 2.5;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export default function DiagramPane({ svgRef }: { svgRef: RefObject<SVGSVGElement> }) {
  const title = useStore((s) => s.title);
  const bandLabel = useStore((s) => s.bandLabel);
  const lanes = useStore((s) => s.lanes);
  const steps = useStore((s) => s.steps);
  const selectedStepId = useStore((s) => s.selectedStepId);
  const selectStep = useStore((s) => s.selectStep);

  const layout = useMemo(
    () => computeLayout({ schemaVersion: 2, title, bandLabel, lanes, steps }),
    [title, bandLabel, lanes, steps],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const fittedRef = useRef(false);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const scale = clamp(Math.min(cw / layout.width, ch / layout.height) * 0.94, MIN, MAX);
    // left-align with a small margin; centre only when there is lots of slack
    const slack = cw - layout.width * scale;
    setView({ scale, tx: slack > 160 ? Math.min(slack / 2, 120) : 24, ty: 16 });
  }, [layout.width, layout.height]);

  // fit once when first laid out
  useLayoutEffect(() => {
    if (fittedRef.current) return;
    fittedRef.current = true;
    fit();
  }, [fit]);

  const zoomBy = (factor: number) => {
    const el = containerRef.current;
    if (!el) return;
    const cx = el.clientWidth / 2;
    const cy = el.clientHeight / 2;
    setView((v) => {
      const scale = clamp(v.scale * factor, MIN, MAX);
      const k = scale / v.scale;
      return { scale, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k };
    });
  };

  // Wheel handling is a NATIVE non-passive listener so we can preventDefault():
  //  - trackpad pinch / ctrl+wheel  → zoom the diagram only (never the page)
  //  - plain two-finger scroll       → pan the diagram
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (e.ctrlKey) {
        const dy = Math.max(-40, Math.min(40, e.deltaY));
        setView((v) => {
          const scale = clamp(v.scale * Math.exp(-dy * 0.012), MIN, MAX);
          const k = scale / v.scale;
          return { scale, tx: mx - (mx - v.tx) * k, ty: my - (my - v.ty) * k };
        });
      } else {
        setView((v) => ({ ...v, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    // only start panning from empty canvas, not from a node
    if ((e.target as Element).closest('g[style*="cursor"]')) return;
    drag.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  useEffect(() => {
    const onResize = () => {
      if (!fittedRef.current) return;
      // keep it usable after a window resize
      fit();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fit]);

  return (
    <section className="diagram-pane">
      <div className="eyebrow diagram-eyebrow">ผังการไหล · อัปเดตอัตโนมัติ</div>

      <div
        ref={containerRef}
        className="diagram-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div
          className="diagram-stage"
          style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})` }}
        >
          <Diagram ref={svgRef} layout={layout} selectedId={selectedStepId} onSelect={selectStep} />
        </div>
      </div>

      <div className="zoom-bar">
        <button className="zoom-btn" title="ซูมออก" onClick={() => zoomBy(1 / 1.2)}>
          <Minus width={14} height={14} />
        </button>
        <span className="zoom-val">{Math.round(view.scale * 100)}%</span>
        <button className="zoom-btn" title="ซูมเข้า" onClick={() => zoomBy(1.2)}>
          <Plus width={14} height={14} />
        </button>
        <button className="zoom-btn" title="พอดีหน้าจอ" onClick={fit}>
          <Maximize width={14} height={14} />
        </button>
      </div>
    </section>
  );
}
