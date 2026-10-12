// verify_opening_overlays.mjs with the video mode: in PAL func_0021D990 takes the logo's two rectangles
// 0x20 bytes further into D_00365158 (sltu s1, zero, is_pal; sll s1, 5 at 0x0021DA10..0x0021DA20).
// Two flat draws of the opening intro (HDD OSD 1.10U), recomputed and compared write by write:
// the ghost of the previous frame laid over the new one (func_0021D140, 0x0021D140) and the
// "Sony Computer Entertainment" logo (func_0021D990, 0x0021D990). NTSC only: in PAL the logo's
// rectangles come from the second half of its table.
//
//   0x0021D140  entry: a0 blend on, a1 blend mode, a2 fixed alpha, a3 z, t0 grey level
//   0x0021D990  entry: a2 = alpha
//
// node verify_opening_overlays.mjs <trace.jsonl>
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { GifPath } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/gif.js';
import { PAL } from './builds.mjs';

export const PROBES = [
  { pc: '0x0021d140', ranges: ['0x002b0c40:0x10', '0x001f0ca0:0x1c', '0x002b0cc0:0xb0'] },
  { pc: '0x0021d990', ranges: ['0x00365158:0x40', '0x003653a8:0x10', '0x001f0ca0:0x1c', '0x002b0cc0:0xb0'] },
];
const [GHOST, LOGO] = PROBES.map((probe) => parseInt(probe.pc, 16));
const REG = { PRIM: 0, RGBAQ: 1, UV: 3, XYZ2: 5, TEX0: 6, CLAMP: 8, TEX1: 0x14, ALPHA: 0x42, TEST: 0x47, PABE: 0x49, ZBUF: 0x4e };
const big = (x) => BigInt.asUintN(64, BigInt(x));

/** pktSetAlphaBlend (0x0021B9C8): PABE off when blending is on; the mode's selectors and the fixed alpha. */
function blend(modes, on, mode, fix) {
  const [a, b, c, d] = [0, 4, 8, 12].map((o) => modes.readInt32LE(mode * 16 + o));
  return [[REG.PABE, on < 1 ? 1n : 0n], [REG.ALPHA, big(a | (b << 2) | (c << 4) | (d << 6)) | (big(fix) << 32n)]];
}
/** pktSetTexRect (0x0021B7A0): a textured sprite; half a texel in at the first corner, half a pixel in at the second. */
function rectangle(place, source, colour, blended, z, width, height) {
  const ox = 0x800 - (width >> 1), oy = 0x800 - (height >> 1);
  return [
    [REG.PRIM, big((blended << 6) | 0x116)],
    [REG.RGBAQ, big(colour[0] | (colour[1] << 8) | (colour[2] << 16)) | (big(colour[3]) << 24n) | (0xfe00n << 46n)],
    [REG.UV, big(source[0] * 16 + 8) | (big(source[1] * 16 + 8) << 16n)],
    [REG.XYZ2, big((place[0] + ox) << 4) | (big((place[1] + oy) << 4) << 16n) | (big(z) << 32n)],
    [REG.UV, big((source[0] + source[2]) << 4) | (big((source[1] + source[3]) << 4) << 16n)],
    [REG.XYZ2, big(((place[0] + ox + place[2]) << 4) - 8) | (big(((place[1] + oy + place[3]) << 4) - 8) << 16n) | (big(z) << 32n)],
  ];
}

