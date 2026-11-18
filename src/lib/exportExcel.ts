/**
 * Export the process as the บฟ. form (.xlsx) — table **plus** the flow drawn as
 * native, editable Excel shapes in the "ผังการไหลของกระบวนการ" columns (I = Application,
 * then one column per org lane, headed by the lane's own name).
 *
 * `write-excel-file` builds the table (row order = step order, one row per
 * process / decision step). It can't draw shapes, so we then open the .xlsx zip
 * and splice in `xl/drawings/drawing1.xml` from `excelDrawing.ts`, wiring it to
 * the sheet. Row heights are set here to match what the drawing expects.
 */
import writeXlsxFile from 'write-excel-file';
import JSZip from 'jszip';
import type { Process } from '../domain/types';
import { computeExcelDiagram, taskCellText } from './excelDrawing';
import { triggerDownload } from './persistence';

// สีตามไฟล์ตัวอย่างของทีม ((Workshop) Maintenance V.4 / Microgrid Operation):
// หัวตารางพื้นเทาเข้ม #525252 ตัวหนังสือขาวตัวหนา เส้นตารางสีดำ
const BORDER = '#000000';
const HEAD_BG = '#525252';
const HEAD_TEXT = '#FFFFFF';
const FONT = 'TH SarabunPSK';
const FONT_SIZE = 16;

type Cell = {
  value?: string | number | null;
  fontWeight?: 'bold';
  align?: 'left' | 'center' | 'right';
  alignVertical?: 'top' | 'center' | 'bottom';
  backgroundColor?: string;
  /** สีตัวหนังสือ */
  color?: string;
  span?: number;
  rowSpan?: number;
  wrap?: boolean;
  borderColor?: string;
  borderStyle?: 'thin' | 'medium';
  leftBorderStyle?: 'thin';
  rightBorderStyle?: 'thin';
  topBorderStyle?: 'thin';
  bottomBorderStyle?: 'thin';
  leftBorderColor?: string;
  rightBorderColor?: string;
  topBorderColor?: string;
  bottomBorderColor?: string;
  fontFamily?: string;
  fontSize?: number;
  height?: number;
} | null;

const b = (extra: Partial<NonNullable<Cell>> = {}): NonNullable<Cell> => ({
  borderColor: BORDER,
  borderStyle: 'thin',
  alignVertical: 'top',
  wrap: true,
  fontFamily: FONT,
  fontSize: FONT_SIZE,
  ...extra,
});

const head = (value: string, extra: Partial<NonNullable<Cell>> = {}): NonNullable<Cell> =>
  b({
    value,
    fontWeight: 'bold',
    align: 'center',
    alignVertical: 'center',
    backgroundColor: HEAD_BG,
    color: HEAD_TEXT,
    ...extra,
  });

/** Add / replace an entry just before the closing tag of an XML document. */
function spliceBefore(xml: string, closeTag: string, insert: string): string {
  const at = xml.lastIndexOf(closeTag);
  if (at < 0) return xml + insert;
  return xml.slice(0, at) + insert + xml.slice(at);
}

