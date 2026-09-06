import { create } from 'zustand';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import type { Diagram, FlowNodeData, FlowNodeType, Lane, StepFields } from './domain/types';
import { HEADER_HEIGHT, NODE_SIZE } from './domain/theme';
import { computeLaneGeometry, laneAtX, snapXToLane } from './domain/lanes';
import { TEMPLATES, DEFAULT_TEMPLATE_ID } from './domain/templates';

export type AppNode = Node<FlowNodeData>;

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

interface AppState {
  title: string;
  lanes: Lane[];
  nodes: AppNode[];
  edges: Edge[];
  selectedNodeId: string | null;

  // ---- React Flow wiring ----
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (conn: Connection) => void;
  setSelectedNode: (id: string | null) => void;

  // ---- editing ----
  setTitle: (title: string) => void;
  addNode: (type: FlowNodeType, laneId?: string) => void;
  updateNodeFields: (id: string, patch: Partial<StepFields>) => void;
  deleteNode: (id: string) => void;
  snapNodeToNearestLane: (id: string) => void;

  // ---- lanes ----
  updateLane: (id: string, patch: Partial<Lane>) => void;
  addLane: (afterId?: string) => void;
  removeLane: (id: string) => void;
  moveLane: (id: string, dir: -1 | 1) => void;

  // ---- persistence ----
  loadTemplate: (templateId: string) => void;
  loadDiagram: (d: Diagram) => void;
  toDiagram: () => Diagram;
}

function diagramToRuntime(d: Diagram): Pick<AppState, 'title' | 'lanes' | 'nodes' | 'edges'> {
  return {
    title: d.title,
    lanes: d.lanes,
    nodes: d.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: { ...n.data },
    })),
    edges: d.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
      label: e.label,
    })),
  };
}

const initial = diagramToRuntime(
  (TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE_ID) ?? TEMPLATES[0]).build(),
);

export const useStore = create<AppState>((set, get) => ({
  ...initial,
  selectedNodeId: null,

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) as AppNode[] });
  },
  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },
  onConnect: (conn) => {
    set({ edges: addEdge({ ...conn }, get().edges) });
  },
  setSelectedNode: (id) => set({ selectedNodeId: id }),

  setTitle: (title) => set({ title }),

  addNode: (type, laneId) => {
    const { lanes, nodes } = get();
    const targetLane = laneId ?? lanes.find((l) => l.kind === 'org')?.id ?? lanes[0]?.id;
    if (!targetLane) return;
    // place below the lowest existing node in that lane, else near the top
    const inLane = nodes.filter((n) => n.data.laneId === targetLane);
    const y = inLane.length
      ? Math.max(...inLane.map((n) => n.position.y)) + 150
      : HEADER_HEIGHT + 40;
    const node: AppNode = {
      id: uid(),
      type,
      position: { x: snapXToLane(lanes, targetLane, type), y },
      data: {
        kind: type,
        laneId: targetLane,
        label:
          type === 'start'
            ? 'Start'
            : type === 'end'
              ? 'End'
              : type === 'decision'
                ? 'จุดตัดสินใจ'
                : type === 'application'
                  ? 'ระบบงาน'
                  : type === 'connector'
                    ? 'A'
                    : 'ขั้นตอนใหม่',
      },
    };
    set({ nodes: [...nodes, node], selectedNodeId: node.id });
  },

  updateNodeFields: (id, patch) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
    });
  },

  deleteNode: (id) => {
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
    });
  },

  snapNodeToNearestLane: (id) => {
    const { lanes, nodes } = get();
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    const size = NODE_SIZE[node.type ?? 'process'] ?? { width: 200, height: 90 };
    const centreX = node.position.x + size.width / 2;
    const lane = laneAtX(lanes, centreX);
    if (!lane) return;
    set({
      nodes: nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              position: {
                x: snapXToLane(lanes, lane.id, n.type ?? 'process'),
                y: Math.max(HEADER_HEIGHT + 8, n.position.y),
              },
              data: { ...n.data, laneId: lane.id },
            }
          : n,
      ),
    });
  },

  updateLane: (id, patch) => {
    const lanes = get().lanes.map((l) => (l.id === id ? { ...l, ...patch } : l));
    set({ lanes, nodes: reflowNodes(lanes, get().nodes) });
  },

  addLane: (afterId) => {
    const lanes = [...get().lanes];
    const idx = afterId ? lanes.findIndex((l) => l.id === afterId) : lanes.length - 1;
    const newLane: Lane = {
      id: uid(),
      label: 'เลนใหม่',
      kind: 'org',
      width: 240,
      groupLabel: 'กระบวนการ',
    };
    lanes.splice(idx + 1, 0, newLane);
    set({ lanes, nodes: reflowNodes(lanes, get().nodes) });
  },

  removeLane: (id) => {
    const lanes = get().lanes.filter((l) => l.id !== id);
    if (lanes.length === 0) return;
    const fallback = lanes[0].id;
    const nodes = get().nodes.map((n) =>
      n.data.laneId === id ? { ...n, data: { ...n.data, laneId: fallback } } : n,
    );
    set({ lanes, nodes: reflowNodes(lanes, nodes) });
  },

  moveLane: (id, dir) => {
    const lanes = [...get().lanes];
    const i = lanes.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= lanes.length) return;
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
    set({ lanes, nodes: reflowNodes(lanes, get().nodes) });
  },

  loadTemplate: (templateId) => {
    const t = TEMPLATES.find((it) => it.id === templateId);
    if (!t) return;
    set({ ...diagramToRuntime(t.build()), selectedNodeId: null });
  },

  loadDiagram: (d) => {
    set({ ...diagramToRuntime(d), selectedNodeId: null });
  },

  toDiagram: () => {
    const { title, lanes, nodes, edges } = get();
    return {
      schemaVersion: 1,
      title,
      lanes,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: (n.type ?? 'process') as FlowNodeType,
        position: n.position,
        data: n.data,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
        targetHandle: e.targetHandle ?? null,
        label: typeof e.label === 'string' ? e.label : undefined,
      })),
    };
  },
}));

/** Re-centre every node in its lane after the lane list/size/order changes. */
function reflowNodes(lanes: Lane[], nodes: AppNode[]): AppNode[] {
  const geo = computeLaneGeometry(lanes);
  return nodes.map((n) => {
    const g = geo.find((it) => it.lane.id === n.data.laneId);
    if (!g) return n;
    const size = NODE_SIZE[n.type ?? 'process'] ?? { width: 200, height: 90 };
    return { ...n, position: { ...n.position, x: Math.round(g.center - size.width / 2) } };
  });
}
