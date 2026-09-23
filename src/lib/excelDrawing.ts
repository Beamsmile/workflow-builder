/**
 * DrawingML generator for the Excel export.
 *
 * The บฟ. sheet carries the flow drawn as *native, editable* Excel shapes in the
 * "ผังการไหลของกระบวนการ" columns (I–M): one box per table row, each anchored to
 * its own row/lane cell (`twoCellAnchor`) so a box always lines up with the
 * table row it belongs to. Start / End circles share the first / last step row.
 *
 * `write-excel-file` can't draw shapes, so `exportExcel.ts` builds the table and
 * then splices the XML this module produces into the .xlsx zip.
 *
 * Everything is laid out first in a plain pixel model (known column widths + the
 * row heights we set on the sheet), then every shape rectangle is converted back
 * to a cell anchor. Keep the pixel constants here in sync with the row-height
 * maths — the table and the drawing must agree on how tall each row is.
 */
import type { Process, Step } from '../domain/types';
import { wrapLabel } from '../domain/text';

const EMU = 9525; // EMU per pixel
const emu = (px: number) => Math.round(px * EMU);
const pxToPt = (px: number) => Math.round(px * 0.75 * 100) / 100;

/**
 * Column widths for A–I (Excel "character" units), fixed by the บฟ. form
 * ("ตัวอย่าง (ฟอร์มเปล่า).xlsx"). The four org columns J–M are *computed* per
 * process — see `computeExcelDiagram`: a column is as wide as the boxes it
 * holds plus the routing channels its arrows actually need, and an unused
 * column shrinks away.
 */
const FORM_COL_CHARS = [8.16, 51.5, 33, 18.16, 16, 20, 19.16, 20, 27.66];
const charsToPx = (w: number) => Math.round(w * 7 + 5);
const pxToChars = (px: number) => Math.round(((px - 5) / 7) * 100) / 100;

/** Routing-channel geometry (px) — mirrors `LAYOUT` in domain/layout.ts. */
const CHANNEL_W = 16; // width of one vertical routing channel
const CHANNEL_GAP = 12; // gap between the box edge and the first channel
const MAX_CHANNELS = 8; // hard cap, same as the on-screen diagram
const LANE_PAD = 12; // padding inside a sub-lane, each side
const SUBLANE_GAP = 10; // gap between two sub-lanes sharing one column
const EMPTY_COL_CHARS = 12; // width of an org column with no steps in it
const MAX_COL_CHARS = 110; // never let one column explode past this
const MIN_BOX_W = 150;
const MAX_BOX_W = 260;
const CHAR_PX = 8.6; // rough advance width of TH SarabunPSK 16pt
/** branch captions wrap at this many characters, so they stay narrow */
const LABEL_CHARS = 16;
const LABEL_CHAR_PX = 7.4;
/** size of the caption for a branch label (wrapped to LABEL_CHARS) */
const labelBoxW = (text: string) =>
  Math.round(Math.max(40, Math.min(LABEL_CHARS, text.length) * LABEL_CHAR_PX + 18));
const labelBoxH = (text: string) =>
  Math.max(20, Math.max(1, Math.ceil(text.length / LABEL_CHARS)) * 17 + 6);

/** Header row heights (px) — title, header line 1, header line 2. */
const HEADER_ROWS_PX = [26, 20, 42];

// box / text metrics (px), tuned for TH Sarabun New 16pt
const LINE_PX = 21; // label line (16pt)
const UNIT_LINE_PX = 17; // หน่วยงานรับผิดชอบหลัก line (13pt)
const BOX_PAD_Y = 12;
const UNIT_GAP_PX = 6; // gap between the label and the unit line inside a box
const ROW_MARGIN_PX = 14; // breathing room above + below the content in a data row
const MIN_ROW_PX = 62;
const START_END_ZONE_PX = 52; // extra height on the first / last data row for the circle
const CIRCLE_PX = 46;

// House style, matching "3.Maintenance V.3.xlsx": every flow shape is a WHITE
// box with a black border and black text (no colour-coding). Process boxes hold
// only the responsible unit; the step text lives in the table's column B.
const COLORS = {
  shape: 'FFFFFF',
  shapeBorder: '000000',
  nodeText: '1F2430',
  unitText: '5B6472',
  edge: '5B6472',
  appLink: '2E8B57',
  branchNormal: '1E7E34',
  branchAlt: 'C0392B',
} as const;

const FONT = 'TH SarabunPSK';

