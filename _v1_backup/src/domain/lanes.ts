/** Helpers for turning the ordered lane list into x-positions on the canvas. */
import type { Lane } from './types';
import { NODE_SIZE } from './theme';

export interface LaneGeometry {
  lane: Lane;
  x: number; // left edge, flow px
  width: number;
  center: number;
}

/** Left edge + centre for every lane, in order. */
export function computeLaneGeometry(lanes: Lane[]): LaneGeometry[] {
  const out: LaneGeometry[] = [];
  let x = 0;
  for (const lane of lanes) {
    out.push({ lane, x, width: lane.width, center: x + lane.width / 2 });
    x += lane.width;
  }
  return out;
}

export function totalLaneWidth(lanes: Lane[]): number {
  return lanes.reduce((sum, l) => sum + l.width, 0);
}

/** The lane whose column contains centreX (falls back to nearest). */
export function laneAtX(lanes: Lane[], centreX: number): Lane | undefined {
  const geo = computeLaneGeometry(lanes);
  const hit = geo.find((g) => centreX >= g.x && centreX < g.x + g.width);
  if (hit) return hit.lane;
  if (geo.length === 0) return undefined;
  // nearest by centre distance
  return geo.reduce((best, g) =>
    Math.abs(g.center - centreX) < Math.abs(best.center - centreX) ? g : best,
  ).lane;
}

/** Snap a node's x so it is centred in its lane. */
export function snapXToLane(lanes: Lane[], laneId: string, nodeType: string): number {
  const geo = computeLaneGeometry(lanes);
  const g = geo.find((it) => it.lane.id === laneId) ?? geo[0];
  if (!g) return 0;
  const w = NODE_SIZE[nodeType]?.width ?? 200;
  return Math.round(g.center - w / 2);
}

/**
 * Contiguous runs of lanes that share a groupLabel, for drawing the band header
 * (e.g. one "กระบวนการ" band spanning the four org columns).
 */
export function laneBands(lanes: Lane[]): { label: string; x: number; width: number }[] {
  const geo = computeLaneGeometry(lanes);
  const bands: { label: string; x: number; width: number }[] = [];
  let i = 0;
  while (i < geo.length) {
    const label = geo[i].lane.groupLabel;
    if (!label) {
      i++;
      continue;
    }
    let j = i;
    let width = 0;
    while (j < geo.length && geo[j].lane.groupLabel === label) {
      width += geo[j].width;
      j++;
    }
    bands.push({ label, x: geo[i].x, width });
    i = j;
  }
  return bands;
}
