// The flat draws of the opening intro (HDD OSD 1.10U), recomputed from their arguments and
// compared packet by packet, write by write:
//
//   func_0021D3D0(n, which, field)   the dive blur: n round trips through the extra buffer
//   func_0021CF38()                  the frame copied into the store at half width
//   func_0021D848(mode, alpha)       the fade rectangle ('B' black, 'W' white)
//   func_0021D6C0()                  the letterbox bars
//
// Each call sends one packet per helper call (vif1Set*: 0x0021BA60..0x0021CF30):
//   XYOffset(on, field)  XYOFFSET_1 = (2048 - W/2) x 16, (2048 - H/2) x 16 (+ 8 when on and field)
//   ZWrite(on)           ZBUF_1 = depth buffer, 24-bit, mask set when off
//   ZTest(on)            TEST_1 = 0x30000 (always) or 0x50000 (greater or equal)
//   AlphaBlend(on, mode, fix)   PABE, ALPHA_1 from the mode table at 0x002B0CC0
//   Framebuffer(address, psm, W, H, clear)   FRAME_1, SCISSOR_1 and, when clear is 1, a sprite
//   CLAMP_1(...)   AD(register, value)   TexRect   FlatRect
//
// ROM 2.30 (OPENING_BUILD=rom, on a trace rewritten by extract_opening_rom_trace.mjs): the fade
// and the bars are the same code; the blur (ROM 0x00218A00) and the frame copy (ROM 0x00218590)
// are the same but for one call, CLAMP_1(0), which only HDD OSD makes.
//
// [OPENING_BUILD=rom] node verify_opening_flat.mjs <trace.jsonl>
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { GifPath } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/gif.js';
import { f, toInt } from '../model/opening-lib.mjs';

const SCREEN = '0x001f0ca0:0x1c', MODES = '0x002b0cc0:0xb0';
export const PROBES = [
  { pc: '0x0021d3d0', ranges: ['0x00365118:0x10', SCREEN, '0x002b0c40:0x10', MODES] },
  { pc: '0x0021cf38', ranges: ['0x00365118:0x10', SCREEN, '0x002b0c40:0x10', '0x00370000:0x4'] },
  { pc: '0x0021d848', ranges: ['a0:0x1', '0x00365138:0x20', SCREEN, MODES] },
  { pc: '0x0021d6c0', ranges: ['0x00365128:0x10', SCREEN, '0x00370030:0x8', MODES] },
];
const [BLUR, COPY, FADE, BARS] = PROBES.map((probe) => parseInt(probe.pc, 16));
export const ROM = { '0x0021d3d0': { pc: '0x00218a00' }, '0x0021cf38': { pc: '0x00218590' } };
const HDD = process.env.OPENING_BUILD !== 'rom';
const REG = { PRIM: 0, RGBAQ: 1, UV: 3, XYZF2: 4, XYZ2: 5, TEX0: 6, CLAMP: 8, TEX1: 0x14, XYOFFSET: 0x18, SCISSOR: 0x40, ALPHA: 0x42, TEST: 0x47, PABE: 0x49, FRAME: 0x4c, ZBUF: 0x4e };
const big = (x) => BigInt.asUintN(64, BigInt(x));
const ints = (buffer, at = 0) => [0, 4, 8, 12].map((o) => buffer.readInt32LE(at + o));
const half = (x) => (x + (x >>> 31)) >> 1;
const blocks = (x) => (x < 0 ? x + 0x3f : x) >> 6;

