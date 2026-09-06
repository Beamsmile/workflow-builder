/**
 * Export the diagram as the บฟ. table (.xlsx).
 *
 * v1 = the table only (columns งาน/ขั้นตอน … ระเบียบที่เกี่ยวข้อง + the org
 * columns marked with ● for the lane each step sits in). The drawn flow inside
 * the "ผังการไหลของกระบวนการ" column is Phase 6 (needs hand-written DrawingML).
 */
import writeXlsxFile from 'write-excel-file';
import type { Diagram } from '../domain/types';

const BORDER = '#8a8f99';
const HEAD_BG = '#dfe3ec';

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
  fontSize?: number;
} | null;

const b = (extra: Partial<NonNullable<Cell>> = {}): NonNullable<Cell> => ({
  borderColor: BORDER,
  borderStyle: 'thin',
  alignVertical: 'top',
  wrap: true,
  ...extra,
});

const head = (value: string, extra: Partial<NonNullable<Cell>> = {}): NonNullable<Cell> =>
  b({ value, fontWeight: 'bold', align: 'center', alignVertical: 'center', backgroundColor: HEAD_BG, ...extra });

/** lane id / label → which org column (0-based J..M = 9..12), or -1. */
function orgColumnIndex(diagram: Diagram, laneId: string): number {
  const lane = diagram.lanes.find((l) => l.id === laneId);
  if (!lane) return -1;
  const label = lane.label.replace(/\s/g, '');
  if (/สนญ|สำนักงานใหญ่/.test(label)) return 9;
  if (/กฟข/.test(label)) return 10;
  if (/กฟฟ/.test(label)) return 11;
  if (/อื่น/.test(label)) return 12;
  // any other org lane → "อื่นๆ"
  return lane.kind === 'org' ? 12 : -1;
}

export async function exportExcel(diagram: Diagram, fileName: string) {
  const steps = diagram.nodes
    .filter((n) => n.type === 'process' || n.type === 'decision')
    .slice()
    .sort((a, z) => a.position.y - z.position.y || a.position.x - z.position.x);

  const rows: Cell[][] = [];

  // Row 1 – title across A:M
  rows.push([
    head(diagram.title || 'workflow', { span: 13, align: 'center', fontSize: 14 }),
    ...Array(12).fill(null),
  ]);

  // Row 2
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

  // Row 3
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

  // Data rows
  steps.forEach((step, i) => {
    const d = step.data;
    const orgCol = orgColumnIndex(diagram, d.laneId);
    const row: Cell[] = [
      b({ value: i + 1, align: 'center', alignVertical: 'center', wrap: false }),
      b({ value: labelWithDetail(d.label, step.type) }),
      b({ value: d.duration || '-' }),
      b({ value: d.mainUnit || '-' }),
      b({ value: d.operatorRole || '-' }),
      b({ value: d.dataIn || '-' }),
      b({ value: d.dataOut || '-' }),
      b({ value: d.regulations || '-' }),
      b({ value: d.application || '-' }),
      b({ value: orgCol === 9 ? '●' : '', align: 'center' }),
      b({ value: orgCol === 10 ? '●' : '', align: 'center' }),
      b({ value: orgCol === 11 ? '●' : '', align: 'center' }),
      b({ value: orgCol === 12 ? '●' : '', align: 'center' }),
    ];
    rows.push(row);
  });

  const columns = [
    { width: 6 },
    { width: 42 },
    { width: 16 },
    { width: 20 },
    { width: 16 },
    { width: 24 },
    { width: 24 },
    { width: 28 },
    { width: 18 },
    { width: 7 },
    { width: 7 },
    { width: 7 },
    { width: 7 },
  ];

  await writeXlsxFile(rows as never, {
    columns,
    fileName: fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`,
    sheet: 'Flow',
  });
}

function labelWithDetail(label: string, type: string): string {
  if (type === 'decision' && label && !label.includes('จุดตัดสินใจ')) {
    return `${label} (จุดตัดสินใจ)`;
  }
  return label || '-';
}
