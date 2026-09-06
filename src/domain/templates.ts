/**
 * Starting-point processes. `Blank` gives the standard บฟ. org columns with no
 * steps; `Maintenance` is seeded from the sample file "3.Maintenance.xlsx".
 */
import type { Lane, Process, Step, StepType } from './types';

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  build: () => Process;
}

/** The standard บฟ.-form columns: side (meta) columns then the org columns. */
function standardLanes(): Lane[] {
  return [
    { id: 'lane-time', label: 'ระยะเวลา', kind: 'meta', field: 'duration' },
    { id: 'lane-datain', label: 'Data in', kind: 'meta', field: 'dataIn' },
    { id: 'lane-dataout', label: 'Data out', kind: 'meta', field: 'dataOut' },
    { id: 'lane-app', label: 'Application', kind: 'meta', field: 'application' },
    { id: 'lane-hq', label: 'สำนักงานใหญ่', kind: 'org' },
    { id: 'lane-area', label: 'กฟข.', kind: 'org' },
    { id: 'lane-branch', label: 'กฟฟ.', kind: 'org' },
    { id: 'lane-other', label: 'อื่นๆ', kind: 'org' },
  ];
}

function blank(): Process {
  return {
    schemaVersion: 2,
    title: 'ชื่อกระบวนการ',
    bandLabel: 'กระบวนการ',
    lanes: standardLanes(),
    steps: [],
  };
}

