// The Browser's Format dialog on a card slot that reports no format: the logic of HDD OSD 1.10U 0x255C18 (state, Yes/No cursor, sounds,
// the format job and the rescan request) and what the render 0x255868 draws in each state.
const FORMAT_LEFT = 0x8000;
const FORMAT_RIGHT = 0x2000;
const FORMAT_CROSS = 0x20;
const FORMAT_CIRCLE = 0x40;

// 0x255C18: one call of the Format dialog's logic. `edge` is the pad's new presses.
export function formatStep({ state, cursor, edge, busy, result }) {
  const out = { state, cursor, dialog: 1, sounds: [], job: false, rescan: false, clearBit: false };
  if (state === 1) { out.cursor = 0; out.state = 2; state = 2; }
  if (state === 2) {
    if ((edge & FORMAT_LEFT) !== 0 && out.cursor === 0) { out.sounds.push(6); out.cursor = 1; }
    if ((edge & FORMAT_RIGHT) !== 0 && out.cursor === 1) { out.sounds.push(6); out.cursor = 0; }
    if ((edge & FORMAT_CROSS) !== 0) {
      out.sounds.push(4);
      if (out.cursor === 1) { out.job = true; out.state = 3; } else { out.state = 0; out.dialog = 0; }
    } else if ((edge & FORMAT_CIRCLE) !== 0) {
      out.sounds.push(0xa);
      out.state = 0;
      out.dialog = 0;
    }
    return out;
  }
  if (state === 3) {
    if (busy !== 0) return out;
    out.rescan = true;
    if (result === 0) { out.sounds.push(9); out.state = 4; out.clearBit = true; } else { out.sounds.push(0xb); out.state = 5; }
    return out;
  }
  if ((state === 4 || state === 5) && (edge & FORMAT_CIRCLE) !== 0) { out.state = 0; out.dialog = 0; }
  return out;
}

// 0x255868: what the dialog draws in a state: the OSD string ids in order, the heights, and the colours of Yes and No.
export function formatDraw({ state, cursor }) {
  if (state === 1 || state === 2) return { ids: [0x4a, 0x4b, 0x31, 0x32], heights: [0x59, 0x6a, 0x80], colours: [cursor === 1 ? 2 : 4, cursor === 1 ? 4 : 2] };
  if (state === 3) return { ids: [0x4c, 0x4d], heights: [0x5f, 0x70], colours: null };
  if (state === 4) return { ids: [0x4e], heights: [0x68], colours: null };
  if (state === 5) return { ids: [0x4f], heights: [0x68], colours: null };
  return null;
}