/**
 * lane → บฟ. column index (0-based): I=8 app, J=9 สนญ., K=10 กฟข., L=11 กฟฟ.,
 * M=12 อื่นๆ. The form has exactly these four org columns, so any lane the user
 * names themselves lands in "อื่นๆ" — `computeExcelDiagram` then gives each such
 * lane its own sub-column inside M so they never draw on top of each other.
 */
function laneColumn(proc: Process, laneId: string): number {
  const lane = proc.lanes.find((l) => l.id === laneId);
  const label = (lane?.label ?? '').replace(/\s/g, '');
  if (/สนญ|สำนักงานใหญ่/.test(label)) return 9;
  if (/กฟข/.test(label)) return 10;
  if (/กฟฟ/.test(label)) return 11;
  return 12; // อื่นๆ / anything else
}

/**
 * Greedy interval colouring — the same routine the on-screen diagram uses
 * (`colourIntervals` in domain/layout.ts). Arrows whose vertical spans do NOT
 * overlap share a channel, so a lane only widens for arrows that truly clash.
 */
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

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Sub-actions for a step's "งาน/ขั้นตอน" cell — one per non-empty line of the note. */
export function stepSubActions(step: Step): string[] {
  return (step.note ?? '')
    .split(/\r?\n/)
    .map((s) => s.replace(/^[\s*·•\-–]+/, '').trim())
    .filter(Boolean);
}

/**
 * The full text of the "งาน/ขั้นตอนการดำเนินการ" cell (column B), in the house
 * format (see `ร่าง (ตัวอย่างที่ทำเสร็จ).xlsx`):
 *
 *   <title>                                        ← rendered bold + underlined
 *    - <หน่วยงานรับผิดชอบหลัก> <ชื่อขั้นตอน>
 *        * <ขั้นตอนย่อย>
 *        * ...
 *        * หาก<กรณี> ให้ดำเนินการข้อ N ต่อ          ← decision: one per branch
 */
export function taskCellText(step: Step, proc: Process): { full: string; title: string } {
  const dataSteps = proc.steps.filter((s) => s.type === 'process' || s.type === 'decision');
  const selfIdx = dataSteps.findIndex((s) => s.id === step.id);
  const routeText = (toStepId: string): string | null => {
    const target = proc.steps.find((s) => s.id === toStepId);
    if (!target) return null;
    if (target.type === 'end') return 'ให้จบกระบวนการ';
    if (target.type === 'start') return 'ให้กลับไปที่จุดเริ่มต้น';
    const toIdx = dataSteps.findIndex((s) => s.id === toStepId);
    if (toIdx < 0) return null;
    return toIdx < selfIdx ? `ให้กลับไปดำเนินการข้อ ${toIdx + 1}` : `ให้ดำเนินการข้อ ${toIdx + 1} ต่อ`;
  };

  const title =
    step.type === 'decision' && step.label && !step.label.includes('ตัดสินใจ')
      ? `${step.label} (จุดตัดสินใจ)`
      : step.label || '-';
  const lines = [title];

  const subs = stepSubActions(step);
  // "- <หน่วยงาน> <ชื่อขั้นตอน>" then one bullet per sub-action (format of V.3)
  if (step.mainUnit) lines.push(` - ${step.mainUnit} ${step.label || ''}`.trimEnd());
  for (const s of subs) lines.push(`     * ${s}`);

  if (step.type === 'decision') {
    // spell out which case goes to which step
    for (const br of step.branches ?? []) {
      if (!br.toStepId) continue;
      const route = routeText(br.toStepId);
      if (!route) continue;
      lines.push(`     * ${br.label ? `หาก${br.label} ` : ''}${route}`);
    }
  } else {
    // a step that jumps somewhere other than the next row — note the target
    const br = (step.branches ?? []).find((b) => b.toStepId);
    if (br?.toStepId) {
      const toIdx = dataSteps.findIndex((s) => s.id === br.toStepId);
      const target = proc.steps.find((s) => s.id === br.toStepId);
      if (target?.type === 'end') lines.push('     * ให้จบกระบวนการ');
      else if (toIdx >= 0 && toIdx !== selfIdx + 1) {
        const route = routeText(br.toStepId);
        if (route) lines.push(`     * ${route}`);
      }
    }
  }

  return { full: lines.join('\n'), title };
}

/** Rough wrapped-line count for `text` in a column `chars` wide. */
function wrappedLines(text: string, chars: number): number {
  return text
    .split('\n')
    .reduce((n, ln) => n + Math.max(1, Math.ceil(ln.length / Math.max(4, chars))), 0);
}

