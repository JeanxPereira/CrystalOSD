// The towers of the opening intro (HDD OSD 1.10U): the only draws of the module that go through
// VU1. For each tower the EE fills a VIF1 chain at 0x002A4EE0 and starts it (func_002214F8,
// 0x002219C0); the microprogram (References/model/opening-vu1-microprogram.json, 229
// instructions) transforms, lights and sends the six faces. This walks the chain as it stood when
// it was started, runs a model of the microprogram written from its disassembly, and compares
// every packet it sends with the PATH1 packets of the trace, write by write.
//
//   0x002219B4  the chain is complete and about to be started
//
// The towers only exist when the play history has entries; captures are taken from a saved state
// in which five entries were written to 0x001F0198 before the intro set its towers up.
//
// node verify_opening_towers.mjs <trace.jsonl>
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { GifPath } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/gif.js';
import { f } from '../model/clock_frame.mjs';

const CHAIN = 0x002a4ee0;
export const PROBES = [{ pc: '0x002219b4', ranges: ['0x002a4ee0:0x840'] }];
const START = parseInt(PROBES[0].pc, 16);

const toInt = (x) => (x >= 2147483647 ? 2147483647 : x <= -2147483648 ? -2147483648 : Math.trunc(x));
const apply = (m, v) => [0, 1, 2, 3].map((i) => f(f(f(f(m[0][i] * v[0]) + f(m[1][i] * v[1])) + f(m[2][i] * v[2])) + f(m[3][i] * v[3])));

/** The 32-bit words VIF1 receives: the chain's tags (their upper halves too) and what follows them. */
function vifWords(memory) {
  const words = [];
  let at = 0;
  for (let guard = 0; guard < 64; guard++) {
    const tag = memory.readUInt32LE(at), address = memory.readUInt32LE(at + 4);
    const count = tag & 0xffff, id = (tag >>> 28) & 7;
    words.push(memory.readUInt32LE(at + 8), memory.readUInt32LE(at + 12));
    for (let i = 0; i < count * 4; i++) words.push(memory.readUInt32LE(at + 16 + i * 4));
    if (id === 7 || id === 0) return words;
    if (id === 2) at = address - CHAIN;
    else if (id === 1) at += 16 + count * 16;
    else throw new Error(`chain tag ${id} is not handled`);
  }
  throw new Error('the chain does not end');
}

