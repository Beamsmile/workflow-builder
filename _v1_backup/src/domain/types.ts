/**
 * Domain model for the workflow builder.
 *
 * A "diagram" is one process (e.g. "งานซ่อมแซมและบำรุงรักษา").
 * It has vertical lanes (columns) and a set of steps/nodes placed in those lanes,
 * connected by edges. The same data is used to render the on-screen flow AND to
 * build the บฟ. Excel table.
 */

/** The kind of a lane (column) in the swimlane. */
export type LaneKind =
  | 'meta' // side columns: ระยะเวลา / Data in / Application / Data out
  | 'org'; // an organisation column under "กระบวนการ" (สนญ. / กฟข. / กฟฟ. / อื่นๆ)

export interface Lane {
  id: string;
  /** Header text shown at the top of the column. */
  label: string;
  kind: LaneKind;
  /** Column width in flow pixels. */
  width: number;
  /**
   * Optional band title drawn above a run of columns that share it
   * (used for the "กระบวนการ" band over the org columns).
   */
  groupLabel?: string;
}

/** Every shape type the user can place on the canvas. */
export type FlowNodeType =
  | 'start'
  | 'end'
  | 'process'
  | 'decision'
  | 'application'
  | 'connector'; // off-page / on-page connector (small circle with a letter)

/**
 * Structured fields for one step. These map 1:1 to the บฟ. table columns.
 * Not every node type uses every field (a Start node has almost none).
 */
export interface StepFields {
  /** งาน/ขั้นตอนการดำเนินการ – the main description shown inside the box. */
  label: string;
  /** Red tag under the box: responsible position/unit, e.g. "ผคฟ. กปบ.". */
  orgLabel?: string;
  /** กรอบระยะเวลาดำเนินการ */
  duration?: string;
  /** หน่วยงานรับผิดชอบหลัก */
  mainUnit?: string;
  /** ตำแหน่งผู้ปฏิบัติงาน */
  operatorRole?: string;
  /** Data Input */
  dataIn?: string;
  /** Data Output */
  dataOut?: string;
  /** ระเบียบที่เกี่ยวข้อง */
  regulations?: string;
  /** Application in Process (systems used), e.g. "SAP, GIS". */
  application?: string;
  /** Free note (not exported). */
  note?: string;
}

/** Data stored on every React Flow node. */
export interface FlowNodeData extends StepFields {
  kind: FlowNodeType;
  /** id of the lane this node currently sits in. */
  laneId: string;
  [key: string]: unknown;
}

export interface DiagramNode {
  id: string;
  type: FlowNodeType;
  position: { x: number; y: number };
  data: FlowNodeData;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  /** Edge caption, e.g. "Y" / "N" for decision branches. */
  label?: string;
}

export interface Diagram {
  /** schema version so old saved files can be migrated later. */
  schemaVersion: 1;
  /** Process title – goes in row 1 of the Excel sheet. */
  title: string;
  lanes: Lane[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}
