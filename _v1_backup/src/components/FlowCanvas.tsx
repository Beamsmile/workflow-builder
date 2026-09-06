import { useCallback, useMemo } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type NodeChange,
  type NodeMouseHandler,
  type OnNodeDrag,
  MarkerType,
} from '@xyflow/react';
import { useStore } from '../store';
import { nodeTypes } from './nodes';
import { buildLaneNodes, laneNodeTypes, LaneHeaderStrip } from './swimlane';

const allNodeTypes = { ...nodeTypes, ...laneNodeTypes };

const defaultEdgeOptions = {
  type: 'smoothstep' as const,
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
};

export default function FlowCanvas() {
  const lanes = useStore((s) => s.lanes);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const onNodesChange = useStore((s) => s.onNodesChange);
  const onEdgesChange = useStore((s) => s.onEdgesChange);
  const onConnect = useStore((s) => s.onConnect);
  const setSelectedNode = useStore((s) => s.setSelectedNode);
  const snapNodeToNearestLane = useStore((s) => s.snapNodeToNearestLane);

  const contentHeight = useMemo(
    () => nodes.reduce((m, n) => Math.max(m, n.position.y), 0),
    [nodes],
  );

  const rfNodes = useMemo(() => {
    const laneNodes = buildLaneNodes(lanes, contentHeight);
    const flowNodes = nodes.map((n) => ({
      ...n,
      selected: n.id === selectedNodeId,
    }));
    return [...laneNodes, ...flowNodes];
  }, [lanes, nodes, contentHeight, selectedNodeId]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // lane nodes are not in the store – drop their changes
      onNodesChange(changes.filter((c) => !('id' in c) || !c.id.startsWith('lane__')));
    },
    [onNodesChange],
  );

  const handleNodeClick = useCallback<NodeMouseHandler>(
    (_e, node) => {
      if (node.id.startsWith('lane__')) return;
      setSelectedNode(node.id);
    },
    [setSelectedNode],
  );

  const handleNodeDragStop = useCallback<OnNodeDrag>(
    (_e, node) => {
      if (node.id.startsWith('lane__')) return;
      snapNodeToNearestLane(node.id);
    },
    [snapNodeToNearestLane],
  );

  return (
    <div className="canvas">
      <ReactFlow
        nodes={rfNodes}
        edges={edges}
        nodeTypes={allNodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onNodeDragStop={handleNodeDragStop}
        onPaneClick={() => setSelectedNode(null)}
        minZoom={0.2}
        maxZoom={2}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
      >
        <Background gap={18} size={1.5} color="#d8dbe2" />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>
      <LaneHeaderStrip />
    </div>
  );
}
