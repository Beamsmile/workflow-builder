import { useState } from 'react';
import { useStore } from '../store';
import type { FlowNodeType, StepFields } from '../domain/types';

const TYPE_LABEL: Record<FlowNodeType, string> = {
  start: 'Start',
  end: 'End',
  process: 'Process – กล่องขั้นตอน',
  decision: 'Decision – จุดตัดสินใจ',
  application: 'Application – ระบบงาน',
  connector: 'Connector – จุดเชื่อม/ข้ามหน้า',
};

/** Which structured fields to show for each node type. */
const FIELDS_FOR: Record<FlowNodeType, (keyof StepFields)[]> = {
  start: [],
  end: [],
  process: [
    'orgLabel',
    'duration',
    'mainUnit',
    'operatorRole',
    'dataIn',
    'dataOut',
    'regulations',
    'application',
  ],
  decision: ['orgLabel', 'duration', 'mainUnit', 'operatorRole', 'regulations'],
  application: ['application', 'note'],
  connector: ['note'],
};

const FIELD_LABEL: Record<keyof StepFields, string> = {
  label: 'งาน/ขั้นตอนการดำเนินการ',
  orgLabel: 'ป้ายหน่วยงาน (สีแดงใต้กล่อง)',
  duration: 'กรอบระยะเวลาดำเนินการ',
  mainUnit: 'หน่วยงานรับผิดชอบหลัก',
  operatorRole: 'ตำแหน่งผู้ปฏิบัติงาน',
  dataIn: 'Data Input',
  dataOut: 'Data Output',
  regulations: 'ระเบียบที่เกี่ยวข้อง',
  application: 'Application in Process (ระบบงานที่ใช้)',
  note: 'หมายเหตุ (ไม่ export)',
};

function LaneManager() {
  const lanes = useStore((s) => s.lanes);
  const updateLane = useStore((s) => s.updateLane);
  const addLane = useStore((s) => s.addLane);
  const removeLane = useStore((s) => s.removeLane);
  const moveLane = useStore((s) => s.moveLane);
  const [open, setOpen] = useState(false);

  return (
    <section className="panel-section">
      <button className="section-toggle" onClick={() => setOpen((v) => !v)}>
        <span aria-hidden>{open ? '▾' : '▸'}</span> Lanes / คอลัมน์ ({lanes.length})
      </button>
      {open && (
        <div className="lane-manager">
          {lanes.map((lane, i) => (
            <div key={lane.id} className="lane-row">
              <input
                className="lane-label-input"
                value={lane.label}
                onChange={(e) => updateLane(lane.id, { label: e.target.value })}
              />
              <select
                value={lane.kind}
                onChange={(e) =>
                  updateLane(lane.id, { kind: e.target.value as 'meta' | 'org' })
                }
              >
                <option value="meta">meta</option>
                <option value="org">org</option>
              </select>
              <input
                className="lane-width-input"
                type="number"
                min={80}
                max={600}
                step={10}
                value={lane.width}
                onChange={(e) =>
                  updateLane(lane.id, { width: Number(e.target.value) || 120 })
                }
              />
              <input
                className="lane-group-input"
                placeholder="band…"
                value={lane.groupLabel ?? ''}
                onChange={(e) =>
                  updateLane(lane.id, { groupLabel: e.target.value || undefined })
                }
              />
              <div className="lane-row-actions">
                <button title="เลื่อนซ้าย" onClick={() => moveLane(lane.id, -1)} disabled={i === 0}>
                  ◀
                </button>
                <button
                  title="เลื่อนขวา"
                  onClick={() => moveLane(lane.id, 1)}
                  disabled={i === lanes.length - 1}
                >
                  ▶
                </button>
                <button title="เพิ่มเลนถัดไป" onClick={() => addLane(lane.id)}>
                  +
                </button>
                <button
                  title="ลบเลน"
                  onClick={() => removeLane(lane.id)}
                  disabled={lanes.length <= 1}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          <button className="add-lane-btn" onClick={() => addLane()}>
            + เพิ่มเลน
          </button>
        </div>
      )}
    </section>
  );
}

export default function DetailsPanel() {
  const title = useStore((s) => s.title);
  const setTitle = useStore((s) => s.setTitle);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const node = useStore((s) => s.nodes.find((n) => n.id === s.selectedNodeId) ?? null);
  const updateNodeFields = useStore((s) => s.updateNodeFields);
  const deleteNode = useStore((s) => s.deleteNode);

  const kind = (node?.type ?? 'process') as FlowNodeType;

  return (
    <aside className="details-panel">
      <section className="panel-section">
        <h2 className="panel-heading">กระบวนการ</h2>
        <input
          className="title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="ชื่อกระบวนการ"
        />
      </section>

      <LaneManager />

      <section className="panel-section">
        <h2 className="panel-heading">รายละเอียดกล่อง</h2>
        {!node && (
          <div className="empty-state">
            <span className="empty-glyph" aria-hidden>
              ◇
            </span>
            <p className="hint">
              เลือกกล่องบน canvas เพื่อแก้ไข — หรือกดปุ่มใน rail ซ้ายเพื่อเพิ่มกล่องใหม่
            </p>
          </div>
        )}
        {node && (
          <>
            <div className="node-kind-badge">{TYPE_LABEL[kind]}</div>

            <label className="field-label">{FIELD_LABEL.label}</label>
            <textarea
              rows={kind === 'process' || kind === 'decision' ? 4 : 2}
              value={node.data.label ?? ''}
              onChange={(e) => updateNodeFields(node.id, { label: e.target.value })}
            />

            {FIELDS_FOR[kind].map((f) => (
              <div key={f}>
                <label className="field-label">{FIELD_LABEL[f]}</label>
                <textarea
                  rows={f === 'regulations' || f === 'dataIn' || f === 'dataOut' ? 3 : 2}
                  value={(node.data[f] as string) ?? ''}
                  onChange={(e) => updateNodeFields(node.id, { [f]: e.target.value })}
                />
              </div>
            ))}

            <button className="danger-btn" onClick={() => deleteNode(node.id)}>
              ลบกล่องนี้
            </button>
          </>
        )}
      </section>

      {selectedNodeId && (
        <section className="panel-section">
          <p className="hint tiny">
            ลากเส้นจากจุดวงกลมที่ขอบกล่องเพื่อเชื่อมขั้นตอน · คลิกเส้นแล้วกด Backspace เพื่อลบ
          </p>
        </section>
      )}
    </aside>
  );
}
