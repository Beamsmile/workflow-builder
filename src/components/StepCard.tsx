import { useStore } from '../store';
import type { Step, StepFields, StepType } from '../domain/types';
import { TYPE_LABEL } from '../domain/theme';
import { ChevronDown, ChevronUp, Plus, X, ArrowRight } from './icons';

const STEP_TYPES: StepType[] = ['start', 'process', 'decision', 'connector', 'end'];

/** Which บฟ. fields each step type shows, in order. */
const FIELDS_FOR: Record<StepType, (keyof StepFields)[]> = {
  start: ['note'],
  end: ['note'],
  process: [
    'duration',
    'mainUnit',
    'operatorRole',
    'dataIn',
    'dataOut',
    'regulations',
    'application',
    'note',
  ],
  decision: ['duration', 'mainUnit', 'operatorRole', 'regulations', 'note'],
  connector: ['note'],
};

const FIELD_LABEL: Record<keyof StepFields, string> = {
  duration: 'กรอบระยะเวลาดำเนินการ',
  mainUnit: 'หน่วยงานรับผิดชอบหลัก (แสดงในกล่องผังด้วย)',
  operatorRole: 'ตำแหน่งผู้ปฏิบัติงาน',
  dataIn: 'Data Input',
  dataOut: 'Data Output',
  regulations: 'ระเบียบที่เกี่ยวข้อง',
  application: 'Application in Process (ระบบงานที่ใช้)',
  note: 'รายละเอียด/ขั้นตอนย่อย (บรรทัดละข้อ — ไป export เป็น bullet)',
};

const BIG_FIELDS: (keyof StepFields)[] = ['dataIn', 'dataOut', 'regulations'];

