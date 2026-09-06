import type { Diagram, Lane } from './types';
import { LANE_WIDTH, HEADER_HEIGHT } from './theme';
import { snapXToLane } from './lanes';

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  build: () => Diagram;
}

/** The standard column set from the บฟ. form. */
function standardLanes(): Lane[] {
  return [
    { id: 'lane-time', label: 'ระยะเวลา', kind: 'meta', width: LANE_WIDTH.meta },
    { id: 'lane-datain', label: 'Data in', kind: 'meta', width: LANE_WIDTH.meta },
    { id: 'lane-app', label: 'Application', kind: 'meta', width: LANE_WIDTH.meta },
    { id: 'lane-hq', label: 'สำนักงานใหญ่', kind: 'org', width: LANE_WIDTH.org, groupLabel: 'กระบวนการ' },
    { id: 'lane-area', label: 'กฟข.', kind: 'org', width: LANE_WIDTH.org, groupLabel: 'กระบวนการ' },
    { id: 'lane-branch', label: 'กฟฟ.', kind: 'org', width: LANE_WIDTH.org, groupLabel: 'กระบวนการ' },
    { id: 'lane-other', label: 'อื่นๆ', kind: 'org', width: LANE_WIDTH.org, groupLabel: 'กระบวนการ' },
    { id: 'lane-dataout', label: 'Data out', kind: 'meta', width: LANE_WIDTH.meta },
  ];
}

function blank(): Diagram {
  return {
    schemaVersion: 1,
    title: 'ชื่อกระบวนการ',
    lanes: standardLanes(),
    nodes: [],
    edges: [],
  };
}

/**
 * งานซ่อมแซมและบำรุงรักษา – seeded from "3.Maintenance.xlsx" (sheet "Flow").
 * Placed as a starting point; the user edits from here.
 */
