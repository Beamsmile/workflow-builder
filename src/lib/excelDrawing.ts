/**
 * DrawingML สำหรับไฟล์ Excel (ฟอร์ม บฟ.)
 *
 * วาดผังเป็น "รูปทรงของ Excel จริง" ในคอลัมน์ผังการไหล (I = Application, J เป็นต้นไป = เลนละคอลัมน์) ให้แก้ต่อใน Excel ได้
 * โดยยึดแบบจากผังตัวอย่างของทีม (`ตัวอย่าง Flow/(Workshop) Maintenance V.4.xlsx`):
 *   - กล่องขนาดเท่ากันทุกกล่อง (สี่เหลี่ยม 187×107px, ข้าวหลามตัด ~221px, วงรี Start/End 68×46px)
 *     พื้นขาว ขอบดำ 1pt ตัวอักษร TH SarabunPSK 11pt
 *   - Application = ทรงกระบอก (can) ในคอลัมน์ I ต่อกับกล่องด้วยเส้นประสีเขียว
 *   - **เส้นเชื่อมเป็นเส้นเดียวที่เลี้ยวได้ (elbow connector) และเกาะกับกล่อง**
 *     (stCxn / endCxn) — ลากกล่องใน Excel แล้วเส้นตามไปเอง ไม่ใช่เส้นตรงหลายท่อนต่อกัน
 *   - ป้ายกิ่ง = กล่องข้อความพื้นเหลืองทอง (#FFC000) ตัวดำหนา วางบนเส้นของตัวเอง
 *
 * ตำแหน่งกล่องกับรูปแบบเส้นมาจาก `domain/route.ts` ชุดเดียวกับหน้าเว็บ
 * (เส้น/ป้ายใช้ `edgeRoute` + `placeEdgeLabels` ของ `domain/layout.ts`) ผังสองที่จึงตรงกัน
 * ต่างกันแค่ขนาด: ที่นี่แต่ละขั้นต้องอยู่ในแถวตารางของตัวเอง
 *
 * `write-excel-file` วาดรูปทรงไม่ได้ `exportExcel.ts` จึงสร้างตารางก่อน แล้วยัด XML
 * ที่ไฟล์นี้สร้างเข้าไปใน zip ของ .xlsx — ความสูงแถวในตารางต้องตรงกับที่คำนวณที่นี่
 */
import type { Process, Step } from '../domain/types';
import { planFlow, type PlannedEdge } from '../domain/route';
import { colourIntervals, edgeRoute, placeEdgeLabels, type BoxGeom, type Pt } from '../domain/layout';
import { wrapLabel } from '../domain/text';

const EMU = 9525; // EMU ต่อ 1 px
const emu = (px: number) => Math.round(px * EMU);
const pxToPt = (px: number) => Math.round(px * 0.75 * 100) / 100;

/** ความกว้างคอลัมน์ A–I (หน่วยตัวอักษรของ Excel) ตามฟอร์ม บฟ. — J–M คำนวณตามผัง */
const FORM_COL_CHARS = [8.16, 51.5, 33, 18.16, 16, 20, 19.16, 20, 27.66];
/**
 * ความกว้างคอลัมน์ "1 ตัวอักษร" = กี่ px — วัดจาก Excel บน Mac (ที่ทีมใช้: ไฟล์ตัวอย่างบันทึกจาก
 * Microsoft Macintosh Excel) ได้ 8px/ตัว พอดี (Excel บน Windows ใช้ราว 7px+5)
 * ถ้าค่านี้ไม่ตรงกับเครื่องที่เปิด กล่องจะเยื้องจากกึ่งกลางคอลัมน์ และป้ายบนเส้นที่ข้ามคอลัมน์จะเหลื่อมเล็กน้อย
 */
const PX_PER_CHAR = 8;
const charsToPx = (w: number) => Math.round(w * PX_PER_CHAR);
const pxToChars = (px: number) => Math.round((px / PX_PER_CHAR) * 100) / 100;

/** ความสูงแถวหัวตาราง (px): ชื่อกระบวนการ, หัวบรรทัด 1, หัวบรรทัด 2 */
const HEADER_ROWS_PX = [26, 20, 42];

// ---- ขนาดรูปทรง (px) ตามผังตัวอย่าง ----
const PROC_W = 187;
const PROC_MIN_H = 107;
const DEC_W = 221;
const DEC_MIN_H = 170;
const DEC_MAX_W = 400;
const OVAL_W = 68;
const OVAL_H = 46;
const CAN_W = 123;
const CAN_MIN_H = 68;
/** TH SarabunPSK 11pt: ประมาณตัวอักษรต่อบรรทัดในกล่อง และความสูงบรรทัด (ใช้กะความสูงกล่องเท่านั้น
 *  การตัดบรรทัดจริงให้ Excel ทำเอง ซึ่งตัดคำไทยได้ถูกกว่า) */
const PROC_CHARS = 24;
const DEC_CHARS = 13;
const CAN_CHARS = 15;
const LINE_11 = 19;
const LINE_12 = 20;

