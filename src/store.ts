/**
 * The "brain" of the app — one Zustand store holding the whole `Process`
 * (title, lanes, ordered steps) plus the id of the step currently selected in
 * the editor. Every edit goes through an action here; the diagram and the
 * Excel export are derived from this state, never stored separately.
 */
import { create } from 'zustand';
import type { Branch, Lane, Process, Step, StepFields, StepType } from './domain/types';
import { TEMPLATES, DEFAULT_TEMPLATE_ID } from './domain/templates';

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

const DEFAULT_LABEL: Record<StepType, string> = {
  start: 'เริ่มต้นกระบวนการ',
  process: 'ขั้นตอนใหม่',
  decision: 'เงื่อนไข / จุดตัดสินใจ',
  connector: 'A',
  end: 'สิ้นสุดกระบวนการ',
};

/** true while a step still carries the name it was born with */
export function isDefaultLabel(label: string): boolean {
  const t = (label ?? '').trim();
  return !t || Object.values(DEFAULT_LABEL).includes(t);
}


interface AppState {
  title: string;
  bandLabel: string;
  lanes: Lane[];
  steps: Step[];
  /** step highlighted in the diagram */
  selectedStepId: string | null;
  /** step whose card is expanded (shows the full form) */
  expandedStepId: string | null;

  // ---- selection ----
  /** select + expand a step (e.g. clicking its box in the diagram) */
  selectStep: (id: string | null) => void;
  /** clicking a card header — collapse if already open (keeps it selected), else open */
  toggleExpand: (id: string) => void;

  // ---- process ----
  setTitle: (title: string) => void;
  setBandLabel: (label: string) => void;

  // ---- steps ----
  addStep: (type?: StepType) => void;
  /** paste a list of names — one step per line, chained into the flow */
  addStepsFromLines: (afterStepId: string, lines: string[]) => void;
  updateStep: (id: string, patch: Partial<Step> & Partial<StepFields>) => void;
  deleteStep: (id: string) => void;
  moveStep: (id: string, dir: -1 | 1) => void;
  /** ลากวาง: ย้ายขั้น `id` ไปแทรกก่อนตำแหน่ง `beforeIndex` (นับตามลำดับก่อนย้าย, = steps.length คือท้ายสุด) */
  moveStepTo: (id: string, beforeIndex: number) => void;

  // ---- branches ----
  addBranch: (stepId: string, toStepId?: string | null) => void;
  /** add a branch to the step right after this one (the "→ ไปขั้นถัดไป" button) */
  connectToNext: (stepId: string) => void;
  updateBranch: (stepId: string, branchId: string, patch: Partial<Branch>) => void;
  removeBranch: (stepId: string, branchId: string) => void;

  // ---- lanes ----
  addLane: () => void;
  updateLane: (id: string, patch: Partial<Lane>) => void;
  removeLane: (id: string) => void;
  moveLane: (id: string, dir: -1 | 1) => void;

  // ---- whole document ----
  /**
   * เปิดงาน (จากไฟล์หรือเทมเพลต) เป็นแท็บใหม่ — ไม่เขียนทับแท็บที่เปิดอยู่
   * ยกเว้นแท็บปัจจุบันยังว่างเปล่า ก็ใช้แท็บนั้นเลย
   */
  openProcess: (proc: Process) => void;
  toProcess: () => Process;

  // ---- tabs (one workflow per tab) ----
  /** has the saved workspace been loaded from storage yet */
  hydrated: boolean;
  /**
   * เพิ่มขึ้นทุกครั้งที่จอแสดง "งานคนละชิ้น" (โหลดงานที่บันทึกไว้ สลับ/เปิด/ปิดแท็บ)
   * ให้ผังจัดซูมให้พอดีจอใหม่ — ไม่งั้นยังค้างซูม/ตำแหน่งของงานก่อนหน้า อาจเห็นแต่พื้นที่ว่าง
   */
  viewKey: number;
  tabs: TabMeta[];
  activeTabId: string;
  /** content of every tab that is NOT the active one (active = the fields above) */
  _inactive: Record<string, DocSnap>;
  newTab: () => void;
  switchTab: (id: string) => void;
  closeTab: (id: string) => void;
  /** internal — replace the whole workspace after loading it from storage */
  _hydrate: (payload: {
    tabs: TabMeta[];
    activeTabId: string;
    inactive: Record<string, DocSnap>;
    active: DocSnap;
  }) => void;
  /** internal — the autosave layer renamed some tabs' files */
  _renameTabs: (renames: TabMeta[]) => void;
}