export default function StepCard({
  step,
  index,
  total,
  selected,
  expanded,
}: {
  step: Step;
  index: number;
  total: number;
  selected: boolean;
  expanded: boolean;
}) {
  const steps = useStore((s) => s.steps);
  const lanes = useStore((s) => s.lanes).filter((l) => l.kind === 'org');
  const toggleExpand = useStore((s) => s.toggleExpand);
  const updateStep = useStore((s) => s.updateStep);
  const deleteStep = useStore((s) => s.deleteStep);
  const moveStep = useStore((s) => s.moveStep);
  const addBranch = useStore((s) => s.addBranch);
  const connectToNext = useStore((s) => s.connectToNext);
  const updateBranch = useStore((s) => s.updateBranch);
  const removeBranch = useStore((s) => s.removeBranch);

  const hasLane = step.type !== 'start' && step.type !== 'end';
  const showRouting = step.type !== 'end';
  const isDecision = step.type === 'decision';
  const branches = step.branches ?? [];
  const nextStep = steps[index + 1];
  const nextAlreadyLinked = branches.some((b) => b.toStepId === nextStep?.id);

  return (
    <div
      className={`step-card${selected ? ' is-selected' : ''}${expanded ? ' is-expanded' : ''}`}
    >
      <div
        className="step-card-head"
        onClick={() => toggleExpand(step.id)}
        title={expanded ? 'คลิกเพื่อย่อ' : 'คลิกเพื่อกาง'}
      >
        <span className="step-no">{index + 1}</span>

        {expanded ? (
          <select
            className="step-type-select"
            value={step.type}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => updateStep(step.id, { type: e.target.value as StepType })}
          >
            {STEP_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        ) : (
          <span className={`step-type-pill type-${step.type}`}>{TYPE_LABEL[step.type]}</span>
        )}

        {hasLane && (
          <select
            className="lane-pill"
            value={step.laneId}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => updateStep(step.id, { laneId: e.target.value })}
          >
            {lanes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        )}

        <span className="spacer" />

        <button
          className="icon-btn"
          title="เลื่อนขึ้น"
          disabled={index === 0}
          onClick={(e) => {
            e.stopPropagation();
            moveStep(step.id, -1);
          }}
        >
          <ChevronUp width={13} height={13} />
        </button>
        <button
          className="icon-btn"
          title="เลื่อนลง"
          disabled={index === total - 1}
          onClick={(e) => {
            e.stopPropagation();
            moveStep(step.id, 1);
          }}
        >
          <ChevronDown width={13} height={13} />
        </button>

        <span className={`expand-caret${expanded ? ' is-open' : ''}`} aria-hidden>
          <ChevronDown width={14} height={14} />
        </span>
      </div>

      {!expanded && (
        <div className="step-card-label">{step.label || <span className="muted">(ยังไม่มีชื่อ)</span>}</div>
      )}

      {expanded && (
        <div className="step-card-body" onClick={(e) => e.stopPropagation()}>
          <label className="field">
            <span className="field-label">งาน / ขั้นตอนการดำเนินการ</span>
            <textarea
              rows={2}
              value={step.label}
              onChange={(e) => updateStep(step.id, { label: e.target.value })}
            />
          </label>

          <div className="field-grid">
            {FIELDS_FOR[step.type].map((f) => (
              <label key={f} className={`field${BIG_FIELDS.includes(f) || f === 'note' ? ' field-wide' : ''}`}>
                <span className="field-label">{FIELD_LABEL[f]}</span>
                <textarea
                  rows={BIG_FIELDS.includes(f) ? 2 : 1}
                  value={(step[f] as string) ?? ''}
                  onChange={(e) => updateStep(step.id, { [f]: e.target.value })}
                />
              </label>
            ))}
          </div>

          {showRouting && (
            <div className="routing">
              <div className="routing-head">
                {isDecision ? 'เส้นทางแยก (Decision)' : 'เส้นทางออก'}
                <span className="hint tiny">
                  {branches.length === 0
                    ? ' — ไม่มี = ไม่มีลูกศรออกจากขั้นนี้'
                    : isDecision
                      ? ' — ใส่ label ให้แต่ละกิ่ง'
                      : ''}
                </span>
              </div>

              {branches.map((br) => (
                <div key={br.id} className="branch-row">
                  <input
                    className="branch-label"
                    placeholder={isDecision ? 'เช่น ใช่ / ไม่ใช่' : 'label (ไม่บังคับ)'}
                    value={br.label}
                    onChange={(e) => updateBranch(step.id, br.id, { label: e.target.value })}
                  />
                  <ArrowRight width={15} height={15} className="branch-arrow" />
                  <select
                    className="branch-target"
                    value={br.toStepId ?? ''}
                    onChange={(e) =>
                      updateBranch(step.id, br.id, { toStepId: e.target.value || null })
                    }
                  >
                    <option value="">— เลือกปลายทาง —</option>
                    {steps.map((s, i) =>
                      s.id === step.id ? null : (
                        <option key={s.id} value={s.id}>
                          {i + 1}. {truncate(s.label)}
                        </option>
                      ),
                    )}
                  </select>
                  <button
                    className="icon-btn danger"
                    title="ลบเส้นทาง"
                    onClick={() => removeBranch(step.id, br.id)}
                  >
                    <X width={12} height={12} />
                  </button>
                </div>
              ))}

              <div className="routing-actions">
                <button className="link-btn" onClick={() => addBranch(step.id)}>
                  <Plus width={12} height={12} /> เพิ่มเส้นทาง
                </button>
                {nextStep && !nextAlreadyLinked && (
                  <button className="link-btn" onClick={() => connectToNext(step.id)}>
                    <ArrowRight width={12} height={12} /> ไปขั้นถัดไป ({index + 2})
                  </button>
                )}
              </div>
            </div>
          )}

          <button className="danger-btn" onClick={() => deleteStep(step.id)}>
            ลบขั้นตอนนี้
          </button>
        </div>
      )}
    </div>
  );
}

function truncate(s: string, n = 28): string {
  if (!s) return '(ยังไม่มีชื่อ)';
  return s.length > n ? s.slice(0, n) + '…' : s;
}
