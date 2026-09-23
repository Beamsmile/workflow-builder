import { useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { checkProcess, type Issue } from '../lib/preflight';

/**
 * Shown between "Export Excel" and the actual download when `checkProcess`
 * found anything. Every row carries the shortcut that fixes it, and the export
 * is never blocked — the form is often handed over half-filled on purpose.
 */
export default function PreflightDialog({
  onExport,
  onClose,
  onOpenTable,
}: {
  onExport: () => void;
  onClose: () => void;
  onOpenTable: () => void;
}) {
  const updateStep = useStore((s) => s.updateStep);
  const selectStep = useStore((s) => s.selectStep);
  // read the flow here, not from a prop: a fix applied inside the dialog has to
  // make its own row disappear
  const steps = useStore((s) => s.steps);
  const title = useStore((s) => s.title);
  const bandLabel = useStore((s) => s.bandLabel);
  const lanes = useStore((s) => s.lanes);
  const issues = useMemo(
    () => checkProcess({ schemaVersion: 2, title, bandLabel, lanes, steps }),
    [title, bandLabel, lanes, steps],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const warns = issues.filter((i) => i.level === 'warn');
  const infos = issues.filter((i) => i.level === 'info');

  const act = (issue: Issue) => {
    const a = issue.action;
    if (!a) return;
    if (a.kind === 'makeDecision') {
      updateStep(a.stepId, { type: 'decision' });
      return; // stay open — the row disappears as the list recomputes
    }
    if (a.kind === 'goto') {
      selectStep(a.stepId);
      onClose();
      return;
    }
    onOpenTable();
    onClose();
  };

  const actionLabel = (issue: Issue): string | null => {
    switch (issue.action?.kind) {
      case 'makeDecision':
        return 'แก้ให้เลย';
      case 'goto':
        return 'ไปที่ขั้นตอน';
      case 'table':
        return 'เปิดมุมมองตาราง';
      default:
        return null;
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>
            {issues.length === 0
              ? 'ตรวจก่อน export — เรียบร้อยแล้ว'
              : `ตรวจก่อน export — พบ ${issues.length} เรื่องที่ควรดู`}
          </strong>
          <span className="hint tiny">
            ทั้งหมดนี้เป็นคำเตือน ไม่ได้บังคับ — กด “Export ต่อเลย” ได้ทันที
          </span>
        </div>

        <div className="modal-body">
          {issues.length === 0 && (
            <div className="issue-row is-ok">
              <span className="issue-dot" aria-hidden>
                ✓
              </span>
              <span className="issue-text">ไม่พบอะไรที่ต้องแก้แล้ว</span>
            </div>
          )}
          {warns.length > 0 && (
            <>
              <div className="issue-group">ควรแก้ก่อน · {warns.length}</div>
              {warns.map((i) => (
                <IssueRow key={i.id} issue={i} label={actionLabel(i)} onAct={() => act(i)} />
              ))}
            </>
          )}
          {infos.length > 0 && (
            <>
              <div className="issue-group">ข้อมูลที่ยังไม่ครบ · {infos.length}</div>
              {infos.map((i) => (
                <IssueRow key={i.id} issue={i} label={actionLabel(i)} onAct={() => act(i)} />
              ))}
            </>
          )}
        </div>

        <div className="modal-foot">
          <button className="menu-trigger" onClick={onClose}>
            ยกเลิก
          </button>
          <button className="btn-primary menu-trigger" onClick={onExport}>
            Export ต่อเลย
          </button>
        </div>
      </div>
    </div>
  );
}

function IssueRow({
  issue,
  label,
  onAct,
}: {
  issue: Issue;
  label: string | null;
  onAct: () => void;
}) {
  return (
    <div className={`issue-row is-${issue.level}`}>
      <span className="issue-dot" aria-hidden>
        {issue.level === 'warn' ? '!' : 'i'}
      </span>
      <span className="issue-text">{issue.text}</span>
      {label && (
        <button className="link-btn" onClick={onAct}>
          {label}
        </button>
      )}
    </div>
  );
}
