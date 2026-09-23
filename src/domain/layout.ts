/**
 * Layout engine — turns a `Process` (title + lanes + ordered steps) into
 * absolute geometry the SVG diagram can draw directly.
 *
 * Rules:
 *   - columns  = lanes, left→right in list order
 *   - rows     = steps, top→bottom in list order; every row is as tall as its
 *                box needs (the label is wrapped here, never truncated unless it
 *                is really long), so nothing overlaps vertically
 *   - a step sits centred on its lane's "spine"
 *   - an edge goes from each step to its target(s):
 *       • no branches → the next step in the list
 *       • branches    → each branch's `toStepId` (with the branch label)
 *
 * Arrows never overlap horizontally: any edge that has to travel vertically
 * *past* a box is pushed into a routing CHANNEL on the right side of the lane,
 * and the lane widens by one channel-width per channel it needs (greedy
 * interval colouring). Empty, unused lanes shrink.
 *
 * Pure function — no React, easy to test and reuse from the exporter.
 */
import type { Lane, Process, Step, StepType } from './types';
import { BOX, HEADER_HEIGHT, LAYOUT, META, ORG_TAG, ROUND_SIZE } from './theme';
import { wrapLabel } from './text';

export interface LaidBox {
  step: Step;
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  lines: string[];
  orgLines: string[];
  orgW: number;
}

export interface LaidEdge {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
  path: string;
  labelX?: number;
  labelY?: number;
  labelAnchor?: 'start' | 'middle' | 'end';
}

export interface LaidLane {
  lane: Lane;
  x: number;
  w: number;
  /** x of the box centre-line */
  spineX: number;
  /** geometric centre of the column (for the header label) */
  centerX: number;
  /** box area width (grows for lanes with staggered boxes) */
  contentW: number;
  channelsL: number;
  channelsR: number;
  /** a meta column with no data in any step, squeezed down to a thin strip */
  collapsed?: boolean;
}

export interface DiagramLayout {
  width: number;
  height: number;
  headerHeight: number;
  bandHeight: number;
  laneHeadHeight: number;
  gutter: number;
  band: { label: string; x: number; w: number } | null;
  lanes: LaidLane[];
  boxes: LaidBox[];
  gutterMarks: { n: number; y: number }[];
  edges: LaidEdge[];
}

const LOOP = '__loop__';

type EdgeKind = 'direct' | 'skip' | 'cross' | 'loop';
type Side = 'L' | 'R';

interface Plan {
  fromIdx: number;
  toIdx: number;
  label?: string;
  kind: EdgeKind;
  outSlot: number;
  outOf: number;
  inSlot: number;
  inOf: number;
  yh?: number;
  srcCh?: number;
  srcSide?: Side;
  tgtCh?: number;
  tgtSide?: Side;
  loopCh?: number;
}

interface Metrics {
  w: number;
  h: number;
  /** row height this step needs — max of the box and its meta-column text */
  contentH: number;
  lines: string[];
  orgLines: string[];
  orgW: number;
  orgH: number;
}

function metaTextHeight(step: Step, metaLanes: Lane[]): number {
  let mh = 0;
  for (const l of metaLanes) {
    if (!l.field) continue;
    const v = step[l.field];
    if (!v) continue;
    const n = wrapLabel(v, META.maxChars).length;
    mh = Math.max(mh, n * (META.fontSize + 4) + 6);
  }
  return mh;
}

function boxMetrics(step: Step, metaLanes: Lane[]): Metrics {
  const metaH = metaTextHeight(step, metaLanes);

  if (step.type === 'start' || step.type === 'end' || step.type === 'connector') {
    const s = ROUND_SIZE[step.type];
    return {
      w: s,
      h: s,
      contentH: Math.max(s, metaH),
      lines: [],
      orgLines: [],
      orgW: 0,
      orgH: 0,
    };
  }
  const cfg = BOX[step.type];
  const fallback = step.type === 'decision' ? 'จุดตัดสินใจ' : 'ขั้นตอน';
  const lines = wrapLabel(step.label || fallback, cfg.maxChars);
  const lh = cfg.fontSize + 4;
  const textH = Math.ceil(lines.length * lh);
  // decision: the rhombus tapers, so the text block must sit inside its middle
  // ~55% — give the diamond ~1.9× the text height (plus a floor)
  const h =
    step.type === 'decision'
      ? Math.max(108, Math.round(textH * 1.9) + 40)
      : Math.max(58, textH + 22);

  const orgLines = step.mainUnit ? wrapLabel(step.mainUnit, ORG_TAG.maxChars) : [];
  const orgH = orgLines.length ? orgLines.length * (ORG_TAG.fontSize + 3) + 9 : 0;
  const longest = orgLines.reduce((mx, l) => Math.max(mx, l.length), 0);
  const orgW = orgLines.length
    ? Math.min(cfg.width + 12, Math.max(56, longest * 5.6 + 16))
    : 0;

  return { w: cfg.width, h, contentH: Math.max(h, metaH), lines, orgLines, orgW, orgH };
}

