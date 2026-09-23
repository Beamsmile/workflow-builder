import { useMemo, useRef } from 'react';
import { useStore } from '../store';
import type { StepFields, StepType } from '../domain/types';
import { TYPE_LABEL } from '../domain/theme';
import { X } from './icons';

/**
 * Spreadsheet view of the บฟ. fields — one row per step, one column per field.
 *
 * The card view is for *shaping* the flow (one step at a time, in depth). This
 * is for *finishing* it: once the steps exist, the job is filling the same
 * column down the whole flow, and doing that card by card meant opening and
 * closing eleven cards. Here it's Tab / ↓ / ⌘D.
 */

const COLS: { key: keyof StepFields; head: string; w: number; suggest?: boolean }[] = [
  { key: 'duration', head: 'กรอบระยะเวลา', w: 120, suggest: true },
  { key: 'mainUnit', head: 'หน่วยงานหลัก', w: 150, suggest: true },
  { key: 'operatorRole', head: 'ตำแหน่งผู้ปฏิบัติงาน', w: 150, suggest: true },
  { key: 'dataIn', head: 'Data Input', w: 170 },
  { key: 'dataOut', head: 'Data Output', w: 170 },
  { key: 'regulations', head: 'ระเบียบที่เกี่ยวข้อง', w: 170 },
  { key: 'application', head: 'Application', w: 140, suggest: true },
];

/** Only these step types get a row in the บฟ. table, so only they get fields. */
const HAS_FIELDS: StepType[] = ['process', 'decision'];

export default function StepTable({ onClose }: { onClose: () => void }) {
  const steps = useStore((s) => s.steps);
  const updateStep = useStore((s) => s.updateStep);
  const selectStep = useStore((s) => s.selectStep);
  const selectedStepId = useStore((s) => s.selectedStepId);
  const gridRef = useRef<HTMLDivElement>(null);

  // every value already used in a column, offered as a dropdown (same idea as
  // the card view) — keeps the wording identical across the whole form
  const suggestions = useMemo(() => {
    const map = {} as Record<string, string[]>;
    for (const c of COLS) {
      if (!c.suggest) continue;
      const seen = new Set<string>();
      for (const st of steps) {
        const v = (st[c.key] ?? '').toString().trim();
        if (v) seen.add(v);
      }
      map[c.key] = [...seen].sort();
    }
    return map;
  }, [steps]);

  /** Move `dir` rows in the same column, stepping over rows that have no cell
   *  there — start/end rows get no บฟ. fields, and stalling on one feels broken. */
  const focusCell = (from: number, c: number, dir: 1 | -1) => {
    const grid = gridRef.current;
    if (!grid) return;
    for (let r = from + dir; r >= 0 && r < steps.length; r += dir) {
      const el = grid.querySelector<HTMLInputElement>(`input[data-r="${r}"][data-c="${c}"]`);
      if (!el) continue;
      el.focus();
      el.select();
      return;
    }
  };

  /** nearest row above `r` that actually carries บฟ. fields */
  const rowAbove = (r: number) => {
    for (let i = r - 1; i >= 0; i--) if (HAS_FIELDS.includes(steps[i].type)) return steps[i];
    return undefined;
  };

  const onCellKey = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    // ⌘D / Ctrl+D — take whatever the row above has in this column
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      const above = rowAbove(r);
      const col = COLS[c];
      if (!above || !col) return;
      updateStep(steps[r].id, { [col.key]: (above[col.key] ?? '').toString() });
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      focusCell(r, c, 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusCell(r, c, -1);
    }
  };

  const filledOf = (key: keyof StepFields) =>
    steps.filter((s) => HAS_FIELDS.includes(s.type) && (s[key] ?? '').toString().trim()).length;
  const formRows = steps.filter((s) => HAS_FIELDS.includes(s.type)).length;

  return (
    <section className="table-view">
      <div className="table-view-head">
        <div>
          <span className="eyebrow">มุมมองตาราง บฟ.</span>
          <span className="hint tiny table-view-hint">
            Tab = ช่องถัดไป · ↑ ↓ = ขึ้น-ลงในคอลัมน์เดียวกัน · ⌘D = ก๊อปค่าจากแถวบน
          </span>
        </div>
        <button className="chip-btn" onClick={onClose}>
          <X width={12} height={12} /> กลับไปมุมมองรายการ
        </button>
      </div>

      <div className="table-scroll" ref={gridRef}>
        {steps.length === 0 ? (
          <div className="empty-state">
            <p className="hint">ยังไม่มีขั้นตอน — กลับไปมุมมองรายการเพื่อเริ่มสร้าง</p>
          </div>
        ) : (
          <table className="bf-table">
            <thead>
              <tr>
                <th className="col-n">#</th>
                <th className="col-label">งาน / ขั้นตอนการดำเนินการ</th>
                {COLS.map((c) => (
                  <th key={c.key} style={{ width: c.w, minWidth: c.w }}>
                    {c.head}
                    <span className="th-count">
                      {filledOf(c.key)}/{formRows}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {steps.map((s, r) => {
                const editable = HAS_FIELDS.includes(s.type);
                return (
                  <tr key={s.id} className={s.id === selectedStepId ? 'is-selected' : undefined}>
                    <td className="col-n">
                      <button
                        className="row-n"
                        title="เลือกขั้นตอนนี้ (ไฮไลต์ในผัง)"
                        onClick={() => selectStep(s.id)}
                      >
                        {r + 1}
                      </button>
                    </td>
                    <td className="col-label">
                      <input
                        className="cell-input cell-label"
                        value={s.label}
                        title={s.label}
                        placeholder="(ยังไม่มีชื่อ)"
                        data-r={r}
                        data-c={-1}
                        onChange={(e) => updateStep(s.id, { label: e.target.value })}
                        onKeyDown={(e) => onCellKey(e, r, -1)}
                      />
                      {!editable && <span className="cell-type">{TYPE_LABEL[s.type]}</span>}
                    </td>
                    {COLS.map((c, ci) =>
                      editable ? (
                        <td key={c.key}>
                          <input
                            className="cell-input"
                            list={c.suggest ? `t-sug-${c.key}` : undefined}
                            value={(s[c.key] as string) ?? ''}
                            data-r={r}
                            data-c={ci}
                            onChange={(e) => updateStep(s.id, { [c.key]: e.target.value })}
                            onKeyDown={(e) => onCellKey(e, r, ci)}
                          />
                        </td>
                      ) : (
                        // start / end / connector have no row in the บฟ. table
                        <td key={c.key} className="cell-na" title="ขั้นตอนประเภทนี้ไม่มีแถวในตาราง บฟ." />
                      ),
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {COLS.filter((c) => c.suggest).map((c) => (
          <datalist key={c.key} id={`t-sug-${c.key}`}>
            {(suggestions[c.key] ?? []).map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        ))}
      </div>
    </section>
  );
}
