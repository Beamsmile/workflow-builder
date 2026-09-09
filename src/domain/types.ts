/**
 * Domain model — v2 ("form-first").
 *
 * A `Process` is ONE workflow (e.g. "งานซ่อมแซมและบำรุงรักษา").
 * It is just:
 *   - a title
 *   - a list of vertical lanes (หน่วยงาน columns in the swimlane)
 *   - an ORDERED list of steps
 *
 * There are no x/y coordinates and no separate "edges" list. The picture is
 * drawn 100% from this data by `domain/layout.ts`, and the บฟ. Excel table is
 * built from the same `steps` array (row order = step order).
 */

/** Shape of one step on the flow. */
export type StepType =
  | 'start' // จุดเริ่ม — วงกลมเขียว
  | 'process' // ขั้นตอนปกติ — กล่องเหลือง
  | 'decision' // จุดตัดสินใจ — สี่เหลี่ยมข้าวหลามตัด
  | 'connector' // จุดเชื่อม/ข้ามหน้า — วงกลมเล็กมีตัวอักษร
  | 'end'; // จุดจบ — วงกลมเขียว

/** One outgoing path from a step. */
export interface Branch {
  id: string;
  /** ป้ายกำกับเส้น เช่น "ซ่อมได้" / "Y" / "N" */
  label: string;
  /** id ของ step ปลายทาง — null = ยังไม่ได้เลือก */
  toStepId: string | null;
}

/** บฟ.-form fields for a step (map 1:1 to the Excel columns). */
export interface StepFields {
  /** กรอบระยะเวลาดำเนินการ */
  duration?: string;
  /**
   * หน่วยงานรับผิดชอบหลัก — ทั้งคอลัมน์ในตาราง บฟ. และป้ายสีแดงใต้กล่องในผัง
   * ใช้ค่าเดียวกัน
   */
  mainUnit?: string;
  /** ตำแหน่งผู้ปฏิบัติงาน */
  operatorRole?: string;
  /** Data Input */
  dataIn?: string;
  /** Data Output */
  dataOut?: string;
  /** ระเบียบที่เกี่ยวข้อง */
  regulations?: string;
  /** Application in Process (ระบบงานที่ใช้) เช่น "SAP, GIS" */
  application?: string;
  /**
   * รายละเอียด/ขั้นตอนย่อย — พิมพ์บรรทัดละหนึ่งข้อ จะไป export เป็น bullet "*"
   * ใต้ชื่อขั้นตอนในคอลัมน์ "งาน/ขั้นตอนการดำเนินการ" ของฟอร์ม บฟ.
   */
  note?: string;
}

export interface Step extends StepFields {
  id: string;
  type: StepType;
  /** งาน/ขั้นตอนการดำเนินการ — ข้อความในกล่อง */
  label: string;
  /** id ของเลนที่ step นี้อยู่ */
  laneId: string;
  /**
   * เส้นทางออกจาก step นี้ (ผังวาดลูกศรจาก branch ที่ระบุไว้เท่านั้น)
   *  - ว่าง/ไม่มี  → ไม่มีลูกศรออกจากขั้นนี้
   *  - มี 1 เส้น   → ไปยังปลายทางที่ระบุ
   *  - มีหลายเส้น  → decision แตกกิ่ง (แต่ละกิ่งมี label)
   *
   * ตอน "เพิ่มขั้นตอน" ระบบจะสร้าง branch โยงเข้ากับ chain ให้อัตโนมัติ
   * (ขั้นก่อนหน้า → ขั้นใหม่ → ขั้นถัดไป) แล้วผู้ใช้แก้/ลบทีหลังได้
   */
  branches?: Branch[];
}

/**
 * A step field a meta column can display. These are the columns that sit
 * *beside* the process in the บฟ. form (ระยะเวลา / Data in / Application / Data out).
 */
export type MetaField = 'duration' | 'dataIn' | 'application' | 'dataOut';

/**
 * A vertical column in the swimlane.
 *  - `org`  — a หน่วยงาน column under the "กระบวนการ" band; steps live here
 *  - `meta` — a side column that just shows one field of each step
 *             (ระยะเวลา / Data in / Application / Data out); no steps go in it
 */
export interface Lane {
  id: string;
  /** หัวคอลัมน์ เช่น "กฟฟ." / "ระยะเวลา" */
  label: string;
  kind: 'org' | 'meta';
  /** for `meta` lanes — which step field to display in the column */
  field?: MetaField;
}

export interface Process {
  schemaVersion: 2;
  /** ชื่อกระบวนการ — แถวที่ 1 ของชีต Excel */
  title: string;
  /** แถบหัวรวมเหนือเลน org (ปกติ "กระบวนการ") */
  bandLabel: string;
  lanes: Lane[];
  steps: Step[];
}
