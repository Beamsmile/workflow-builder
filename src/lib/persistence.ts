/** Save / load the whole process as a `.flow.json` file on the user's computer. */
import type { Process } from '../domain/types';

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

export function downloadProcess(proc: Process, fileStem: string) {
  const blob = new Blob([JSON.stringify(proc, null, 2)], { type: 'application/json' });
  triggerDownload(blob, `${fileStem}.flow.json`);
}

export function pickProcessFile(): Promise<Process | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        const data = JSON.parse(await file.text()) as Process;
        if (!data || data.schemaVersion !== 2 || !Array.isArray(data.steps) || !Array.isArray(data.lanes)) {
          alert('ไฟล์นี้ไม่ใช่ไฟล์กระบวนการ v2 ที่ถูกต้อง');
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
  return (title || 'workflow').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80) || 'workflow';
}