// ---- ระยะในคอลัมน์ผัง (px) ----
const TRACK_PAD = 14; // เว้นข้างกล่องในราง
const TRACK_GAP = 16; // ทางเดินระหว่างรางในเลนเดียวกัน
const LANE_PAD = 14; // ทางเดินริมเลน
const CH_W = 14; // ช่องของเส้นที่อ้อมผ่านทางเดิน
const CH_GAP = 8;
const EMPTY_COL_CHARS = 16;
const MAX_COL_CHARS = 160;

// ---- ระยะแนวตั้งในแถว (px) ----
const BUS = 16; // เส้นแยกใต้กล่อง / เส้นรวมเหนือกล่อง
const GAP_ABOVE = 26; // ที่ว่างเหนือรูปทรง (ให้เส้นรวม)
const GAP_BELOW = 26; // ที่ว่างใต้รูปทรง (ให้เส้นแยก)
const LABEL_ROOM = 36; // ที่เพิ่มใต้รูปทรงที่มีป้ายกิ่งห้อยอยู่ (ป้าย 16pt สูง 32px + ระยะห่าง)
const MIN_ROW_PX = 62;
const MAX_ROW_PX = 545; // Excel สูงสุด 409pt

// ---- สี/ตัวอักษร ----
const FONT = 'TH SarabunPSK';
const BLACK = '000000';
/**
 * ป้ายกิ่ง: พื้นเหลืองทอง ตัวดำหนา 16pt — ตามผังตัวอย่างของทีม (Microgrid Operation, สับเปลี่ยนมิเตอร์ V.6)
 * ผู้ใช้ขอ 18 พ.ย. 2569 (เดิมพื้นขาวตัวแดง 12pt ตาม Maintenance V.4 — มองไม่ค่อยเห็นว่าเป็นป้าย)
 */
const LABEL_FILL = 'FFC000';
const LABEL_TEXT = '000000';
const LABEL_PT = 16;
const APP_GREEN = '70AD47';
const LABEL_H = 32;
/** ป้ายกิ่ง 16pt ตัวหนา — กะความกว้างจากจำนวนตัวอักษร (ไม่นับสระบน/ล่าง วรรณยุกต์) + ขอบพื้นสีซ้ายขวา */
const labelW = (t: string) => Math.round(t.replace(/[ัิ-ฺ็-๎]/g, '').length * 10.2 + 28);

/** จุดเกาะเส้นบนรูปทรงแต่ละชนิด (ลำดับตาม preset ของ Office — ตรวจกับไฟล์ตัวอย่างแล้ว) */
const SITE: Record<string, { top: number; left: number; bottom: number; right: number }> = {
  rect: { top: 0, left: 1, bottom: 2, right: 3 },
  diamond: { top: 0, left: 1, bottom: 2, right: 3 },
  ellipse: { top: 0, left: 2, bottom: 4, right: 6 },
  can: { top: 0, left: 1, bottom: 2, right: 4 },
};

/** คอลัมน์แรกของผังในเลน org (0-based: I=8 คือ Application, เลน org เริ่มที่ J=9) */
export const FIRST_LANE_COL = 9;

/**
 * หัวคอลัมน์ของเลน org ในตาราง บฟ. = ชื่อเลนที่ผู้ใช้ตั้ง (1 เลน = 1 คอลัมน์)
 * เดิมหัวคอลัมน์ตายตัว สนญ./กฟข./กฟฟ./อื่นๆ แล้วเลนชื่ออื่นถูกยัดไปรวมใน "อื่นๆ" หัวจึงไม่ตรงกับผังบนเว็บ
 * ยกเว้น "สำนักงานใหญ่" ที่ฟอร์ม บฟ. ของทีมเขียนย่อว่า "สนญ." เสมอ — ใช้ตามฟอร์ม
 */
