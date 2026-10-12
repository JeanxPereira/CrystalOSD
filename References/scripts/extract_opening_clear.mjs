// What the "clear" sprites of vif1SetFramebuffer(.., clear = 1) cover. The helper sends, after FRAME_1
// and SCISSOR_1, TEST_1 0x30000 (depth always), PRIM 6 (an untextured sprite, context 1), RGBAQ 0
// and two corners XYZF2 (0, 0) and (W x 16, H x 16): primitive coordinates 0..W, 0..H. The GS
// takes a vertex's window position as the primitive coordinate minus XYOFFSET_1 and draws only the
// pixels inside SCISSOR_1. This walks every packet of a trace, keeps the XYOFFSET_1, SCISSOR_1 and
// FRAME_1 in effect, and for each such sprite reports the window rectangle and how many of its
// pixels fall inside the scissor.
//
// node extract_opening_clear.mjs <trace.jsonl> ...
import { readTrace } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/trace.js';
import { GifPath } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/gif.js';

const REG = { PRIM: 0, RGBAQ: 1, XYZF2: 4, XYOFFSET: 0x18, SCISSOR: 0x40, FRAME: 0x4c, TEST: 0x47 };

export function clears(traceFile) {
  const trace = readTrace(traceFile);
  const state = { offset: 0n, scissor: 0n, frame: 0n };
  const found = [];
  for (const [n, packet] of trace.packets.entries()) {
    const writes = [...new GifPath().feed(packet.bytes)].filter((event) => event.kind === 'write');
    for (let i = 0; i < writes.length; i++) {
      const w = writes[i];
      if (w.reg === REG.XYOFFSET) state.offset = w.value;
      else if (w.reg === REG.SCISSOR) state.scissor = w.value;
      else if (w.reg === REG.FRAME) state.frame = w.value;
      else if (w.reg === REG.PRIM && w.value === 6n && writes[i + 1]?.reg === REG.RGBAQ && writes[i + 2]?.reg === REG.XYZF2 && writes[i + 2].value === 0n && writes[i + 3]?.reg === REG.XYZF2) {
        const corner = writes[i + 3].value;
        const ox = Number(state.offset & 0xffffn), oy = Number((state.offset >> 32n) & 0xffffn);
        const x0 = (0 - ox) / 16, y0 = (0 - oy) / 16;
        const x1 = (Number(corner & 0xffffn) - ox) / 16, y1 = (Number((corner >> 16n) & 0xffffn) - oy) / 16;
        const sc = [0n, 16n, 32n, 48n].map((s) => Number((state.scissor >> s) & 0x7ffn));
        // Pixels whose centres lie in [x0, x1) x [y0, y1) and inside [SCAX0, SCAX1] x [SCAY0, SCAY1].
        const wide = Math.max(0, Math.min(Math.ceil(x1), sc[1] + 1) - Math.max(Math.ceil(x0), sc[0]));
        const high = Math.max(0, Math.min(Math.ceil(y1), sc[3] + 1) - Math.max(Math.ceil(y0), sc[2]));
        found.push({ packet: n, frame: state.frame, window: [x0, y0, x1, y1], scissor: sc, pixels: wide * high });
      }
    }
  }
  return found;
}

if (process.argv[1] && process.argv[1].endsWith('extract_opening_clear.mjs')) {
  for (const file of process.argv.slice(2)) {
    const list = clears(file);
    const kinds = new Map();
    for (const c of list) {
      const key = `FRAME_1 0x${c.frame.toString(16)} window ${c.window.join(',')} scissor ${c.scissor.join(',')} pixels drawn ${c.pixels}`;
      kinds.set(key, (kinds.get(key) ?? 0) + 1);
    }
    console.log(`${file}: ${list.length} clear sprites`);
    for (const [key, count] of kinds) console.log(`  x${count}  ${key}`);
  }
}