const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unescXml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#10;/g, '\n')
    .replace(/&#13;/g, '\r')
    .replace(/&amp;/g, '&');

/**
 * Turn a plain "งาน/ขั้นตอน" shared string into rich text: a bold + underlined
 * title line, then the plain body (unit line + "* ..." sub-actions), matching the
 * house form (see `ร่าง (ตัวอย่างที่ทำเสร็จ).xlsx`).
 */
function richTaskSi(full: string, title: string): string {
  const body = full.slice(title.length);
  const rpr = (bold: boolean) =>
    `<rPr>${bold ? '<b/><u/>' : ''}<sz val="16"/><color rgb="FF1F2430"/><rFont val="${FONT}"/><family val="2"/></rPr>`;
  let si = `<si><r>${rpr(true)}<t xml:space="preserve">${escXml(title)}</t></r>`;
  if (body) si += `<r>${rpr(false)}<t xml:space="preserve">${escXml(body)}</t></r>`;
  return si + '</si>';
}

export async function exportExcel(proc: Process, fileStem: string) {
  const steps = proc.steps.filter((s) => s.type === 'process' || s.type === 'decision');
  const diagram = computeExcelDiagram(proc);

  const rows: Cell[][] = [];
  // คอลัมน์ผังมีเลนละคอลัมน์ (ฟอร์มมาตรฐาน 4 เลน = J–M) จำนวนคอลัมน์ทั้งแผ่นจึงขึ้นกับจำนวนเลน
  const lanes = diagram.laneHeaders.length ? diagram.laneHeaders : ['อื่นๆ'];
  const totalCols = 9 + lanes.length;
  const lastCol = totalCols - 1;
  const blanks = (n: number) => Array(n).fill(null);

  // Row 1 — title across every column
  rows.push([
    // ชื่อกระบวนการ: ตัวหนาสีดำ ไม่มีพื้น (แบบไฟล์ตัวอย่าง)
    head(proc.title || 'workflow', { span: totalCols, align: 'left', backgroundColor: undefined, color: '#000000' }),
    ...blanks(totalCols - 1),
  ]);

  // Row 2 / 3 — header
  rows.push([
    head('งาน/ขั้นตอนการดำเนินการ', { span: 2, rowSpan: 2 }),
    null,
    head('กรอบระยะเวลาดำเนินการ', { rowSpan: 2 }),
    head('หน่วยงานรับผิดชอบหลัก', { rowSpan: 2 }),
    head('ตำแหน่งผู้ปฏิบัติงาน', { rowSpan: 2 }),
    head('Data Input', { rowSpan: 2 }),
    head('Data Output', { rowSpan: 2 }),
    head('ระเบียบที่เกี่ยวข้อง', { rowSpan: 2 }),
    head('ผังการไหลของกระบวนการ', { span: 1 + lanes.length }),
    ...blanks(lanes.length),
  ]);
  rows.push([
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    head('Application in Process'),
    ...lanes.map((name) => head(name)),
  ]);

  // Data rows — the diagram columns (J onward) are just the drawing canvas now.
  const richTasks: Array<{ full: string; title: string }> = [];
  /**
   * เซลล์ในคอลัมน์ผัง (I ถึงคอลัมน์สุดท้าย) ไม่มีเส้นตารางด้านใน ให้เส้นของผังเห็นชัด (ผู้ใช้ขอ 18 พ.ย. 2569)
   * เหลือเฉพาะกรอบนอก: ซ้ายของ I, ขวาของคอลัมน์สุดท้าย และล่างสุดของแถวสุดท้าย
   */
  const flowCell = (col: number, last: boolean, value: string): NonNullable<Cell> => {
    const { borderColor: _c, borderStyle: _s, ...rest } = b({ value });
    const edge = (on: boolean) => (on ? { style: 'thin' as const, color: BORDER } : null);
    const L = edge(col === 8);
    const R = edge(col === lastCol);
    const B = edge(last);
    return {
      ...rest,
      ...(L && { leftBorderStyle: L.style, leftBorderColor: L.color }),
      ...(R && { rightBorderStyle: R.style, rightBorderColor: R.color }),
      ...(B && { bottomBorderStyle: B.style, bottomBorderColor: B.color }),
    };
  };

  steps.forEach((step, i) => {
    const last = i === steps.length - 1;
    const rowHeight = diagram.rowHeightsPt[i];
    const task = taskCellText(step, proc);
    richTasks.push(task);
    rows.push([
      b({ value: i + 1, align: 'center', alignVertical: 'center', wrap: false, height: rowHeight }),
      b({ value: task.full }),
      b({ value: step.duration || '-' }),
      b({ value: step.mainUnit || '-' }),
      b({ value: step.operatorRole || '-' }),
      b({ value: step.dataIn || '-' }),
      b({ value: step.dataOut || '-' }),
      b({ value: step.regulations || '-' }),
      flowCell(8, last, step.application || '-'),
      ...lanes.map((_, k) => flowCell(9 + k, last, '')),
    ]);
  });

  const columns = diagram.colWidthChars.map((width) => ({ width }));

  const blob = (await writeXlsxFile(rows as never, {
    columns,
    sheet: 'Flow',
  })) as Blob;

  // --- splice the drawing into the .xlsx zip ---
  const zip = await JSZip.loadAsync(blob);

  const ctPath = '[Content_Types].xml';
  const ct = await zip.file(ctPath)!.async('string');
  zip.file(
    ctPath,
    spliceBefore(
      ct,
      '</Types>',
      '<Override ContentType="application/vnd.openxmlformats-officedocument.drawing+xml" PartName="/xl/drawings/drawing1.xml"/>',
    ),
  );

  const sheetPath = 'xl/worksheets/sheet1.xml';
  let sheet = await zip.file(sheetPath)!.async('string');
  // write-excel-file ไม่ใส่ <sheetViews> — ถ้าไม่มี Excel (Mac) จะคิดตำแหน่งรูปทรงแนวตั้งผิดเป็น 0.75 เท่า
  // (ทดสอบแล้ว: สี่เหลี่ยมที่สูงเท่าแถวพอดีออกมาสูงแค่ 3/4 แถว) ไฟล์ที่ Excel บันทึกเองมีส่วนนี้เสมอ
  // ลำดับใน <worksheet>: sheetPr, dimension, sheetViews, ... — ไฟล์นี้ไม่มีสองตัวแรก จึงใส่ต้นสุดได้
  // showGridLines="0": ซ่อนเส้นตารางจาง ๆ ของ Excel เอง ไม่งั้นคอลัมน์ผังที่ไม่มีเส้นขอบจะมีเส้นเทาโผล่แทน
  if (!sheet.includes('<sheetViews')) {
    sheet = sheet.replace(/(<worksheet[^>]*>)/, '$1<sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>');
  }
  zip.file(sheetPath, spliceBefore(sheet, '</worksheet>', '<drawing r:id="rId1"/>'));

  const sheetRelsPath = 'xl/worksheets/_rels/sheet1.xml.rels';
  const relEntry =
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>';
  const existingRels = zip.file(sheetRelsPath);
  if (existingRels) {
    const rels = await existingRels.async('string');
    zip.file(sheetRelsPath, spliceBefore(rels, '</Relationships>', relEntry));
  } else {
    zip.file(
      sheetRelsPath,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relEntry}</Relationships>`,
    );
  }

  zip.file('xl/drawings/drawing1.xml', diagram.drawingXml);

  // ฟอนต์ตั้งต้นของไฟล์ (Normal) เป็นตัวกำหนดว่า "1 ตัวอักษร" ของความกว้างคอลัมน์กว้างกี่ px
  // write-excel-file ใส่ Calibri 12 (≈8px/ตัว) แต่ฟอร์ม บฟ. และ excelDrawing.ts คิดแบบ Calibri 11
  // (7px/ตัว) — ถ้าไม่แก้ คอลัมน์ใน Excel จะกว้างเกินที่คำนวณราว 14% แล้วป้าย/เส้นอ้อมจะเยื้อง
  // (เซลล์ในตารางตั้งฟอนต์ TH SarabunPSK 16 ของตัวเองอยู่แล้ว จึงไม่กระทบหน้าตาตาราง)
  const stylesPath = 'xl/styles.xml';
  const stylesFile = zip.file(stylesPath);
  if (stylesFile) {
    const styles = await stylesFile.async('string');
    zip.file(stylesPath, styles.replace(/(<fonts[^>]*>\s*<font>\s*<sz val=")\d+(")/, '$111$2'));
  }

  // --- rich text for the "งาน/ขั้นตอน" column (bold + underlined title) ---
  const ssPath = 'xl/sharedStrings.xml';
  const ssFile = zip.file(ssPath);
  if (ssFile) {
    const ss = await ssFile.async('string');
    const patched = ss.replace(
      /<si><t(?: [^>]*)?>((?:(?!<\/t>)[\s\S])*)<\/t><\/si>/g,
      (whole, inner: string) => {
        const text = unescXml(inner);
        const hit = richTasks.find((t) => t.full === text);
        return hit ? richTaskSi(hit.full, hit.title) : whole;
      },
    );
    zip.file(ssPath, patched);
  }

  const out = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(out, `${fileStem}.xlsx`);
  if (diagram.warnings.length) alert(diagram.warnings.join('\n\n'));
}
