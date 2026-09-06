import { useStore } from '../store';
import { TEMPLATES } from '../domain/templates';
import { downloadDiagram, pickDiagramFile, safeFileStem } from '../lib/persistence';
import { exportPng, exportSvg } from '../lib/exportImage';
import { exportExcel } from '../lib/exportExcel';
import Menu from './Menu';

export default function TopBar() {
  const title = useStore((s) => s.title);
  const setTitle = useStore((s) => s.setTitle);
  const loadTemplate = useStore((s) => s.loadTemplate);
  const loadDiagram = useStore((s) => s.loadDiagram);
  const toDiagram = useStore((s) => s.toDiagram);
  const nodes = useStore((s) => s.nodes);

  const stem = () => safeFileStem(title);

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          ⣿
        </span>
        <span className="brand-name">Workflow Builder</span>
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

        <button
          onClick={async () => {
            const d = await pickDiagramFile();
            if (d) loadDiagram(d);
          }}
        >
          เปิด
        </button>

        <button onClick={() => downloadDiagram(toDiagram(), stem())}>บันทึก</button>

        <Menu label="Export" primary>
          <div className="menu-label">รูปภาพ</div>
          <button className="menu-item" onClick={() => exportPng(nodes, stem())}>
            PNG
          </button>
          <button className="menu-item" onClick={() => exportSvg(nodes, stem())}>
            SVG
          </button>
          <div className="menu-sep" />
          <div className="menu-label">ฟอร์ม บฟ.</div>
          <button className="menu-item" onClick={() => exportExcel(toDiagram(), stem())}>
            Excel (.xlsx)
          </button>
        </Menu>
      </div>
    </header>
  );
}
