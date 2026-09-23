/**
 * Visual constants shared by the SVG diagram, the layout engine and the image
 * exporter. Colours follow the PEA flow style:
 *   - Start / End : green circle, white text
 *   - Process     : light-yellow rounded box
 *   - Decision    : yellow diamond
 *   - Connector   : white circle with a letter
 *   - Org tag     : solid red pill under a box
 */
import type { StepType } from './types';

export const COLORS = {
  startEnd: '#00b050',
  startEndBorder: '#009448',
  startEndText: '#ffffff',
  process: '#ffe599',
  processBorder: '#e6b800',
  decision: '#ffe599',
  decisionBorder: '#e6b800',
  connector: '#ffffff',
  connectorBorder: '#5b6472',
  orgTag: '#d9342b',
  orgTagText: '#ffffff',
  nodeText: '#1f2430',
  edge: '#5b6472',
  laneEven: '#ffffff',
  laneOdd: '#f8f9fb',
  laneMeta: '#f4f6fa',
  metaText: '#2b3038',
  laneBorder: '#dfe3ea',
  headerBg: '#f1f3f7',
  bandBg: '#e5e9f2',
  headerText: '#3a4256',
  selected: '#4f46e5',
} as const;

/** Side (meta) column: fixed width, centred text per step row. */
export const META = {
  width: 152,
  maxChars: 15,
  fontSize: 11,
  weight: 500,
  /** width of a meta column that holds no data and has been collapsed away */
  collapsedW: 26,
} as const;

/** Fixed size (px) for the round shapes. Process / decision size to their text. */
export const ROUND_SIZE: Record<'start' | 'end' | 'connector', number> = {
  start: 50,
  end: 50,
  connector: 44,
};

/**
 * Per-type text-wrapping + box-sizing rules. No line cap — the box grows to
 * fit every line, so `maxChars` is really "chars per line".
 */
export const BOX: Record<StepType, { width: number; maxChars: number; fontSize: number }> = {
  start: { width: 52, maxChars: 8, fontSize: 12 },
  end: { width: 52, maxChars: 8, fontSize: 12 },
  connector: { width: 46, maxChars: 3, fontSize: 14 },
  process: { width: 238, maxChars: 28, fontSize: 12.5 },
  // decision text lives in the middle of a rhombus, so it wraps narrower and
  // the diamond gets extra height to keep the wide lines clear of the slanted edges
  decision: { width: 214, maxChars: 14, fontSize: 11.5 },
};

/** Font weight for the label text inside a flow box (make it stand out). */
export const LABEL_WEIGHT = 600;

/** Wrapping for the red org-label tag under a box. */
export const ORG_TAG = { maxChars: 32, fontSize: 9.5 } as const;

/** Layout geometry (px). */
export const LAYOUT = {
  /** left gutter that shows the step number */
  gutter: 54,
  /** padding inside a lane, each side of the box area */
  lanePad: 30,
  /** box-area width of a normal used org lane (staggered lanes grow — see layout) */
  laneContentW: 320,
  /** horizontal stagger for a box reached by an extra decision branch (same lane) */
  boxOffset: 92,
  /** width of a lane that has no steps and no routed edges */
  emptyLaneW: 124,
  /** gap between the box area and the first routing channel */
  channelGap: 14,
  /** width of one routing channel (a lane widens by this per channel it needs) */
  channelW: 16,
  /** never widen a lane past this many channels */
  maxChannels: 8,
  /** band strip height */
  bandHeight: 26,
  /** lane-header strip height (under the band) */
  laneHeadHeight: 30,
  /** vertical gap between one row's content and the next row's box */
  rowVGap: 58,
  /** top padding before the first row */
  rowTop: 30,
  /** bottom padding after the last row */
  rowBottom: 56,
  /** gap before the first loop-back channel, right of all lanes */
  loopGap: 12,
  /** right margin when there are no loop-back edges */
  loopMargin: 28,
} as const;

export const HEADER_HEIGHT = LAYOUT.bandHeight + LAYOUT.laneHeadHeight;

export const TYPE_LABEL: Record<StepType, string> = {
  start: 'Start',
  process: 'Process',
  decision: 'Decision',
  connector: 'Connector',
  end: 'End',
};