function maintenance(): Process {
  const lanes = standardLanes();

  type Seed = {
    id: string;
    type: StepType;
    label: string;
    lane: string;
    mainUnit?: string;
    operatorRole?: string;
    duration?: string;
    dataIn?: string;
    dataOut?: string;
    application?: string;
    note?: string;
    branches?: { label: string; to: string }[];
  };

  const seeds: Seed[] = [
    { id: 's1', type: 'start', label: 'เริ่มต้นกระบวนการ', lane: 'lane-branch' },
    {
      id: 's2',
      type: 'process',
      label: 'กำหนดแผนการบำรุงรักษาของแต่ละอุปกรณ์',
      lane: 'lane-branch',
      mainUnit: 'หน่วยงานที่เกี่ยวข้องกับแต่ละอุปกรณ์',
      operatorRole: 'ผู้ควบคุมงาน',
      duration: '1 เดือน/ปี',
      dataIn: 'มาตรฐานการบำรุงรักษาอุปกรณ์',
      dataOut: 'แผนการบำรุงรักษา',
      application: 'SAP PM',
      note: 'ทบทวนรอบการบำรุงรักษาของอุปกรณ์แต่ละชนิด\nจัดลำดับความสำคัญตามความเสี่ยง\nจัดทำปฏิทินการบำรุงรักษาประจำปี',
    },
    {
      id: 's3',
      type: 'process',
      label: 'สร้างใบสั่งงานบำรุงรักษาตามแผนการบำรุงรักษา',
      lane: 'lane-branch',
      operatorRole: 'ผู้ควบคุมงาน',
      duration: '1 วันทำการ',
      dataIn: 'แผนการบำรุงรักษา',
      dataOut: 'ใบสั่งงานบำรุงรักษา',
      application: 'SAP PM',
    },
    {
      id: 's4',
      type: 'process',
      label: 'ดำเนินการบำรุงรักษาตามมาตรฐานการบำรุงรักษาของแต่ละอุปกรณ์',
      lane: 'lane-branch',
      mainUnit: 'หน่วยงานที่เกี่ยวข้องกับแต่ละอุปกรณ์',
      duration: 'ตามแผน',
      dataIn: 'ใบสั่งงานบำรุงรักษา',
      dataOut: 'ผลการบำรุงรักษา',
    },
    {
      id: 's5',
      type: 'decision',
      label: 'ต้องซ่อมแซมอุปกรณ์หรือไม่',
      lane: 'lane-branch',
      mainUnit: 'หน่วยงานที่เกี่ยวข้องกับแต่ละอุปกรณ์',
      branches: [
        { label: 'ซ่อมได้', to: 's7' },
        { label: 'ซ่อมไม่ได้', to: 's6' },
        { label: 'ไม่ต้องซ่อม', to: 's11' },
      ],
    },
    {
      id: 's6',
      type: 'process',
      label:
        'กรณีซ่อมไม่ได้ ปฏิบัติตามหลักเกณฑ์และวิธีปฏิบัติเกี่ยวกับการจำหน่ายพัสดุของ กฟภ.',
      lane: 'lane-other',
      mainUnit: 'เจ้าหน้าที่ระบบงานพัสดุ',
      branches: [{ label: '', to: 's12' }],
    },
    {
      id: 's7',
      type: 'process',
      label: 'กรณีซ่อมได้ สร้างใบแจ้งซ่อมและใบสั่งซ่อม และส่งใบเบิกของให้เจ้าหน้าที่ระบบงานพัสดุ',
      lane: 'lane-branch',
      mainUnit: 'ผู้ควบคุมงาน',
      note: 'สร้างใบแจ้งซ่อมในระบบ\nสร้างใบสั่งซ่อม\nจัดทำใบเบิกของและส่งให้เจ้าหน้าที่ระบบงานพัสดุ',
    },
    {
      id: 's8',
      type: 'process',
      label: 'ตัดจ่ายพัสดุ พร้อมพิมพ์ใบส่งของให้ผู้ควบคุมงาน',
      lane: 'lane-other',
      mainUnit: 'เจ้าหน้าที่ระบบงานพัสดุ',
    },
    {
      id: 's9',
      type: 'process',
      label: 'ดำเนินการซ่อมแซมอุปกรณ์ตามขั้นตอนปฏิบัติของอุปกรณ์',
      lane: 'lane-branch',
      mainUnit: 'หน่วยงานที่เกี่ยวข้องกับแต่ละอุปกรณ์',
    },
    {
      id: 's10',
      type: 'process',
      label: 'บันทึกรายงานผลการซ่อมแซม และปิดใบสั่งซ่อม',
      lane: 'lane-branch',
      mainUnit: 'ผู้ควบคุมงาน',
    },
    {
      id: 's11',
      type: 'process',
      label: 'ตรวจสอบความพร้อมของอุปกรณ์ให้เป็นไปตามมาตรฐาน หลังจากบำรุงรักษา',
      lane: 'lane-branch',
      mainUnit: 'หน่วยงานที่เกี่ยวข้องกับแต่ละอุปกรณ์',
    },
    {
      id: 's12',
      type: 'process',
      label: 'บันทึกรายงานผลการบำรุงรักษา ปิดใบสั่งงานบำรุงรักษา',
      lane: 'lane-branch',
      mainUnit: 'ผู้ควบคุมงาน',
      branches: [{ label: '', to: 's13' }],
    },
    { id: 's13', type: 'end', label: 'สิ้นสุดกระบวนการ', lane: 'lane-branch' },
  ];

  const steps: Step[] = seeds.map((s, si) => ({
    id: s.id,
    type: s.type,
    label: s.label,
    laneId: s.lane,
    mainUnit: s.mainUnit,
    operatorRole: s.operatorRole,
    duration: s.duration,
    dataIn: s.dataIn,
    dataOut: s.dataOut,
    application: s.application,
    note: s.note,
    // explicit branches from the seed, else a plain link to the next step so the
    // template comes fully connected (the app itself never auto-connects)
    branches: s.branches
      ? s.branches.map((b, i) => ({ id: `${s.id}-b${i}`, label: b.label, toStepId: b.to }))
      : s.type !== 'end' && seeds[si + 1]
        ? [{ id: `${s.id}-b0`, label: '', toStepId: seeds[si + 1].id }]
        : undefined,
  }));

  return {
    schemaVersion: 2,
    title: 'งานซ่อมแซมและบำรุงรักษา',
    bandLabel: 'กระบวนการ',
    lanes,
    steps,
  };
}

export const TEMPLATES: TemplateInfo[] = [
  {
    id: 'blank',
    name: 'หน้าใหม่ (ว่าง)',
    description: 'คอลัมน์มาตรฐานตามฟอร์ม บฟ. — เริ่มทำงานได้เลย',
    build: blank,
  },
  {
    id: 'maintenance',
    name: 'ตัวอย่าง: งานซ่อมแซมและบำรุงรักษา',
    description: 'ไว้ทดลองใช้งาน — 13 ขั้นตอน + จุดตัดสินใจ + ข้อมูลตัวอย่าง',
    build: maintenance,
  },
];

/** App opens on a blank working page; the sample flow is loaded from the menu. */
export const DEFAULT_TEMPLATE_ID = 'blank';