export interface TabMeta {
  id: string;
  /** file stem it's saved under (`workflows/<name>.flow.json`) */
  name: string;
}

/** One workflow document's editable state (what a tab holds). */
export type DocSnap = Pick<
  AppState,
  'title' | 'bandLabel' | 'lanes' | 'steps' | 'selectedStepId' | 'expandedStepId'
>;

export function snapshot(s: DocSnap): DocSnap {
  return {
    title: s.title,
    bandLabel: s.bandLabel,
    lanes: s.lanes,
    steps: s.steps,
    selectedStepId: s.selectedStepId,
    expandedStepId: s.expandedStepId,
  };
}

export function snapToProcess(s: DocSnap): Process {
  return { schemaVersion: 2, title: s.title, bandLabel: s.bandLabel, lanes: s.lanes, steps: s.steps };
}

/** A brand-new empty document is not worth writing to disk yet. */
export function isBlankDoc(s: DocSnap): boolean {
  return s.steps.length === 0 && (!s.title.trim() || s.title === 'ชื่อกระบวนการ');
}

/** Filesystem-safe file stem from a process title. */
export function safeStem(title: string): string {
  return (
    (title || 'workflow')
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || 'workflow'
  );
}

/** `base`, or `base (2)`, … so no two open tabs share a file name. */
export function uniqueName(base: string, selfId: string, tabs: TabMeta[]): string {
  const taken = new Set(tabs.filter((t) => t.id !== selfId).map((t) => t.name));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 999; i++) {
    const n = `${base} (${i})`;
    if (!taken.has(n)) return n;
  }
  return `${base} ${Date.now()}`;
}

export function fromProcess(proc: Process): Pick<AppState, 'title' | 'bandLabel' | 'lanes' | 'steps'> {
  return {
    title: proc.title,
    bandLabel: proc.bandLabel || 'กระบวนการ',
    lanes: proc.lanes.map((l) => ({ ...l, kind: l.kind ?? 'org' })),
    steps: proc.steps.map((s) => {
      // migrate old files: `orgLabel` was merged into `mainUnit`
      const { orgLabel, ...rest } = s as Step & { orgLabel?: string };
      return {
        ...rest,
        mainUnit: rest.mainUnit || orgLabel,
        branches: s.branches?.map((b) => ({ ...b })),
      };
    }),
  };
}

function blankSnap(): DocSnap {
  const base = (TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE_ID) ?? TEMPLATES[0]).build();
  return { ...fromProcess(base), selectedStepId: null, expandedStepId: null };
}

const firstTabId = uid();
const initial = blankSnap();

