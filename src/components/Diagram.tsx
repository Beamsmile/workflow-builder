import { forwardRef } from 'react';
import type { DiagramLayout, LaidBox, LaidLane } from '../domain/layout';
import { BOX, COLORS, LABEL_WEIGHT, META, ORG_TAG } from '../domain/theme';
import { wrapLabel } from '../domain/text';

/**
 * Pure SVG renderer. Everything it draws comes from `layout` (computed by
 * `domain/layout.ts`); the only interactivity is clicking a box to select it.
 */
const Diagram = forwardRef<SVGSVGElement, {
  layout: DiagramLayout;
  selectedId: string | null;
  onSelect: (id: string) => void;
}>(function Diagram({ layout, selectedId, onSelect }, ref) {
  const { width, height, band, lanes, boxes, edges, gutterMarks, bandHeight, laneHeadHeight } = layout;

  return (
    <svg
      ref={ref}
      className="diagram-svg"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={COLORS.edge} />
        </marker>
      </defs>

      {/* lane columns */}
      {lanes.map((l, i) => (
        <rect
          key={l.lane.id}
          x={l.x}
          y={layout.headerHeight}
          width={l.w}
          height={height - layout.headerHeight}
          fill={
            l.lane.kind === 'meta'
              ? COLORS.laneMeta
              : i % 2
                ? COLORS.laneOdd
                : COLORS.laneEven
          }
          stroke={COLORS.laneBorder}
        />
      ))}

      {/* "กระบวนการ" band over the org columns */}
      {band && (
        <>
          <rect x={band.x} y={0} width={band.w} height={bandHeight} fill={COLORS.bandBg} stroke="#d3d7dd" />
          <text x={band.x + band.w / 2} y={bandHeight / 2} textAnchor="middle" dominantBaseline="central" fontSize={12.5} fontWeight={700} fill={COLORS.headerText}>
            {band.label}
          </text>
        </>
      )}

      {/* headers — meta lanes span the full header height, org lanes sit under the band */}
      {lanes.map((l) => {
        const meta = l.lane.kind === 'meta';
        const y = meta ? 0 : bandHeight;
        const h = meta ? layout.headerHeight : laneHeadHeight;
        return (
          <g key={`h-${l.lane.id}`}>
            <rect x={l.x} y={y} width={l.w} height={h} fill={COLORS.headerBg} stroke="#d3d7dd" />
            <text x={l.centerX} y={y + h / 2} textAnchor="middle" dominantBaseline="central" fontSize={meta ? 11 : 12} fontWeight={600} fill={COLORS.headerText}>
              {l.lane.label}
            </text>
          </g>
        );
      })}

      {/* meta-column values, one per step row */}
      {lanes
        .filter((l) => l.lane.kind === 'meta' && l.lane.field)
        .map((l) => (
          <MetaColumn key={`m-${l.lane.id}`} lane={l} boxes={boxes} />
        ))}

      {/* step-number gutter */}
      {gutterMarks.map((m) => (
        <text key={m.n} x={layout.gutter / 2} y={m.y} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700} fill="#9aa1ac">
          {m.n}
        </text>
      ))}

      {/* edges */}
      {edges.map((e) => (
        <g key={e.id}>
          <path d={e.path} fill="none" stroke={COLORS.edge} strokeWidth={1.6} markerEnd="url(#arrow)" />
          {e.label && (
            <text
              x={e.labelX}
              y={e.labelY}
              textAnchor={e.labelAnchor}
              dominantBaseline="central"
              fontSize={11.5}
              fontWeight={700}
              fill={COLORS.nodeText}
              stroke="#ffffff"
              strokeWidth={3.6}
              style={{ paintOrder: 'stroke' }}
            >
              {e.label}
            </text>
          )}
        </g>
      ))}

      {/* nodes */}
      {boxes.map((b) => (
        <Node key={b.step.id} box={b} selected={b.step.id === selectedId} onSelect={onSelect} />
      ))}
    </svg>
  );
});

export default Diagram;

function MetaColumn({ lane, boxes }: { lane: LaidLane; boxes: LaidBox[] }) {
  const field = lane.lane.field;
  if (!field) return null;
  const lh = META.fontSize + 4;
  return (
    <>
      {boxes.map((b) => {
        const raw = b.step[field];
        if (!raw) return null;
        const lines = wrapLabel(raw, META.maxChars);
        const startY = b.cy - ((lines.length - 1) * lh) / 2;
        return (
          <text
            key={b.step.id}
            textAnchor="middle"
            fontSize={META.fontSize}
            fontWeight={META.weight}
            fill={COLORS.metaText}
            stroke="#ffffff"
            strokeWidth={3}
            style={{ paintOrder: 'stroke' }}
          >
            {lines.map((ln, i) => (
              <tspan key={i} x={lane.centerX} y={startY + i * lh} dominantBaseline="central">
                {ln}
              </tspan>
            ))}
          </text>
        );
      })}
    </>
  );
}

