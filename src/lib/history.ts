/**
 * ย้อนกลับ / ทำซ้ำ (⌘Z / ⌘⇧Z) — แยกประวัติของแต่ละแท็บ
 *
 * ทำไมเป็นตัวดักการเปลี่ยนแปลงของ store แทนที่จะแก้ทุก action: ทุกการแก้ (พิมพ์ ลบ ย้าย ต่อเส้น
 * เปลี่ยนเลน) เข้ามาเก็บได้ครบโดยไม่ต้องจำไปใส่ทีละที่ — action ใหม่ในอนาคตก็ย้อนกลับได้เอง
 *
 * การพิมพ์ต่อเนื่องในช่องเดียวกันรวมเป็นขั้นเดียว (ไม่งั้นกด ⌘Z ทีละตัวอักษร) ส่วนการเปลี่ยน
 * โครงผัง (เพิ่ม/ลบ/ย้ายขั้น เปลี่ยนเส้นทาง เปลี่ยนเลน) นับเป็นขั้นใหม่เสมอ
 */
import { useSyncExternalStore } from 'react';
import { useStore, type DocSnap } from '../store';
import { hideToast } from './toast';

type Doc = Pick<DocSnap, 'title' | 'bandLabel' | 'lanes' | 'steps'>;
interface Stack {
  past: Doc[];
  future: Doc[];
}

const LIMIT = 100; // จำย้อนหลังได้ราว 100 ขั้นต่อแท็บ
const BURST_MS = 1200; // พิมพ์ห่างกันไม่เกินนี้ = ขั้นเดียวกัน

const stacks = new Map<string, Stack>();
const listeners = new Set<() => void>();
let started = false;
let applying = false;
let prevTab = '';
let prevDoc: Doc | null = null;
let prevShape = '';
let lastTextAt = 0;
let lastWasText = false;

const docOf = (s: DocSnap): Doc => ({ title: s.title, bandLabel: s.bandLabel, lanes: s.lanes, steps: s.steps });
const sameDoc = (a: Doc, b: Doc) =>
  a.title === b.title && a.bandLabel === b.bandLabel && a.lanes === b.lanes && a.steps === b.steps;

/** โครงของผัง (ไม่รวมข้อความ) — ต่างกันเมื่อไหร่ = เป็นการแก้โครง ไม่ใช่การพิมพ์ */
function shapeKey(d: Doc): string {
  const lanes = d.lanes.map((l) => `${l.id}:${l.kind}:${l.field ?? ''}`).join(',');
  const steps = d.steps
    .map((s) => `${s.id}:${s.type}:${s.laneId}:${(s.branches ?? []).map((b) => `${b.id}>${b.toStepId}`).join('.')}`)
    .join(';');
  return `${lanes}|${steps}`;
}

function stackOf(tab: string): Stack {
  let st = stacks.get(tab);
  if (!st) stacks.set(tab, (st = { past: [], future: [] }));
  return st;
}

const emit = () => listeners.forEach((fn) => fn());

/** เริ่มเก็บประวัติ — เรียกหลังโหลดงานที่บันทึกไว้เสร็จ (ไม่ให้การโหลดนับเป็นขั้นที่ย้อนได้) */
export function startHistory(): void {
  if (started) return;
  started = true;
  const s0 = useStore.getState();
  prevTab = s0.activeTabId;
  prevDoc = docOf(s0);
  prevShape = shapeKey(prevDoc);

  useStore.subscribe((s) => {
    const doc = docOf(s);
    // สลับ/เปิด/ปิดแท็บ ไม่ใช่การแก้งาน — แค่ไปใช้ประวัติของอีกแท็บ
    if (s.activeTabId !== prevTab) {
      for (const id of [...stacks.keys()]) if (!s.tabs.some((t) => t.id === id)) stacks.delete(id);
      prevTab = s.activeTabId;
      prevDoc = doc;
      prevShape = shapeKey(doc);
      lastWasText = false;
      hideToast(); // ปุ่ม "ย้อนกลับ" ในแถบแจ้งเตือนเป็นของแท็บก่อน — กดในแท็บนี้จะย้อนผิดงาน
      emit();
      return;
    }
    if (!prevDoc || sameDoc(doc, prevDoc)) return; // แค่เลือก/กางการ์ด

    const shape = shapeKey(doc);
    if (!applying) {
      const now = Date.now();
      const isText = shape === prevShape;
      const continuing = isText && lastWasText && now - lastTextAt < BURST_MS;
      const st = stackOf(s.activeTabId);
      if (!continuing) {
        st.past.push(prevDoc);
        if (st.past.length > LIMIT) st.past.shift();
      }
      // มีการแก้ใหม่หลังลบ → ปุ่ม "ย้อนกลับ" ในแถบแจ้งเตือนจะไปย้อนการแก้ล่าสุดแทนการลบ จึงซ่อนแถบ
      // (การลบเองก็ผ่านตรงนี้ แต่แถบแจ้งเตือนแสดง "หลัง" ลบเสร็จ จึงไม่โดนซ่อน)
      hideToast();
      st.future = [];
      lastWasText = isText;
      lastTextAt = now;
    }
    prevDoc = doc;
    prevShape = shape;
    emit();
  });
}

function apply(doc: Doc) {
  const s = useStore.getState();
  const ids = new Set(doc.steps.map((x) => x.id));
  applying = true;
  try {
    useStore.setState({
      ...doc,
      // ขั้นที่เลือกอยู่อาจหายไปหลังย้อนกลับ
      selectedStepId: s.selectedStepId && ids.has(s.selectedStepId) ? s.selectedStepId : null,
      expandedStepId: s.expandedStepId && ids.has(s.expandedStepId) ? s.expandedStepId : null,
    });
  } finally {
    applying = false;
    lastWasText = false;
  }
}

export function undo(): boolean {
  const s = useStore.getState();
  const st = stacks.get(s.activeTabId);
  const target = st?.past.pop();
  if (!st || !target) return false;
  st.future.push(docOf(s));
  apply(target);
  return true;
}

export function redo(): boolean {
  const s = useStore.getState();
  const st = stacks.get(s.activeTabId);
  const target = st?.future.pop();
  if (!st || !target) return false;
  st.past.push(docOf(s));
  apply(target);
  return true;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** bit 1 = ย้อนกลับได้, bit 2 = ทำซ้ำได้ (ตัวเลขเดียว ให้ React เทียบค่าได้ง่าย) */
function flags(): number {
  const st = stacks.get(useStore.getState().activeTabId);
  return (st?.past.length ? 1 : 0) | (st?.future.length ? 2 : 0);
}

export function useHistory(): { canUndo: boolean; canRedo: boolean } {
  const f = useSyncExternalStore(subscribe, flags);
  return { canUndo: (f & 1) !== 0, canRedo: (f & 2) !== 0 };
}

/** ⌘Z / Ctrl+Z = ย้อนกลับ, ⌘⇧Z / Ctrl+Y = ทำซ้ำ — ใช้ได้ทั้งตอนอยู่ในช่องพิมพ์ */
export function bindHistoryKeys(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.isComposing) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((k === 'z' && e.shiftKey) || (k === 'y' && e.ctrlKey)) {
      e.preventDefault();
      redo();
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
