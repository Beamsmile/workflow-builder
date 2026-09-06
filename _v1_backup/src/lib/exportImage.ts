/**
 * Export the flow as a PNG or SVG image – handy as a reference to rebuild the
 * diagram in Canva, or to drop straight into a slide.
 *
 * Based on the React Flow "download image" recipe: we compute the bounding box
 * of all nodes, then render the `.react-flow__viewport` element at a transform
 * that fits that box.
 */
import { getNodesBounds, getViewportForBounds, type Node } from '@xyflow/react';
import { toPng, toSvg } from 'html-to-image';
import { triggerDownload } from './persistence';
import { NODE_SIZE } from '../domain/theme';

/** Ensure every node has a size so getNodesBounds works even before measuring. */
function withSizes(nodes: Node[]): Node[] {
  return nodes.map((n) => {
    const fallback = NODE_SIZE[n.type ?? 'process'] ?? { width: 200, height: 90 };
    return {
      ...n,
      measured: {
        width: n.measured?.width ?? fallback.width,
        height: n.measured?.height ?? fallback.height,
      },
    };
  });
}

const PADDING = 60;
const MAX = 4096;

async function renderViewport(
  nodes: Node[],
  format: 'png' | 'svg',
): Promise<Blob | null> {
  const viewport = document.querySelector<HTMLElement>('.react-flow__viewport');
  if (!viewport || nodes.length === 0) {
    alert('ยังไม่มีกล่องให้ export');
    return null;
  }

  const bounds = getNodesBounds(withSizes(nodes));
  const width = Math.min(MAX, Math.ceil(bounds.width) + PADDING * 2);
  const height = Math.min(MAX, Math.ceil(bounds.height) + PADDING * 2);
  const { x, y, zoom } = getViewportForBounds(bounds, width, height, 0.2, 2, PADDING);

  const style = {
    width: `${width}px`,
    height: `${height}px`,
    transform: `translate(${x}px, ${y}px) scale(${zoom})`,
  };
  const options = {
    backgroundColor: '#ffffff',
    width,
    height,
    style,
    filter: (el: HTMLElement) => {
      const cls = el.classList;
      if (!cls) return true;
      // hide UI chrome and the lane label strip in the exported image
      return !(
        cls.contains('react-flow__minimap') ||
        cls.contains('react-flow__controls') ||
        cls.contains('react-flow__background') ||
        cls.contains('react-flow__attribution') ||
        cls.contains('react-flow__panel') ||
        cls.contains('lane-header-strip')
      );
    },
  };

  const dataUrl = format === 'png' ? await toPng(viewport, options) : await toSvg(viewport, options);
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function exportPng(nodes: Node[], fileStem: string) {
  const blob = await renderViewport(nodes, 'png');
  if (blob) triggerDownload(blob, `${fileStem}.png`);
}

export async function exportSvg(nodes: Node[], fileStem: string) {
  const blob = await renderViewport(nodes, 'svg');
  if (blob) triggerDownload(blob, `${fileStem}.svg`);
}
