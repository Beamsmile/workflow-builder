/**
 * Visual constants shared by the canvas, the swimlane layer and the exporters.
 * Colours follow the PEA flow style seen in the sample files:
 *   - Start / End  : green circle, white text
 *   - Process      : light-yellow rounded box, dark text
 *   - Decision     : yellow diamond
 *   - Application   : yellow flag/callout
 *   - Org tag      : solid red pill under a box
 */

export const COLORS = {
  startEnd: '#00B050',
  startEndText: '#ffffff',
  process: '#FFE599',
  processBorder: '#E6B800',
  decision: '#FFE599',
  decisionBorder: '#E6B800',
  application: '#FFD966',
  applicationBorder: '#D6A400',
  orgTag: '#D9342B',
  orgTagText: '#ffffff',
  text: '#1f2430',
  edge: '#5b6472',
  laneBorder: '#c9ced8',
  laneHeaderBg: '#f3f5f9',
  laneBandBg: '#e8ecf4',
} as const;

/** Fixed on-canvas size (flow px) for each node type – used for lane snapping. */
export const NODE_SIZE: Record<string, { width: number; height: number }> = {
  start: { width: 96, height: 96 },
  end: { width: 96, height: 96 },
  process: { width: 230, height: 92 },
  decision: { width: 190, height: 130 },
  application: { width: 170, height: 96 },
  connector: { width: 54, height: 54 },
};

/** Height (flow px) reserved at the top of the canvas for the lane band + headers. */
export const HEADER_HEIGHT = 76;

/** Default column widths (flow px). */
export const LANE_WIDTH = {
  meta: 150,
  org: 240,
} as const;