export const useStore = create<AppState>((set, get) => ({
  ...initial,

  hydrated: false,
  viewKey: 0,
  tabs: [{ id: firstTabId, name: safeStem(initial.title) }],
  activeTabId: firstTabId,
  _inactive: {},

  selectStep: (id) => set({ selectedStepId: id, expandedStepId: id }),

  toggleExpand: (id) =>
    set((s) =>
      s.expandedStepId === id
        ? { expandedStepId: null } // collapse but keep it highlighted
        : { selectedStepId: id, expandedStepId: id },
    ),

  setTitle: (title) => set({ title }),
  setBandLabel: (bandLabel) => set({ bandLabel }),

  addStep: (type = 'process') => {
    const { steps, lanes, selectedStepId } = get();
    // insert right after the selected step, else at the end
    const at = selectedStepId ? steps.findIndex((s) => s.id === selectedStepId) + 1 : steps.length;
    const firstOrg = lanes.find((l) => l.kind === 'org')?.id ?? lanes[0]?.id ?? '';
    const prev = steps[at - 1];
    const after = steps[at]; // the step this one is pushed down in front of
    const step: Step = {
      id: uid(),
      type,
      label: DEFAULT_LABEL[type],
      laneId: prev?.laneId ?? firstOrg,
      // auto-link into the chain: X → after (editable/removable later)
      branches: after ? [{ id: uid(), label: '', toStepId: after.id }] : undefined,
    };

    let list = [...steps];
    // link the previous step into X
    if (prev) {
      const toAfter = after ? prev.branches?.find((b) => b.toStepId === after.id) : undefined;
      if (toAfter) {
        // prev → after  becomes  prev → X   (keep prev's label)
        list = list.map((s) =>
          s.id === prev.id
            ? { ...s, branches: s.branches!.map((b) => (b === toAfter ? { ...b, toStepId: step.id } : b)) }
            : s,
        );
      } else if (!prev.branches || prev.branches.length === 0) {
        list = list.map((s) => (s.id === prev.id ? { ...s, branches: [{ id: uid(), label: '', toStepId: step.id }] } : s));
      }
      // else: prev already has other outgoing paths (e.g. a decision) — leave it, user links X manually
    }

    list.splice(at, 0, step);
    set({ steps: list, selectedStepId: step.id, expandedStepId: step.id });
  },

  addStepsFromLines: (afterStepId, lines) => {
    const names = lines.map((l) => l.trim()).filter(Boolean);
    if (names.length === 0) return;
    const steps = get().steps;
    const i = steps.findIndex((s) => s.id === afterStepId);
    if (i < 0) return;
    const target = steps[i];
    const after = steps[i + 1];

    // the first line renames the step being pasted into; the rest become new
    // steps behind it, chained the same way addStep chains a single one
    const created: Step[] = names.slice(1).map((label) => ({
      id: uid(),
      type: 'process' as StepType,
      label,
      laneId: target.laneId,
      branches: undefined,
    }));
    const chain = [...created.map((c) => c.id), after?.id ?? null];
    created.forEach((c, n) => {
      const to = chain[n + 1];
      if (to) c.branches = [{ id: uid(), label: '', toStepId: to }];
    });

    const head: Step = { ...target, label: names[0] };
    const first = chain[0];
    if (first) {
      const toAfter = after ? head.branches?.find((b) => b.toStepId === after.id) : undefined;
      if (toAfter) {
        head.branches = head.branches!.map((b) =>
          b === toAfter ? { ...b, toStepId: first } : b,
        );
      } else if (!head.branches || head.branches.length === 0) {
        head.branches = [{ id: uid(), label: '', toStepId: first }];
      }
    }

    const list = [...steps];
    list[i] = head;
    list.splice(i + 1, 0, ...created);
    const last = created[created.length - 1] ?? head;
    set({ steps: list, selectedStepId: last.id, expandedStepId: last.id });
  },

  updateStep: (id, patch) => {
    set({
      steps: get().steps.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s, ...patch };
        // switching the type renames the step, but only while it still carries
        // a default name — never overwrite something the user actually typed
        if (patch.type && patch.type !== s.type && isDefaultLabel(s.label)) {
          next.label = DEFAULT_LABEL[patch.type];
        }
        return next;
      }),
    });
  },

  deleteStep: (id) => {
    const gone = get().steps.find((s) => s.id === id);
    // ขั้นที่ลบมีทางออกทางเดียว (A → X → B) → ต่อ A → B ให้เลย ไม่ให้เส้นขาดกลางสาย
    // (ตรงข้ามกับตอนเพิ่มขั้นที่แทรกเข้า chain ให้อัตโนมัติ) ถ้า X แตกหลายทาง เดาไม่ได้ว่าควรไปทางไหน
    // จึงปล่อยเส้นนั้นว่างไว้ให้ผู้ใช้เลือกเอง (หน้าตรวจก่อน export จะเตือน)
    const outs = (gone?.branches ?? []).filter((b) => b.toStepId && b.toStepId !== id);
    const heir = outs.length === 1 ? outs[0].toStepId : null;
    const steps = get().steps
      .filter((s) => s.id !== id)
      .map((s) => {
        if (!s.branches?.some((b) => b.toStepId === id)) return s;
        const to = heir && heir !== s.id ? heir : null; // ไม่ต่อเส้นวนเข้าตัวเอง
        const already = (b: Branch) => b.toStepId === to;
        const branches = s.branches.flatMap((b) => {
          if (b.toStepId !== id) return [b];
          // มีเส้นไป B อยู่แล้ว และเส้นนี้ไม่มีป้าย → ทิ้งไป ไม่ให้มีเส้นซ้ำ
          if (to && s.branches!.some((o) => o !== b && already(o)) && !b.label.trim()) return [];
          return [{ ...b, toStepId: to }];
        });
        return { ...s, branches };
      });
    set({
      steps,
      selectedStepId: get().selectedStepId === id ? null : get().selectedStepId,
      expandedStepId: get().expandedStepId === id ? null : get().expandedStepId,
    });
  },

  moveStep: (id, dir) => {
    const steps = [...get().steps];
    const i = steps.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= steps.length) return;
    [steps[i], steps[j]] = [steps[j], steps[i]];
    set({ steps });
  },

  moveStepTo: (id, beforeIndex) => {
    const steps = [...get().steps];
    const i = steps.findIndex((s) => s.id === id);
    if (i < 0) return;
    // ตำแหน่งหลังดึงตัวเองออกแล้ว (ถ้าลากลง ทุกอย่างข้างล่างเลื่อนขึ้น 1)
    const j = Math.max(0, Math.min(steps.length - 1, beforeIndex > i ? beforeIndex - 1 : beforeIndex));
    if (j === i) return;
    const [moved] = steps.splice(i, 1);
    steps.splice(j, 0, moved);
    set({ steps });
  },

  addBranch: (stepId, toStepId = null) => {
    set({
      steps: get().steps.map((s) =>
        s.id === stepId
          ? {
              ...s,
              branches: [...(s.branches ?? []), { id: uid(), label: '', toStepId }],
            }
          : s,
      ),
    });
  },

  connectToNext: (stepId) => {
    const steps = get().steps;
    const i = steps.findIndex((s) => s.id === stepId);
    const next = steps[i + 1];
    if (!next) return;
    // don't add a duplicate
    if (steps[i].branches?.some((b) => b.toStepId === next.id)) return;
    get().addBranch(stepId, next.id);
  },

  updateBranch: (stepId, branchId, patch) => {
    set({
      steps: get().steps.map((s) =>
        s.id === stepId
          ? {
              ...s,
              branches: (s.branches ?? []).map((b) => (b.id === branchId ? { ...b, ...patch } : b)),
            }
          : s,
      ),
    });
  },

  removeBranch: (stepId, branchId) => {
    set({
      steps: get().steps.map((s) =>
        s.id === stepId
          ? { ...s, branches: (s.branches ?? []).filter((b) => b.id !== branchId) }
          : s,
      ),
    });
  },

  addLane: () => {
    // insert the new org lane after the last existing org lane
    const lanes = [...get().lanes];
    let at = lanes.length;
    for (let i = lanes.length - 1; i >= 0; i--) {
      if (lanes[i].kind === 'org') {
        at = i + 1;
        break;
      }
    }
    lanes.splice(at, 0, { id: uid(), label: 'เลนใหม่', kind: 'org' });
    set({ lanes });
  },

  updateLane: (id, patch) => {
    set({ lanes: get().lanes.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  },

  removeLane: (id) => {
    const lane = get().lanes.find((l) => l.id === id);
    const lanes = get().lanes.filter((l) => l.id !== id);
    // keep at least one org lane
    if (lane?.kind === 'org' && !lanes.some((l) => l.kind === 'org')) return;
    if (lanes.length === 0) return;
    const fallback = lanes.find((l) => l.kind === 'org')?.id ?? lanes[0].id;
    set({
      lanes,
      steps: get().steps.map((s) => (s.laneId === id ? { ...s, laneId: fallback } : s)),
    });
  },

  moveLane: (id, dir) => {
    const lanes = [...get().lanes];
    const i = lanes.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= lanes.length) return;
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    set({ lanes });
  },

  // เดิม "เปิด" กับ "เทมเพลต" แทนที่งานในแท็บปัจจุบัน — ชื่อกระบวนการเปลี่ยน ระบบบันทึกอัตโนมัติ
  // จึงลบไฟล์งานเดิมทิ้งไปด้วย (งานหาย) ตอนนี้เปิดเป็นแท็บใหม่เสมอ
  openProcess: (proc) =>
    set((s) => {
      const p = fromProcess(proc);
      const doc = { ...p, selectedStepId: p.steps[0]?.id ?? null, expandedStepId: null };
      if (isBlankDoc(snapshot(s))) return { ...doc, viewKey: s.viewKey + 1 }; // แท็บนี้ยังว่าง ไม่มีอะไรให้เสีย
      const id = uid();
      return {
        _inactive: { ...s._inactive, [s.activeTabId]: snapshot(s) },
        tabs: [...s.tabs, { id, name: uniqueName(safeStem(p.title), id, s.tabs) }],
        activeTabId: id,
        viewKey: s.viewKey + 1,
        ...doc,
      };
    }),

  toProcess: () => {
    const { title, bandLabel, lanes, steps } = get();
    return { schemaVersion: 2, title, bandLabel, lanes, steps };
  },

  // ---- tabs ----
  newTab: () =>
    set((s) => {
      const id = uid();
      const blank = blankSnap();
      return {
        _inactive: { ...s._inactive, [s.activeTabId]: snapshot(s) },
        tabs: [...s.tabs, { id, name: uniqueName(safeStem(blank.title), id, s.tabs) }],
        activeTabId: id,
        viewKey: s.viewKey + 1,
        ...blank,
      };
    }),

  switchTab: (id) =>
    set((s) => {
      if (id === s.activeTabId) return {};
      const target = s._inactive[id];
      if (!target) return {};
      const inactive = { ...s._inactive, [s.activeTabId]: snapshot(s) };
      delete inactive[id];
      return { activeTabId: id, _inactive: inactive, viewKey: s.viewKey + 1, ...target };
    }),

  closeTab: (id) =>
    set((s) => {
      if (s.tabs.length <= 1) {
        // closing the only tab just wipes it back to a fresh page
        const blank = blankSnap();
        return {
          tabs: [{ id: s.tabs[0].id, name: safeStem(blank.title) }],
          activeTabId: s.tabs[0].id,
          _inactive: {},
          viewKey: s.viewKey + 1,
          ...blank,
        };
      }
      const idx = s.tabs.findIndex((t) => t.id === id);
      if (idx < 0) return {};
      const tabs = s.tabs.filter((t) => t.id !== id);
      const inactive = { ...s._inactive };
      delete inactive[id];
      if (id !== s.activeTabId) return { tabs, _inactive: inactive };
      const nextId = tabs[Math.min(idx, tabs.length - 1)].id;
      const target = inactive[nextId] ?? blankSnap();
      delete inactive[nextId];
      return { tabs, activeTabId: nextId, _inactive: inactive, viewKey: s.viewKey + 1, ...target };
    }),

  _hydrate: ({ tabs, activeTabId, inactive, active }) =>
    set((s) => ({ tabs, activeTabId, _inactive: inactive, ...active, hydrated: true, viewKey: s.viewKey + 1 })),

  _renameTabs: (renames) =>
    set((s) => ({
      tabs: s.tabs.map((t) => renames.find((r) => r.id === t.id) ?? t),
    })),
}));