function maintenance(): Diagram {
  const lanes = standardLanes();
  const laneId = 'lane-branch'; // most steps are field units → put them in กฟฟ.

  const rowGap = 150;
  let y = HEADER_HEIGHT + 40;
  const nextY = () => {
    const cur = y;
    y += rowGap;
    return cur;
  };

  type Seed = {
    id: string;
    type: 'start' | 'end' | 'process' | 'decision';
    label: string;
    orgLabel?: string;
    mainUnit?: string;
  };

  const seeds: Seed[] = [
    { id: 'n-start', type: 'start', label: 'Start' },
    { id: 'n1', type: 'process', label: 'กำหนดแผนการบำรุงรักษาของแต่ละอุปกรณ์' },
    { id: 'n2', type: 'process', label: 'สร้างใบสั่งงานบำรุงรักษาตามแผนการบำรุงรักษา' },
    {
      id: 'n3',
      type: 'process',
      label: 'ดำเนินการบำรุงรักษาตามมาตรฐานการบำรุงรักษาของแต่ละอุปกรณ์',
      orgLabel: 'หน่วยงานที่เกี่ยวข้องกับแต่ละอุปกรณ์',
      mainUnit: 'หน่วยงานที่เกี่ยวข้องกับแต่ละอุปกรณ์',
    },
    {
      id: 'n4',
      type: 'decision',
      label: 'ต้องซ่อมแซมอุปกรณ์หรือไม่',
      orgLabel: 'หน่วยงานที่เกี่ยวข้องกับแต่ละอุปกรณ์',
      mainUnit: 'หน่วยงานที่เกี่ยวข้องกับแต่ละอุปกรณ์',
    },
    {
      id: 'n5',
      type: 'process',
      label: 'กรณีซ่อมไม่ได้ ปฏิบัติตามหลักเกณฑ์และวิธีปฏิบัติเกี่ยวกับการจำหน่ายพัสดุของ กฟภ.',
      orgLabel: 'เจ้าหน้าที่ระบบงานพัสดุ',
      mainUnit: 'เจ้าหน้าที่ระบบงานพัสดุ',
    },
    {
      id: 'n6',
      type: 'process',
      label: 'กรณีซ่อมได้ สร้างใบแจ้งซ่อมและใบสั่งซ่อม และส่งใบเบิกของให้เจ้าหน้าที่ระบบงานพัสดุ',
      orgLabel: 'ผู้ควบคุมงาน',
      mainUnit: 'ผู้ควบคุมงาน',
    },
    {
      id: 'n7',
      type: 'process',
      label: 'ตัดจ่ายพัสดุ พร้อมพิมพ์ใบส่งของให้ผู้ควบคุมงาน',
      orgLabel: 'เจ้าหน้าที่ระบบงานพัสดุ',
      mainUnit: 'เจ้าหน้าที่ระบบงานพัสดุ',
    },
    {
      id: 'n8',
      type: 'process',
      label: 'ดำเนินการซ่อมแซมอุปกรณ์ตามขั้นตอนปฏิบัติของอุปกรณ์',
      orgLabel: 'หน่วยงานที่เกี่ยวข้องกับแต่ละอุปกรณ์',
      mainUnit: 'หน่วยงานที่เกี่ยวข้องกับแต่ละอุปกรณ์',
    },
    {
      id: 'n9',
      type: 'process',
      label: 'บันทึกรายงานผลการซ่อมแซม และปิดใบสั่งงาน',
      orgLabel: 'ผู้ควบคุมงาน',
      mainUnit: 'ผู้ควบคุมงาน',
    },
    {
      id: 'n10',
      type: 'process',
      label: 'ตรวจสอบความพร้อมของอุปกรณ์ให้เป็นไปตามมาตรฐาน หลังจากบำรุงรักษา',
      orgLabel: 'หน่วยงานที่เกี่ยวข้องกับแต่ละอุปกรณ์',
      mainUnit: 'หน่วยงานที่เกี่ยวข้องกับแต่ละอุปกรณ์',
    },
    {
      id: 'n11',
      type: 'process',
      label: 'บันทึกรายงานผลการบำรุงรักษา ปิดใบสั่งงานบำรุงรักษา',
      orgLabel: 'ผู้ควบคุมงาน',
      mainUnit: 'ผู้ควบคุมงาน',
    },
    { id: 'n-end', type: 'end', label: 'End' },
  ];

  const nodes = seeds.map((s) => ({
    id: s.id,
    type: s.type,
    position: { x: snapXToLane(lanes, laneId, s.type), y: nextY() },
    data: {
      kind: s.type,
      laneId,
      label: s.label,
      orgLabel: s.orgLabel,
      mainUnit: s.mainUnit,
      duration: '-',
      operatorRole: '-',
      dataIn: '-',
      dataOut: '-',
      regulations: '-',
    },
  }));

  // centre Start/End (small shapes) under the column
  for (const n of nodes) {
    if (n.type === 'start' || n.type === 'end') {
      n.position.x = snapXToLane(lanes, laneId, n.type);
    }
  }

  const linear = ['n-start', 'n1', 'n2', 'n3', 'n4'];
  const edges = [];
  for (let i = 0; i < linear.length - 1; i++) {
    edges.push({ id: `e-${linear[i]}-${linear[i + 1]}`, source: linear[i], target: linear[i + 1] });
  }
  edges.push({ id: 'e-n4-n6', source: 'n4', target: 'n6', label: 'ซ่อมได้' });
  edges.push({ id: 'e-n4-n5', source: 'n4', target: 'n5', label: 'ซ่อมไม่ได้' });
  edges.push({ id: 'e-n4-n10', source: 'n4', target: 'n10', label: 'ไม่ต้องซ่อม' });
  edges.push({ id: 'e-n6-n7', source: 'n6', target: 'n7' });
  edges.push({ id: 'e-n7-n8', source: 'n7', target: 'n8' });
  edges.push({ id: 'e-n8-n9', source: 'n8', target: 'n9' });
  edges.push({ id: 'e-n9-n10', source: 'n9', target: 'n10' });
  edges.push({ id: 'e-n10-n11', source: 'n10', target: 'n11' });
  edges.push({ id: 'e-n11-end', source: 'n11', target: 'n-end' });
  edges.push({ id: 'e-n5-end', source: 'n5', target: 'n-end' });

  return {
    schemaVersion: 1,
    title: 'งานซ่อมแซมและบำรุงรักษา',
    lanes,
    nodes: nodes as Diagram['nodes'],
    edges,
  };
}

export const TEMPLATES: TemplateInfo[] = [
  {
    id: 'blank',
    name: 'Blank (define your own lanes)',
    description: 'คอลัมน์มาตรฐานตามฟอร์ม บฟ. ยังไม่มีขั้นตอน',
    build: blank,
  },
  {
    id: 'maintenance',
    name: 'Maintenance (งานซ่อมแซมและบำรุงรักษา)',
    description: 'ตัวอย่างจากไฟล์ 3.Maintenance.xlsx — 11 ขั้นตอน + จุดตัดสินใจ',
    build: maintenance,
  },
];

export const DEFAULT_TEMPLATE_ID = 'maintenance';
