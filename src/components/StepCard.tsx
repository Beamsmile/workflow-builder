import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, isDefaultLabel } from '../store';
import type { Step, StepFields, StepType } from '../domain/types';
import { TYPE_LABEL } from '../domain/theme';
import { ChevronDown, ChevronUp, Plus, X, ArrowRight, Grip } from './icons';
import { showToast } from '../lib/toast';
import { undo } from '../lib/history';

const STEP_TYPES: StepType[] = ['start', 'process', 'decision', 'connector', 'end'];

/** ช่อง บฟ. ครบชุด — ทั้ง Process และ Decision มีแถวในตาราง บฟ. จึงกรอกได้ครบเหมือนกัน */
const FORM_FIELDS: (keyof StepFields)[] = [
  'duration',
  'mainUnit',
  'operatorRole',
  'dataIn',
  'dataOut',
  'regulations',
  'application',
  'note',
];

/**
 * Which บฟ. fields each step type shows, in order.
 * - Decision เดิมไม่มี Data in/out กับ Application ทั้งที่มุมมองตารางมี และ Excel ก็ใช้ (วาดทรงกระบอก)
 * - Start/End/จุดเชื่อม ไม่มีแถวในตาราง บฟ. ช่อง "ขั้นตอนย่อย" ที่เคยให้กรอกจึงไม่ไปไหน — เอาออก
 */
