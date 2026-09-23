import { useState } from 'react';
import { useStore } from '../store';
import StepCard from './StepCard';
import LaneEditor from './LaneEditor';
import { Plus } from './icons';

export default function StepList({ onOpenTable }: { onOpenTable: () => void }) {
  const steps = useStore((s) => s.steps);
  const laneCount = useStore((s) => s.lanes.length);
  const selectedStepId = useStore((s) => s.selectedStepId);
  const expandedStepId = useStore((s) => s.expandedStepId);
  const addStep = useStore((s) => s.addStep);
  const [showLanes, setShowLanes] = useState(false);

  return (
    <section className="step-list">
      <div className="step-list-head">
        <span className="eyebrow">ขั้นตอน · {steps.length}</span>
        <div className="step-list-head-actions">
          <button
            className={`chip-btn${showLanes ? ' is-on' : ''}`}
            onClick={() => setShowLanes((v) => !v)}
          >
            เลน ({laneCount})
          </button>
          <button
            className="chip-btn"
            onClick={onOpenTable}
            title="กรอกข้อมูล บฟ. แบบตาราง — ไล่ทีละคอลัมน์ให้ครบทุกขั้นตอน"
          >
            ตาราง บฟ.
          </button>
          <button className="chip-btn accent" onClick={() => addStep()}>
            <Plus width={13} height={13} /> เพิ่มขั้นตอน
          </button>
        </div>
      </div>

      {showLanes && <LaneEditor />}

      <div className="step-list-scroll">
        {steps.length === 0 && (
          <div className="empty-state">
            <p className="hint">ยังไม่มีขั้นตอน — กด “เพิ่มขั้นตอน” เพื่อเริ่ม</p>
          </div>
        )}
        {steps.map((step, i) => (
          <StepCard
            key={step.id}
            step={step}
            index={i}
            total={steps.length}
            selected={step.id === selectedStepId}
            expanded={step.id === expandedStepId}
          />
        ))}
        {steps.length > 0 && (
          <button className="add-step-row" onClick={() => addStep()}>
            <Plus width={13} height={13} /> เพิ่มขั้นตอน
          </button>
        )}
      </div>
    </section>
  );
}
