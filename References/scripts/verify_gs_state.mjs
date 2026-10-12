// What the state helpers of the clock send to the GS, as a function of their arguments.
// The formulas are the ones READ on HDD OSD 1.10U (References/readings/gs-state-helpers.md);
// the packets are the ones ROM 2.30 really sent after each call. Several of these helpers are
// different code in the two builds, so this script reports, register by register, where the ROM
// agrees with the HDD OSD reading and where it does not.
//
//   0x00230518  blend and depth test      (HDD func_00233E70)   a0 mode, a1 ztst
//   0x00230ee0  bind a loaded texture     (HDD func_002348A8)   a0 base, a1 log2 w, a2 log2 h, a3 blend, t0 ztst, t1 psm
//   0x002306e8  bind a work buffer        (HDD func_00234070)   a0 which
//   0x00230920  draw to a work buffer     (HDD func_002342F0)   a0 target, a1 clear colour, a2 field
//   0x00230810  draw to the display       (HDD func_002341C8)   a0 buffers, a1 index, a2 clear colour, a3 field
//   0x0022fd00  sprite                    (HDD func_00233770)   a0 rectangle
//
// node verify_gs_state.mjs <trace.jsonl>
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { pick, range, pc, BUILD, BUILD_NAME } from './builds.mjs';
import { GifPath } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/gif.js';

// The six helpers in the order of the list above, and the screen size, per build.
const A = pick({
  rom: { pcs: [0x00230518, 0x00230ee0, 0x002306e8, 0x00230920, 0x00230810, 0x0022fd00], screen: 0x001f0c50 },
  hdd: { pcs: [0x00233e70, 0x002348a8, 0x00234070, 0x002342f0, 0x002341c8, 0x00233770], screen: 0x001f0cb4 },
});
const SCREEN = range(A.screen, 8);
export const PROBES = [
  { pc: pc(A.pcs[0]), ranges: [] },
  { pc: pc(A.pcs[1]), ranges: [] },
  { pc: pc(A.pcs[2]), ranges: [SCREEN] },
  { pc: pc(A.pcs[3]), ranges: ['a1:0x10', SCREEN] },
  { pc: pc(A.pcs[4]), ranges: ['a0:0x230', 'a2:0x10', SCREEN] },
  { pc: pc(A.pcs[5]), ranges: ['a0:0x3c', SCREEN] },
];
const [BLEND, TEXTURE, BUFFER, WORK, DISPLAY, SPRITE] = A.pcs;
const R = { PRIM: 0x00, RGBAQ: 0x01, UV: 0x03, XYZF2: 0x04, XYZ2: 0x05, TEX0: 0x06, CLAMP: 0x08, TEX1: 0x14, XYOFFSET: 0x18, PRMODECONT: 0x1a, TEXA: 0x3b,
  TEXFLUSH: 0x3f, SCISSOR: 0x40, ALPHA: 0x42, DTHE: 0x45, COLCLAMP: 0x46, TEST: 0x47, PABE: 0x49, FBA: 0x4a, FRAME: 0x4c, ZBUF: 0x4e };
const NAME = Object.fromEntries(Object.entries(R).map(([name, value]) => [value, name]));
const big = (x) => BigInt.asUintN(64, BigInt(x));
const TEXA = 0x810000807fn;

const blend = (mode) => [0x48n, 0x44n, 0x42n, (0x28n << 32n) | 0x64n, 0x68n][mode] ?? 0x44n;
const test = (ztst) => 0x10000n | (big(ztst) << 17n);
const tex0 = (tbp, tbw, psm, tw, th) => big(tbp) | (big(tbw) << 14n) | (big(psm) << 20n) | (big(tw) << 26n) | (big(th) << 30n) | (1n << 34n);
const offset = (w, h, field) => big((0x800 - (w >> 1)) << 4) | (big(((0x800 - (h >> 1)) << 4) + (field ? 8 : 0)) << 32n);
const rgbaq = (c) => big(c[0]) | (big(c[1]) << 8n) | (big(c[2]) << 16n) | (big(c[3]) << 24n) | (0x3f800000n << 32n);
const xyz = (x, y, z) => big(x & 0xffff) | (big(y & 0xffff) << 16n) | (big(z) << 32n);