const FIELDS_FOR: Record<StepType, (keyof StepFields)[]> = {
  start: [],
  end: [],
  process: FORM_FIELDS,
  decision: FORM_FIELDS,
  connector: [],
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
/** short one-line values — these get a dropdown of what you already used */
const SHORT_FIELDS: (keyof StepFields)[] = ['duration', 'mainUnit', 'operatorRole', 'application'];

type CardTab = 'form' | 'routes' | 'detail';

/** A textarea that grows with its text — long Data in / ระเบียบ values were
 *  being clipped at two rows with no sign there was more. */
function GrowTextarea(props: React.ComponentProps<'textarea'>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, 260)}px`;
  }, [props.value]);
  return <textarea ref={ref} {...props} />;
}

export default function StepCard({
  step,
  index,
  total,
  selected,
  expanded,
  onDragHandle,
}: {
  step: Step;
  index: number;
  total: number;
  selected: boolean;
  expanded: boolean;
  /** เริ่มลากการ์ดนี้ (จับที่ปุ่มจุด ๆ ด้านซ้าย) — StepList เป็นคนจัดการวาง */
  onDragHandle?: (e: React.DragEvent, el: HTMLElement | null) => void;
}) {
  const steps = useStore((s) => s.steps);
  const lanes = useStore((s) => s.lanes).filter((l) => l.kind === 'org');
  const toggleExpand = useStore((s) => s.toggleExpand);
  const updateStep = useStore((s) => s.updateStep);
  const deleteStep = useStore((s) => s.deleteStep);
  const moveStep = useStore((s) => s.moveStep);
  const addStep = useStore((s) => s.addStep);
  const addStepsFromLines = useStore((s) => s.addStepsFromLines);
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

  const [tab, setTab] = useState<CardTab>('form');

  // Everything already typed into this field anywhere in the flow, offered as a
  // dropdown. Saves retyping "ผู้รับจ้าง" on every step — and keeps the wording
  // identical, which matters once it reaches the official form.
  const suggestions = useMemo(() => {
    const map = {} as Record<string, string[]>;
    for (const f of SHORT_FIELDS) {
      const seen = new Set<string>();
      for (const st of steps) {
        const v = (st[f] ?? '').toString().trim();
        if (v) seen.add(v);
      }
      map[f] = [...seen].sort();
    }
    return map;
  }, [steps]);

  const subCount = (step.note ?? '').split(/\r?\n/).filter((l) => l.trim()).length;

  // Small badges on the collapsed card, so the whole flow can be scanned at a
  // glance: who owns the step, how complete it is, and where it branches.
  const formFields = FIELDS_FOR[step.type].filter((f) => f !== 'note');
  const filled = formFields.filter((f) => (step[f] ?? '').toString().trim()).length;
  const linked = branches.filter((b) => b.toStepId).length;
  // แท็บที่ขั้นชนิดนี้มีจริง — Start/End/จุดเชื่อมไม่มีช่อง บฟ. ให้ไปแท็บที่มีแทน (End อาจไม่มีแท็บเลย)
  const hasDetail = FIELDS_FOR[step.type].includes('note');
  const tabsHere = [
    formFields.length > 0 && 'form',
    showRouting && 'routes',
    hasDetail && 'detail',
  ].filter(Boolean) as CardTab[];
  const activeTab: CardTab | undefined = tabsHere.includes(tab) ? tab : tabsHere[0];
  const chips: { key: string; text: string; warn?: boolean; title: string }[] = [];
  if (step.mainUnit?.trim()) {
    chips.push({ key: 'unit', text: step.mainUnit.trim(), title: 'หน่วยงานรับผิดชอบหลัก' });
  }
  if (formFields.length > 0) {
    chips.push({
      key: 'fill',
      text: `${filled}/${formFields.length}`,
      warn: filled === 0,
      title: `กรอกช่อง บฟ. แล้ว ${filled} จาก ${formFields.length} ช่อง`,
    });
  }
  if (linked >= 2) {
    chips.push({ key: 'br', text: `แตก ${linked} ทาง`, title: 'ขั้นตอนนี้มีหลายเส้นทางออก' });
  }
  if (step.type !== 'end' && linked === 0) {
    chips.push({ key: 'no', text: 'ไม่มีเส้นทางออก', warn: true, title: 'ยังไม่ได้ต่อไปขั้นตอนไหน' });
  }

  const labelRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!expanded) return;
    // An open card is tall, and it may have been opened from the diagram — bring
    // it to the top of the panel so the whole form is reachable either way.
    // Wait a frame: the card has only just grown, and the one that closed has
    // only just shrunk, so scrolling now would aim at a stale position.
    const raf = requestAnimationFrame(() =>
      cardRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
    );
    // A step that still has its default name was just created: put the cursor in
    // the name box with the text selected, so typing replaces it straight away.
    // Drafting a flow is then: type → Enter → type → Enter.
    if (isDefaultLabel(step.label)) {
      labelRef.current?.focus();
      labelRef.current?.select();
    }
    return () => cancelAnimationFrame(raf);
    // only when this card opens, not on every keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, step.id]);

  return (
    <div
      ref={cardRef}
      className={`step-card${selected ? ' is-selected' : ''}${expanded ? ' is-expanded' : ''}`}
    >
      <div
        className="step-card-head"
        onClick={() => toggleExpand(step.id)}
        title={expanded ? 'คลิกเพื่อย่อ' : 'คลิกเพื่อกาง'}
      >
        {onDragHandle && (
          <span
            className="drag-grip"
            draggable
            title="ลากเพื่อย้ายลำดับ"
            onClick={(e) => e.stopPropagation()}
            onDragStart={(e) => onDragHandle(e, cardRef.current)}
          >
            <Grip width={12} height={12} />
          </span>
        )}
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
        <div className="step-card-label">
          {step.label || <span className="muted">(ยังไม่มีชื่อ)</span>}
          {chips.length > 0 && (
            <span className="step-chips">
              {chips.map((c) => (
                <span key={c.key} className={`step-chip${c.warn ? ' is-warn' : ''}`} title={c.title}>
                  {c.text}
                </span>
              ))}
            </span>
          )}
        </div>
      )}

      {expanded && (
        <div className="step-card-body" onClick={(e) => e.stopPropagation()}>
          <label className="field">
            <span className="field-label">งาน / ขั้นตอนการดำเนินการ</span>
            <textarea
              ref={labelRef}
              rows={2}
              value={step.label}
              placeholder="เช่น ตรวจสอบเอกสารและบันทึกผล"
              onChange={(e) =>
                updateStep(step.id, { label: e.target.value.replace(/[\r\n]+/g, ' ') })
              }
              onPaste={(e) => {
                const text = e.clipboardData.getData('text');
                const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
                if (lines.length < 2) return; // ordinary paste
                e.preventDefault();
                addStepsFromLines(step.id, lines);
              }}
              onKeyDown={(e) => {
                // Enter moves on to the next step instead of inserting a line
                // break — a label is one line, and this makes drafting fast.
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  addStep();
                }
              }}
            />
          </label>

          {/* One tall form was 984px in an 807px panel, so its last fields and
              the whole routing section sat below the fold. Split into tabs, any
              one of them fits on screen. */}
          {tabsHere.length > 0 && (
          <div className="card-tabs" role="tablist">
            {formFields.length > 0 && (
              <button
                role="tab"
                className={`card-tab${activeTab === 'form' ? ' is-on' : ''}`}
                onClick={() => setTab('form')}
              >
                ข้อมูล บฟ. <span className="card-tab-n">{filled}/{formFields.length}</span>
              </button>
            )}
            {showRouting && (
              <button
                role="tab"
                className={`card-tab${activeTab === 'routes' ? ' is-on' : ''}`}
                onClick={() => setTab('routes')}
              >
                เส้นทางออก{' '}
                <span className={`card-tab-n${linked === 0 ? ' is-warn' : ''}`}>{linked}</span>
              </button>
            )}
            {hasDetail && (
              <button
                role="tab"
                className={`card-tab${activeTab === 'detail' ? ' is-on' : ''}`}
                onClick={() => setTab('detail')}
              >
                ขั้นตอนย่อย
                {subCount > 0 && <span className="card-tab-n">{subCount}</span>}
              </button>
            )}
          </div>
          )}

          {activeTab === 'form' && formFields.length > 0 && (
            <div className="field-grid">
              {formFields.map((f) => (
                <label key={f} className={`field${BIG_FIELDS.includes(f) ? ' field-wide' : ''}`}>
                  <span className="field-label">{FIELD_LABEL[f]}</span>
                  {SHORT_FIELDS.includes(f) ? (
                    <>
                      <input
                        list={`sug-${step.id}-${f}`}
                        value={(step[f] as string) ?? ''}
                        onChange={(e) => updateStep(step.id, { [f]: e.target.value })}
                      />
                      <datalist id={`sug-${step.id}-${f}`}>
                        {(suggestions[f] ?? []).map((v) => (
                          <option key={v} value={v} />
                        ))}
                      </datalist>
                    </>
                  ) : (
                    <GrowTextarea
                      rows={2}
                      value={(step[f] as string) ?? ''}
                      onChange={(e) => updateStep(step.id, { [f]: e.target.value })}
                    />
                  )}
                </label>
              ))}
            </div>
          )}

          {activeTab === 'detail' && (
            <div className="field-grid">
              <label className="field field-wide">
                <span className="field-label">{FIELD_LABEL.note}</span>
                <GrowTextarea
                  rows={4}
                  value={step.note ?? ''}
                  placeholder={'พิมพ์บรรทัดละข้อ เช่น\nตรวจสอบข้อมูลจากระบบ\nแจ้งผลให้ผู้เกี่ยวข้อง'}
                  onChange={(e) => updateStep(step.id, { note: e.target.value })}
                />
              </label>
            </div>
          )}

          {activeTab === 'routes' && showRouting && (
            <div className="routing">
              <div className="routing-head">
                {isDecision ? 'เส้นทางแยก (Decision)' : 'เส้นทางออก'}
                <span className="hint tiny">
                  {branches.length === 0
                    ? ' — ยังไม่มีเส้นทางออก (แก้/เพิ่มได้ด้านล่าง)'
                    : isDecision
                      ? ' — ใส่ label ให้แต่ละกิ่ง'
                      : ''}
                </span>
              </div>

              {/* a step that splits is a decision point — offer to fix the type
                  so the web diagram and the Excel export both draw a diamond */}
              {!isDecision && branches.length >= 2 && (
                <div className="routing-notice">
                  <span>
                    ขั้นตอนนี้แตก {branches.length} เส้นทาง — ปกติควรเป็นจุดตัดสินใจ
                  </span>
                  <button
                    className="link-btn"
                    onClick={() => updateStep(step.id, { type: 'decision' })}
                  >
                    เปลี่ยนเป็น Decision
                  </button>
                </div>
              )}

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

          <button
            className="danger-btn"
            onClick={() => {
              deleteStep(step.id);
              // ลบทันที ไม่ต้องกดยืนยัน — กดผิดก็กด "ย้อนกลับ" หรือ ⌘Z ได้
              showToast(`ลบขั้นตอน “${truncate(step.label)}” แล้ว`, { label: 'ย้อนกลับ', run: undo });
            }}
          >
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