function Node({ box, selected, onSelect }: { box: LaidBox; selected: boolean; onSelect: (id: string) => void }) {
  const { step, x, y, w, h, cx, cy, lines, orgLines, orgW } = box;
  const ring = selected ? COLORS.selected : undefined;
  const click = { onClick: () => onSelect(step.id), style: { cursor: 'pointer' } as const };
  const org = orgLines.length ? <OrgTag lines={orgLines} w={orgW} cx={cx} y={y + h + 5} /> : null;

  if (step.type === 'start' || step.type === 'end') {
    return (
      <g {...click}>
        {selected && <circle cx={cx} cy={cy} r={w / 2 + 5} fill="none" stroke={ring} strokeWidth={2} strokeDasharray="4 3" />}
        <circle cx={cx} cy={cy} r={w / 2} fill={COLORS.startEnd} stroke={COLORS.startEndBorder} strokeWidth={2} />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700} fill={COLORS.startEndText}>
          {step.type === 'start' ? 'เริ่ม' : 'จบ'}
        </text>
      </g>
    );
  }

  if (step.type === 'connector') {
    return (
      <g {...click}>
        {selected && <circle cx={cx} cy={cy} r={w / 2 + 5} fill="none" stroke={ring} strokeWidth={2} strokeDasharray="4 3" />}
        <circle cx={cx} cy={cy} r={w / 2} fill={COLORS.connector} stroke={COLORS.connectorBorder} strokeWidth={2} />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={700} fill={COLORS.nodeText}>
          {(step.label || 'A').slice(0, 2)}
        </text>
      </g>
    );
  }

  if (step.type === 'decision') {
    const pts = `${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`;
    return (
      <g {...click}>
        {selected && <rect x={x - 5} y={y - 5} width={w + 10} height={h + 10} rx={8} fill="none" stroke={ring} strokeWidth={2} strokeDasharray="4 3" />}
        <polygon points={pts} fill={COLORS.decision} stroke={selected ? ring : COLORS.decisionBorder} strokeWidth={selected ? 2 : 1.5} />
        <TextLines lines={lines} cx={cx} cy={cy} fontSize={BOX.decision.fontSize} />
        {org}
      </g>
    );
  }

  // process
  return (
    <g {...click}>
      {selected && <rect x={x - 5} y={y - 5} width={w + 10} height={h + 10} rx={9} fill="none" stroke={ring} strokeWidth={2} strokeDasharray="4 3" />}
      <rect x={x} y={y} width={w} height={h} rx={5} fill={COLORS.process} stroke={selected ? ring : COLORS.processBorder} strokeWidth={selected ? 2 : 1.5} />
      <TextLines lines={lines} cx={cx} cy={cy} fontSize={BOX.process.fontSize} />
      {org}
    </g>
  );
}

function TextLines({ lines, cx, cy, fontSize }: { lines: string[]; cx: number; cy: number; fontSize: number }) {
  const lh = fontSize + 4;
  const startY = cy - ((lines.length - 1) * lh) / 2;
  return (
    <text
      textAnchor="middle"
      fontSize={fontSize}
      fontWeight={LABEL_WEIGHT}
      fill={COLORS.nodeText}
    >
      {lines.map((ln, i) => (
        <tspan key={i} x={cx} y={startY + i * lh} dominantBaseline="central">
          {ln}
        </tspan>
      ))}
    </text>
  );
}

function OrgTag({ lines, w, cx, y }: { lines: string[]; w: number; cx: number; y: number }) {
  const lh = ORG_TAG.fontSize + 3;
  const h = lines.length * lh + 7;
  return (
    <g>
      <rect x={cx - w / 2} y={y} width={w} height={h} rx={3} fill={COLORS.orgTag} />
      <text textAnchor="middle" fontSize={ORG_TAG.fontSize} fontWeight={600} fill={COLORS.orgTagText}>
        {lines.map((ln, i) => (
          <tspan key={i} x={cx} y={y + 3.5 + lh * (i + 0.5)} dominantBaseline="central">
            {ln}
          </tspan>
        ))}
      </text>
    </g>
  );
}