export interface ExcelDiagram {
  /** Column widths for the sheet, in Excel char units (index 0 = column A). */
  colWidthChars: number[];
  /** Height (pt) for every data row, in table order. */
  rowHeightsPt: number[];
  /** The full `xl/drawings/drawing1.xml` document. */
  drawingXml: string;
  /** Problems worth telling the user about before they open the file. */
  warnings: string[];
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Build the row-aligned diagram for the given process. */
export function computeExcelDiagram(proc: Process): ExcelDiagram {
  const dataSteps = proc.steps.filter((s) => s.type === 'process' || s.type === 'decision');
  const start = proc.steps.find((s) => s.type === 'start');
  const end = proc.steps.find((s) => s.type === 'end');

  const warnings: string[] = [];

  // ---- pass 1: sub-lanes -------------------------------------------------
  // Each app lane that actually holds a step becomes a sub-column of its บฟ.
  // column, so several user-named lanes can share "อื่นๆ" without colliding.
  const laneOrder = new Map(proc.lanes.map((l, i) => [l.id, i]));
  const subByCol = new Map<number, string[]>();
  for (const s of proc.steps) {
    const col = laneColumn(proc, s.laneId);
    const arr = subByCol.get(col) ?? [];
    if (!arr.includes(s.laneId)) arr.push(s.laneId);
    subByCol.set(col, arr);
  }
  for (const arr of subByCol.values()) {
    arr.sort((a, b) => (laneOrder.get(a) ?? 0) - (laneOrder.get(b) ?? 0));
  }
  /** every sub-lane left→right, so we can tell which side a hop should leave on */
  const flatLanes: string[] = [];
  for (let c = 9; c <= 12; c++) for (const id of subByCol.get(c) ?? []) flatLanes.push(id);
  const laneRank = (id: string) => flatLanes.indexOf(id);

  // ---- pass 2: box width per sub-lane (depends on its own text only) -----
  const boxTextOf = (s: Step) => (s.type === 'decision' ? s.label || '-' : s.mainUnit || '-');
  const boxWOf = new Map<string, number>();
  for (const laneId of flatLanes) {
    const texts = dataSteps.filter((s) => s.laneId === laneId).map(boxTextOf);
    const maxLen = Math.max(8, ...texts.map((t) => t.length));
    const perLine = Math.min(30, Math.max(14, Math.ceil(maxLen / 3)));
    boxWOf.set(laneId, Math.round(Math.min(MAX_BOX_W, Math.max(MIN_BOX_W, perLine * CHAR_PX + 24))));
  }
  const wantBoxW = (laneId: string) => boxWOf.get(laneId) ?? MIN_BOX_W;

  // ---- pass 2b: how much vertical room each step's captions will need ----
  // Adjacency and lane are known from the step list alone, so we can size the
  // row for its captions *before* any geometry exists.
  const rowIndexOf = new Map<string, number>();
  dataSteps.forEach((s, i) => rowIndexOf.set(s.id, i));
  if (start) rowIndexOf.set(start.id, 0);
  if (end) rowIndexOf.set(end.id, Math.max(0, dataSteps.length - 1));
  /** a branch needs its own leg (and caption row) when it is not a neighbour hop */
  const isLongHop = (fromId: string, toId: string) => {
    const fr = rowIndexOf.get(fromId);
    const tr = rowIndexOf.get(toId);
    if (fr === undefined || tr === undefined) return false;
    return Math.abs(tr - fr) > 1;
  };
  const captionStack = new Map<string, number>();
  for (const s of proc.steps) {
    let down = 0;
    let up = 0;
    for (const br of s.branches ?? []) {
      if (!br.toStepId || !br.label || !isLongHop(s.id, br.toStepId)) continue;
      const lh = labelBoxH(br.label);
      const need = Math.max(12, lh / 2 + 8) + Math.max(6, lh / 2 + 4);
      if ((rowIndexOf.get(br.toStepId) ?? 0) >= (rowIndexOf.get(s.id) ?? 0)) down += need;
      else up += need;
    }
    if (down || up) captionStack.set(s.id, Math.max(down, up));
  }

  // ---- pass 3: rows (heights depend on box width, not on lane width) -----
  const rows = dataSteps.map((step, i) => {
    const col = laneColumn(proc, step.laneId);
    const isDecision = step.type === 'decision';
    const bw = wantBoxW(step.laneId);
    const labelChars = Math.max(8, Math.floor((bw - 24) / CHAR_PX));
    // Process boxes show ONLY the responsible unit (the step text lives in the
    // table's column B); decision diamonds keep the question + a smaller unit line.
    const labelLines = isDecision
      ? wrapLabel(step.label || '-', Math.floor(labelChars * 0.8))
      : wrapLabel(step.mainUnit || '-', labelChars);
    const unitLines =
      isDecision && step.mainUnit ? wrapLabel(step.mainUnit, Math.floor(labelChars * 0.9)) : [];

    const textH =
      Math.max(1, labelLines.length) * LINE_PX +
      (unitLines.length ? UNIT_GAP_PX + unitLines.length * UNIT_LINE_PX : 0) +
      BOX_PAD_Y * 2;
    const boxH = isDecision ? Math.max(96, Math.round(textH * 1.3)) : Math.max(52, textH);

    let rowH = boxH + ROW_MARGIN_PX * 2 + (captionStack.get(step.id) ?? 0);
    if (i === 0 && start) rowH += START_END_ZONE_PX + (captionStack.get(start.id) ?? 0);
    if (i === dataSteps.length - 1 && end) rowH += START_END_ZONE_PX;

    // the row must also be tall enough for the text columns (B is the big one)
    const textCols: Array<[string | undefined, number]> = [
      [taskCellText(step, proc).full, FORM_COL_CHARS[1]],
      [step.dataIn, FORM_COL_CHARS[5]],
      [step.dataOut, FORM_COL_CHARS[6]],
      [step.regulations, FORM_COL_CHARS[7]],
    ];
    const colLines = Math.max(
      1,
      ...textCols.map(([t, c]) => (t ? wrappedLines(t, Math.floor(c * 1.4)) : 1)),
    );
    rowH = Math.max(MIN_ROW_PX, rowH, colLines * 20 + 16);

    return { step, col, laneId: step.laneId, boxW: bw, boxH, labelLines, unitLines, rowH };
  });

  // --- cumulative row grid (px): 3 header rows then the data rows ---
  const rowStart: number[] = [0];
  for (const h of HEADER_ROWS_PX) rowStart.push(rowStart[rowStart.length - 1] + h);
  const dataTop = rowStart[rowStart.length - 1];
  rows.forEach((r) => rowStart.push(rowStart[rowStart.length - 1] + r.rowH));

  // ---- pass 4: vertical position of every shape (x still unknown) -------
  const rowGeom = rows.map((r, i) => {
    const rTop = rowStart[3 + i];
    const rBot = rowStart[4 + i];
    const circleTop = i === 0 && start ? START_END_ZONE_PX : 0;
    const circleBot = i === rows.length - 1 && end ? START_END_ZONE_PX : 0;
    // keep the caption stack free below the box, so the arrow legs that carry
    // those captions never have to cross into the next row's box
    const stack = captionStack.get(r.step.id) ?? 0;
    const band = r.rowH - circleTop - circleBot - stack;
    const boxY = rTop + circleTop + Math.max(ROW_MARGIN_PX / 2, (band - r.boxH) / 2);
    return { rTop, rBot, boxY };
  });
  const yPort = new Map<string, { top: number; bottom: number }>();
  rows.forEach((r, i) => yPort.set(r.step.id, { top: rowGeom[i].boxY, bottom: rowGeom[i].boxY + r.boxH }));
  if (start && rowGeom.length) {
    const y = rowGeom[0].rTop + 8;
    yPort.set(start.id, { top: y, bottom: y + CIRCLE_PX });
  }
  if (end && rowGeom.length) {
    const y = rowGeom[rowGeom.length - 1].rBot - 8 - CIRCLE_PX;
    yPort.set(end.id, { top: y, bottom: y + CIRCLE_PX });
  }

  // ---- pass 5: classify every arrow, then colour the long hops ----------
  const rowOf = new Map<string, number>();
  rows.forEach((r, i) => rowOf.set(r.step.id, i));
  if (start) rowOf.set(start.id, 0);
  if (end) rowOf.set(end.id, Math.max(0, rows.length - 1));
  const laneIdOf = new Map(proc.steps.map((s) => [s.id, s.laneId]));

  interface Hop {
    from: string;
    to: string;
    label: string;
    kind: 'straight' | 'bent' | 'dog';
    lane: string;
    side: 'L' | 'R';
    ch: number;
    y1: number;
    y2: number;
    down: boolean;
  }
  const hops: Hop[] = [];
  const addHop = (fromId: string, toId: string, label: string) => {
    const a = yPort.get(fromId);
    const b = yPort.get(toId);
    if (!a || !b || fromId === toId) return;
    const fr = rowOf.get(fromId) ?? 0;
    const tr = rowOf.get(toId) ?? 0;
    const down = tr >= fr;
    const y1 = down ? a.bottom : a.top;
    const y2 = down ? b.top : b.bottom;
    const laneA = laneIdOf.get(fromId) ?? '';
    const laneB = laneIdOf.get(toId) ?? '';
    const same = laneA === laneB;
    const adjacent = Math.abs(tr - fr) <= 1;
    const base = { from: fromId, to: toId, label, lane: laneA, ch: 0, y1, y2, down };
    if (adjacent && same) return void hops.push({ ...base, kind: 'straight', side: 'R' });
    if (adjacent && !same) return void hops.push({ ...base, kind: 'bent', side: 'R' });
    // long hop — runs in a vertical channel beside the SOURCE lane's boxes.
    // Forward hops go right, loop-backs go left, so the two never fight.
    const side: 'L' | 'R' = same ? (down ? 'R' : 'L') : laneRank(laneB) > laneRank(laneA) ? 'R' : 'L';
    hops.push({ ...base, kind: 'dog', side });
  };

  if (start) {
    const explicit = (start.branches ?? []).find((br) => br.toStepId);
    const target = explicit?.toStepId ?? dataSteps[0]?.id;
    if (target) addHop(start.id, target, explicit?.label ?? '');
  }
  for (const step of dataSteps) {
    for (const br of step.branches ?? []) if (br.toStepId) addHop(step.id, br.toStepId, br.label ?? '');
  }

  const channelCount = new Map<string, number>();
  const byChannelKey = new Map<string, Hop[]>();
  for (const h of hops) {
    if (h.kind !== 'dog') continue;
    const key = `${h.lane}:${h.side}`;
    const list = byChannelKey.get(key) ?? [];
    list.push(h);
    byChannelKey.set(key, list);
  }
  for (const [key, list] of byChannelKey) {
    const idx = colourIntervals(
      list.map((h) => ({ y1: Math.min(h.y1, h.y2), y2: Math.max(h.y1, h.y2) })),
    );
    let n = 0;
    idx.forEach((c, i) => {
      if (c >= MAX_CHANNELS) warnings.push('channels-capped');
      list[i].ch = Math.min(c, MAX_CHANNELS - 1);
      n = Math.max(n, list[i].ch + 1);
    });
    channelCount.set(key, n);
  }

  // ---- pass 6: lane / column widths, then x positions -------------------
  // a side needs room for its channels AND for the widest branch caption drawn there
  // every caption — short arrows included — sits just outside the box on that side
  const captionW = new Map<string, number>();
  for (const h of hops) {
    if (!h.label) continue;
    const key = `${h.lane}:${h.side}`;
    captionW.set(key, Math.max(captionW.get(key) ?? 0, labelBoxW(h.label)));
  }
  // a side needs room for its channels *and* for the caption beside the box
  const block = (n: number, cap: number) => {
    if (n === 0 && cap === 0) return 0;
    return (n > 0 ? CHANNEL_GAP + n * CHANNEL_W : CHANNEL_GAP) + (cap ? cap + 10 : 0);
  };
  const wantSubW = new Map<string, number>();
  for (const laneId of flatLanes) {
    const nl = channelCount.get(`${laneId}:L`) ?? 0;
    const nr = channelCount.get(`${laneId}:R`) ?? 0;
    wantSubW.set(
      laneId,
      LANE_PAD * 2 +
        block(nl, captionW.get(`${laneId}:L`) ?? 0) +
        wantBoxW(laneId) +
        block(nr, captionW.get(`${laneId}:R`) ?? 0),
    );
  }

  const colWidthChars = [...FORM_COL_CHARS];
  for (let c = 9; c <= 12; c++) {
    const lanes = subByCol.get(c) ?? [];
    if (lanes.length === 0) {
      colWidthChars[c] = EMPTY_COL_CHARS;
      continue;
    }
    const want = lanes.reduce((a, l) => a + (wantSubW.get(l) ?? 0), 0) + SUBLANE_GAP * (lanes.length - 1);
    colWidthChars[c] = Math.min(MAX_COL_CHARS, Math.max(EMPTY_COL_CHARS, pxToChars(want)));
  }
  const COL_PX = colWidthChars.map(charsToPx);
  const colStart: number[] = [0];
  for (let i = 0; i < COL_PX.length; i++) colStart.push(colStart[i] + COL_PX[i]);

  // lay the sub-lanes out inside their column (squeezing if the cap bit)
  const subCX = new Map<string, number>();
  const fitBoxW = new Map<string, number>();
  for (let c = 9; c <= 12; c++) {
    const lanes = subByCol.get(c) ?? [];
    if (!lanes.length) continue;
    const want = lanes.reduce((a, l) => a + (wantSubW.get(l) ?? 0), 0) + SUBLANE_GAP * (lanes.length - 1);
    const have = COL_PX[c];
    const k = want > have ? have / want : 1;
    if (k < 1) warnings.push('lane-squeezed');
    let x = colStart[c] + Math.max(0, (have - want * k) / 2);
    for (const laneId of lanes) {
      const w = (wantSubW.get(laneId) ?? 0) * k;
      subCX.set(laneId, x + w / 2);
      fitBoxW.set(laneId, Math.max(60, Math.min(wantBoxW(laneId), w - 8)));
      x += w + SUBLANE_GAP * k;
    }
  }
  const laneCX = (laneId: string) => subCX.get(laneId) ?? colStart[12] + COL_PX[12] / 2;
  const laneBoxW = (laneId: string) => fitBoxW.get(laneId) ?? MIN_BOX_W;
  /** x of one routing channel beside a sub-lane's boxes */
  const channelX = (laneId: string, side: 'L' | 'R', ch: number) => {
    const half = laneBoxW(laneId) / 2;
    const cx = laneCX(laneId);
    return side === 'R'
      ? cx + half + CHANNEL_GAP + ch * CHANNEL_W + CHANNEL_W / 2
      : cx - half - CHANNEL_GAP - ch * CHANNEL_W - CHANNEL_W / 2;
  };

  // --- place every shape in the pixel model ---
  const shapes: string[] = [];
  let nextId = 2;
  const id = () => nextId++;

  // anchor helper: pixel rect -> twoCellAnchor wrapping `inner`
  const cellOf = (starts: number[], px: number, lastIdx: number) => {
    for (let i = 0; i < lastIdx; i++) {
      if (px < starts[i + 1]) return { idx: i, off: emu(px - starts[i]) };
    }
    return { idx: lastIdx, off: emu(px - starts[lastIdx]) };
  };
  const anchor = (r: Rect, inner: string) => {
    const fromC = cellOf(colStart, r.x, COL_PX.length - 1);
    const toC = cellOf(colStart, r.x + r.w, COL_PX.length - 1);
    const fromR = cellOf(rowStart, r.y, rowStart.length - 2);
    const toR = cellOf(rowStart, r.y + r.h, rowStart.length - 2);
    return (
      `<xdr:twoCellAnchor editAs="oneCell">` +
      `<xdr:from><xdr:col>${fromC.idx}</xdr:col><xdr:colOff>${fromC.off}</xdr:colOff>` +
      `<xdr:row>${fromR.idx}</xdr:row><xdr:rowOff>${fromR.off}</xdr:rowOff></xdr:from>` +
      `<xdr:to><xdr:col>${toC.idx}</xdr:col><xdr:colOff>${toC.off}</xdr:colOff>` +
      `<xdr:row>${toR.idx}</xdr:row><xdr:rowOff>${toR.off}</xdr:rowOff></xdr:to>` +
      inner +
      `<xdr:clientData/></xdr:twoCellAnchor>`
    );
  };

  const para = (text: string, fontPt: number, color: string) =>
    `<a:p><a:pPr algn="ctr"/><a:r>` +
    `<a:rPr lang="th-TH" sz="${Math.round(fontPt * 100)}" b="1"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` +
    `<a:latin typeface="${FONT}"/><a:cs typeface="${FONT}"/></a:rPr>` +
    `<a:t>${esc(text)}</a:t></a:r></a:p>`;

  /** A white flow box. `main` is the label; `sub` is the unit line (smaller, muted). */
  const shape = (
    r: Rect,
    prst: string,
    main: string[],
    fontPt: number,
    sub: string[] = [],
  ) => {
    const paras =
      (main.length ? main : ['']).map((ln) => para(ln, fontPt, COLORS.nodeText)).join('') +
      sub.map((ln) => para(ln, 13, COLORS.unitText)).join('');
    const inner =
      `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id()}" name="${prst}-${nextId}"/><xdr:cNvSpPr/></xdr:nvSpPr>` +
      `<xdr:spPr><a:xfrm><a:off x="${emu(r.x)}" y="${emu(r.y)}"/><a:ext cx="${emu(r.w)}" cy="${emu(r.h)}"/></a:xfrm>` +
      `<a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>` +
      `<a:solidFill><a:srgbClr val="${COLORS.shape}"/></a:solidFill>` +
      `<a:ln w="12700"><a:solidFill><a:srgbClr val="${COLORS.shapeBorder}"/></a:solidFill></a:ln></xdr:spPr>` +
      `<xdr:txBody><a:bodyPr wrap="square" lIns="36000" tIns="18000" rIns="36000" bIns="18000" anchor="ctr"/><a:lstStyle/>${paras}</xdr:txBody></xdr:sp>`;
    shapes.push(anchor(r, inner));
  };

  const connector = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    prst: string,
    color: string,
    dashed = false,
    arrow = true,
  ) => {
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const w = Math.max(1, Math.abs(x2 - x1));
    const h = Math.max(1, Math.abs(y2 - y1));
    const flip = `${x2 < x1 ? ' flipH="1"' : ''}${y2 < y1 ? ' flipV="1"' : ''}`;
    const inner =
      `<xdr:cxnSp macro=""><xdr:nvCxnSpPr><xdr:cNvPr id="${id()}" name="c${nextId}"/><xdr:cNvCxnSpPr/></xdr:nvCxnSpPr>` +
      `<xdr:spPr><a:xfrm${flip}><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm>` +
      `<a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>` +
      `<a:ln w="12700"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` +
      `${dashed ? '<a:prstDash val="dash"/>' : ''}${arrow ? '<a:tailEnd type="triangle"/>' : ''}</a:ln></xdr:spPr>` +
      `<xdr:style><a:lnRef idx="1"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="0"><a:schemeClr val="accent1"/></a:fillRef>` +
      `<a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef></xdr:style></xdr:cxnSp>`;
    shapes.push(anchor({ x, y, w, h }, inner));
  };