/** The register writes the HDD OSD reading gives for each helper. */
const expected = {
  [BLEND]: (p) => [[[R.TEST, test(p.gpr[5])], [R.ALPHA, blend(p.gpr[4])]]],
  [TEXTURE]: (p) => {
    const [base, lw, lh, sel, ztst, psm] = [4, 5, 6, 7, 8, 9].map((r) => p.gpr[r]);
    return [[[R.TEST, test(ztst)], [R.ALPHA, sel ? 0x48n : 0x44n], [R.PABE, 0n], [R.TEXA, TEXA], [R.FBA, 0n], [R.TEXFLUSH, 0n], [R.TEX1, 0x61n],
      [R.TEX0, tex0(base >> 6, (1 << lw) >> 6, psm, lw, lh)], [R.CLAMP, 5n]]];
  },
  [BUFFER]: (p) => {
    const [w, h] = [p.mem[0].bytes.readInt32LE(0), p.mem[0].bytes.readInt32LE(4)];
    const tbp = p.gpr[4] & 1 ? (w * h) >> 4 : (3 * w * h) >> 6;
    return [[[R.TEST, 0x50000n], [R.ALPHA, 0x44n], [R.PABE, 0n], [R.TEXA, TEXA], [R.FBA, 0n], [R.TEXFLUSH, 0n], [R.TEX1, 0x61n],
      [R.TEX0, tex0(tbp, w >> 6, 0, 10, 8)], [R.CLAMP, 0xan | (big(w - 1) << 14n) | (big(h - 1) << 34n)]]];
  },
  [WORK]: (p) => {
    const [w, h] = [p.mem[1].bytes.readInt32LE(0), p.mem[1].bytes.readInt32LE(4)];
    const fbp = p.gpr[4] & 1 ? (w * h) >> 9 : (3 * w * h) >> 11;
    const env = [[R.FRAME, big(fbp) | (big((w + 63) >> 6) << 16n)], [R.ZBUF, big(((w + 63) >> 6) * ((h + 31) >> 5) * 2)], [R.XYOFFSET, offset(w, h, p.gpr[6])],
      [R.SCISSOR, (big(w - 1) << 16n) | (big(h - 1) << 48n)], [R.PRMODECONT, 1n], [R.COLCLAMP, 1n], [R.DTHE, 0n], [R.TEST, 0x50000n]];
    if (p.gpr[5] === 0 || !p.mem[0].bytes) return [env];
    const c = [0, 4, 8, 12].map((o) => p.mem[0].bytes.readInt32LE(o));
    const x = (0x800 - (w >> 1)) << 4, y = (0x800 - (h >> 1)) << 4;
    return [[...env, [R.TEST, 0x30000n], [R.PRIM, 6n], [R.RGBAQ, rgbaq(c)], [R.XYZ2, xyz(x, y, 0)], [R.XYZ2, xyz(x + (w << 4), y + (h << 4), 0)], [R.TEST, 0x50000n]]];
  },
  [DISPLAY]: (p) => {
    // The environment was built when the buffers were set up; only the offset and the clear colour are set here.
    const db = p.mem[0].bytes;
    if (!db) return null;
    const [w, h] = [p.mem[2].bytes.readInt32LE(0), p.mem[2].bytes.readInt32LE(4)];
    const at = p.gpr[5] ? 0x140 : 0x50;
    const count = p.gpr[6] ? 14 : 8;
    const writes = [];
    for (let i = 0; i < count; i++) writes.push([Number(db.readBigUInt64LE(at + 0x18 + i * 16) & 0xffn), db.readBigUInt64LE(at + 0x10 + i * 16)]);
    writes[2] = [R.XYOFFSET, offset(w, h, p.gpr[7])];
    if (p.gpr[6] && p.mem[1].bytes && p.gpr[5]) writes[10] = [R.RGBAQ, rgbaq([0, 4, 8, 12].map((o) => p.mem[1].bytes.readInt32LE(o)))];
    return [writes];
  },
  [SPRITE]: (p) => {
    const r = p.mem[0].bytes;
    if (!r) return null;
    const [w, h] = [p.mem[1].bytes.readInt32LE(0), p.mem[1].bytes.readInt32LE(4)];
    const i = (o) => r.readInt32LE(o);
    const ox = (0x800 - (w >> 1)) << 4, oy = (0x800 - (h >> 1)) << 4;
    return [
      [[R.PRIM, big(6 | (i(0x38) << 4) | (i(0x34) << 6) | (1 << 8))], [R.RGBAQ, rgbaq([i(0), i(4), i(8), i(12)])]],
      [[R.UV, big(i(0x18) & 0xffff) | (big(i(0x1c) & 0xffff) << 16n)], [R.XYZF2, xyz(i(0x10) + ox, i(0x14) + oy, i(0x30))],
        [R.UV, big(i(0x28) & 0xffff) | (big(i(0x2c) & 0xffff) << 16n)], [R.XYZF2, xyz(i(0x20) + ox, i(0x24) + oy, i(0x30))]],
    ];
  },
};
const LABEL = { [BLEND]: 'blend and depth test', [TEXTURE]: 'bind a loaded texture', [BUFFER]: 'bind a work buffer', [WORK]: 'draw to a work buffer', [DISPLAY]: 'draw to the display', [SPRITE]: 'sprite' };

