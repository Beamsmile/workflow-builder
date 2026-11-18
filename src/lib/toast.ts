/**
 * แถบแจ้งเตือนสั้น ๆ ด้านล่างจอ พร้อมปุ่มทำอย่างหนึ่ง (เช่น "ย้อนกลับ")
 * ใช้หลังการลบ — ลบได้ทันทีไม่ต้องกดยืนยันให้เสียจังหวะ แต่กดผิดก็เอาคืนได้ในคลิกเดียว
 */
export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

const SHOW_MS = 7000;
let current: Toast | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;
const listeners = new Set<(t: Toast | null) => void>();

function set(t: Toast | null) {
  current = t;
  listeners.forEach((fn) => fn(t));
}

export function showToast(text: string, action?: Toast['action']): void {
  clearTimeout(timer);
  set({ id: ++seq, text, action });
  timer = setTimeout(() => set(null), SHOW_MS);
}

export function hideToast(): void {
  clearTimeout(timer);
  set(null);
}

export function onToast(fn: (t: Toast | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getToast(): Toast | null {
  return current;
}