/** The helpers, each returning the writes of its one packet. */
function helpers(width, height, modes) {
  const ox = 0x800 - half(width), oy = 0x800 - half(height);
  const depth = big((blocks(width * height) << 1) >> 5) | 0x31000000n;
  const colourOf = (c) => big(c[0] | (c[1] << 8) | (c[2] << 16)) | (big(c[3]) << 24n) | (0xfe00n << 46n);
  return {
    offset: (on, field) => [[REG.XYOFFSET, big(ox << 4) | (big((oy << 4) + (on && field ? 8 : 0)) << 32n)]],
    zwrite: (on) => [[REG.ZBUF, on ? depth : depth | (1n << 32n)]],
    ztest: (on) => [[REG.TEST, on ? 0x50000n : 0x30000n]],
    blend: (on, mode, fix) => {
      const [a, b, c, d] = ints(modes, mode * 16);
      return [[REG.PABE, on < 1 ? 1n : 0n], [REG.ALPHA, big(a | (b << 2) | (c << 4) | (d << 6)) | (big(fix) << 32n)]];
    },
    clamp: () => (HDD ? [[[REG.CLAMP, 0n]]] : []),
    ad: (register, value) => [[register, big(value)]],
    frame: (address, psm, clear) => {
      const writes = [[REG.FRAME, (big(address) >> 5n) | (big((width >> 6) & 0x3f) << 16n) | (big(psm & 0xf) << 24n)],
        [REG.SCISSOR, (big(width - 1) << 16n) | (big(height - 1) << 48n)]];
      if (clear === 1) writes.push([REG.TEST, 0x30000n], [REG.PRIM, 6n], [REG.RGBAQ, 0xfe00n << 46n], [REG.XYZF2, 0n],
        [REG.XYZF2, big(width << 4) | (big(height << 4) << 16n)], [REG.TEST, 0x50000n]);
      return writes;
    },
    textured: (place, source, colour, blended, z) => [
      [REG.PRIM, big((blended << 6) | 0x116)], [REG.RGBAQ, colourOf(colour)],
      [REG.UV, big(source[0] * 16 + 8) | (big(source[1] * 16 + 8) << 16n)],
      [REG.XYZ2, big((place[0] + ox) << 4) | (big((place[1] + oy) << 4) << 16n) | (big(z) << 32n)],
      [REG.UV, big((source[0] + source[2]) << 4) | (big((source[1] + source[3]) << 4) << 16n)],
      [REG.XYZ2, big(((place[0] + ox + place[2]) << 4) - 8) | (big(((place[1] + oy + place[3]) << 4) - 8) << 16n) | (big(z) << 32n)],
    ],
    flat: (rect, colour, blended, z) => [
      [REG.PRIM, big((blended << 6) | 6)], [REG.RGBAQ, colourOf(colour)],
      [REG.XYZ2, big((rect[0] + ox) << 4) | (big((rect[1] + oy) << 4) << 16n) | (big(z) << 32n)],
      [REG.XYZ2, big(((rect[0] + ox + rect[2]) << 4) - 1) | (big(((rect[1] + oy + rect[3]) << 4) - 1) << 16n) | (big(z) << 32n)],
    ],
  };
}

/** The packets one call sends, by the probed function. */
export function expect(probe) {
  const m = probe.mem.map((range) => range.bytes);
  if (probe.pc === BLUR) {
    const [colourBytes, screen, buffers, modes] = m;
    const width = screen.readInt32LE(0x14), height = screen.readInt32LE(0x18);
    const h = helpers(width, height, modes);
    const n = probe.gpr[4] | 0, which = probe.gpr[5], field = probe.gpr[6];
    const colour = ints(colourBytes), full = [0, 0, width, height];
    const here = which !== 0 ? 0 : blocks(width * height), extra = buffers.readUInt32LE(0);
    const tex = (address) => big(address) | (big(blocks(width)) << 14n) | (0xc500n << 19n);
    const packets = [h.offset(0, field), h.zwrite(0), h.ztest(0), h.blend(0, 0, 0), ...h.clamp(), h.ad(REG.TEX1, 0x60)];
    for (let i = 0; i < n; i++) {
      const shrink = i * (n - 1);
      const small = [0, 0, (((width * 7) < 0 ? width * 7 + 7 : width * 7) >> 3) - 1 - shrink, (((height * 7) < 0 ? height * 7 + 7 : height * 7) >> 3) - 1 - shrink];
      packets.push(h.frame(extra, 0, 1), h.ad(REG.TEX0, tex(here)), h.textured(small, full, colour, 0, 0xffffff),
        h.frame(here, 0, 1), h.ad(REG.TEX0, tex(extra)), h.textured(full, small, colour, 0, 0xffffff));
    }
    packets.push(h.ztest(1), h.zwrite(1), h.offset(1, field));
    return { name: 'blur', packets, detail: n };
  }
  if (probe.pc === COPY) {
    const [colourBytes, screen, buffers, counter] = m;
    const width = screen.readInt32LE(0x14), height = screen.readInt32LE(0x18), field = screen.readInt32LE(4);
    const h = helpers(width, height, null);
    const odd = counter.readUInt32LE(0) & 1;
    const here = odd ? 0 : blocks(width * height);
    const store = buffers.readBigUInt64LE(8);
    return { name: 'frame copy', packets: [h.offset(0, field), h.zwrite(0), h.frame(store, 0, 1), ...h.clamp(),
      h.ad(REG.TEX0, 0x668028000n | big(here)), h.ad(REG.TEX1, 0x60),
      h.textured([0, 0, half(width), height], [0, 0, width, height], ints(colourBytes), 0, 0xffffff),
      h.frame(here, 0, 1), h.zwrite(1), h.offset(1, field)] };
  }
  if (probe.pc === FADE) {
    const [mode, table, screen, modes] = m;
    const width = screen.readInt32LE(0x14), height = screen.readInt32LE(0x18);
    const h = helpers(width, height, modes);
    const alpha = probe.gpr[5] >>> 0 < 0x81 ? probe.gpr[5] : 0x80;
    const rect = [table.readInt32LE(0), table.readInt32LE(4), width, height];
    const packets = [h.ztest(0), h.zwrite(0), h.blend(1, 4, 0)];
    if (mode[0] === 0x57) packets.push(h.flat(rect, [...ints(table, 0x10).slice(0, 3), alpha], 1, 0xffffff));
    else if (mode[0] === 0x42) packets.push(h.flat(rect, [0, 0, 0, alpha], 1, 0xffffff));
    packets.push(h.zwrite(1), h.ztest(1));
    return { name: 'fade rectangle', packets, detail: `${String.fromCharCode(mode[0])} ${alpha}` };
  }
  const [colourBytes, screen, shape, modes] = m;
  const width = screen.readInt32LE(0x14), height = screen.readInt32LE(0x18), field = screen.readInt32LE(4);
  const h = helpers(width, height, modes);
  const open = toInt(f(f(f(width * 9) * shape.readFloatLE(4)) / f(shape.readFloatLE(0) * 16)));
  const bar = half(height - open + 1);
  const colour = ints(colourBytes);
  return { name: 'letterbox bars', detail: `${bar} rows above and below ${open}`, packets: [h.offset(1, field), h.ztest(0), h.zwrite(0), h.blend(1, 1, 0x80),
    h.flat([0, 0, width, bar], colour, 1, 0xffffff), h.flat([0, bar + open, width, bar], colour, 1, 0xffffff), h.zwrite(1), h.ztest(1)] };
}