export function verify(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const result = {};
  for (const probe of trace.probes) {
    const make = expected[probe.pc];
    if (!make || probe.preroll) continue;
    const wanted = make(probe);
    if (!wanted) continue;
    const entry = (result[LABEL[probe.pc]] ??= { calls: 0, shape: 0, registers: {}, differences: new Map(), arguments: new Map() });
    entry.calls += 1;
    const args = [4, 5, 6, 7].map((r) => probe.gpr[r] > 0xffff ? 'ptr' : probe.gpr[r]).join(', ');
    entry.arguments.set(args, (entry.arguments.get(args) ?? 0) + 1);
    let shaped = true;
    wanted.forEach((writes, n) => {
      const packet = trace.packets[probe.at + n];
      const sent = packet ? [...new GifPath().feed(packet.bytes)].filter((event) => event.kind === 'write') : [];
      if (sent.length !== writes.length) shaped = false;
      writes.forEach(([reg, value], i) => {
        const name = NAME[reg] ?? `0x${reg.toString(16)}`;
        const tally = (entry.registers[name] ??= [0, 0]);
        tally[1] += 1;
        const got = sent[i];
        if (got && got.reg === reg && got.value === value) { tally[0] += 1; return; }
        const key = `${name}: HDD OSD reading 0x${value.toString(16)}, ${BUILD_NAME} sent ${got ? `${NAME[got.reg] ?? `register 0x${got.reg.toString(16)}`} = 0x${got.value.toString(16)}` : 'nothing'}`;
        entry.differences.set(key, (entry.differences.get(key) ?? 0) + 1);
      });
    });
    if (shaped) entry.shape += 1;
  }
  return result;
}

if (process.argv[1] && process.argv[1].endsWith('verify_gs_state.mjs')) {
  const result = verify(process.argv[2]);
  console.log(`build: ${BUILD_NAME}`);
  let differing = 0;
  for (const [label, entry] of Object.entries(result)) {
    console.log(`${label}: ${entry.calls} calls, ${entry.shape} with the number of writes read`);
    console.log(`  arguments seen (a0, a1, a2, a3): ${[...entry.arguments].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([args, n]) => `(${args}) x${n}`).join('  ')}`);
    console.log(`  ${Object.entries(entry.registers).map(([name, [equal, total]]) => `${name} ${equal}/${total}`).join('  ')}`);
    for (const [text, n] of [...entry.differences].sort((a, b) => b[1] - a[1]).slice(0, 6)) { console.log(`  ! x${n}  ${text}`); differing += 1; }
  }
  console.log(`verdict: ${Object.keys(result).length === 0 ? 'NOT FOUND no helper call in the trace' : differing ? `PARTIAL ${BUILD_NAME} differs from the HDD OSD reading in the registers marked` : 'FOUND every write as read'}`);
  process.exit(differing ? 3 : 0);
}