/** VU1's data memory as 16-byte entries, and the program's run from one start to the next stop. */
class Vu1 {
  constructor() {
    this.memory = Buffer.alloc(0x4000);
    this.kicks = [];
    this.stage = 'setup';
    this.faces = { plain: 0, moved: 0 };
  }
  vector(n) { return [0, 4, 8, 12].map((k) => this.memory.readFloatLE(((n & 0x3ff) << 4) + k)); }
  word(n, k) { return this.memory.readUInt32LE(((n & 0x3ff) << 4) + k * 4); }
  store(n, values, asInt = false) { values.forEach((x, k) => (asInt ? this.memory.writeInt32LE(x | 0, ((n & 0x3ff) << 4) + k * 4) : this.memory.writeFloatLE(x, ((n & 0x3ff) << 4) + k * 4))); }
  /** XGKICK: the GIF packet that starts at an entry, up to the end of its last tag. */
  kick(n) {
    let at = (n & 0x3ff) << 4;
    const from = at;
    for (;;) {
      const loops = this.memory.readUInt32LE(at) & 0x7fff, end = (this.memory.readUInt32LE(at) >>> 15) & 1;
      const flag = (this.memory.readUInt32LE(at + 4) >>> 26) & 3, registers = (this.memory.readUInt32LE(at + 4) >>> 28) || 16;
      at += 16 + (flag === 0 ? loops * registers * 16 : flag === 1 ? Math.ceil((loops * registers) / 2) * 16 : loops * 16);
      if (end) break;
    }
    this.kicks.push(Buffer.from(this.memory.subarray(from, at)));
  }
  /** Instructions 0..25: world-to-screen x the tower's matrix, the registers, the blend packet. */
  setup() {
    const a = [0, 1, 2, 3].map((r) => this.vector(r));
    [4, 5, 6, 7].forEach((r, i) => this.store(22 + i, apply(a, this.vector(r))));
    this.light = [8, 9, 10, 11].map((r) => this.vector(r));
    this.normal = [12, 13, 14, 15].map((r) => this.vector(r));
    this.low = this.vector(16);
    this.high = this.vector(17);
    this.kick(18);
    this.shine = this.vector(21);
    this.shineFlag = this.word(21, 0) & 0xffff;
    this.matrix = [22, 23, 24, 25].map((r) => this.vector(r));
    this.stage = 'strips';
  }
  /** Instructions 33..96 (plain faces) and 99..198 (faces whose coordinates move with the normal). */
  strip(top) {
    const count = this.word(top, 0) & 0x7fff;
    const out = top + 1 + 4 * count + 4;
    this.memory.copy(this.memory, (out & 0x3ff) << 4, (top & 0x3ff) << 4, ((top & 0x3ff) << 4) + 16);
    let wait = 0, colour = this.colour ?? [0, 0, 0, 0];
    this.faces[this.shineFlag !== 0 ? 'moved' : 'plain'] += 1;
    for (let i = 0; i < count; i++) {
      const p = apply(this.matrix, this.vector(top + 1 + i));
      let n = apply(this.normal, this.vector(top + 1 + count + i));
      const tint = this.vector(top + 1 + 2 * count + i);
      const q = f(1 / p[3]);
      const place = [f(p[0] * q), f(p[1] * q), f(p[2] * q), p[3]];
      let st = this.vector(top + 1 + 3 * count + i).map((x) => f(x * q));
      if (this.shineFlag !== 0) {
        const push = this.shine.map((x, k) => f(n[k] * f(x * q)));
        st = [f(st[0] + push[0]), f(st[1] - push[1]), st[2], st[3]];
      }
      n = n.map((x) => (x > 0 ? x : 0));
      // Inside: past the low bound and before the high one in x, y and w.
      const inside = [0, 1, 3].every((k) => f(this.low[k] - place[k]) < 0 && f(place[k] - this.high[k]) < 0);
      let drawn = false;
      if (inside) {
        wait -= 1;
        drawn = wait <= 0;
      } else wait = 3;
      // The plain routine skips the colour of a vertex outside the bounds: it keeps the one before.
      if (inside || this.shineFlag !== 0) { const lit = apply(this.light, n); colour = tint.map((x, k) => f(x * lit[k])); }
      this.store(out + 1 + i * 3, st);
      this.store(out + 2 + i * 3, colour.map(toInt), true);
      this.store(out + 3 + i * 3, [toInt(place[0] * 16), toInt(place[1] * 16), toInt(place[2] * 16), drawn ? 0 : -0x8000], true);
    }
    this.colour = colour;
    this.kick(out);
  }
}

/** Run a chain: what VIF1 does with each code, as far as this chain uses them. */
export function run(memory) {
  const words = vifWords(memory);
  const vu = new Vu1();
  let base = 0, offset = 0, tops = 0, top = 0, flip = 0;
  const start = () => {
    top = tops;
    tops = flip === 0 ? base + offset : base;
    flip ^= 1;
  };
  for (let i = 0; i < words.length; i++) {
    const code = words[i], command = (code >>> 24) & 0x7f, number = (code >>> 16) & 0xff, immediate = code & 0xffff;
    if (command === 0x00 || command === 0x01 || command === 0x10 || command === 0x11 || command === 0x13) continue;       // NOP, STCYCL (4, 4 throughout), FLUSH
    if (command === 0x03) { base = immediate & 0x3ff; continue; }
    if (command === 0x02) { offset = immediate & 0x3ff; flip = 0; tops = base; continue; }
    if (command === 0x14) { if (immediate !== 0) throw new Error(`MSCAL ${immediate}`); start(); vu.setup(); continue; }
    if (command === 0x17) { start(); vu.strip(top); continue; }
    if (command === 0x6c) {
      const address = (immediate & 0x3ff) + ((immediate & 0x8000) ? tops : 0);
      const entries = number === 0 ? 256 : number;
      for (let k = 0; k < entries * 4; k++) vu.memory.writeUInt32LE(words[i + 1 + k], (((address << 4) + k * 4) & 0x3fff));
      i += entries * 4;
      continue;
    }
    throw new Error(`VIF code 0x${code.toString(16)} is not handled`);
  }
  return Object.assign(vu.kicks, { faces: vu.faces });
}