export function verify(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const result = { kinds: {}, problems: [] };
  const problem = (text) => { if (result.problems.length < 14) result.problems.push(text); };
  const writesOf = (packet) => [...new GifPath().feed(packet.bytes)].filter((event) => event.kind === 'write');
  const wanted = new Set([BLUR, COPY, FADE, BARS]);
  for (const probe of trace.probes) {
    if (probe.preroll || !wanted.has(probe.pc)) continue;
    if (probe.mem.some((range) => !range.bytes)) { problem(`frame ${probe.frame}: a probed range was not readable`); continue; }
    const made = expect(probe);
    if (probe.at + made.packets.length > trace.packets.length) continue;
    const tally = (result.kinds[made.name] ??= { calls: 0, packets: [0, 0], writes: [0, 0], details: new Map() });
    tally.calls += 1;
    if (made.detail !== undefined) tally.details.set(made.detail, (tally.details.get(made.detail) ?? 0) + 1);
    made.packets.forEach((expected, i) => {
      const sent = writesOf(trace.packets[probe.at + i]);
      tally.packets[1] += 1;
      tally.writes[1] += expected.length;
      let equal = sent.length === expected.length, bad = null;
      expected.forEach(([reg, value], w) => { if (sent[w] && sent[w].reg === reg && sent[w].value === value) tally.writes[0] += 1; else { equal = false; bad ??= w; } });
      if (equal) tally.packets[0] += 1;
      else problem(`frame ${probe.frame} ${made.name} packet ${i}: ${sent.length} writes sent, ${expected.length} computed${bad === null ? '' : `; write ${bad}: sent ${sent[bad] ? `reg 0x${sent[bad].reg.toString(16)} = 0x${sent[bad].value.toString(16)}` : 'nothing'}, computed reg 0x${expected[bad][0].toString(16)} = 0x${expected[bad][1].toString(16)}`}`);
    });
  }
  return result;
}

if (process.argv[1] && process.argv[1].endsWith('verify_opening_flat.mjs')) {
  const result = verify(process.argv[2]);
  let total = 0;
  for (const [name, t] of Object.entries(result.kinds)) {
    total += t.calls;
    console.log(`${name.padEnd(16)} ${t.calls} calls   packets ${t.packets[0]} of ${t.packets[1]} equal   writes ${t.writes[0]} of ${t.writes[1]}`);
    if (t.details.size > 0 && t.details.size <= 12) console.log(`    ${[...t.details].map(([k, n]) => `${k}: ${n}`).join('   ')}`);
    else if (t.details.size > 12) console.log(`    ${t.details.size} distinct arguments`);
  }
  for (const text of result.problems) console.log(`  ! ${text}`);
  const whole = total > 0 && result.problems.length === 0;
  console.log(`verdict: ${whole ? `FOUND ${total} flat draws of the opening, every write equal` : 'PARTIAL see the lines marked !'}`);
  process.exit(whole ? 0 : 3);
}
