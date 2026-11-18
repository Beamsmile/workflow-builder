/**
 * Layout engine — แปลง `Process` เป็นตำแหน่งจริง (px) ให้ SVG วาดได้ทันที
 *
 * งานแบ่งสองชั้น:
 *   1. `route.ts` ตัดสินใจว่ากล่องไหนอยู่รางไหน และเส้นแต่ละเส้นเดินแบบไหน
 *      (ทำบนตารางนามธรรม จึงใช้ร่วมกับ Excel ได้)
 *   2. ไฟล์นี้ใส่ขนาดจริง: ความสูงแถวตามข้อความ, ความกว้างรางตามกล่อง,
 *      ทางเดินกว้างตามจำนวนเส้นที่ต้องอ้อมผ่าน แล้วสร้าง path ของเส้นกับตำแหน่งป้าย
 *
 * กติกาที่เห็นในภาพ (ตามผังตัวอย่างของทีม):
 *   - แถว = ลำดับขั้น (ตรงกับแถวในตาราง บฟ.)
 *   - เส้นออกจากกึ่งกลางขอบล่าง เข้าที่กึ่งกลางขอบบน
 *   - กิ่งแยกด้วยเส้นแนวนอนใต้กล่องต้นทาง ป้ายกิ่งอยู่บนเส้นตรงจุดแยก
 *   - เส้นย้อนกลับออกด้านข้างกล่อง และเข้าด้านข้างกล่องปลายทาง
 *
 * Pure function — no React, easy to test and reuse from the exporter.
 */
import type { Lane, Process, Step } from './types';
import { BOX, HEADER_HEIGHT, LAYOUT, META, ORG_TAG, ROUND_SIZE } from './theme';
import { connectorWidth, edgeLabelWidth, wrapLabel } from './text';
import { planFlow, LANE_SPAN, type PlannedEdge } from './route';

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
  /** x ของรางกลาง (ราง 0) */
  spineX: number;
  /** geometric centre of the column (for the header label) */
  centerX: number;
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

/** ข้าวหลามตัดบนเว็บกว้างได้สุดเท่านี้ (px) แล้วค่อยสูงต่อ */
const DECISION_MAX_W = 360;

function boxMetrics(step: Step, metaLanes: Lane[]): Metrics {
  const metaH = metaTextHeight(step, metaLanes);

  if (step.type === 'start' || step.type === 'end' || step.type === 'connector') {
    const s = ROUND_SIZE[step.type];
    // จุดเชื่อมที่ป้ายยาว (เช่น "C8.1.6") ยืดเป็นวงรีให้เห็นป้ายครบ — สูงเท่าเดิม
    const w = step.type === 'connector' ? connectorWidth(step.label, s) : s;
    return { w, h: s, contentH: Math.max(s, metaH), lines: [], orgLines: [], orgW: 0, orgH: 0 };
  }
  const cfg = BOX[step.type];
  const fallback = step.type === 'decision' ? 'จุดตัดสินใจ' : 'ขั้นตอน';
  const lh = cfg.fontSize + 4;
  // decision: the rhombus tapers, so the text block must sit inside its middle
  // ~55% — give the diamond ~1.9× the text height (plus a floor)
  const sizeAt = (w: number) => {
    const chars = Math.floor((cfg.maxChars * w) / cfg.width);
    const lines = wrapLabel(step.label || fallback, chars);
    const textH = Math.ceil(lines.length * lh);
    const h =
      step.type === 'decision'
        ? Math.max(108, Math.round(textH * 1.9) + 40)
        : Math.max(58, textH + 22);
    return { lines, h };
  };
  // ข้าวหลามตัดข้อความยาว: ขยายความกว้างก่อน (เหมือนใน Excel — ผู้ใช้เลือก 18 พ.ย. 2569)
  // ไม่ให้สูงชะลูด — กว้างขึ้นทีละ 20px จนสูงไม่เกิน 80% ของความกว้าง (กว้างสุด DECISION_MAX_W)
  let w = cfg.width;
  let { lines, h } = sizeAt(w);
  if (step.type === 'decision') {
    while (w < DECISION_MAX_W && h > w * 0.8) {
      w = Math.min(DECISION_MAX_W, w + 20);
      ({ lines, h } = sizeAt(w));
    }
  }

  const orgLines = step.mainUnit ? wrapLabel(step.mainUnit, ORG_TAG.maxChars) : [];
  const orgH = orgLines.length ? orgLines.length * (ORG_TAG.fontSize + 3) + 9 : 0;
  const longest = orgLines.reduce((mx, l) => Math.max(mx, l.length), 0);
  const orgW = orgLines.length
    ? Math.min(w + 12, Math.max(56, longest * 5.6 + 16))
    : 0;

  return { w, h, contentH: Math.max(h, metaH), lines, orgLines, orgW, orgH };
}