export function verify(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const result = { towers: 0, packets: [0, 0], writes: [0, 0], vertices: 0, hidden: 0, plain: 0, moved: 0, problems: [] };
  const problem = (text) => { if (result.problems.length < 14) result.problems.push(text); };
  const writesOf = (bytes) => [...new GifPath().feed(bytes)].filter((event) => event.kind === 'write');

  // PATH1 packets in order; the chains are started one tower at a time.
  const sent = trace.packets.map((packet, at) => ({ packet, at })).filter(({ packet }) => packet.path === 1);
  let next = 0;
  for (const probe of trace.probes) {
    if (probe.pc !== START || probe.preroll) continue;
    if (!probe.mem[0].bytes) { problem(`frame ${probe.frame}: the chain was not readable`); continue; }
    let kicks;
    try { kicks = run(probe.mem[0].bytes); } catch (error) { problem(`frame ${probe.frame}: ${error.message}`); continue; }
    while (next < sent.length && sent[next].at < probe.at) next += 1;
    if (next + kicks.length > sent.length) break;        // the trace ends inside this tower
    result.towers += 1;
    result.plain += kicks.faces.plain; result.moved += kicks.faces.moved;
    kicks.forEach((bytes, k) => {
      const expected = writesOf(bytes), got = writesOf(sent[next + k].packet.bytes);
      result.packets[1] += 1;
      result.writes[1] += expected.length;
      let equal = got.length === expected.length, bad = null;
      expected.forEach((write, i) => { if (got[i] && got[i].reg === write.reg && got[i].value === write.value) result.writes[0] += 1; else { equal = false; bad ??= i; } });
      if (equal) result.packets[0] += 1;
      else problem(`frame ${probe.frame} tower ${result.towers} packet ${k}: ${got.length} writes sent, ${expected.length} computed${bad === null ? '' : `; write ${bad}: sent ${got[bad] ? `reg 0x${got[bad].reg.toString(16)} = 0x${got[bad].value.toString(16)}` : 'nothing'}, computed reg 0x${expected[bad].reg.toString(16)} = 0x${expected[bad].value.toString(16)}`}`);
      result.vertices += expected.filter((write) => write.reg === 4 || write.reg === 0xc).length;
      result.hidden += expected.filter((write) => write.reg === 0xc).length;
    });
    next += kicks.length;
  }
  return result;
}

if (process.argv[1] && process.argv[1].endsWith('verify_opening_towers.mjs')) {
  const result = verify(process.argv[2]);
  console.log(`towers: ${result.towers}   packets equal: ${result.packets[0]} of ${result.packets[1]} (writes ${result.writes[0]} of ${result.writes[1]})   vertices ${result.vertices}, of them sent without drawing ${result.hidden}`);
  console.log(`  faces through the plain routine: ${result.plain}   through the one that moves the coordinates with the normal: ${result.moved}`);
  for (const text of result.problems) console.log(`  ! ${text}`);
  const whole = result.towers > 0 && result.problems.length === 0;
  console.log(`verdict: ${whole ? `FOUND ${result.towers} towers of the opening, every write equal` : 'PARTIAL see the lines marked !'}`);
  process.exit(whole ? 0 : 3);
}
