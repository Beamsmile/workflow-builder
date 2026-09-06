import { useStore } from '../store';
import type { MetaField } from '../domain/types';
import { ChevronDown, ChevronUp, Plus, X } from './icons';

const META_FIELDS: { value: MetaField; label: string }[] = [
  { value: 'duration', label: 'กรอบระยะเวลา' },
  { value: 'dataIn', label: 'Data Input' },
  { value: 'application', label: 'Application' },
  { value: 'dataOut', label: 'Data Output' },
];

/** Compact manager for the columns — org (หน่วยงาน) and meta (side columns). */
export default function LaneEditor() {
  const lanes = useStore((s) => s.lanes);
  const bandLabel = useStore((s) => s.bandLabel);
  const setBandLabel = useStore((s) => s.setBandLabel);
  const addLane = useStore((s) => s.addLane);
  const updateLane = useStore((s) => s.updateLane);
  const removeLane = useStore((s) => s.removeLane);
  const moveLane = useStore((s) => s.moveLane);

  return (
    <div className="lane-editor">
      <label className="field">
        <span className="field-label">แถบหัวรวมเหนือเลน org (band)</span>
        <input value={bandLabel} onChange={(e) => setBandLabel(e.target.value)} />
      </label>

      <div className="lane-editor-list">
        {lanes.map((lane, i) => (
          <div key={lane.id} className="lane-editor-row-group">
            <div className="lane-editor-row">
              <input
                value={lane.label}
                onChange={(e) => updateLane(lane.id, { label: e.target.value })}
              />
              <button className="icon-btn" title="ซ้าย" disabled={i === 0} onClick={() => moveLane(lane.id, -1)}>
                <ChevronUp width={12} height={12} style={{ transform: 'rotate(-90deg)' }} />
              </button>
              <button
                className="icon-btn"
                title="ขวา"
                disabled={i === lanes.length - 1}
                onClick={() => moveLane(lane.id, 1)}
              >
                <ChevronDown width={12} height={12} style={{ transform: 'rotate(-90deg)' }} />
              </button>
              <button
                className="icon-btn danger"
                title="ลบเลน"
                disabled={lanes.length <= 1}
                onClick={() => removeLane(lane.id)}
              >
                <X width={11} height={11} />
              </button>
            </div>
            <div className="lane-editor-kind">
              <select
                value={lane.kind}
                onChange={(e) =>
                  updateLane(lane.id, {
                    kind: e.target.value as 'org' | 'meta',
                    field: e.target.value === 'meta' ? (lane.field ?? 'duration') : undefined,
                  })
                }
              >
                <option value="org">กระบวนการ (หน่วยงาน)</option>
                <option value="meta">คอลัมน์ข้าง (meta)</option>
              </select>
              {lane.kind === 'meta' && (
                <select
                  value={lane.field ?? 'duration'}
                  onChange={(e) => updateLane(lane.id, { field: e.target.value as MetaField })}
                >
                  {META_FIELDS.map((f) => (
                    <option key={f.value} value={f.value}>
                      แสดง: {f.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        ))}
      </div>

      <button className="link-btn" onClick={addLane}>
        <Plus width={12} height={12} /> เพิ่มเลนกระบวนการ
      </button>
    </div>
  );
}
