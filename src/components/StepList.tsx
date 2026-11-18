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
  const moveStepTo = useStore((s) => s.moveStepTo);
  const [showLanes, setShowLanes] = useState(false);

  // ลากวางสลับลำดับ — ผังยาว 30 ขั้นกดปุ่ม ↑↓ ทีละช่องไม่ไหว
  // dragId = การ์ดที่กำลังลาก, dropAt = จะแทรกก่อนการ์ดลำดับนี้ (steps.length = ท้ายสุด)
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const endDrag = () => {
    setDragId(null);
    setDropAt(null);
  };
  const onDragOverCard = (e: React.DragEvent<HTMLDivElement>, i: number) => {
    if (!dragId) return;
    e.preventDefault(); // อนุญาตให้วาง
    e.dataTransfer.dropEffect = 'move';
    const r = e.currentTarget.getBoundingClientRect();
    const at = e.clientY < r.top + r.height / 2 ? i : i + 1; // ครึ่งบน = ก่อนใบนี้, ครึ่งล่าง = หลัง
    if (at !== dropAt) setDropAt(at);
  };
  const onDrop = (e: React.DragEvent) => {
    // ไม่ได้ลากการ์ด (เช่น ลากข้อความไปวางในช่องพิมพ์) — ปล่อยให้เบราว์เซอร์ทำตามปกติ
    if (!dragId) return;
    e.preventDefault();
    if (dragId && dropAt !== null) moveStepTo(dragId, dropAt);
    endDrag();
  };
  // เส้นบอกตำแหน่งวาง ไม่แสดงตรงที่วางแล้วไม่ขยับ (ก่อนหรือหลังตัวเอง)
  const dragIdx = dragId ? steps.findIndex((s) => s.id === dragId) : -1;
  const showLine = (at: number) => dropAt === at && at !== dragIdx && at !== dragIdx + 1;

  return (
    // dragend ลอยขึ้นมาจากปุ่มลาก — ปล่อยนอกรายการก็ล้างสถานะลากได้
    <section className="step-list" onDragEnd={endDrag}>
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

      {/* วางรับที่กล่องรายการทั้งกล่อง (ไม่ใช่ที่การ์ด) — ปล่อยตรงช่องว่างระหว่างการ์ดก็ยังวางได้
          และ drop เกิดครั้งเดียว ไม่ซ้ำจากการ์ดกับกล่อง */}
      <div
        className="step-list-scroll"
        onDragOver={(e) => {
          if (dragId) e.preventDefault();
        }}
        onDrop={onDrop}
      >
        {steps.length === 0 && (
          <div className="empty-state">
            <p className="hint">ยังไม่มีขั้นตอน — กด “เพิ่มขั้นตอน” เพื่อเริ่ม</p>
          </div>
        )}
        {steps.map((step, i) => (
          <div
            key={step.id}
            className={`step-drop${showLine(i) ? ' drop-before' : ''}${
              i === steps.length - 1 && showLine(steps.length) ? ' drop-after' : ''
            }${dragId === step.id ? ' is-dragging' : ''}`}
            onDragOver={(e) => onDragOverCard(e, i)}
          >
            <StepCard
              step={step}
              index={i}
              total={steps.length}
              selected={step.id === selectedStepId}
              expanded={step.id === expandedStepId}
              onDragHandle={(e, el) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', step.id); // Firefox ต้องมีข้อมูลถึงจะลากได้
                if (el) e.dataTransfer.setDragImage(el, 24, 18); // ภาพตอนลาก = ทั้งการ์ด
                setDragId(step.id);
              }}
            />
          </div>
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