  /**
   * Branch caption ("กรณีซ่อมได้") — borderless text on a white pad, so it can
   * sit right on top of the arrow it belongs to and still stay readable.
   */
  const labelBox = (cx: number, cy: number, text: string, color: string) => {
    const lines = wrapLabel(text, LABEL_CHARS);
    const w = labelBoxW(text);
    const h = Math.max(20, lines.length * 17 + 6);
    const paras = lines
      .map(
        (ln) =>
          `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="th-TH" sz="1200" b="1">` +
          `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` +
          `<a:latin typeface="${FONT}"/><a:cs typeface="${FONT}"/></a:rPr><a:t>${esc(ln)}</a:t></a:r></a:p>`,
      )
      .join('');
    const inner =
      `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id()}" name="lbl${nextId}"/><xdr:cNvSpPr/></xdr:nvSpPr>` +
      `<xdr:spPr><a:xfrm><a:off x="${emu(cx - w / 2)}" y="${emu(cy - h / 2)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm>` +
      `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
      `<a:solidFill><a:srgbClr val="${COLORS.shape}"/></a:solidFill>` +
      `<a:ln><a:noFill/></a:ln></xdr:spPr>` +
      `<xdr:txBody><a:bodyPr wrap="square" lIns="9000" tIns="4500" rIns="9000" bIns="4500" anchor="ctr"/><a:lstStyle/>${paras}</xdr:txBody></xdr:sp>`;
    shapes.push(anchor({ x: cx - w / 2, y: cy - h / 2, w, h }, inner));
  };

  // ---- pass 7: emit the boxes -------------------------------------------
  /** horizontal centre of a step's shape */
  const cxOf = (stepId: string) => laneCX(laneIdOf.get(stepId) ?? '');

  rows.forEach((r, i) => {
    const { rTop, rBot, boxY } = rowGeom[i];
    const bw = Math.min(r.boxW, laneBoxW(r.laneId));
    const cx = laneCX(r.laneId);
    const boxRect: Rect = { x: cx - bw / 2, y: boxY, w: bw, h: r.boxH };

    shape(
      boxRect,
      r.step.type === 'decision' ? 'diamond' : 'rect',
      r.labelLines,
      r.step.type === 'decision' ? 15 : 16,
      r.unitLines,
    );

    // Application box in column I + dashed green link
    if (r.step.application) {
      const appCx = colStart[8] + COL_PX[8] / 2;
      const appW = Math.min(COL_PX[8] - 20, 150);
      const appH = 40;
      const midY = boxY + r.boxH / 2;
      const appLines = wrapLabel(r.step.application, Math.floor(appW / 7));
      shape({ x: appCx - appW / 2, y: midY - appH / 2, w: appW, h: appH }, 'can', appLines, 12);
      connector(appCx + appW / 2, midY, boxRect.x, midY, 'bentConnector3', COLORS.appLink, true, false);
    }

    // Start / End circles share the first / last step's row
    if (i === 0 && start) {
      const sCx = laneCX(start.laneId);
      shape({ x: sCx - CIRCLE_PX / 2, y: rTop + 8, w: CIRCLE_PX, h: CIRCLE_PX }, 'ellipse', ['เริ่ม'], 14);
    }
    if (i === rows.length - 1 && end) {
      const eCx = laneCX(end.laneId);
      shape({ x: eCx - CIRCLE_PX / 2, y: rBot - 8 - CIRCLE_PX, w: CIRCLE_PX, h: CIRCLE_PX }, 'ellipse', ['จบ'], 14);
    }
  });

  // ---- pass 8: emit the arrows, each in the channel it was given --------
  const seg = (x1: number, y1: number, x2: number, y2: number, arrow = false) =>
    connector(x1, y1, x2, y2, 'straightConnector1', COLORS.edge, false, arrow);
  const branchColor = (label: string) => (/ไม่|N\b/.test(label) ? COLORS.branchAlt : COLORS.branchNormal);

  // Several arrows can leave the same box (a decision). Each gets its own height
  // to turn off at, spaced by the caption that will sit there — so the legs fan
  // out, the captions don't stack, and none of them rides up onto the box.
  const legOffset = new Map<Hop, number>();
  const legAcc = new Map<string, number>();
  for (const h of hops) {
    if (h.kind !== 'dog') continue;
    const key = `${h.from}:${h.down ? 'D' : 'U'}`;
    const lh = h.label ? labelBoxH(h.label) : 0;
    const off = (legAcc.get(key) ?? 0) + Math.max(12, lh / 2 + 8);
    legOffset.set(h, off);
    legAcc.set(key, off + Math.max(6, lh / 2 + 4));
  }

  /** caption x — always just outside the source box, clear of every shape */
  const captionX = (h: Hop, ax: number) => {
    const half = laneBoxW(h.lane) / 2;
    const lw = labelBoxW(h.label);
    return h.side === 'R' ? ax + half + 8 + lw / 2 : ax - half - 8 - lw / 2;
  };

  for (const h of hops) {
    const ax = cxOf(h.from);
    const bx = cxOf(h.to);

    if (h.kind === 'straight') {
      seg(ax, h.y1, bx, h.y2, true);
      if (h.label) labelBox(captionX(h, ax), (h.y1 + h.y2) / 2, h.label, branchColor(h.label));
      continue;
    }
    if (h.kind === 'bent') {
      connector(ax, h.y1, bx, h.y2, 'bentConnector3', COLORS.edge);
      if (h.label) labelBox(captionX(h, ax), (h.y1 + h.y2) / 2, h.label, branchColor(h.label));
      continue;
    }

    // dog-leg: out of the box, into its own vertical channel, then back in
    const edgeX = channelX(h.lane, h.side, h.ch);
    const yOut = h.y1 + (h.down ? 1 : -1) * (legOffset.get(h) ?? 12);
    const yIn = h.y2 + (h.down ? -12 : 12);
    seg(ax, h.y1, ax, yOut);
    seg(ax, yOut, edgeX, yOut);
    seg(edgeX, yOut, edgeX, yIn);
    seg(edgeX, yIn, bx, yIn);
    seg(bx, yIn, bx, h.y2, true);
    // caption sits ON its own leg, starting just past the box edge — the white
    // pad masks the line behind it, so you can see which arrow it belongs to
    if (h.label) labelBox(captionX(h, ax), yOut, h.label, branchColor(h.label));
  }

  const totalW = colStart[COL_PX.length];
  const totalH = rowStart[rowStart.length - 1];
  const drawingXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    shapes.join('') +
    `</xdr:wsDr>`;
  // totalW / totalH are only used to keep the model honest while debugging
  void totalW;
  void totalH;
  void dataTop;

  const notes: string[] = [];
  if (warnings.includes('channels-capped') || warnings.includes('lane-squeezed')) {
    notes.push(
      'กระบวนการนี้มีเส้นทางไขว้กันเยอะมาก เส้นในผังอาจทับกันบ้าง — แนะนำแยกเป็น 2 แท็บ (เช่นแยกตามกรณี) แล้ว export ทีละแท็บ',
    );
  }

  return {
    colWidthChars,
    rowHeightsPt: rows.map((r) => pxToPt(r.rowH)),
    drawingXml,
    warnings: notes,
  };
}
