// The Browser's device row: what the scan stores per memory card slot, the title ids, the page layout
// and item positions, the selection pulse and the Left/Right cursor, as the HDD OSD 1.10U computes them
// (addresses in facts/browser-devices.md). Floats are the EE's: every result cut toward zero.
import { add, mul, f } from '../lib/ee-float.mjs';

const s32 = (v) => v | 0;

// 0x2493A8: the kilobytes the Browser keeps for a slot, from the library's type (2: a PS2 card, 0: none) and free count; null where no capture reaches.
export function isFirstSlot(type, free) {
  if (type === 2) return Math.max(s32(free) - 2, 0);
  if (type === 0 && free === 0) return 0;
  return null;
}

// 0x24B940 loop: what slot i's three arrays hold after the scan stores it; null where no capture reaches.
export function scanStore({ type, free, format, multitap }) {
  const kb = isFirstSlot(type, free);
  if (kb === null || (type !== 0 && multitap === 1)) return null;
  return { type, kb, formatted: format !== 0 ? 1 : 0 };
}

// 0x253D38: the text ids concatenated for device `dev` (0 the root, 1 the HDD, 2..9 the card slots) of card type `type`; null where no capture reaches.
export function titleIds(dev, type, rom = false) {
  if (dev >= 2 && dev <= 9) return type === 2 ? [(rom ? 0x95 : 0x8a), 7 + ((dev - 2) >> 2)] : null;
  if (dev === 0) return [6];
  if (dev === 1 && !rom) return [0x1a1];
  return null;
}

// 0x2551B0: columns, rows and the three floats of a page of `count - first` items (fewer than 5, no scrolling); null otherwise.
export function pageLayout({ count, first, scrollTop }) {
  const n = count - first;
  if (scrollTop !== 0 || n >= 5) return null;
  const cols = n >= 2 ? 2 : 1;
  const rows = Math.max(Math.trunc((n + cols - 1) / cols), 1);
  return {
    cols,
    rows,
    f0: mul(add(mul(f(cols), 24), 6), 0.5),
    f4: mul(add(mul(f(rows), 24), 4), 0.5),
    d8: add(mul(f(rows - 1), 40), 160),
  };
}

// 0x257860: the grid position of item `index` on a page with `cols` columns.
export function itemPosition({ index, cols, f0, f4 }) {
  const col = index % cols;
  const row = Math.trunc(index / cols);
  const x = add(mul(f(col), 24), add(add(-f0, 3), 12));
  const y = add(mul(f(row), 24), add(add(-f4, 2), 12));
  return { x, y };
}

// 0x259B14: the selection phase of the next call.
export function nextPhase(phase, step) {
  const sum = add(phase, step);
  return sum >= 1048576 ? null : sum;
}

const LEFT = 0x8000;
const RIGHT = 0x2000;
const UP = 0x1000;
const DOWN = 0x4000;
const EDGE_KEYS = 0x70;

// 0x254840: the cursor after one frame of the grid page's input, for Left and Right on an NTSC page without scrolling.
// `modelled` is false for a frame the model does not cover (an edge key, Up or Down, a scroll, the other video mode or a leave).
export function cursorStep(s) {
  const same = { cursor: s.cursor, modelled: true, sound: false };
  if (s.pal !== 0) return { ...same, modelled: false };
  if (s.dialog !== 0 || s.pageIn !== 0x1a || s.hold === 1 || s.slide !== 0 || s.slideB !== 0) return same;
  if ((s.edge & EDGE_KEYS) !== 0) return { ...same, modelled: false };
  if (s.recCount === 0 || s.listCount === 0 || s.busy !== 0) return same;
  if (s.mode === 2 || s.scrollTop !== 0) return { ...same, modelled: false };
  if ((s.repeat & (UP | DOWN)) !== 0) return { ...same, modelled: false };
  const last = Math.min(s.recCount, s.listCount) - 1;
  const cursor = s.cursor;
  if (s.repeat & LEFT) {
    if (cursor === s.first) return s.device === 0 ? same : { ...same, modelled: false };
    return { cursor: cursor - 1, modelled: true, sound: true };
  }
  if (s.repeat & RIGHT) {
    if (cursor >= last) return same;
    return { cursor: cursor + 1, modelled: true, sound: true };
  }
  return same;
}

// 0x2516F0: the id of the centred status line of a page ('No data.' 0x50, 'Unformatted' 0x51) and its fade alpha, NTSC.
export function statusLine({ flags, device, empty, pageIn, pal, mode, slide }) {
  if (pal !== 0 || (mode === 2 && slide > 0)) return null;
  const id = device !== 0 && (flags & 8) !== 0 ? 0x51 : 0x50;
  const ramp = Math.trunc((100 * empty) / 60);
  return { id, alpha: Math.trunc((ramp * (pageIn - 10)) / (0x1a - 10)) };
}

// 0x253FA0: the format id, its two numbers and the exit that prints a free count of `kb` kilobytes (under 10000).
export function freeText(kb) {
  if (kb >= 10000) return null;
  if (kb >= 1000) return { id: 0x2f, args: [Math.trunc(kb / 1000), kb % 1000], exit: 0x254090 };
  return { id: 0x2e, args: [kb, null], exit: 0x2540b8 };
}
