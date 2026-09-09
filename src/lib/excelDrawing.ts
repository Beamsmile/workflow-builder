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

/** Every org lane (J–M = สนญ./กฟข./กฟฟ./อื่นๆ) gets the same width, so the
 *  flow boxes come out the same width in every lane. */
const LANE_WIDTH_CHARS = 36;

/**
 * Column widths (Excel "character" units). A–I follow the บฟ. form
 * ("ตัวอย่าง (ฟอร์มเปล่า).xlsx"); J–M are all `LANE_WIDTH_CHARS`.
 */
export const COL_WIDTH_CHARS = [
  8.16, 51.5, 33, 18.16, 16, 20, 19.16, 20, 27.66,
  LANE_WIDTH_CHARS, LANE_WIDTH_CHARS, LANE_WIDTH_CHARS, LANE_WIDTH_CHARS,
];
const charsToPx = (w: number) => Math.round(w * 7 + 5);
const COL_PX = COL_WIDTH_CHARS.map(charsToPx);

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
const BOX_SIDE_INSET = 16; // gap from the lane-column edge to the box

// House style: every flow shape is a WHITE box with a dark border and black
// bold text (no colour-coding). The responsible unit (หน่วยงานรับผิดชอบหลัก)
// is a second, smaller line of text inside the box — no separate red tag.
const COLORS = {
  shape: 'FFFFFF',
  shapeBorder: '404040',
  nodeText: '1F2430',
  unitText: '5B6472',
  edge: '5B6472',
  appLink: '2E8B57',
  branchNormal: '1E7E34',
  branchAlt: 'C0392B',
} as const;

const FONT = 'TH Sarabun New';