export function laneHeader(label: string): string {
  const t = (label ?? '').trim();
  return t.replace(/\s/g, '') === 'สำนักงานใหญ่' ? 'สนญ.' : t || '-';
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
 *        1. กรณี<ป้ายเส้น> ให้ดำเนินการขั้นตอนที่ N   ← decision: one numbered line per branch
 */
export function taskCellText(step: Step, proc: Process): { full: string; title: string } {
  const dataSteps = proc.steps.filter((s) => s.type === 'process' || s.type === 'decision');
  const selfIdx = dataSteps.findIndex((s) => s.id === step.id);
  /**
   * ปลายทางจริงของเส้น — ถ้าชี้ไปจุดเชื่อม (เช่น "B") ให้ตามต่อไปยังขั้นที่จุดเชื่อมนั้นพาไป
   * เดิมเส้นที่ไปจุดเชื่อมไม่ถูกเขียนในคอลัมน์นี้เลย เพราะจุดเชื่อมไม่มีเลขขั้นตอน
   */
  const resolve = (toStepId: string): Step | undefined => {
    let target = proc.steps.find((s) => s.id === toStepId);
    for (let hop = 0; target?.type === 'connector' && hop < 10; hop++) {
      const next = (target.branches ?? []).find((b) => b.toStepId)?.toStepId;
      const after = next ? proc.steps.find((s) => s.id === next) : undefined;
      if (!after) break; // จุดเชื่อมที่ไม่ได้ต่อไปไหน (ข้ามไปหน้าอื่น) — หยุดที่จุดเชื่อม
      target = after;
    }
    return target;
  };
  // ถ้อยคำตามฟอร์มของทีม: "ให้ดำเนินการขั้นตอนที่ N" (ผู้ใช้ส่งตัวอย่างมา 18 พ.ย. 2569)
  const routeText = (toStepId: string): string | null => {
    const target = resolve(toStepId);
    if (!target) return null;
    if (target.type === 'end') return 'ให้จบกระบวนการ';
    if (target.type === 'start') return 'ให้กลับไปที่จุดเริ่มต้น';
    if (target.type === 'connector') return `ให้ไปต่อที่จุดเชื่อม ${target.label || 'A'}`;
    const toIdx = dataSteps.findIndex((s) => s.id === target.id);
    if (toIdx < 0) return null;
    return toIdx < selfIdx
      ? `ให้กลับไปดำเนินการขั้นตอนที่ ${toIdx + 1}`
      : `ให้ดำเนินการขั้นตอนที่ ${toIdx + 1}`;
  };

  const title =
    step.type === 'decision' && step.label && !step.label.includes('ตัดสินใจ')
      ? `${step.label} (จุดตัดสินใจ)`
      : step.label || '-';
  const lines = [title];

  const subs = stepSubActions(step);
  // "- <หน่วยงาน> <ชื่อขั้นตอน>" then one bullet per sub-action (format of V.3)
  // ชื่อขั้นที่ขึ้นต้นด้วยชื่อหน่วยงานอยู่แล้ว (เช่น "ระบบ SAP (Billing…") ไม่ต้องเติมซ้ำเป็น "ระบบ SAP ระบบ SAP …"
  if (step.mainUnit) {
    const label = (step.label || '').trim();
    const unit = step.mainUnit.trim();
    lines.push(` - ${label.startsWith(unit) ? label : `${unit} ${label}`}`.trimEnd());
  }
  for (const s of subs) lines.push(`     * ${s}`);

  if (step.type === 'decision') {
    // แต่ละกรณีเป็นข้อมีเลข แบบฟอร์มของทีม:
    //      1. กรณีไม่ต้องระดมผู้ปฏิบัติงาน ให้ดำเนินการขั้นตอนที่ 5
    // ป้ายที่ขึ้นต้นด้วย "กรณี"/"หาก" อยู่แล้วไม่ต้องเติม "กรณี" ซ้ำ
    let n = 0;
    for (const br of step.branches ?? []) {
      if (!br.toStepId) continue;
      const route = routeText(br.toStepId);
      if (!route) continue;
      const label = br.label.trim();
      const when = !label ? '' : /^(กรณี|หาก)/.test(label) ? `${label} ` : `กรณี${label} `;
      lines.push(`     ${++n}. ${when}${route}`);
    }
  } else {
    // a step that jumps somewhere other than the next row — note the target
    const br = (step.branches ?? []).find((b) => b.toStepId);
    if (br?.toStepId) {
      const target = resolve(br.toStepId);
      const toIdx = target ? dataSteps.findIndex((s) => s.id === target.id) : -1;
      if (target?.type === 'end') lines.push('     * ให้จบกระบวนการ');
      else if (target?.type === 'connector' || (toIdx >= 0 && toIdx !== selfIdx + 1)) {
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
  /** หัวคอลัมน์ของเลน org ตามลำดับ (คอลัมน์ J เป็นต้นไป) */
  laneHeaders: string[];
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

const isData = (s: Step) => s.type === 'process' || s.type === 'decision';

/** ข้อความในรูปทรง: สี่เหลี่ยม = หน่วยงาน (แบบผังตัวอย่าง ถ้าไม่ได้กรอกใช้ชื่อขั้นตอน), ข้าวหลามตัด = คำถาม + หน่วยงาน */
function shapeText(step: Step): { main: string; sub?: string } {
  switch (step.type) {
    case 'start':
      return { main: 'Start' };
    case 'end':
      return { main: 'End' };
    case 'connector':
      return { main: step.label || 'A' };
    case 'decision':
      return { main: step.label || 'จุดตัดสินใจ', sub: step.mainUnit || undefined };
    default:
      return { main: step.mainUnit || step.label || '-' };
  }
}

/** ชนิดและขนาดรูปทรงของแต่ละขั้น — ขนาดคงที่ตามผังตัวอย่าง สูงขึ้นเฉพาะเมื่อข้อความยาว */
function shapeOf(step: Step): { prst: 'rect' | 'diamond' | 'ellipse'; w: number; h: number } {
  const t = shapeText(step);
  if (step.type === 'start' || step.type === 'end') return { prst: 'ellipse', w: OVAL_W, h: OVAL_H };
  // จุดเชื่อม: ป้ายสั้นเป็นวงกลม ป้ายยาว ("C8.1.6") ยืดเป็นวงรีให้ป้ายอยู่ในบรรทัดเดียว
  if (step.type === 'connector')
    return { prst: 'ellipse', w: Math.max(OVAL_H, Math.round(t.main.replace(/[ัิ-ฺ็-๎]/g, '').length * 7 + 30)), h: OVAL_H };
  if (step.type === 'decision') {
    // ข้อความอยู่ได้แค่ราวครึ่งกลางของข้าวหลามตัด จึงต้องสูงราว 2 เท่าของข้อความ
    // ข้อความยาว: ขยายความกว้างก่อน (ผู้ใช้เลือก 18 พ.ย. 2569) ให้ทรงยังใกล้จัตุรัสแบบผังตัวอย่าง
    // (221×212) แทนที่จะสูงชะลูด — กว้างสุด DEC_MAX_W แล้วค่อยให้สูงต่อ
    const sizeAt = (w: number) => {
      const chars = Math.floor((DEC_CHARS * w) / DEC_W);
      const n = wrapLabel(t.main, chars).length + (t.sub ? wrapLabel(t.sub, chars).length : 0);
      return Math.max(DEC_MIN_H, n * LINE_11 * 2 + 40);
    };
    let w = DEC_W;
    while (w < DEC_MAX_W && sizeAt(w) > w) w = Math.min(DEC_MAX_W, w + 20);
    return { prst: 'diamond', w, h: sizeAt(w) };
  }
  const n = wrapLabel(t.main, PROC_CHARS).length;
  return { prst: 'rect', w: PROC_W, h: Math.max(PROC_MIN_H, n * LINE_11 + 30) };
}

/** ป้ายของเส้น i→j = ป้ายของทุกกิ่งจากขั้น i ที่ไปขั้น j */
function edgeLabel(from: Step, to: Step): string | undefined {
  const labels = (from.branches ?? [])
    .filter((b) => b.toStepId === to.id && b.label.trim())
    .map((b) => b.label.trim());
  return labels.length ? labels.join(' / ') : undefined;
}

/** Build the row-aligned diagram for the given process. */
export function computeExcelDiagram(proc: Process): ExcelDiagram {
  const steps = proc.steps;
  const N = steps.length;
  const laneHeaders = proc.lanes.filter((l) => l.kind === 'org').map((l) => laneHeader(l.label));
  const nLanes = Math.max(1, laneHeaders.length);
  const warnings: string[] = [];
  const dataIdx = steps.map((s, i) => (isData(s) ? i : -1)).filter((i) => i >= 0);
  const emptyDoc =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"></xdr:wsDr>`;
  if (!dataIdx.length) {
    return {
      laneHeaders,
      colWidthChars: [...FORM_COL_CHARS, ...Array(nLanes).fill(EMPTY_COL_CHARS)],
      rowHeightsPt: [],
      drawingXml: emptyDoc,
      warnings,
    };
  }

  // ---- 1. แผนราง + เส้น (ชุดเดียวกับหน้าเว็บ) ----
  const plan = planFlow(proc);
  const shp = steps.map(shapeOf);
  const labels = plan.edges.map((e) => edgeLabel(steps[e.from], steps[e.to]));
  const hasLabelBelow = new Array(N).fill(false);
  plan.edges.forEach((e, k) => {
    if (labels[k] && e.kind !== 'loop') hasLabelBelow[e.from] = true;
  });

  // ---- 2. แถว: ขั้น Process/Decision มีแถวของตัวเอง ----
  // Start / End / จุดเชื่อม ไม่มีแถวในตาราง → ไปอยู่แถวของขั้นข้อมูลถัดไป (หรือก่อนหน้าถ้าเป็นตัวท้าย)
  const rowOfStep = new Array<number>(N);
  steps.forEach((_, i) => {
    const r = dataIdx.findIndex((d) => d >= i);
    rowOfStep[i] = r >= 0 ? r : dataIdx.length - 1;
  });
  const items: number[][] = dataIdx.map(() => []);
  steps.forEach((_, i) => items[rowOfStep[i]].push(i)); // เรียงตามลำดับขั้น → บนลงล่าง

  const below = (i: number) => GAP_BELOW + (hasLabelBelow[i] ? LABEL_ROOM : 0);
  const contentH = items.map((list) => list.reduce((a, i) => a + GAP_ABOVE + shp[i].h + below(i), 0));
  const rowH = dataIdx.map((si, r) => {
    const step = steps[si];
    // แถวต้องสูงพอให้ข้อความในตารางด้วย (คอลัมน์ B ยาวสุด)
    const textCols: Array<[string | undefined, number]> = [
      [taskCellText(step, proc).full, FORM_COL_CHARS[1]],
      [step.dataIn, FORM_COL_CHARS[5]],
      [step.dataOut, FORM_COL_CHARS[6]],
      [step.regulations, FORM_COL_CHARS[7]],
    ];
    const colLines = Math.max(1, ...textCols.map(([t, c]) => (t ? wrappedLines(t, Math.floor(c * 1.4)) : 1)));
    const want = Math.max(MIN_ROW_PX, contentH[r], colLines * 20 + 16);
    if (contentH[r] > MAX_ROW_PX) warnings.push(`row-${r + 1}`);
    return Math.min(MAX_ROW_PX, Math.round(want));
  });

  const rowStart: number[] = [0];
  for (const h of HEADER_ROWS_PX) rowStart.push(rowStart[rowStart.length - 1] + h);
  rowH.forEach((h) => rowStart.push(rowStart[rowStart.length - 1] + h));

  // ตำแหน่งแนวตั้งของแต่ละรูปทรง: วางกลุ่มรูปทรงไว้กลางแถว
  const top = new Array<number>(N);
  items.forEach((list, r) => {
    let y = rowStart[3 + r] + Math.max(0, (rowH[r] - contentH[r]) / 2);
    for (const i of list) {
      top[i] = y + GAP_ABOVE;
      y += GAP_ABOVE + shp[i].h + below(i);
    }
  });
  const cy = (i: number) => top[i] + shp[i].h / 2;
  const outY = (i: number) => top[i] + shp[i].h + BUS;
  const inY = (i: number) => top[i] - BUS;

  // ---- 3. ทางเดิน: แบ่งช่องให้เส้นที่อ้อม/ย้อนกลับผ่านทางเดินเดียวกัน ----
  const runs = new Map<number, { k: number; y1: number; y2: number }[]>();
  plan.edges.forEach((e, k) => {
    if (e.corridorX === undefined) return;
    const run =
      e.kind === 'loop' ? { k, y1: cy(e.to), y2: cy(e.from) } : { k, y1: outY(e.from), y2: inY(e.to) };
    const list = runs.get(e.corridorX) ?? [];
    list.push(run);
    runs.set(e.corridorX, list);
  });
  const channelOf = new Map<number, number>();
  const channelCount = new Map<number, number>();
  for (const [cx, list] of runs) {
    const idx = colourIntervals(list);
    idx.forEach((c, n) => channelOf.set(list[n].k, c));
    channelCount.set(cx, Math.max(...idx) + 1);
  }

  // ---- 4. คอลัมน์ผัง (J เป็นต้นไป): แต่ละเลนกว้างตามรางที่ใช้ + ทางเดิน ----
  // ทุกเลน org มีคอลัมน์ของตัวเอง เรียงตามลำดับเลน: J, K, L, ...
  const LAST_COL = FIRST_LANE_COL + nLanes - 1;
  const range = new Map<number, { lo: number; hi: number }>();
  const trackBoxW = new Map<string, number>();
  steps.forEach((_, i) => {
    const k = plan.lane[i];
    const t = plan.track[i];
    const r = range.get(k) ?? { lo: t, hi: t };
    range.set(k, { lo: Math.min(r.lo, t), hi: Math.max(r.hi, t) });
    trackBoxW.set(`${k}:${t}`, Math.max(trackBoxW.get(`${k}:${t}`) ?? 0, shp[i].w));
  });
  const LANE_SPAN = 100; // ต้องตรงกับ route.ts
  /** ลำดับช่วงในเลน: ทางเดิน (ครึ่งราง) สลับกับราง พร้อมความกว้างของแต่ละช่วง */
  const laneParts = (k: number) => {
    const r = range.get(k)!;
    const parts: { pos: number; w: number }[] = [];
    for (let p = r.lo - 0.5; p <= r.hi + 0.5 + 1e-9; p += 0.5) {
      if (Math.abs(p - Math.round(p)) > 1e-6) {
        const n = channelCount.get(k * LANE_SPAN + p) ?? 0;
        const outer = p < r.lo || p > r.hi;
        parts.push({ pos: p, w: (outer ? LANE_PAD : TRACK_GAP) + (n ? CH_GAP + n * CH_W : 0) });
      } else {
        const bw = trackBoxW.get(`${k}:${p}`);
        parts.push({ pos: p, w: bw ? bw + TRACK_PAD * 2 : 24 });
      }
    }
    return parts;
  };
  const laneOfCol = (c: number) => c - FIRST_LANE_COL;
  const colWidthChars = [...FORM_COL_CHARS];
  const wantPx = new Map<number, number>();
  for (let c = FIRST_LANE_COL; c <= LAST_COL; c++) {
    const k = laneOfCol(c);
    const want = range.has(k) ? laneParts(k).reduce((a, p) => a + p.w, 0) : 0; // เลนว่าง = กว้างขั้นต่ำ
    wantPx.set(c, want);
    colWidthChars[c] = Math.min(MAX_COL_CHARS, Math.max(EMPTY_COL_CHARS, pxToChars(want)));
    if (pxToChars(want) > MAX_COL_CHARS) warnings.push('wide');
  }
  const COL_PX = colWidthChars.map(charsToPx);
  const colStart: number[] = [0];
  for (let i = 0; i < COL_PX.length; i++) colStart.push(colStart[i] + COL_PX[i]);

  const trackX = new Map<string, number>();
  const corridorCenter = new Map<number, number>();
  for (let c = FIRST_LANE_COL; c <= LAST_COL; c++) {
    const k = laneOfCol(c);
    if (!range.has(k)) continue;
    let x = colStart[c] + Math.max(0, (COL_PX[c] - (wantPx.get(c) ?? 0)) / 2);
    for (const p of laneParts(k)) {
      if (Math.abs(p.pos - Math.round(p.pos)) > 1e-6) corridorCenter.set(k * LANE_SPAN + p.pos, x + p.w / 2);
      else trackX.set(`${k}:${p.pos}`, x + p.w / 2);
      x += p.w;
    }
  }
  const corridorPx = (e: PlannedEdge, k: number) => {
    const c = corridorCenter.get(e.corridorX as number) ?? colStart[LAST_COL + 1];
    const n = channelCount.get(e.corridorX as number) ?? 1;
    return c + ((channelOf.get(k) ?? 0) - (n - 1) / 2) * CH_W;
  };

  // ---- 5. ตำแหน่งรูปทรง + เส้น + ป้าย ----
  const geom: BoxGeom[] = steps.map((_, i) => {
    const cx = trackX.get(`${plan.lane[i]}:${plan.track[i]}`) ?? colStart[LAST_COL] + COL_PX[LAST_COL] / 2;
    const { w, h } = shp[i];
    return { cx, cy: cy(i), x: cx - w / 2, y: top[i], w, h };
  });
  const routes = plan.edges.map((e, k) =>
    edgeRoute(e, geom[e.from], geom[e.to], outY(e.from), inY(e.to), () => corridorPx(e, k)),
  );
  const labelPos = placeEdgeLabels(routes, labels, plan.edges, labelW, LABEL_H, geom);

  // ป้ายที่ยื่นเลยขอบขวาของคอลัมน์สุดท้าย (เช่น ป้ายของเส้นย้อนกลับที่ชิดขวาสุด) — Excel จะบีบกล่องป้าย
  // ให้เหลือแค่ถึงขอบคอลัมน์ พื้นสีเหลือเป็นแถบบาง ๆ ตัวหนังสือล้นออกไป จึงขยายคอลัมน์สุดท้ายให้พอ
  // (คอลัมน์สุดท้ายกว้างขึ้นไม่ทำให้รูปทรงหรือเส้นไหนเลื่อน)
  let labelRight = 0;
  labelPos.forEach((pos, k) => {
    const text = labels[k];
    if (pos && text) labelRight = Math.max(labelRight, pos[0] + labelW(text) / 2 + 8);
  });
  if (labelRight > colStart[LAST_COL + 1]) {
    colWidthChars[LAST_COL] = Math.ceil(pxToChars(labelRight - colStart[LAST_COL]) * 10) / 10;
    COL_PX[LAST_COL] = charsToPx(colWidthChars[LAST_COL]);
    colStart[LAST_COL + 1] = colStart[LAST_COL] + COL_PX[LAST_COL];
  }

  // ---- 6. เขียน XML ----
  const out: string[] = [];
  let nextId = 2;
  const cellOf = (starts: number[], px: number, lastIdx: number) => {
    for (let i = 0; i < lastIdx; i++) if (px < starts[i + 1]) return { idx: i, off: emu(px - starts[i]) };
    return { idx: lastIdx, off: emu(px - starts[lastIdx]) };
  };
  /** twoCellAnchor ตามกรอบที่เห็นจริง (Excel เก็บแบบนี้แม้รูปทรงจะหมุนอยู่) */
  const anchor = (r: Rect, inner: string) => {
    const fc = cellOf(colStart, r.x, COL_PX.length - 1);
    const tc = cellOf(colStart, r.x + r.w, COL_PX.length - 1);
    const fr = cellOf(rowStart, r.y, rowStart.length - 2);
    const tr = cellOf(rowStart, r.y + r.h, rowStart.length - 2);
    out.push(
      `<xdr:twoCellAnchor>` +
        `<xdr:from><xdr:col>${fc.idx}</xdr:col><xdr:colOff>${fc.off}</xdr:colOff><xdr:row>${fr.idx}</xdr:row><xdr:rowOff>${fr.off}</xdr:rowOff></xdr:from>` +
        `<xdr:to><xdr:col>${tc.idx}</xdr:col><xdr:colOff>${tc.off}</xdr:colOff><xdr:row>${tr.idx}</xdr:row><xdr:rowOff>${tr.off}</xdr:rowOff></xdr:to>` +
        inner +
        `<xdr:clientData/></xdr:twoCellAnchor>`,
    );
  };
  const run = (text: string, pt: number, color: string, bold = false) =>
    `<a:r><a:rPr lang="th-TH" sz="${Math.round(pt * 100)}" b="${bold ? 1 : 0}">` +
    `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` +
    `<a:latin typeface="${FONT}"/><a:ea typeface="${FONT}"/><a:cs typeface="${FONT}"/></a:rPr>` +
    `<a:t>${esc(text)}</a:t></a:r>`;
  const para = (runs: string) => `<a:p><a:pPr algn="ctr"/>${runs}</a:p>`;

  /** รูปทรงพื้นขาวขอบดำ — ข้อความเป็นย่อหน้าเดียว ให้ Excel ตัดบรรทัดเอง (ตัดคำไทยถูกกว่าเราตัด) */
  const shape = (r: Rect, prst: string, name: string, paras: string): number => {
    const id = nextId++;
    anchor(
      r,
      `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id}" name="${name} ${id}"/><xdr:cNvSpPr/></xdr:nvSpPr>` +
        `<xdr:spPr><a:xfrm><a:off x="${emu(r.x)}" y="${emu(r.y)}"/><a:ext cx="${emu(r.w)}" cy="${emu(r.h)}"/></a:xfrm>` +
        `<a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>` +
        `<a:ln w="12700"><a:solidFill><a:srgbClr val="${BLACK}"/></a:solidFill></a:ln></xdr:spPr>` +
        `<xdr:txBody><a:bodyPr vertOverflow="overflow" horzOverflow="overflow" wrap="square" lIns="45720" tIns="27432" rIns="45720" bIns="27432" rtlCol="0" anchor="ctr"/>` +
        `<a:lstStyle/>${paras}</xdr:txBody></xdr:sp>`,
    );
    return id;
  };

  type Glue = { id: number; idx: number };
  /**
   * เส้นเชื่อมชิ้นเดียวที่เกาะรูปทรงทั้งสองข้าง
   *  - 'straight' : straightConnector1
   *  - 'v3'       : ลง-ข้าง-ลง  = bentConnector3 หมุน 90°  (adj1 = ระดับที่หัก)
   *  - 'v5'       : ลง-ข้าง-ลง-ข้าง-ลง = bentConnector5 หมุน 90° (adj2 = x ของทางเดิน)
   *  - 'h3'       : ข้าง-ขึ้น/ลง-ข้าง = bentConnector3 ไม่หมุน (เส้นย้อนกลับ)
   * Excel วาดตาม xfrm/adj ที่เราให้ตอนเปิดไฟล์ และคำนวณใหม่เองเมื่อผู้ใช้ลากกล่อง
   */
  const connector = (
    kind: 'straight' | 'v3' | 'v5' | 'h3',
    pts: Pt[],
    st: Glue,
    en: Glue,
    style: { color: string; dash?: boolean },
  ) => {
    const id = nextId++;
    const [sx, sy] = pts[0];
    let [ex, ey] = pts[pts.length - 1];
    const vertical = kind === 'v3' || kind === 'v5';
    // เส้นอ้อม/ย้อนกลับที่ต้นทางกับปลายทางตรงกันพอดี กว้าง 0 ทำให้ adj ไม่มีความหมาย — เผื่อ 1px
    if ((kind === 'v5' || kind === 'h3') && Math.abs(ex - sx) < 1) ex = sx + 1;
    if (kind === 'h3' && Math.abs(ey - sy) < 1) ey = sy + 1;
    const dx = ex - sx;
    const dy = ey - sy;
    const cxp = (sx + ex) / 2;
    const cyp = (sy + ey) / 2;
    let xfrmAttr = '';
    let off: Pt;
    let ext: Pt;
    const adj: number[] = [];
    const frac = (v: number, from: number, span: number) => Math.round(((v - from) / span) * 100000);
    if (vertical) {
      // หมุน 90°: แกนยาวของรูปเดิมกลายเป็นแนวตั้ง (เหมือนที่ Excel ทำเองในไฟล์ตัวอย่าง)
      const w = Math.abs(dy);
      const h = Math.abs(dx);
      xfrmAttr = dx < 0 ? ` rot="5400000"` : ` rot="16200000" flipH="1"`;
      off = [cxp - w / 2, cyp - h / 2];
      ext = [w, h];
      if (kind === 'v3') adj.push(frac(pts[1][1], sy, dy));
      else adj.push(frac(pts[1][1], sy, dy), frac(pts[2][0], sx, dx), frac(pts[3][1], sy, dy));
    } else {
      xfrmAttr = `${dx < 0 ? ' flipH="1"' : ''}${dy < 0 ? ' flipV="1"' : ''}`;
      off = [Math.min(sx, ex), Math.min(sy, ey)];
      ext = [Math.abs(dx), Math.abs(dy)];
      if (kind === 'h3') adj.push(frac(pts[1][0], sx, dx));
    }
    const prst = kind === 'straight' ? 'straightConnector1' : kind === 'v5' ? 'bentConnector5' : 'bentConnector3';
    const av = adj.map((v, n) => `<a:gd name="adj${n + 1}" fmla="val ${v}"/>`).join('');
    const box: Rect = {
      x: Math.min(sx, ex),
      y: Math.min(sy, ey),
      w: Math.max(Math.abs(dx), 0),
      h: Math.max(Math.abs(dy), 0),
    };
    anchor(
      box,
      `<xdr:cxnSp macro=""><xdr:nvCxnSpPr><xdr:cNvPr id="${id}" name="${kind === 'straight' ? 'Straight Arrow Connector' : 'Elbow Connector'} ${id}"/>` +
        `<xdr:cNvCxnSpPr><a:stCxn id="${st.id}" idx="${st.idx}"/><a:endCxn id="${en.id}" idx="${en.idx}"/></xdr:cNvCxnSpPr></xdr:nvCxnSpPr>` +
        `<xdr:spPr><a:xfrm${xfrmAttr}><a:off x="${emu(off[0])}" y="${emu(off[1])}"/><a:ext cx="${emu(ext[0])}" cy="${emu(ext[1])}"/></a:xfrm>` +
        `<a:prstGeom prst="${prst}"><a:avLst>${av}</a:avLst></a:prstGeom>` +
        `<a:ln w="12700"><a:solidFill><a:srgbClr val="${style.color}"/></a:solidFill>` +
        `${style.dash ? '<a:prstDash val="dash"/>' : ''}<a:tailEnd type="triangle"/></a:ln></xdr:spPr></xdr:cxnSp>`,
    );
  };

  // รูปทรงของแต่ละขั้น
  const shapeId = steps.map((s, i) => {
    const g = geom[i];
    const t = shapeText(s);
    const { prst } = shp[i];
    const paras =
      para(run(t.main, s.type === 'start' || s.type === 'end' ? 12 : 11, BLACK)) +
      (t.sub ? para(run(`(${t.sub})`, 10, BLACK)) : '');
    const name = prst === 'diamond' ? 'Diamond' : prst === 'ellipse' ? 'Oval' : 'Rectangle';
    return shape({ x: g.x, y: g.y, w: g.w, h: g.h }, prst, name, paras);
  });
  const site = (i: number, side: 'top' | 'left' | 'bottom' | 'right'): Glue => ({
    id: shapeId[i],
    idx: SITE[shp[i].prst][side],
  });

  // Application: ทรงกระบอกในคอลัมน์ I + เส้นประสีเขียวจากด้านซ้ายของกล่อง
  dataIdx.forEach((i) => {
    const app = steps[i].application?.trim();
    if (!app) return;
    const h = Math.max(CAN_MIN_H, wrapLabel(app, CAN_CHARS).length * LINE_12 + 34);
    const ax = colStart[8] + COL_PX[8] / 2;
    const canId = shape({ x: ax - CAN_W / 2, y: geom[i].cy - h / 2, w: CAN_W, h }, 'can', 'Can', para(run(app, 12, BLACK)));
    connector(
      'straight',
      [[geom[i].x, geom[i].cy], [ax + CAN_W / 2, geom[i].cy]],
      site(i, 'left'),
      { id: canId, idx: SITE.can.right },
      { color: APP_GREEN, dash: true },
    );
  });

  // เส้นเชื่อมตามแผน
  plan.edges.forEach((e, k) => {
    const pts = routes[k].pts;
    const black = { color: BLACK };
    if (e.kind === 'loop') {
      const side = (e.side ?? 1) > 0 ? 'right' : 'left';
      connector('h3', pts, site(e.from, side), site(e.to, side), black);
      return;
    }
    const kind = e.kind === 'straight' ? 'straight' : e.kind === 'corridor' ? 'v5' : 'v3';
    connector(kind, pts, site(e.from, 'bottom'), site(e.to, 'top'), black);
  });

  // ป้ายกิ่ง: กล่องข้อความพื้นเหลืองทองไม่มีขอบ วางทับเส้น — เส้นดูขาดตรงป้าย และเห็นชัดว่าป้ายเป็นของเส้นไหน
  labelPos.forEach((pos, k) => {
    const text = labels[k];
    if (!pos || !text) return;
    const w = labelW(text);
    const id = nextId++;
    anchor(
      { x: pos[0] - w / 2, y: pos[1] - LABEL_H / 2, w, h: LABEL_H },
      `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id}" name="TextBox ${id}"/><xdr:cNvSpPr txBox="1"/></xdr:nvSpPr>` +
        `<xdr:spPr><a:xfrm><a:off x="${emu(pos[0] - w / 2)}" y="${emu(pos[1] - LABEL_H / 2)}"/><a:ext cx="${emu(w)}" cy="${emu(LABEL_H)}"/></a:xfrm>` +
        `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${LABEL_FILL}"/></a:solidFill><a:ln><a:noFill/></a:ln></xdr:spPr>` +
        `<xdr:txBody><a:bodyPr vertOverflow="overflow" horzOverflow="overflow" wrap="none" lIns="18000" tIns="0" rIns="18000" bIns="0" rtlCol="0" anchor="ctr"/>` +
        `<a:lstStyle/>${para(run(text, LABEL_PT, LABEL_TEXT, true))}</xdr:txBody></xdr:sp>`,
    );
  });

  const drawingXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    out.join('') +
    `</xdr:wsDr>`;

  const notes: string[] = [];
  const tall = warnings.filter((w) => w.startsWith('row-')).map((w) => w.slice(4));
  if (tall.length) {
    notes.push(
      `แถวที่ ${tall.join(', ')} มีรูปทรงซ้อนในแถวเดียวเยอะเกินความสูงที่ Excel รับได้ — รูปอาจล้นไปแถวถัดไป`,
    );
  }
  if (warnings.includes('wide')) {
    notes.push('ผังกว้างมาก บางคอลัมน์ถูกจำกัดความกว้างไว้ — รูปอาจล้นไปคอลัมน์ข้าง ๆ');
  }

  return { laneHeaders, colWidthChars, rowHeightsPt: rowH.map(pxToPt), drawingXml, warnings: notes };
}