/** Greedy interval colouring — returns a channel index per input interval. */
function colourIntervals(items: { y1: number; y2: number }[]): number[] {
  const order = items
    .map((_, i) => i)
    .sort((a, b) => items[a].y1 - items[b].y1 || items[a].y2 - items[b].y2);
  const ends: number[] = [];
  const out = new Array(items.length).fill(0);
  const GAP = 10;
  for (const i of order) {
    const it = items[i];
    let ch = ends.findIndex((e) => e + GAP <= it.y1);
    if (ch === -1) {
      ch = ends.length;
      ends.push(it.y2);
    } else {
      ends[ch] = it.y2;
    }
    out[i] = ch;
  }
  return out;
}

/** Knobs the viewer can turn that change the picture but never the data. */
export interface LayoutOptions {
  /** squeeze meta columns nobody filled in down to a thin labelled strip */
  collapseEmptyMeta?: boolean;
}

export function computeLayout(proc: Process, opts: LayoutOptions = {}): DiagramLayout {
  const steps = proc.steps;
  const N = steps.length;
  const indexById = new Map(steps.map((s, i) => [s.id, i]));

  const metaLanes = proc.lanes.filter((l) => l.kind === 'meta');
  /** a meta column is empty when not one step has anything in its field */
  const metaEmpty = (l: Lane) =>
    !l.field || !steps.some((s) => (s[l.field!] ?? '').toString().trim());
  const isCollapsed = (l: Lane) => !!opts.collapseEmptyMeta && l.kind === 'meta' && metaEmpty(l);
  // a collapsed column shows no text, so it must not stretch the rows either
  const shownMetaLanes = metaLanes.filter((l) => !isCollapsed(l));

  // ---------- 1. box metrics + row positions ----------
  const m = steps.map((s) => boxMetrics(s, shownMetaLanes));
  const rowCy: number[] = [];
  let cursor = HEADER_HEIGHT + LAYOUT.rowTop;
  for (let i = 0; i < N; i++) {
    rowCy[i] = cursor + m[i].contentH / 2;
    cursor += m[i].contentH + m[i].orgH + LAYOUT.rowVGap;
  }
  const height = (N ? cursor - LAYOUT.rowVGap : cursor) + LAYOUT.rowBottom;

  const boxTop = (i: number) => rowCy[i] - m[i].h / 2;
  const boxBot = (i: number) => rowCy[i] + m[i].h / 2;

  // ---------- 1b. horizontal stagger + which side each branch routes on ----------
  // A decision's nearest same-lane target keeps the spine; every extra same-lane
  // target is a "side excursion" — it is nudged left/right, and its incoming edge
  // is routed on that same side so nothing runs over the main flow.
  const laneIndex = new Map(proc.lanes.map((l, i) => [l.id, i]));
  const staggerDir = new Map<number, -1 | 1>(); // box index → direction
  const branchSide = new Map<string, Side>(); // "from->to" → side its edge routes
  steps.forEach((s, i) => {
    const tg = (s.branches ?? [])
      .map((b) => (b.toStepId && indexById.has(b.toStepId) ? (indexById.get(b.toStepId) as number) : -1))
      .filter((t) => t > i && steps[t].laneId === s.laneId)
      .sort((a, b) => a - b);
    tg.forEach((t, k) => {
      if (k === 0) {
        branchSide.set(`${i}->${t}`, 'R'); // primary keeps the spine
        return;
      }
      const side: Side = k % 2 === 1 ? 'L' : 'R';
      branchSide.set(`${i}->${t}`, side);
      staggerDir.set(t, side === 'L' ? -1 : 1);
    });
  });

  // ---------- 2. edge plans ----------
  const plans: Plan[] = [];
  const outCount = new Array(N).fill(0);
  const inCount = new Array(N).fill(0);

  steps.forEach((s, i) => {
    // Edges are ONLY drawn from explicit "เส้นทางออก" entries — nothing is
    // auto-connected to the next step.
    const branches = (s.branches ?? []).filter(
      (b) => b.toStepId && indexById.has(b.toStepId),
    );
    const targets: { toIdx: number; label?: string }[] = branches.map((b) => ({
      toIdx: indexById.get(b.toStepId as string) as number,
      label: b.label || undefined,
    }));

    for (const t of targets) {
      if (t.toIdx === i) continue;
      const from = steps[i];
      const to = steps[t.toIdx];
      const sameLane = from.laneId === to.laneId;
      let kind: EdgeKind;
      if (t.toIdx <= i) kind = 'loop';
      else if (sameLane && t.toIdx === i + 1) kind = 'direct';
      else if (sameLane) kind = 'skip';
      else kind = 'cross';
      plans.push({
        fromIdx: i,
        toIdx: t.toIdx,
        label: t.label,
        kind,
        outSlot: outCount[i]++,
        outOf: 0,
        inSlot: inCount[t.toIdx]++,
        inOf: 0,
      });
    }
  });
  for (const p of plans) {
    p.outOf = outCount[p.fromIdx];
    p.inOf = inCount[p.toIdx];
  }

  // ---------- 3. vertical runs that need a channel ----------
  // Channels sit on BOTH sides of a lane. `key` = "<laneId>:L" | "<laneId>:R" | LOOP.
  const CROSS_THRESHOLD = 50;
  interface RunRef {
    key: string;
    y1: number;
    y2: number;
    plan: Plan;
    slot: 'skip' | 'src' | 'tgt' | 'loop';
  }
  const runs: RunRef[] = [];
  const laneIdxOf = (id: string) => laneIndex.get(id) ?? 0;
  const skipCount = new Map<string, number>(); // per-lane counter to alternate sides

  for (const p of plans) {
    const from = steps[p.fromIdx];
    const to = steps[p.toIdx];
    const fb = boxBot(p.fromIdx);
    const tt = boxTop(p.toIdx);

    if (p.kind === 'skip') {
      let side = branchSide.get(`${p.fromIdx}->${p.toIdx}`);
      if (!side) {
        const n = skipCount.get(from.laneId) ?? 0;
        side = n % 2 === 0 ? 'R' : 'L';
        skipCount.set(from.laneId, n + 1);
      }
      p.srcSide = side;
      runs.push({ key: `${from.laneId}:${side}`, y1: fb, y2: tt, plan: p, slot: 'skip' });
    } else if (p.kind === 'cross') {
      let yh = fb + 18 + p.outSlot * 15;
      if (yh > tt - 12) yh = (fb + tt) / 2;
      p.yh = yh;
      const targetIsRight = laneIdxOf(to.laneId) > laneIdxOf(from.laneId);
      if (tt - yh > CROSS_THRESHOLD) {
        // vertical run in the target lane, on the side the horizontal arrives from
        p.tgtSide = targetIsRight ? 'L' : 'R';
        runs.push({ key: `${to.laneId}:${p.tgtSide}`, y1: yh, y2: tt, plan: p, slot: 'tgt' });
      }
      if (yh - fb > CROSS_THRESHOLD) {
        p.srcSide = targetIsRight ? 'R' : 'L';
        runs.push({ key: `${from.laneId}:${p.srcSide}`, y1: fb, y2: yh, plan: p, slot: 'src' });
      }
    } else if (p.kind === 'loop') {
      runs.push({ key: LOOP, y1: tt - 14, y2: fb + 14, plan: p, slot: 'loop' });
    }
  }

  // ---------- 4. colour channels per (lane, side) ----------
  const byKey = new Map<string, RunRef[]>();
  for (const r of runs) {
    const list = byKey.get(r.key) ?? [];
    list.push(r);
    byKey.set(r.key, list);
  }
  const channelCount = new Map<string, number>();
  for (const [key, list] of byKey) {
    const idx = colourIntervals(list.map((r) => ({ y1: r.y1, y2: r.y2 })));
    idx.forEach((c, k) => {
      const r = list[k];
      const clamped = Math.min(c, LAYOUT.maxChannels - 1);
      if (r.slot === 'tgt') r.plan.tgtCh = clamped;
      else if (r.slot === 'loop') r.plan.loopCh = clamped;
      else r.plan.srcCh = clamped; // 'skip' and 'src' both use srcCh
    });
    channelCount.set(key, Math.min(LAYOUT.maxChannels, Math.max(-1, ...idx) + 1));
  }

  // ---------- 5. lane geometry ----------
  const usedLanes = new Set(steps.map((s) => s.laneId));
  const staggerLanes = new Set(
    steps.filter((_, i) => staggerDir.has(i)).map((s) => s.laneId),
  );
  const block = (n: number) => (n > 0 ? LAYOUT.channelGap + n * LAYOUT.channelW + 4 : 0);
  const lanes: LaidLane[] = [];
  let x = LAYOUT.gutter;
  for (const lane of proc.lanes) {
    if (lane.kind === 'meta') {
      const collapsed = isCollapsed(lane);
      const w = collapsed ? META.collapsedW : META.width;
      lanes.push({
        lane, x, w, spineX: x + w / 2, centerX: x + w / 2,
        contentW: w, channelsL: 0, channelsR: 0, collapsed,
      });
      x += w;
      continue;
    }
    const nL = channelCount.get(`${lane.id}:L`) ?? 0;
    const nR = channelCount.get(`${lane.id}:R`) ?? 0;
    const bare = !usedLanes.has(lane.id) && nL === 0 && nR === 0;
    if (bare) {
      lanes.push({
        lane, x, w: LAYOUT.emptyLaneW,
        spineX: x + LAYOUT.emptyLaneW / 2, centerX: x + LAYOUT.emptyLaneW / 2,
        contentW: LAYOUT.emptyLaneW, channelsL: 0, channelsR: 0,
      });
      x += LAYOUT.emptyLaneW;
      continue;
    }
    const contentW =
      LAYOUT.laneContentW + (staggerLanes.has(lane.id) ? LAYOUT.boxOffset + 40 : 0);
    const leftBlock = block(nL);
    const w = LAYOUT.lanePad * 2 + leftBlock + contentW + block(nR);
    lanes.push({
      lane, x, w,
      spineX: x + LAYOUT.lanePad + leftBlock + contentW / 2,
      centerX: x + w / 2,
      contentW,
      channelsL: nL,
      channelsR: nR,
    });
    x += w;
  }
  const lanesRight = x;
  const orgLaid = lanes.filter((l) => l.lane.kind === 'org');
  const loopN = channelCount.get(LOOP) ?? 0;
  const width =
    lanesRight +
    (loopN > 0 ? LAYOUT.loopGap + loopN * LAYOUT.channelW + 12 : LAYOUT.loopMargin) +
    10;

  const laneById = new Map(lanes.map((l) => [l.lane.id, l]));
  const channelX = (laneId: string, side: Side, c: number): number => {
    const l = laneById.get(laneId);
    if (!l) return lanesRight;
    if (side === 'R') {
      const cl = Math.min(c, Math.max(1, l.channelsR) - 1);
      return (
        l.spineX + l.contentW / 2 + LAYOUT.channelGap + cl * LAYOUT.channelW + LAYOUT.channelW / 2
      );
    }
    const cl = Math.min(c, Math.max(1, l.channelsL) - 1);
    return (
      l.spineX - l.contentW / 2 - LAYOUT.channelGap - cl * LAYOUT.channelW - LAYOUT.channelW / 2
    );
  };
  const loopX = (c: number) =>
    lanesRight + LAYOUT.loopGap + c * LAYOUT.channelW + LAYOUT.channelW / 2;

  // ---------- 6. boxes ----------
  const firstOrg = orgLaid[0] ?? lanes[0];
  const boxes: LaidBox[] = steps.map((step, index) => {
    const found = laneById.get(step.laneId);
    const l = found && found.lane.kind === 'org' ? found : firstOrg;
    const mi = m[index];
    const base = l ? l.spineX : LAYOUT.gutter + LAYOUT.laneContentW / 2;
    const cx = base + (staggerDir.get(index) ?? 0) * LAYOUT.boxOffset;
    const cy = rowCy[index];
    return {
      step,
      index,
      w: mi.w,
      h: mi.h,
      x: cx - mi.w / 2,
      y: cy - mi.h / 2,
      cx,
      cy,
      lines: mi.lines,
      orgLines: mi.orgLines,
      orgW: mi.orgW,
    };
  });

  const isRound = (t: StepType) => t === 'start' || t === 'end' || t === 'connector';

  const outPoint = (b: LaidBox, slot: number, of: number) => {
    if (isRound(b.step.type) || b.step.type === 'decision') return { x: b.cx, y: b.y + b.h };
    const lo = b.x + 16;
    const hi = b.x + b.w - 16;
    const t = of <= 1 ? 0.5 : slot / (of - 1);
    return { x: lo + (hi - lo) * t, y: b.y + b.h };
  };
  // every arrowhead lands on the top-centre of the target box
  const inPoint = (b: LaidBox) => ({ x: b.cx, y: b.y });

  // ---------- 7. edge paths ----------
  const edges: LaidEdge[] = plans.map((p, k) => {
    const F = boxes[p.fromIdx];
    const T = boxes[p.toIdx];
    const op = outPoint(F, p.outSlot, p.outOf);
    const ip = inPoint(T);
    const from = steps[p.fromIdx];
    const to = steps[p.toIdx];
    let path: string;
    let labelX: number | undefined;
    let labelY: number | undefined;
    let labelAnchor: LaidEdge['labelAnchor'] = 'start';

    if (p.kind === 'direct') {
      if (Math.abs(op.x - ip.x) < 1) {
        path = `M ${op.x} ${op.y} L ${ip.x} ${ip.y}`;
        labelX = op.x + 8;
        labelY = (op.y + ip.y) / 2;
      } else {
        const midY = (op.y + ip.y) / 2;
        path = `M ${op.x} ${op.y} L ${op.x} ${midY} L ${ip.x} ${midY} L ${ip.x} ${ip.y}`;
        labelX = (op.x + ip.x) / 2;
        labelY = midY - 6;
        labelAnchor = 'middle';
      }
    } else if (p.kind === 'skip') {
      const side = p.srcSide ?? 'R';
      const cx = channelX(from.laneId, side, p.srcCh ?? 0);
      const y1 = op.y + 10;
      const y2 = ip.y - 10;
      path =
        `M ${op.x} ${op.y} L ${op.x} ${y1} L ${cx} ${y1} ` +
        `L ${cx} ${y2} L ${ip.x} ${y2} L ${ip.x} ${ip.y}`;
      labelX = side === 'R' ? cx + 7 : cx - 7;
      labelY = (y1 + y2) / 2;
      labelAnchor = side === 'R' ? 'start' : 'end';
    } else if (p.kind === 'cross') {
      const yh = p.yh ?? (op.y + ip.y) / 2;
      const parts = [`M ${op.x} ${op.y}`];
      let sx = op.x;
      if (p.srcCh != null && p.srcSide) {
        const scx = channelX(from.laneId, p.srcSide, p.srcCh);
        parts.push(`L ${op.x} ${op.y + 10}`, `L ${scx} ${op.y + 10}`, `L ${scx} ${yh}`);
        sx = scx;
      } else {
        parts.push(`L ${op.x} ${yh}`);
      }
      let ex = ip.x;
      if (p.tgtCh != null && p.tgtSide) {
        const tcx = channelX(to.laneId, p.tgtSide, p.tgtCh);
        parts.push(
          `L ${tcx} ${yh}`,
          `L ${tcx} ${ip.y - 10}`,
          `L ${ip.x} ${ip.y - 10}`,
          `L ${ip.x} ${ip.y}`,
        );
        ex = tcx;
      } else {
        parts.push(`L ${ip.x} ${yh}`, `L ${ip.x} ${ip.y}`);
      }
      path = parts.join(' ');
      labelX = (sx + ex) / 2;
      labelY = yh - 6;
      labelAnchor = 'middle';
    } else {
      // loop
      const lx = loopX(p.loopCh ?? 0);
      const y2 = op.y + 14;
      const y1 = ip.y - 14;
      path =
        `M ${op.x} ${op.y} L ${op.x} ${y2} L ${lx} ${y2} ` +
        `L ${lx} ${y1} L ${ip.x} ${y1} L ${ip.x} ${ip.y}`;
      labelX = lx - 7;
      labelY = (y1 + y2) / 2;
      labelAnchor = 'end';
    }

    return {
      id: `${F.step.id}__${T.step.id}__${k}`,
      fromId: F.step.id,
      toId: T.step.id,
      label: p.label,
      path,
      labelX,
      labelY,
      labelAnchor,
    };
  });

  return {
    width,
    height,
    headerHeight: HEADER_HEIGHT,
    bandHeight: LAYOUT.bandHeight,
    laneHeadHeight: LAYOUT.laneHeadHeight,
    gutter: LAYOUT.gutter,
    band: orgLaid.length
      ? {
          label: proc.bandLabel,
          x: orgLaid[0].x,
          w: orgLaid[orgLaid.length - 1].x + orgLaid[orgLaid.length - 1].w - orgLaid[0].x,
        }
      : null,
    lanes,
    boxes,
    gutterMarks: boxes.map((b) => ({ n: b.index + 1, y: b.cy })),
    edges,
  };
}