/** Greedy interval colouring — returns a channel index per input interval. */
export function colourIntervals(items: { y1: number; y2: number }[]): number[] {
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

/** ป้ายของเส้น i→j = ป้ายของทุกกิ่งจากขั้น i ที่ไปขั้น j (ปกติมีกิ่งเดียว) */
function edgeLabel(from: Step, to: Step): string | undefined {
  const labels = (from.branches ?? [])
    .filter((b) => b.toStepId === to.id && b.label.trim())
    .map((b) => b.label.trim());
  return labels.length ? labels.join(' / ') : undefined;
}

/** Knobs the viewer can turn that change the picture but never the data. */
export interface LayoutOptions {
  /** squeeze meta columns nobody filled in down to a thin labelled strip */
  collapseEmptyMeta?: boolean;
}

export function computeLayout(proc: Process, opts: LayoutOptions = {}): DiagramLayout {
  const steps = proc.steps;
  const N = steps.length;

  const metaLanes = proc.lanes.filter((l) => l.kind === 'meta');
  /** a meta column is empty when not one step has anything in its field */
  const metaEmpty = (l: Lane) =>
    !l.field || !steps.some((s) => (s[l.field!] ?? '').toString().trim());
  const isCollapsed = (l: Lane) => !!opts.collapseEmptyMeta && l.kind === 'meta' && metaEmpty(l);
  // a collapsed column shows no text, so it must not stretch the rows either
  const shownMetaLanes = metaLanes.filter((l) => !isCollapsed(l));

  // ---------- 1. แผนราง + เส้น (นามธรรม) ----------
  const plan = planFlow(proc);
  const labels = plan.edges.map((e) => edgeLabel(steps[e.from], steps[e.to]));
  // ขั้นที่มีป้ายกิ่งห้อยอยู่ใต้กล่อง ต้องเว้นแถวเพิ่มให้ป้ายไม่ชนกล่องถัดไป
  const hasLabelBelow = new Array(N).fill(false);
  plan.edges.forEach((e, k) => {
    if (labels[k] && e.kind !== 'loop') hasLabelBelow[e.from] = true;
  });

  // ---------- 2. ความสูงแถว ----------
  const m = steps.map((s) => boxMetrics(s, shownMetaLanes));
  const rowCy: number[] = [];
  let cursor = HEADER_HEIGHT + LAYOUT.rowTop;
  for (let i = 0; i < N; i++) {
    rowCy[i] = cursor + m[i].contentH / 2;
    cursor +=
      m[i].contentH + m[i].orgH + LAYOUT.rowVGap + (hasLabelBelow[i] ? LAYOUT.labelRowExtra : 0);
  }
  const height = (N ? cursor - LAYOUT.rowVGap : cursor) + LAYOUT.rowBottom;

  const boxTop = (i: number) => rowCy[i] - m[i].h / 2;
  const boxBot = (i: number) => rowCy[i] + m[i].h / 2;
  /** ใต้ป้ายหน่วยงานสีแดง — เส้นแยก/ป้ายกิ่งต้องอยู่ต่ำกว่านี้ */
  const blockBot = (i: number) => boxBot(i) + (m[i].orgH ? m[i].orgH + 3 : 0);
  const outY = (i: number) => blockBot(i) + LAYOUT.busGap;
  const inY = (j: number) => boxTop(j) - LAYOUT.busGap;

  // ---------- 3. ทางเดิน: แบ่งช่องให้เส้นที่อ้อมผ่านทางเดินเดียวกัน ----------
  const corridorRuns = new Map<number, { k: number; y1: number; y2: number }[]>();
  plan.edges.forEach((e, k) => {
    if (e.corridorX === undefined) return;
    const run =
      e.kind === 'loop'
        ? { k, y1: rowCy[e.to], y2: rowCy[e.from] }
        : { k, y1: outY(e.from), y2: inY(e.to) };
    const list = corridorRuns.get(e.corridorX) ?? [];
    list.push(run);
    corridorRuns.set(e.corridorX, list);
  });
  const channelOf = new Map<number, number>(); // edge index → ช่อง
  const channelCount = new Map<number, number>(); // corridorX → จำนวนช่อง
  for (const [cx, list] of corridorRuns) {
    const idx = colourIntervals(list);
    idx.forEach((c, n) => channelOf.set(list[n].k, c));
    channelCount.set(cx, Math.max(...idx) + 1);
  }

  // ---------- 4. ความกว้างเลน / ราง / ทางเดิน ----------
  const orgLanes = proc.lanes.filter((l) => l.kind === 'org');
  const orgIndex = new Map(orgLanes.map((l, k) => [l.id, k]));
  /** กล่องที่กว้างที่สุดในแต่ละราง — "เลน:ราง" → px */
  const trackBoxW = new Map<string, number>();
  const range = new Map<number, { lo: number; hi: number }>();
  steps.forEach((_, i) => {
    const k = plan.lane[i];
    const t = plan.track[i];
    const key = `${k}:${t}`;
    trackBoxW.set(key, Math.max(trackBoxW.get(key) ?? 0, m[i].w, m[i].orgW));
    const r = range.get(k) ?? { lo: t, hi: t };
    range.set(k, { lo: Math.min(r.lo, t), hi: Math.max(r.hi, t) });
  });

  const trackX = new Map<string, number>(); // "เลน:ราง" → x กึ่งกลาง
  const corridorCenter = new Map<number, number>(); // corridorX → x กึ่งกลางทางเดิน
  const lanes: LaidLane[] = [];
  let x = LAYOUT.gutter;
  for (const lane of proc.lanes) {
    if (lane.kind === 'meta') {
      const collapsed = isCollapsed(lane);
      const w = collapsed ? META.collapsedW : META.width;
      lanes.push({ lane, x, w, spineX: x + w / 2, centerX: x + w / 2, collapsed });
      x += w;
      continue;
    }
    const k = orgIndex.get(lane.id) ?? 0;
    const r = range.get(k);
    if (!r) {
      // เลนที่ไม่มีขั้นตอน: แคบลง (เส้นที่ผ่านเป็นแนวนอนเท่านั้น)
      const w = LAYOUT.emptyLaneW;
      lanes.push({ lane, x, w, spineX: x + w / 2, centerX: x + w / 2 });
      x += w;
      continue;
    }
    const x0 = x;
    let spineX = x0;
    for (let p = r.lo - 0.5; p <= r.hi + 0.5 + 1e-9; p += 0.5) {
      const ax = k * LANE_SPAN + p;
      if (Math.abs(p - Math.round(p)) > 1e-6) {
        // ทางเดิน (ครึ่งราง)
        const outer = p < r.lo || p > r.hi;
        const n = channelCount.get(ax) ?? 0;
        const w =
          (outer ? LAYOUT.lanePad : LAYOUT.trackGap) +
          (n ? LAYOUT.channelGap + n * LAYOUT.channelW : 0);
        corridorCenter.set(ax, x + w / 2);
        x += w;
      } else {
        const bw = trackBoxW.get(`${k}:${p}`);
        const w = bw ? bw + LAYOUT.trackPad * 2 : LAYOUT.emptyTrackW;
        trackX.set(`${k}:${p}`, x + w / 2);
        if (p === 0 || (p === r.lo && r.lo > 0)) spineX = x + w / 2;
        x += w;
      }
    }
    const w = x - x0;
    lanes.push({ lane, x: x0, w, spineX, centerX: x0 + w / 2 });
  }
  const width = x + LAYOUT.rightMargin;

  /** x กึ่งกลางของช่องที่เส้น k ได้ในทางเดินของมัน */
  const corridorPx = (e: PlannedEdge, k: number): number => {
    const c = corridorCenter.get(e.corridorX as number) ?? x;
    const n = channelCount.get(e.corridorX as number) ?? 1;
    const ch = channelOf.get(k) ?? 0;
    return c + (ch - (n - 1) / 2) * LAYOUT.channelW;
  };

  // ---------- 5. กล่อง ----------
  const boxes: LaidBox[] = steps.map((step, index) => {
    const mi = m[index];
    const cx = trackX.get(`${plan.lane[index]}:${plan.track[index]}`) ?? LAYOUT.gutter;
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

  // ---------- 6. เส้น + 7. ป้ายกิ่ง (ใช้ฟังก์ชันกลางร่วมกับ Excel) ----------
  const routes = plan.edges.map((e, k) =>
    edgeRoute(e, boxes[e.from], boxes[e.to], outY(e.from), inY(e.to), () => corridorPx(e, k)),
  );
  const labelPos = placeEdgeLabels(routes, labels, plan.edges, edgeLabelWidth, 20, boxes);

  const edges: LaidEdge[] = plan.edges.map((e, k) => {
    const F = boxes[e.from];
    const T = boxes[e.to];
    const pos = labelPos[k];
    return {
      id: `${F.step.id}__${T.step.id}__${k}`,
      fromId: F.step.id,
      toId: T.step.id,
      label: labels[k],
      path: routes[k].pts.map(([px, py], n) => `${n ? 'L' : 'M'} ${px} ${py}`).join(' '),
      labelX: pos?.[0],
      labelY: pos?.[1],
      labelAnchor: 'middle',
    };
  });

  const orgLaid = lanes.filter((l) => l.lane.kind === 'org');
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

// ======================================================================
// ส่วนกลางที่ Excel (lib/excelDrawing.ts) ใช้ด้วย — หน้าเว็บกับ Excel จึงเดินเส้นและวางป้ายเหมือนกัน
// ======================================================================

export type Pt = [number, number];

/** ตำแหน่งกล่องที่ตัวเดินเส้นต้องรู้ (หน้าเว็บใช้ LaidBox, Excel ส่งค่าของตัวเองมา) */
export interface BoxGeom {
  cx: number;
  cy: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * ตำแหน่งป้าย [x, y, ชิด] — ชิด 0 = ป้ายอยู่กึ่งกลาง x, 1 = ขอบซ้ายของป้ายอยู่ที่ x (ป้ายยื่นไปทางขวา),
 * -1 = ขอบขวาของป้ายอยู่ที่ x (ยื่นไปทางซ้าย)
 */
export type Spot = [number, number, (-1 | 0 | 1)?];

export interface EdgeRoute {
  /** จุดหักของเส้น ตั้งแต่ต้นทางถึงหัวลูกศร */
  pts: Pt[];
  /** ตำแหน่งป้ายที่ลองตามลำดับ (ตัวแรกคือแบบผังตัวอย่าง ตัวถัดไปคือทางสำรองเมื่อชนเส้น/กล่อง) */
  spots: Spot[];
}

/**
 * รูปเส้นจริงของเส้นหนึ่งตามแผนจาก route.ts
 * `yo` = ระดับเส้นแยกใต้ต้นทาง, `yi` = ระดับเส้นรวมเหนือปลายทาง,
 * `corridor()` = x ของช่องในทางเดินที่เส้นนี้ได้ (เรียกเฉพาะเส้นที่อ้อม/ย้อนกลับ)
 */
export function edgeRoute(
  e: PlannedEdge,
  F: BoxGeom,
  T: BoxGeom,
  yo: number,
  yi: number,
  corridor: () => number,
): EdgeRoute {
  const sx = F.cx;
  const tx = T.cx;
  const sb = F.y + F.h; // จุดล่างสุดของรูป (ข้าวหลามตัด = มุมล่าง)
  const tt = T.y;
  const LABEL_DY = 13; // ป้ายกิ่งอยู่ใต้เส้นแยกเล็กน้อย บนเส้นของตัวเอง
  switch (e.kind) {
    case 'straight':
      return { pts: [[sx, sb], [tx, tt]], spots: [[sx, yo + LABEL_DY], [sx, (yo + tt) / 2]] };
    case 'early':
      return {
        pts: [[sx, sb], [sx, yo], [tx, yo], [tx, tt]],
        spots: [[tx, yo + LABEL_DY], [(sx + tx) / 2, yo], [tx, (yo + tt) / 2]],
      };
    case 'late':
      return {
        pts: [[sx, sb], [sx, yi], [tx, yi], [tx, tt]],
        spots: [[sx, yo + LABEL_DY], [sx, (yo + yi) / 2], [(sx + tx) / 2, yi]],
      };
    case 'corridor': {
      const cx = corridor();
      return {
        pts: [[sx, sb], [sx, yo], [cx, yo], [cx, yi], [tx, yi], [tx, tt]],
        spots: [[cx, yo + LABEL_DY], [(sx + cx) / 2, yo], [cx, (yo + yi) / 2]],
      };
    }
    default: {
      // loop — ออกด้านข้าง ขึ้นในทางเดิน แล้วเข้าด้านข้างกล่องปลายทาง
      const s = e.side ?? 1;
      const cx = corridor();
      const ax = F.cx + (s * F.w) / 2;
      const bx = T.cx + (s * T.w) / 2;
      const mid = (F.cy + T.cy) / 2;
      // ป้ายอยู่ด้านนอกของเส้น (ฝั่งที่ไม่มีกล่อง) แบบผังตัวอย่าง — ทางเดินแคบกว่าป้าย
      // ถ้าวางกึ่งกลางเส้นจะทับกล่องข้าง ๆ
      return {
        pts: [[ax, F.cy], [cx, F.cy], [cx, T.cy], [bx, T.cy]],
        spots: [[cx + s * 6, mid, s], [cx, mid, 0], [cx + s * 6, F.cy - 24, s], [cx + s * 6, T.cy + 24, s]],
      };
    }
  }
}

/**
 * วางป้ายกิ่งทีละป้าย: เลือกตำแหน่งแรกใน `spots` ที่ไม่ชนเส้นของต้นทางอื่น
 * และไม่ชนป้ายที่วางไปแล้ว (กิ่งพี่น้องใช้เส้นแยกร่วมกัน จึงแตะเส้นกันได้)
 */
export function placeEdgeLabels(
  routes: EdgeRoute[],
  labels: (string | undefined)[],
  edges: { from: number }[],
  widthOf: (text: string) => number,
  height: number,
  /** กล่องทั้งหมด — ป้ายต้องไม่ทับข้อความในกล่อง */
  boxes: BoxGeom[] = [],
): (Pt | undefined)[] {
  type Rect = { x1: number; x2: number; y1: number; y2: number };
  const segsOf = (pts: Pt[]): Rect[] =>
    pts.slice(1).map((b, n) => {
      const a = pts[n];
      return { x1: Math.min(a[0], b[0]), x2: Math.max(a[0], b[0]), y1: Math.min(a[1], b[1]), y2: Math.max(a[1], b[1]) };
    });
  const allSegs = routes.map((r) => segsOf(r.pts));
  const placed: Rect[] = [];
  const hits = (a: Rect, b: Rect) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
  return routes.map((r, k) => {
    const text = labels[k];
    if (!text) return undefined;
    const w = widthOf(text);
    const centerOf = ([x, y, side = 0]: Spot): Pt => [x + (side * w) / 2, y];
    const rectAt = (sp: Spot): Rect => {
      const [x, y] = centerOf(sp);
      return { x1: x - w / 2, x2: x + w / 2, y1: y - height / 2, y2: y + height / 2 };
    };
    const boxRects: Rect[] = boxes.map((b) => ({ x1: b.x, x2: b.x + b.w, y1: b.y, y2: b.y + b.h }));
    const clear = (rc: Rect) =>
      !placed.some((p) => hits(p, rc)) &&
      !boxRects.some((b) => hits(b, rc)) &&
      !allSegs.some(
        (ss, m) =>
          m !== k &&
          edges[m].from !== edges[k].from &&
          ss.some((q) => hits({ x1: q.x1 - 1, x2: q.x2 + 1, y1: q.y1 - 1, y2: q.y2 + 1 }, rc)),
      );
    const spot = r.spots.find((s) => clear(rectAt(s))) ?? r.spots[0];
    placed.push(rectAt(spot));
    return centerOf(spot);
  });
}
