/**
 * Custom React Flow node components – one per shape in the PEA flow style.
 * They only render; all editing happens in the DetailsPanel.
 */
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { AppNode } from '../store';
import { NODE_SIZE } from '../domain/theme';

function OrgTag({ text }: { text?: string }) {
  if (!text) return null;
  return <div className="org-tag">{text}</div>;
}

/** Small round connection points on all four sides. */
function Ports({ withSides = true }: { withSides?: boolean }) {
  return (
    <>
      <Handle type="target" position={Position.Top} id="t" />
      <Handle type="source" position={Position.Bottom} id="b" />
      {withSides && (
        <>
          <Handle type="target" position={Position.Left} id="l" />
          <Handle type="source" position={Position.Right} id="r" />
        </>
      )}
    </>
  );
}

export function StartEndNode({ data, selected }: NodeProps<AppNode>) {
  const size = NODE_SIZE[data.kind];
  return (
    <div
      className={`node start-end ${selected ? 'is-selected' : ''}`}
      style={{ width: size.width, height: size.height }}
    >
      <Handle type="target" position={Position.Top} id="t" />
      <Handle type="source" position={Position.Bottom} id="b" />
      <span>{data.label || (data.kind === 'start' ? 'Start' : 'End')}</span>
    </div>
  );
}

export function ProcessNode({ data, selected }: NodeProps<AppNode>) {
  const size = NODE_SIZE.process;
  return (
    <div className="node-wrap" style={{ width: size.width }}>
      <div
        className={`node process ${selected ? 'is-selected' : ''}`}
        style={{ minHeight: size.height }}
      >
        <Ports />
        <div className="node-label">{data.label || 'ขั้นตอน'}</div>
      </div>
      <OrgTag text={data.orgLabel} />
    </div>
  );
}

export function DecisionNode({ data, selected }: NodeProps<AppNode>) {
  const size = NODE_SIZE.decision;
  return (
    <div className="node-wrap" style={{ width: size.width }}>
      <div
        className={`node decision ${selected ? 'is-selected' : ''}`}
        style={{ width: size.width, height: size.height }}
      >
        <Handle type="target" position={Position.Top} id="t" />
        <Handle type="source" position={Position.Bottom} id="b" />
        <Handle type="source" position={Position.Left} id="l" />
        <Handle type="source" position={Position.Right} id="r" />
        <div className="diamond" />
        <div className="node-label decision-label">{data.label || 'จุดตัดสินใจ'}</div>
      </div>
      <OrgTag text={data.orgLabel} />
    </div>
  );
}

export function ApplicationNode({ data, selected }: NodeProps<AppNode>) {
  const size = NODE_SIZE.application;
  return (
    <div
      className={`node application ${selected ? 'is-selected' : ''}`}
      style={{ width: size.width, minHeight: size.height }}
    >
      <Handle type="source" position={Position.Right} id="r" />
      <Handle type="target" position={Position.Left} id="l" />
      <div className="node-label">{data.label || 'ระบบงาน'}</div>
    </div>
  );
}

export function ConnectorNode({ data, selected }: NodeProps<AppNode>) {
  const size = NODE_SIZE.connector;
  return (
    <div
      className={`node connector ${selected ? 'is-selected' : ''}`}
      style={{ width: size.width, height: size.height }}
    >
      <Ports />
      <span>{data.label || 'A'}</span>
    </div>
  );
}

export const nodeTypes = {
  start: StartEndNode,
  end: StartEndNode,
  process: ProcessNode,
  decision: DecisionNode,
  application: ApplicationNode,
  connector: ConnectorNode,
};