/** lane → column index (0-based): I=8 app, J=9 สนญ., K=10 กฟข., L=11 กฟฟ., M=12 อื่นๆ. */
function laneColumn(proc: Process, laneId: string): number {
  const lane = proc.lanes.find((l) => l.id === laneId);
  const label = (lane?.label ?? '').replace(/\s/g, '');
  if (/สนญ|สำนักงานใหญ่/.test(label)) return 9;
  if (/กฟข/.test(label)) return 10;
  if (/กฟฟ/.test(label)) return 11;
  return 12; // อื่นๆ / anything else
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
 *    - <หน่วยงานรับผิดชอบหลัก> ดำเนินการ <ขั้นตอนแรก>
 *        * <ขั้นตอนถัดไป>
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
  if (step.mainUnit) {
    lines.push(` - ${step.mainUnit} ดำเนินการ${subs[0] ? ` ${subs[0]}` : ''}`);
    for (const s of subs.slice(1)) lines.push(`     * ${s}`);
  } else {
    for (const s of subs) lines.push(`     * ${s}`);
  }

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

  // --- cumulative column grid (px) ---
  const colStart: number[] = [0];
  for (let i = 0; i < COL_PX.length; i++) colStart.push(colStart[i] + COL_PX[i]);

  // --- per-row geometry ---
  const laneColW = (col: number) => COL_PX[col];
  const rows = dataSteps.map((step, i) => {
    const col = laneColumn(proc, step.laneId);
    const isDecision = step.type === 'decision';
    const boxW = Math.max(150, Math.min(isDecision ? 220 : 250, laneColW(col) - BOX_SIDE_INSET * 2));
    const labelChars = Math.max(8, Math.floor((boxW - 24) / 8.6));
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

    let rowH = boxH + ROW_MARGIN_PX * 2;
    if (i === 0 && start) rowH += START_END_ZONE_PX;
    if (i === dataSteps.length - 1 && end) rowH += START_END_ZONE_PX;

    // the row must also be tall enough for the text columns (B is the big one)
    const textCols: Array<[string | undefined, number]> = [
      [taskCellText(step, proc).full, COL_WIDTH_CHARS[1]],
      [step.dataIn, COL_WIDTH_CHARS[5]],
      [step.dataOut, COL_WIDTH_CHARS[6]],
      [step.regulations, COL_WIDTH_CHARS[7]],
    ];
    const colLines = Math.max(
      1,
      ...textCols.map(([t, c]) => (t ? wrappedLines(t, Math.floor(c * 1.4)) : 1)),
    );
    rowH = Math.max(MIN_ROW_PX, rowH, colLines * 20 + 16);

    return { step, col, boxW, boxH, labelLines, unitLines, rowH };
  });

  // --- cumulative row grid (px): 3 header rows then the data rows ---
  const rowStart: number[] = [0];
  for (const h of HEADER_ROWS_PX) rowStart.push(rowStart[rowStart.length - 1] + h);
  const dataTop = rowStart[rowStart.length - 1];
  rows.forEach((r) => rowStart.push(rowStart[rowStart.length - 1] + r.rowH));

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

  const labelBox = (cx: number, cy: number, text: string, color: string) => {
    const w = Math.max(34, text.length * 8 + 12);
    const h = 18;
    const inner =
      `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id()}" name="lbl${nextId}"/><xdr:cNvSpPr txBox="1"/></xdr:nvSpPr>` +
      `<xdr:spPr><a:xfrm><a:off x="${emu(cx - w / 2)}" y="${emu(cy - h / 2)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm>` +
      `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:noFill/></a:ln></xdr:spPr>` +
      `<xdr:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"/><a:lstStyle/>` +
      `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="th-TH" sz="1100" b="1"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` +
      `<a:latin typeface="${FONT}"/><a:cs typeface="${FONT}"/></a:rPr><a:t>${esc(text)}</a:t></a:r></a:p></xdr:txBody></xdr:sp>`;
    shapes.push(anchor({ x: cx - w / 2, y: cy - h / 2, w, h }, inner));
  };

  // per-step anchor points (px), for connectors — keyed by step id
  const port = new Map<string, { cx: number; top: number; bottom: number; left: number; right: number }>();

  rows.forEach((r, i) => {
    const rTop = rowStart[3 + i];
    const rBot = rowStart[4 + i];
    const circleTop = i === 0 && start ? START_END_ZONE_PX : 0;
    const circleBot = i === dataSteps.length - 1 && end ? START_END_ZONE_PX : 0;
    const band = r.rowH - circleTop - circleBot;
    const cursorTop = rTop + circleTop + Math.max(ROW_MARGIN_PX / 2, (band - r.boxH) / 2);
    const cx = colStart[r.col] + laneColW(r.col) / 2;
    const boxX = cx - r.boxW / 2;
    const boxRect: Rect = { x: boxX, y: cursorTop, w: r.boxW, h: r.boxH };

    // white box: step label + หน่วยงานรับผิดชอบหลัก as a smaller line under it
    shape(
      boxRect,
      r.step.type === 'decision' ? 'diamond' : 'rect',
      r.labelLines,
      r.step.type === 'decision' ? 15 : 16,
      r.unitLines,
    );
    port.set(r.step.id, {
      cx,
      top: boxRect.y,
      bottom: boxRect.y + boxRect.h,
      left: boxRect.x,
      right: boxRect.x + boxRect.w,
    });

    // Application box in column I + dashed green link
    if (r.step.application) {
      const appCx = colStart[8] + COL_PX[8] / 2;
      const appW = Math.min(COL_PX[8] - 20, 150);
      const appH = 40;
      const appLines = wrapLabel(r.step.application, Math.floor(appW / 7));
      shape({ x: appCx - appW / 2, y: boxRect.y + boxRect.h / 2 - appH / 2, w: appW, h: appH }, 'can', appLines, 12);
      connector(appCx + appW / 2, boxRect.y + boxRect.h / 2, boxX, boxRect.y + boxRect.h / 2, 'bentConnector3', COLORS.appLink, true, false);
    }

    // Start circle — top of the first data row
    if (i === 0 && start) {
      const sCol = laneColumn(proc, start.laneId);
      const sCx = colStart[sCol] + laneColW(sCol) / 2;
      const sY = rTop + 8;
      shape({ x: sCx - CIRCLE_PX / 2, y: sY, w: CIRCLE_PX, h: CIRCLE_PX }, 'ellipse', ['เริ่ม'], 14);
      port.set(start.id, { cx: sCx, top: sY, bottom: sY + CIRCLE_PX, left: sCx - CIRCLE_PX / 2, right: sCx + CIRCLE_PX / 2 });
    }
    // End circle — bottom of the last data row
    if (i === dataSteps.length - 1 && end) {
      const eCol = laneColumn(proc, end.laneId);
      const eCx = colStart[eCol] + laneColW(eCol) / 2;
      const eY = rBot - 8 - CIRCLE_PX;
      shape({ x: eCx - CIRCLE_PX / 2, y: eY, w: CIRCLE_PX, h: CIRCLE_PX }, 'ellipse', ['จบ'], 14);
      port.set(end.id, { cx: eCx, top: eY, bottom: eY + CIRCLE_PX, left: eCx - CIRCLE_PX / 2, right: eCx + CIRCLE_PX / 2 });
    }
  });

  // --- connectors from branches ---
  const rowOf = new Map<string, number>();
  rows.forEach((r, i) => rowOf.set(r.step.id, i));
  if (start) rowOf.set(start.id, 0);
  if (end) rowOf.set(end.id, dataSteps.length - 1);

  const nearestCol = (x: number) => {
    for (let c = 8; c <= 12; c++) if (x >= colStart[c] && x < colStart[c] + COL_PX[c]) return c;
    return 11;
  };
  /** how many side-routes have already used each lane column's edge channel */
  const sideCount = new Map<string, number>();
  const seg = (x1: number, y1: number, x2: number, y2: number, arrow = false) =>
    connector(x1, y1, x2, y2, 'straightConnector1', COLORS.edge, false, arrow);

  const branchColor = (label: string) => (/ไม่|N\b/.test(label) ? COLORS.branchAlt : COLORS.branchNormal);

  const drawBranch = (fromId: string, toId: string, label: string) => {
    const a = port.get(fromId);
    const b = port.get(toId);
    if (!a || !b) return;
    const fr = rowOf.get(fromId) ?? 0;
    const tr = rowOf.get(toId) ?? 0;
    const down = tr >= fr;
    const sameCol = Math.abs(a.cx - b.cx) < 2;
    const adjacent = Math.abs(tr - fr) <= 1;
    const y1 = down ? a.bottom : a.top;
    const y2 = down ? b.top : b.bottom;

    if (adjacent && sameCol) {
      seg(a.cx, y1, b.cx, y2, true);
      if (label) labelBox((a.cx + b.cx) / 2, (y1 + y2) / 2, label, branchColor(label));
      return;
    }
    if (adjacent && !sameCol) {
      connector(a.cx, y1, b.cx, y2, 'bentConnector3', COLORS.edge);
      if (label) labelBox((a.cx + b.cx) / 2, (y1 + y2) / 2, label, branchColor(label));
      return;
    }

    // long hop — dog-leg out to the lane-column edge, run vertically, back in
    const col = nearestCol(a.cx);
    const goRight = b.cx >= a.cx;
    const key = `${col}:${goRight ? 'R' : 'L'}`;
    const n = sideCount.get(key) ?? 0;
    sideCount.set(key, n + 1);
    const edgeX = goRight
      ? colStart[col] + COL_PX[col] - 8 - n * 10
      : colStart[col] + 8 + n * 10;
    const yOut = y1 + (down ? 12 : -12);
    const yIn = y2 + (down ? -12 : 12);
    seg(a.cx, y1, a.cx, yOut);
    seg(a.cx, yOut, edgeX, yOut);
    seg(edgeX, yOut, edgeX, yIn);
    seg(edgeX, yIn, b.cx, yIn);
    seg(b.cx, yIn, b.cx, y2, true);
    if (label) labelBox(edgeX, (yOut + yIn) / 2, label, branchColor(label));
  };

  // start -> first data step (the start step's own branch, or an implicit link)
  if (start) {
    const firstId = dataSteps[0]?.id;
    const explicit = (start.branches ?? []).find((br) => br.toStepId);
    drawBranch(start.id, explicit?.toStepId ?? firstId ?? start.id, explicit?.label ?? '');
  }
  dataSteps.forEach((step) => {
    (step.branches ?? []).forEach((br) => {
      if (br.toStepId) drawBranch(step.id, br.toStepId, br.label ?? '');
    });
  });

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

  return {
    colWidthChars: COL_WIDTH_CHARS,
    rowHeightsPt: rows.map((r) => pxToPt(r.rowH)),
    drawingXml,
  };
}
