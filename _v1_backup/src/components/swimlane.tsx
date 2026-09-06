/**
 * Swimlane rendering:
 *  - `buildLaneNodes` turns the lane list into non-interactive React Flow nodes
 *    that sit *behind* everything (they pan / zoom for free).
 *  - `LaneHeaderStrip` is a strip pinned to the top of the canvas that shows the
 *    band ("กระบวนการ") and per-column headers, tracking the viewport pan/zoom.
 */
import { useViewport, type Node, type NodeProps } from '@xyflow/react';
import type { Lane } from '../domain/types';
import { computeLaneGeometry, laneBands, totalLaneWidth } from '../domain/lanes';
import { HEADER_HEIGHT } from '../domain/theme';
import { useStore } from '../store';

export interface LaneNodeData {
  lane: Lane;
  height: number;
  [key: string]: unknown;
}
export type LaneRFNode = Node<LaneNodeData, 'lane'>;

export function buildLaneNodes(lanes: Lane[], contentHeight: number): LaneRFNode[] {
  const geo = computeLaneGeometry(lanes);
  const height = Math.max(1600, contentHeight + 600);
  return geo.map((g) => ({
    id: `lane__${g.lane.id}`,
    type: 'lane',
    position: { x: g.x, y: 0 },
    data: { lane: g.lane, height },
    draggable: false,
    selectable: false,
    connectable: false,
    deletable: false,
    focusable: false,
    zIndex: -1,
  }));
}

export function LaneNode({ data }: NodeProps<LaneRFNode>) {
  const { lane, height } = data;
  return (
    <div
      className={`lane-col lane-${lane.kind}`}
      style={{ width: lane.width, height }}
    />
  );
}

export const laneNodeTypes = { lane: LaneNode };

export function LaneHeaderStrip() {
  const lanes = useStore((s) => s.lanes);
  const { x, zoom } = useViewport();
  const geo = computeLaneGeometry(lanes);
  const bands = laneBands(lanes);
  const hasBand = bands.length > 0;
  const bandH = hasBand ? 26 : 0;

  return (
    <div className="lane-header-strip" style={{ height: HEADER_HEIGHT }}>
      <div className="lane-header-inner" style={{ width: totalLaneWidth(lanes) * zoom }}>
        {bands.map((b) => (
          <div
            key={b.label + b.x}
            className="lane-band"
            style={{ left: x + b.x * zoom, width: b.width * zoom, height: bandH }}
          >
            {b.label}
          </div>
        ))}
        {geo.map((g) => (
          <div
            key={g.lane.id}
            className={`lane-head lane-head-${g.lane.kind}`}
            style={{
              left: x + g.x * zoom,
              width: g.width * zoom,
              top: g.lane.groupLabel ? bandH : 0,
              height: HEADER_HEIGHT - (g.lane.groupLabel ? bandH : 0),
            }}
          >
            <span>{g.lane.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
