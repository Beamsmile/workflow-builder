import { useStore } from '../store';
import type { FlowNodeType } from '../domain/types';

const SHAPES: { type: FlowNodeType; glyph: string; label: string }[] = [
  { type: 'start', glyph: '⬤', label: 'Start' },
  { type: 'process', glyph: '▭', label: 'Process' },
  { type: 'decision', glyph: '◇', label: 'Decision' },
  { type: 'application', glyph: '⚑', label: 'App' },
  { type: 'connector', glyph: '◯', label: 'Connector' },
  { type: 'end', glyph: '⬤', label: 'End' },
];

export default function ShapeRail() {
  const addNode = useStore((s) => s.addNode);

  return (
    <nav className="rail" aria-label="เพิ่มกล่อง">
      <span className="rail-label">Add</span>
      {SHAPES.map((s, i) => (
        <div key={s.type} style={{ width: '100%' }}>
          {(i === 1 || i === 5) && <div className="rail-sep" />}
          <button
            className="rail-btn"
            onClick={() => addNode(s.type)}
            title={`เพิ่ม ${s.label}`}
          >
            <span className="rail-glyph" aria-hidden>
              {s.glyph}
            </span>
            <span>{s.label}</span>
          </button>
        </div>
      ))}
    </nav>
  );
}
