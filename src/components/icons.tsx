/** Small stroke icons (16/24 grid). One consistent style, no emoji. */
import type { SVGProps } from 'react';

const base = (props: SVGProps<SVGSVGElement>) => ({
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props,
});

export const ChevronDown = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M6 9l6 6 6-6" /></svg>
);
export const ChevronUp = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M18 15l-6-6-6 6" /></svg>
);
export const Plus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} strokeWidth={2.4}><path d="M12 5v14M5 12h14" /></svg>
);
export const Minus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} strokeWidth={2.4}><path d="M5 12h14" /></svg>
);
export const X = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} strokeWidth={2.4}><path d="M6 6l12 12M18 6L6 18" /></svg>
);
export const MoreH = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none">
    <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
  </svg>
);
export const ArrowRight = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const Maximize = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
);
export const BrandMark = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} strokeWidth={2.4}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
  </svg>
);
