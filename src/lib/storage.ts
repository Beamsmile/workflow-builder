/**
 * Where the open workflows live.
 *
 * During local development the Vite dev server exposes `/api/workflows` (see
 * `vite.config.ts`) and every tab is a real file in `workflows/<name>.flow.json`.
 * When that endpoint isn't there (a built / deployed site), everything falls
 * back to the browser's `localStorage` automatically — same API, no code change.
 *
 * `name` is the file stem (the process title, made filesystem-safe). The little
 * UI manifest (tab order + which tab is active) always lives in localStorage —
 * it's tiny and it's a per-browser preference, not the actual work.
 */
import type { Process } from '../domain/types';

const API = '/api/workflows';
const DOCS_KEY = 'wf:docs';
const UI_KEY = 'wf:ui';

export interface StoredDoc {
  name: string;
  process: Process;
}
export interface WorkspaceUI {
  activeId: string;
  tabs: { id: string; name: string }[];
}

/** 'file' once the dev API answers, 'local' once it fails, 'unknown' before then. */
let mode: 'unknown' | 'file' | 'local' = 'unknown';

async function fileList(): Promise<StoredDoc[] | null> {
  try {
    const res = await fetch(API, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const data = (await res.json()) as StoredDoc[];
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

async function filePut(name: string, process: Process): Promise<boolean> {
  try {
    const res = await fetch(`${API}/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(process, null, 2),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function fileDelete(name: string): Promise<boolean> {
  try {
    const res = await fetch(`${API}/${encodeURIComponent(name)}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

// ---- localStorage fallback ----
function localAll(): Record<string, Process> {
  try {
    return JSON.parse(localStorage.getItem(DOCS_KEY) ?? '{}') as Record<string, Process>;
  } catch {
    return {};
  }
}
function localWrite(all: Record<string, Process>) {
  try {
    localStorage.setItem(DOCS_KEY, JSON.stringify(all));
  } catch {
    /* quota / private mode — nothing we can do */
  }
}

// ---- public API ----
export async function listDocs(): Promise<StoredDoc[]> {
  if (mode !== 'local') {
    const fromFiles = await fileList();
    if (fromFiles) {
      mode = 'file';
      return fromFiles;
    }
    mode = 'local';
  }
  return Object.entries(localAll()).map(([name, process]) => ({ name, process }));
}

export async function putDoc(name: string, process: Process): Promise<void> {
  if (mode === 'file' && (await filePut(name, process))) return;
  if (mode === 'unknown' && (await filePut(name, process))) {
    mode = 'file';
    return;
  }
  mode = mode === 'file' ? 'file' : 'local';
  const all = localAll();
  all[name] = process;
  localWrite(all);
}

export async function deleteDoc(name: string): Promise<void> {
  if (mode === 'file' && (await fileDelete(name))) return;
  const all = localAll();
  if (name in all) {
    delete all[name];
    localWrite(all);
  }
}

export function loadUI(): WorkspaceUI | null {
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (!raw) return null;
    const ui = JSON.parse(raw) as WorkspaceUI;
    return ui && Array.isArray(ui.tabs) ? ui : null;
  } catch {
    return null;
  }
}

export function saveUI(ui: WorkspaceUI) {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify(ui));
  } catch {
    /* ignore */
  }
}

export function storageMode() {
  return mode;
}
