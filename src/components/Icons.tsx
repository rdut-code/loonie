import type { CSSProperties } from 'react';

/** Line icons from the design file, as SVG path data. */
export const ICON = {
  arrow: 'M5 12h14M13 6l6 6-6 6',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  card: 'M3 7h18v10H3V7zM3 10.5h18M6.5 14h3',
  bank: 'M4 10l8-5 8 5M6 10v7M10 10v7M14 10v7M18 10v7M4 19h16',
  chevron: 'M6 9l6 6 6-6',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6v-9z',
  close: 'M6 6l12 12M18 6L6 18',
  groceries: 'M5 9h14l-1.5 10h-11L5 9zM9 9l3-5 3 5',
  dining: 'M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 2-2 6 0 8v10',
  transport: 'M4 16v-4l2-5h12l2 5v4M4 16h16M7 16v2M17 16v2M6 12h12',
  kids: 'M12 3a5 5 0 0 1 5 5c0 3-2.5 6-5 6s-5-3-5-6a5 5 0 0 1 5-5zM12 14c-2 3 2 4 0 7',
  health: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  shopping: 'M6 8h12l1 12H5L6 8zM9 8V7a3 3 0 0 1 6 0v1',
  phone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2',
  fun: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z',
  home: 'M4 11l8-7 8 7M6 10v10h12V10M10 20v-6h4v6',
  repeat: 'M4 9a8 8 0 0 1 14-3l2 2M20 15a8 8 0 0 1-14 3l-2-2M20 4v4h-4M4 20v-4h4',
  plane: 'M3 13l18-8-6 16-3-7-9-1z',
  bolt: 'M13 3L5 13h6l-1 8 8-10h-6l1-8z',
  glass: 'M7 3h10l-1 8a4 4 0 0 1-8 0L7 3zM12 15v6M9 21h6',
  tool: 'M14 6a4 4 0 0 0 5 5l-9 9-4-4 9-9zM5 19l1 1',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.500A4 4 0 0 1 19 10c0 5.500-7 10-7 10z',
  dots: 'M6 12h.5M12 12h.5M18 12h.5',
  swap: 'M4 8h14l-3-3M20 16H6l3 3',
  coins: 'M12 6c4 0 7 1 7 3s-3 3-7 3-7-1-7-3 3-3 7-3zM5 9v6c0 2 3 3 7 3s7-1 7-3V9',
} as const;

const CATEGORY_ICONS: Record<string, string> = {
  rent: ICON.home,
  'car-loan': ICON.transport,
  'car-insurance': ICON.lock,
  daycare: ICON.kids,
  utilities: ICON.bolt,
  'family-support': ICON.heart,
  groceries: ICON.groceries,
  dining: ICON.dining,
  transport: ICON.transport,
  kids: ICON.kids,
  health: ICON.health,
  shopping: ICON.shopping,
  'phone-internet': ICON.phone,
  subscriptions: ICON.repeat,
  travel: ICON.plane,
  vices: ICON.glass,
  irregular: ICON.tool,
  fun: ICON.fun,
  other: ICON.dots,
  'not-spending': ICON.swap,
  income: ICON.coins,
};

export function categoryIcon(id: string): string {
  return CATEGORY_ICONS[id] ?? ICON.dots;
}

export function Icon({ path, size = 22, style }: { path: string; size?: number; style?: CSSProperties }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true" style={{ width: size, height: size, ...style }}>
      <path d={path} />
    </svg>
  );
}

/** The ten-piece confetti burst from the design. */
export function Confetti() {
  return (
    <span className="burst" aria-hidden="true">
      <i /><i /><i /><i /><i /><i /><i /><i /><i /><i />
    </span>
  );
}