export function verify(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const result = { ghosts: [0, 0], logos: [0, 0], writes: [0, 0], problems: [] };
  const problem = (text) => { if (result.problems.length < 12) result.problems.push(text); };
  const writesOf = (packet) => [...new GifPath().feed(packet.bytes)].filter((event) => event.kind === 'write');
  const compare = (expected, sent, tally, label) => {
    tally[1] += 1;
    result.writes[1] += expected.length;
    let equal = sent.length === expected.length, bad = null;
    expected.forEach(([reg, value], i) => { if (sent[i] && sent[i].reg === reg && sent[i].value === value) result.writes[0] += 1; else { equal = false; bad ??= i; } });
    if (equal) tally[0] += 1;
    else problem(`${label}: ${sent.length} writes sent, ${expected.length} computed${bad === null ? '' : `; write ${bad}: sent ${sent[bad] ? `reg 0x${sent[bad].reg.toString(16)} = 0x${sent[bad].value.toString(16)}` : 'nothing'}, computed reg 0x${expected[bad][0].toString(16)} = 0x${expected[bad][1].toString(16)}`}`);
  };

  for (const probe of trace.probes) {
    if (probe.preroll || (probe.pc !== GHOST && probe.pc !== LOGO)) continue;
    if (probe.mem.some((range) => !range.bytes)) { problem(`frame ${probe.frame}: a probed range was not readable`); continue; }
    if (probe.at >= trace.packets.length) continue;
    if (probe.pc === GHOST) {
      const [buffers, screen, modes] = probe.mem.map((range) => range.bytes);
      const width = screen.readInt32LE(0x14), height = screen.readInt32LE(0x18);
      const grey = probe.gpr[8] | 0;
      const level = grey > -1 ? grey : 0;
      const depth = big((((width * height) >> 6) << 1) >> 5) | 0x31000000n;
      const expected = [
        [REG.TEST, 0x30000n], [REG.ZBUF, depth | (1n << 32n)], [REG.CLAMP, 0n],
        // The store: the buffer whose address is at 0x002B0C48, 640 wide, 1024 x 256, 32-bit.
        [REG.TEX0, buffers.readBigUInt64LE(8) | 0x628128000n], [REG.TEX1, 0x60n],
        ...blend(modes, probe.gpr[4], probe.gpr[5], probe.gpr[6]),
        // The store holds the picture at half its width.
        ...rectangle([0, 0, width, height], [0, 0, width >> 1, height], [level, level, level, 0x80], 1, probe.gpr[7], width, height),
        [REG.ZBUF, depth], [REG.TEST, 0x50000n],
      ];
      compare(expected, writesOf(trace.packets[probe.at]), result.ghosts, `frame ${probe.frame} ghost`);
    } else {
      const [table, source, screen, modes] = probe.mem.map((range) => range.bytes);
      const width = screen.readInt32LE(0x14), height = screen.readInt32LE(0x18);
      const alpha = probe.gpr[6];
      const ints = (buffer, at) => [0, 4, 8, 12].map((o) => buffer.readInt32LE(at + o));
      const from = ints(source, 0);
      const expected = [
        ...blend(modes, 1, 4, alpha),
        ...rectangle(ints(table, PAL ? 0x20 : 0), from, [0x80, 0x80, 0x80, alpha], 1, 0xfffffe, width, height),
        ...rectangle(ints(table, PAL ? 0x30 : 0x10), [from[0], from[1] + 0x20, from[2], from[3]], [0x80, 0x80, 0x80, alpha], 1, 0xfffffe, width, height),
      ];
      // The offset and the texture's three packets come first.
      let sent = [];
      for (let at = probe.at; at < Math.min(trace.packets.length, probe.at + 8); at++) {
        const writes = writesOf(trace.packets[at]);
        if (writes.length > 0 && writes[0].reg === REG.PABE) { sent = writes; break; }
      }
      compare(expected, sent, result.logos, `frame ${probe.frame} logo`);
    }
  }
  return result;
}

if (process.argv[1] && process.argv[1].endsWith('verify_opening_overlays_v2.mjs')) {
  const result = verify(process.argv[2]);
  console.log(`ghost of the previous frame: ${result.ghosts[0]} of ${result.ghosts[1]} packets equal   logo: ${result.logos[0]} of ${result.logos[1]} packets equal   (writes ${result.writes[0]} of ${result.writes[1]})`);
  for (const text of result.problems) console.log(`  ! ${text}`);
  const whole = result.ghosts[1] + result.logos[1] > 0 && result.problems.length === 0;
  console.log(`verdict: ${whole ? `FOUND ${result.ghosts[0]} ghost draws and ${result.logos[0]} logo draws of the opening, every write equal` : 'PARTIAL see the lines marked !'}`);
  process.exit(whole ? 0 : 3);
}
