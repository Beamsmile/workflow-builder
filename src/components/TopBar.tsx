import { useEffect, useState, type RefObject } from 'react';
import { useStore } from '../store';
import { TEMPLATES } from '../domain/templates';
import { downloadProcess, pickProcessFile, safeFileStem } from '../lib/persistence';
import { exportPng, exportSvg } from '../lib/exportImage';
import { exportExcel } from '../lib/exportExcel';
import { onSaveState, getSaveState, type SaveState } from '../lib/workspace';
import { checkProcess } from '../lib/preflight';
import Menu from './Menu';
import PreflightDialog from './PreflightDialog';
import { BrandMark } from './icons';

/** Quiet reassurance that nothing is lost — the app saves on its own. */
function SaveIndicator() {
  const [state, setState] = useState<SaveState>(getSaveState);
  useEffect(() => onSaveState(setState), []);
  return (
    <span className={`save-state${state === 'saving' ? ' is-saving' : ''}`}>
      {state === 'saving' ? 'กำลังบันทึก…' : '✓ บันทึกแล้ว'}
    </span>
  );
}

export default function TopBar({
  svgRef,
  onOpenTable,
}: {
  svgRef: RefObject<SVGSVGElement>;
  onOpenTable: () => void;
}) {
  const title = useStore((s) => s.title);
  const setTitle = useStore((s) => s.setTitle);
  const loadTemplate = useStore((s) => s.loadTemplate);
  const loadProcess = useStore((s) => s.loadProcess);
  const toProcess = useStore((s) => s.toProcess);

  const stem = () => safeFileStem(title);

  // Export Excel goes through a look-over first: a dangling step or a missing
  // column is far cheaper to fix here than in the finished .xlsx.
  const [checking, setChecking] = useState(false);
  const runExport = () => exportExcel(toProcess(), stem());
  const startExport = () => {
    // nothing to say? don't make them click through a dialog
    if (checkProcess(toProcess()).length === 0) runExport();
    else setChecking(true);
  };

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark"><BrandMark width={15} height={15} /></span>
        <span>Workflow Builder</span>
        <span className="brand-by">By Beamsmile</span>
      </div>

      <div className="topbar-divider" />

      <div className="topbar-title">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="ชื่อกระบวนการ…"
          aria-label="ชื่อกระบวนการ"
        />
      </div>

      <div className="topbar-actions">
        <Menu label="เทมเพลต">
          <div className="menu-label">แทนที่งานปัจจุบันทั้งหมด</div>
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              className="menu-item"
              onClick={() => {
                if (confirm('โหลดเทมเพลตใหม่จะแทนที่งานปัจจุบันทั้งหมด ดำเนินการต่อ?')) {
                  loadTemplate(t.id);
                }
              }}
            >
              {t.name}
            </button>
          ))}
        </Menu>

        <SaveIndicator />

        <button
          className="menu-trigger"
          onClick={async () => {
            const p = await pickProcessFile();
            if (p) loadProcess(p);
          }}
        >
          เปิด
        </button>

        <button className="menu-trigger" onClick={() => downloadProcess(toProcess(), stem())}>
          บันทึก
        </button>

        <Menu label="Export" primary>
          <div className="menu-label">รูปภาพ</div>
          <button className="menu-item" onClick={() => exportPng(svgRef.current, stem())}>
            PNG
          </button>
          <button className="menu-item" onClick={() => exportSvg(svgRef.current, stem())}>
            SVG
          </button>
          <div className="menu-sep" />
          <div className="menu-label">ฟอร์ม บฟ.</div>
          <button className="menu-item" onClick={startExport}>
            Excel (.xlsx)
          </button>
        </Menu>
      </div>

      {checking && (
        <PreflightDialog
          onClose={() => setChecking(false)}
          onOpenTable={onOpenTable}
          onExport={() => {
            setChecking(false);
            runExport();
          }}
        />
      )}
    </header>
  );
}
