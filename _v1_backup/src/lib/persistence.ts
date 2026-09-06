/** Save / load the whole diagram as a .flow.json file on the user's computer. */
import type { Diagram } from '../domain/types';

export function downloadDiagram(diagram: Diagram, fileName: string) {
  const blob = new Blob([JSON.stringify(diagram, null, 2)], {
    type: 'application/json',
  });
  triggerDownload(blob, fileName.endsWith('.json') ? fileName : `${fileName}.flow.json`);
}

export function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickDiagramFile(): Promise<Diagram | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        const text = await file.text();
        const data = JSON.parse(text) as Diagram;
        if (!data || data.schemaVersion !== 1 || !Array.isArray(data.lanes)) {
          alert('ไฟล์นี้ไม่ใช่ไฟล์ diagram ที่ถูกต้อง');
          return resolve(null);
        }
        resolve(data);
      } catch {
        alert('อ่านไฟล์ไม่สำเร็จ');
        resolve(null);
      }
    };
    input.click();
  });
}

/** Filesystem-safe file stem from the process title. */
export function safeFileStem(title: string): string {
  return (title || 'workflow').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80);
}
