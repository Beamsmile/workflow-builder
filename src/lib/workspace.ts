/**
 * Ties the tab store to storage:
 *   - `hydrateWorkspace()` — on startup, load every saved workflow back into tabs
 *   - `startAutosave()`     — after every edit, write each tab to storage (debounced)
 *
 * Files are named after the process title. The tab⇆file-name mapping lives here
 * (not in the store) so the store stays about editing, not persistence.
 */
import {
  useStore,
  fromProcess,
  snapshot,
  snapToProcess,
  isBlankDoc,
  safeStem,
  uniqueName,
  type DocSnap,
  type TabMeta,
} from '../store';
import type { Process } from '../domain/types';
import { listDocs, putDoc, deleteDoc, loadUI, saveUI } from './storage';

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

/** tab id → the file name it is currently written under */
const fileOf = new Map<string, string>();

export type SaveState = 'saved' | 'saving';
let saveState: SaveState = 'saved';
const saveListeners = new Set<(s: SaveState) => void>();
/** subscribe to "saving / saved" so the UI can reassure the user */
export function onSaveState(fn: (s: SaveState) => void): () => void {
  saveListeners.add(fn);
  return () => saveListeners.delete(fn);
}
export function getSaveState(): SaveState {
  return saveState;
}
function setSaveState(next: SaveState) {
  if (saveState === next) return;
  saveState = next;
  saveListeners.forEach((fn) => fn(next));
}

let hydrated = false;
let autosaveOn = false;

function toSnap(process: Process): DocSnap {
  return { ...fromProcess(process), selectedStepId: null, expandedStepId: null };
}

export async function hydrateWorkspace(): Promise<void> {
  if (hydrated) return;
  hydrated = true;

  const [docs, ui] = [await listDocs(), loadUI()];
  const byName = new Map(docs.map((d) => [d.name, d.process]));

  // start from the saved tab order, drop tabs whose file vanished
  let tabs: TabMeta[] = (ui?.tabs ?? []).filter((t) => byName.has(t.name));
  // add any files that showed up outside the app
  const known = new Set(tabs.map((t) => t.name));
  for (const d of docs) if (!known.has(d.name)) tabs.push({ id: uid(), name: d.name });

  if (tabs.length === 0) {
    // nothing saved yet — keep the store's default single blank tab
    const s = useStore.getState();
    fileOf.set(s.activeTabId, s.tabs[0].name);
    useStore.setState({ hydrated: true });
    return;
  }

  const activeTabId = tabs.find((t) => t.id === ui?.activeId)?.id ?? tabs[0].id;
  const inactive: Record<string, DocSnap> = {};
  let active: DocSnap | null = null;
  for (const t of tabs) {
    const snap = toSnap(byName.get(t.name)!);
    fileOf.set(t.id, t.name);
    if (t.id === activeTabId) active = snap;
    else inactive[t.id] = snap;
  }

  useStore.getState()._hydrate({ tabs, activeTabId, inactive, active: active! });
}

export function startAutosave(): void {
  if (autosaveOn) return;
  autosaveOn = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastTabsKey = '';
  useStore.subscribe((state) => {
    if (!state.hydrated) return;
    // remember tab order / active tab right away — it's just a localStorage write
    const tabsKey = `${state.activeTabId}|${state.tabs.map((t) => t.id).join(',')}`;
    if (tabsKey !== lastTabsKey) {
      lastTabsKey = tabsKey;
      saveUI({
        activeId: state.activeTabId,
        tabs: state.tabs.map((t) => ({ id: t.id, name: fileOf.get(t.id) ?? t.name })),
      });
    }
    setSaveState('saving');
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), 600);
  });
}

async function flush(): Promise<void> {
  const s = useStore.getState();
  const snapFor = (t: TabMeta): DocSnap | undefined =>
    t.id === s.activeTabId ? snapshot(s) : s._inactive[t.id];

  // 1. delete files for tabs that were closed
  const live = new Set(s.tabs.map((t) => t.id));
  for (const [id, name] of [...fileOf]) {
    if (!live.has(id)) {
      await deleteDoc(name);
      fileOf.delete(id);
    }
  }

  // 2. upsert every open tab
  const renames: TabMeta[] = [];
  for (const t of s.tabs) {
    const doc = snapFor(t);
    if (!doc) continue;
    const prev = fileOf.get(t.id);

    if (isBlankDoc(doc)) {
      if (prev) {
        await deleteDoc(prev);
        fileOf.delete(t.id);
      }
      continue;
    }

    const desired = uniqueName(safeStem(doc.title), t.id, s.tabs);
    if (prev && prev !== desired) await deleteDoc(prev);
    await putDoc(desired, snapToProcess(doc));
    fileOf.set(t.id, desired);
    if (t.name !== desired) renames.push({ id: t.id, name: desired });
  }
  if (renames.length) useStore.getState()._renameTabs(renames);

  // 3. remember tab order + which one is active
  saveUI({
    activeId: s.activeTabId,
    tabs: s.tabs.map((t) => ({ id: t.id, name: fileOf.get(t.id) ?? t.name })),
  });
  setSaveState('saved');
}
