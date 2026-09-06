/**
 * Export the process as the บฟ. form (.xlsx) — table **plus** the flow drawn as
 * native, editable Excel shapes in the "ผังการไหลของกระบวนการ" columns (I–M).
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

const BORDER = '#8a8f99';
const HEAD_BG = '#dfe3ec';
const FONT = 'TH Sarabun New';
const FONT_SIZE = 16;

type Cell = {
  value?: string | number | null;
  fontWeight?: 'bold';
  align?: 'left' | 'center' | 'right';
  alignVertical?: 'top' | 'center' | 'bottom';
  backgroundColor?: string;
  span?: number;
  rowSpan?: number;
  wrap?: boolean;
  borderColor?: string;
  borderStyle?: 'thin' | 'medium';
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
    `<rPr>${bold ? '<b/><u/>' : ''}<sz val="16"/><color rgb="FF1F2430"/><rFont val="TH Sarabun New"/><family val="2"/></rPr>`;
  let si = `<si><r>${rpr(true)}<t xml:space="preserve">${escXml(title)}</t></r>`;
  if (body) si += `<r>${rpr(false)}<t xml:space="preserve">${escXml(body)}</t></r>`;
  return si + '</si>';
}

export async function exportExcel(proc: Process, fileStem: string) {
  const steps = proc.steps.filter((s) => s.type === 'process' || s.type === 'decision');
  const diagram = computeExcelDiagram(proc);

  const rows: Cell[][] = [];

  // Row 1 — title across A:M
  rows.push([
    head(proc.title || 'workflow', { span: 13, align: 'left', fontSize: 18, backgroundColor: undefined }),
    ...Array(12).fill(null),
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
    head('ผังการไหลของกระบวนการ', { span: 5 }),
    null,
    null,
    null,
    null,
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
    head('สนญ.'),
    head('กฟข.'),
    head('กฟฟ.'),
    head('อื่นๆ'),
  ]);

  // Data rows — the diagram columns (J–M) are just the drawing canvas now.
  const richTasks: Array<{ full: string; title: string }> = [];
  steps.forEach((step, i) => {
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
      b({ value: step.application || '-' }),
      b({ value: '' }),
      b({ value: '' }),
      b({ value: '' }),
      b({ value: '' }),
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
  const sheet = await zip.file(sheetPath)!.async('string');
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
}
