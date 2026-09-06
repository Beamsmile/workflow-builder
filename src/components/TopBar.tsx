import type { RefObject } from 'react';
import { useStore } from '../store';
import { TEMPLATES } from '../domain/templates';
import { downloadProcess, pickProcessFile, safeFileStem } from '../lib/persistence';
import { exportPng, exportSvg } from '../lib/exportImage';
import { exportExcel } from '../lib/exportExcel';
import Menu from './Menu';
import { BrandMark } from './icons';

export default function TopBar({ svgRef }: { svgRef: RefObject<SVGSVGElement> }) {
  const title = useStore((s) => s.title);
  const setTitle = useStore((s) => s.setTitle);
  const loadTemplate = useStore((s) => s.loadTemplate);
  const loadProcess = useStore((s) => s.loadProcess);
  const toProcess = useStore((s) => s.toProcess);

  const stem = () => safeFileStem(title);

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
          <button className="menu-item" onClick={() => exportExcel(toProcess(), stem())}>
            Excel (.xlsx)
          </button>
        </Menu>
      </div>
    </header>
  );
}
