/**
 * Pre-export check — everything that is worth a second look before the .xlsx
 * leaves the app.
 *
 * Deliberately advisory: nothing here blocks the export. The บฟ. form is often
 * handed over half-filled on purpose, so an issue is a nudge with a shortcut to
 * the place that fixes it, never a gate.
 */
import type { Process, Step, StepFields } from '../domain/types';

export type IssueLevel = 'warn' | 'info';

/** What the dialog offers to do about an issue. */
export type IssueAction =
  | { kind: 'makeDecision'; stepId: string }
  | { kind: 'goto'; stepId: string }
  | { kind: 'table' };

export interface Issue {
  id: string;
  level: IssueLevel;
  text: string;
  action?: IssueAction;
}

/** Short column names — the dialog has no room for the full form wording. */
const FIELD_SHORT: Record<keyof StepFields, string> = {
  duration: 'กรอบระยะเวลาดำเนินการ',
  mainUnit: 'หน่วยงานรับผิดชอบหลัก',
  operatorRole: 'ตำแหน่งผู้ปฏิบัติงาน',
  dataIn: 'Data Input',
  dataOut: 'Data Output',
  regulations: 'ระเบียบที่เกี่ยวข้อง',
  application: 'Application in Process',
  note: 'รายละเอียด/ขั้นตอนย่อย',
};

/** The fields the บฟ. table has a column for (note is folded into the task cell). */
const FORM_FIELDS: (keyof StepFields)[] = [
  'duration',
  'mainUnit',
  'operatorRole',
  'dataIn',
  'dataOut',
  'regulations',
  'application',
];

/** Steps that get a row in the บฟ. table — the round shapes don't. */
const isFormStep = (s: Step) => s.type === 'process' || s.type === 'decision';

const name = (s: Step, i: number) => `ข้อ ${i + 1} “${(s.label || '(ยังไม่มีชื่อ)').trim()}”`;

export function checkProcess(proc: Process): Issue[] {
  const steps = proc.steps;
  const warns: Issue[] = [];
  const infos: Issue[] = [];

  if (steps.length === 0) {
    return [{ id: 'empty', level: 'warn', text: 'ยังไม่มีขั้นตอนเลย — ไฟล์ที่ได้จะเป็นฟอร์มเปล่า' }];
  }

  const byId = new Map(steps.map((s) => [s.id, s]));

  steps.forEach((s, i) => {
    const branches = s.branches ?? [];
    const linked = branches.filter((b) => b.toStepId && byId.has(b.toStepId));

    // a step that splits should be drawn as a diamond, in the picture and the form
    if (s.type !== 'decision' && linked.length >= 2) {
      warns.push({
        id: `dec-${s.id}`,
        level: 'warn',
        text: `${name(s, i)} แตก ${linked.length} เส้นทาง แต่ยังเป็นกล่องสี่เหลี่ยม — ปกติควรเป็นจุดตัดสินใจ`,
        action: { kind: 'makeDecision', stepId: s.id },
      });
    }

    // a dangling step leaves the reader of the form with nowhere to go
    if (s.type !== 'end' && linked.length === 0) {
      warns.push({
        id: `dead-${s.id}`,
        level: 'warn',
        text: `${name(s, i)} ไม่มีเส้นทางออก — ผังจะจบค้างไว้ตรงนี้`,
        action: { kind: 'goto', stepId: s.id },
      });
    }

    // a branch row was added but its target never chosen
    const dangling = branches.filter((b) => !b.toStepId || !byId.has(b.toStepId)).length;
    if (dangling > 0) {
      warns.push({
        id: `nulltgt-${s.id}`,
        level: 'warn',
        text: `${name(s, i)} มีเส้นทาง ${dangling} เส้นที่ยังไม่ได้เลือกปลายทาง — จะไม่ถูกวาดในผัง`,
        action: { kind: 'goto', stepId: s.id },
      });
    }

    // a decision without labels reads as an unexplained fork on the form
    if (s.type === 'decision' && linked.length >= 2) {
      const unlabelled = linked.filter((b) => !b.label.trim()).length;
      if (unlabelled > 0) {
        warns.push({
          id: `brlabel-${s.id}`,
          level: 'warn',
          text: `${name(s, i)} เป็นจุดตัดสินใจ แต่มี ${unlabelled} เส้นที่ยังไม่ได้ใส่เงื่อนไข (เช่น ใช่ / ไม่ใช่)`,
          action: { kind: 'goto', stepId: s.id },
        });
      }
    }
  });

  // ---- completeness of the form columns ----
  const formSteps = steps.filter(isFormStep);
  if (formSteps.length > 0) {
    // a column nobody has touched at all says the same thing seven times over —
    // roll those into one line and spell out only the half-finished ones
    const untouched: string[] = [];
    for (const f of FORM_FIELDS) {
      const missing = formSteps.filter((s) => !(s[f] ?? '').toString().trim()).length;
      if (missing === 0) continue;
      if (missing === formSteps.length) {
        untouched.push(FIELD_SHORT[f]);
        continue;
      }
      infos.push({
        id: `miss-${f}`,
        level: 'info',
        text: `ยังไม่ได้กรอก “${FIELD_SHORT[f]}” อีก ${missing} จาก ${formSteps.length} ข้อ`,
        action: { kind: 'table' },
      });
    }
    if (untouched.length > 0) {
      infos.unshift({
        id: 'miss-none',
        level: 'info',
        text: `ยังไม่ได้กรอกเลยสักข้อ ${untouched.length} คอลัมน์ — ${untouched.join(' · ')}`,
        action: { kind: 'table' },
      });
    }
  }

  if (!steps.some((s) => s.type === 'end')) {
    infos.push({ id: 'noend', level: 'info', text: 'ยังไม่มีขั้นตอน “สิ้นสุดกระบวนการ” ในผัง' });
  }

  return [...warns, ...infos];
}
