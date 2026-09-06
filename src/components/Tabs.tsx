/**
 * The tab strip — one tab per open workflow. Each tab shows its process title;
 * switching tabs swaps the whole editor. Work is auto-saved (see lib/workspace).
 */
import { useStore } from '../store';
import { Plus, X } from './icons';

export default function Tabs() {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const activeTitle = useStore((s) => s.title);
  const activeSteps = useStore((s) => s.steps.length);
  const inactive = useStore((s) => s._inactive);
  const switchTab = useStore((s) => s.switchTab);
  const closeTab = useStore((s) => s.closeTab);
  const newTab = useStore((s) => s.newTab);

  const titleOf = (id: string) =>
    id === activeTabId ? activeTitle : inactive[id]?.title || 'ชื่อกระบวนการ';
  const stepCountOf = (id: string) =>
    id === activeTabId ? activeSteps : (inactive[id]?.steps.length ?? 0);

  const onClose = (id: string) => {
    if (stepCountOf(id) > 0 && !confirm('ปิดแท็บนี้? ไฟล์ของงานนี้จะถูกลบด้วย')) return;
    closeTab(id);
  };

  return (
    <div className="tabstrip" role="tablist">
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tab"
          aria-selected={t.id === activeTabId}
          className={`tab${t.id === activeTabId ? ' is-active' : ''}`}
          onClick={() => switchTab(t.id)}
          title={titleOf(t.id)}
        >
          <span className="tab-label">{titleOf(t.id) || 'ชื่อกระบวนการ'}</span>
          <button
            className="tab-close"
            aria-label="ปิดแท็บ"
            onClick={(e) => {
              e.stopPropagation();
              onClose(t.id);
            }}
          >
            <X />
          </button>
        </div>
      ))}
      <button className="tab-new" aria-label="เปิดแท็บใหม่" onClick={() => newTab()}>
        <Plus />
      </button>
    </div>
  );
}
