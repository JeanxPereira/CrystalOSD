// A small interpreter for the Emotion Engine's integer and single-float code, used by the cold
// start verifiers: it runs the console's own init functions, out of the HDD OSD 1.10U ELF or the
// ROM 2.30 RAM image, over a memory seeded from that same image, and returns the memory they wrote.
// A callee that is not part of the question (GS, DMA, the sound driver, vu0 library calls) is a
// hook: the verifier names it and what it does to the result. Any instruction it does not know
// stops the run with its address.
import { DATA_HOME } from '../lib/data.mjs';
import fs from 'node:fs';
import { BUILD } from './builds.mjs';
import * as ee from '../lib/ee-float.mjs';

export const REFERENCES = DATA_HOME;
const SENTINEL = 0xfffffff0;
const PAGE = 4096;

export function elfSegments(elf) {
  const phoff = elf.readUInt32LE(28), phentsize = elf.readUInt16LE(42), phnum = elf.readUInt16LE(44);
  const segs = [];
  for (let i = 0; i < phnum; i++) {
    const at = phoff + i * phentsize;
    if (elf.readUInt32LE(at) === 1) segs.push({ off: elf.readUInt32LE(at + 4), va: elf.readUInt32LE(at + 8), fsz: elf.readUInt32LE(at + 16) });
  }
  return segs;
}

/** The initial memory of a build: HDD OSD 1.10U = the ELF's loadable segment; ROM 2.30 = the RAM image. */
export function loadImage(build = BUILD) {
  if (build === 'hdd') {
    const elf = fs.readFileSync(`${REFERENCES}/dumps/hddosd-host/hddosd.elf`);
    return { segments: elfSegments(elf).map((s) => ({ base: s.va, bytes: elf.subarray(s.off, s.off + s.fsz) })), gp: 0x377970 };
  }
  const pal = process.env.CLOCK_VIDEO === 'pal';
  const file = pal ? 'rom-0230E-pal-clock-ee-00100000.bin' : 'rom-0230A-clock-ee-00100000.bin';
  return { segments: [{ base: 0x100000, bytes: fs.readFileSync(`${REFERENCES}/dumps/${file}`) }], gp: pal ? 0x2d05e8 : 0x2cfef0 };
}

const s32 = (x) => Number(BigInt.asIntN(32, x));
const u32 = (x) => Number(BigInt.asUintN(32, x));
const sx16 = (x) => (x << 16) >> 16;

export class Machine {
  constructor(image, hooks = {}) {
    this.pages = new Map();
    for (const seg of image.segments) for (let o = 0; o < seg.bytes.length; o += PAGE) {
      const addr = seg.base + o;
      const page = this.page(addr);
      page.set(seg.bytes.subarray(o, Math.min(o + PAGE, seg.bytes.length)), addr & (PAGE - 1));
    }
    this.initial = new Map([...this.pages].map(([k, v]) => [k, Uint8Array.from(v)]));
    this.written = new Set();
    this.r = new BigInt64Array(32);
    this.rhi = new BigInt64Array(32);
    this.hi = 0n; this.lo = 0n; this.hi1 = 0n; this.lo1 = 0n;
    this.f = new Uint32Array(32);
    this.fcc = false;
    this.vf = Array.from({ length: 32 }, () => new Uint32Array(4));
    this.vf[0][3] = 0x3f800000;
    this.acc = new Uint32Array(4);
    this.q = 0; this.vi = new Int32Array(32);
    this.hooks = hooks;
    this.r[28] = BigInt(image.gp);
    this.r[29] = 0x01f00000n;
    this.steps = 0;
    this.calls = [];
  }
  page(addr) {
    const key = (addr & 0x1fffffff) >>> 12;
    let p = this.pages.get(key);
    if (!p) { p = new Uint8Array(PAGE); this.pages.set(key, p); }
    return p;
  }
  read8(a) { return this.page(a)[a & (PAGE - 1)]; }
  write8(a, v) { this.page(a)[a & (PAGE - 1)] = v & 255; this.written.add((a & 0x1fffffff) >>> 0); }
  read16(a) { return this.read8(a) | (this.read8(a + 1) << 8); }
  read32(a) { return (this.read8(a) | (this.read8(a + 1) << 8) | (this.read8(a + 2) << 16) | (this.read8(a + 3) << 24)) >>> 0; }
  write16(a, v) { this.write8(a, v); this.write8(a + 1, v >>> 8); }
  write32(a, v) { this.write8(a, v); this.write8(a + 1, v >>> 8); this.write8(a + 2, v >>> 16); this.write8(a + 3, v >>> 24); }
  read64(a) { return (BigInt(this.read32(a + 4)) << 32n) | BigInt(this.read32(a)); }
  write64(a, v) { this.write32(a, Number(BigInt.asUintN(32, v))); this.write32(a + 4, Number(BigInt.asUintN(32, v >> 32n))); }
  float(a) { const b = new DataView(new ArrayBuffer(4)); b.setUint32(0, this.read32(a)); return b.getFloat32(0); }
  /** Bytes of [addr, addr+length) as they are now. */
  bytes(addr, length) { const out = Buffer.alloc(length); for (let i = 0; i < length; i++) out[i] = this.read8(addr + i); return out; }
  /** The words in [addr, addr+length) that differ from the initial image, keyed by address. */
  changed(addr, length) {
    const out = {};
    for (let a = addr; a < addr + length; a += 4) {
      const was = this.initialWord(a), now = this.read32(a);
      if (was !== now) out[a] = now;
    }
    return out;
  }
  initialWord(a) {
    const p = this.initial.get((a & 0x1fffffff) >>> 12);
    if (!p) return 0;
    const o = a & (PAGE - 1);
    return (p[o] | (p[o + 1] << 8) | (p[o + 2] << 16) | (p[o + 3] << 24)) >>> 0;
  }
  setReg(name, value) { this.r[REG[name]] = BigInt(value); }
  reg(name) { return this.r[REG[name]]; }

  /** Calls the function at `entry` with up to four integer arguments, returns v0 (signed 32). */
  call(entry, args = [], limit = 3e6) {
    for (let i = 0; i < args.length; i++) this.r[4 + i] = BigInt(args[i]);
    this.r[31] = BigInt(SENTINEL);
    this.run(entry, limit);
    return s32(this.r[2]);
  }

  run(start, limit) {
    let pc = start >>> 0;
    const start0 = this.steps;
    while (pc !== SENTINEL) {
      if (this.steps - start0 > limit) throw new Error(`step limit at 0x${pc.toString(16)}`);
      const hook = this.hooks[pc];
      if (hook) {
        this.calls.push(pc);
        const ret = hook(this);
        if (ret !== undefined) this.r[2] = BigInt(ret);
        pc = u32(this.r[31]);
        continue;
      }
      pc = this.step(pc);
    }
  }

  step(pc) {
    this.steps++;
    const w = this.read32(pc);
    const op = w >>> 26, rs = (w >>> 21) & 31, rt = (w >>> 16) & 31, rd = (w >>> 11) & 31, sa = (w >>> 6) & 31, fn = w & 63;
    const imm = sx16(w & 0xffff), uimm = w & 0xffff, target = (((pc + 4) & 0xf0000000) | ((w & 0x3ffffff) << 2)) >>> 0;
    const r = this.r;
    const next = (pc + 4) >>> 0;
    const delay = (taken, to, likely) => {
      if (!taken && likely) return (next + 4) >>> 0;
      this.exec(this.read32(next), next);
      return taken ? to : (next + 4) >>> 0;
    };
    const bt = (cond, likely) => delay(cond, (next + (imm << 2)) >>> 0, likely);
    switch (op) {
      case 0:
        switch (fn) {
          case 8: return delay(true, u32(r[rs]), false);
          case 9: { const to = u32(r[rs]); r[rd] = BigInt(next + 4); return delay(true, to, false); }
          default: this.exec(w, pc); return next;
        }
      case 1:
        switch (rt) {
          case 0: return bt(r[rs] < 0n, false);
          case 1: return bt(r[rs] >= 0n, false);
          case 2: return bt(r[rs] < 0n, true);
          case 3: return bt(r[rs] >= 0n, true);
          default: throw new Error(`regimm ${rt} at 0x${pc.toString(16)}`);
        }
      case 2: return delay(true, target, false);
      case 3: { r[31] = BigInt(next + 4); return delay(true, target, false); }
      case 4: return bt(r[rs] === r[rt], false);
      case 5: return bt(r[rs] !== r[rt], false);
      case 6: return bt(r[rs] <= 0n, false);
      case 7: return bt(r[rs] > 0n, false);
      case 20: return bt(r[rs] === r[rt], true);
      case 21: return bt(r[rs] !== r[rt], true);
      case 22: return bt(r[rs] <= 0n, true);
      case 23: return bt(r[rs] > 0n, true);
      case 17:
        if (rs === 8) { const cond = (rt & 1) ? this.fcc : !this.fcc; return bt(cond, (rt & 2) !== 0); }
        this.exec(w, pc); return next;
      default: this.exec(w, pc); return next;
    }
  }

  exec(w, pc) {
    const op = w >>> 26, rs = (w >>> 21) & 31, rt = (w >>> 16) & 31, rd = (w >>> 11) & 31, sa = (w >>> 6) & 31, fn = w & 63;
    const imm = sx16(w & 0xffff), uimm = w & 0xffff;
    const r = this.r;
    const next = (pc + 4) >>> 0;
    const set = (i, v) => { if (i) r[i] = BigInt.asIntN(64, v); };
    const sext32 = (i, v) => set(i, BigInt.asIntN(32, BigInt(v)));
    const addr = () => (u32(r[rs]) + imm) >>> 0;
    switch (op) {
      case 0:
        switch (fn) {
          case 0: sext32(rd, (Number(BigInt.asUintN(32, r[rt])) << sa) | 0); break;
          case 2: sext32(rd, u32(r[rt]) >>> sa); break;
          case 3: sext32(rd, s32(r[rt]) >> sa); break;
          case 4: sext32(rd, (u32(r[rt]) << (Number(r[rs] & 31n))) | 0); break;
          case 6: sext32(rd, u32(r[rt]) >>> Number(r[rs] & 31n)); break;
          case 7: sext32(rd, s32(r[rt]) >> Number(r[rs] & 31n)); break;
          case 10: if (r[rt] === 0n) set(rd, r[rs]); break;
          case 11: if (r[rt] !== 0n) set(rd, r[rs]); break;
          case 12: throw new Error(`syscall at 0x${pc.toString(16)}`);
          case 13: throw new Error(`break at 0x${pc.toString(16)}`);
          case 15: break;
          case 16: set(rd, this.hi); break;
          case 17: this.hi = r[rs]; break;
          case 18: set(rd, this.lo); break;
          case 19: this.lo = r[rs]; break;
          case 20: set(rd, r[rt] << (r[rs] & 63n)); break;
          case 22: set(rd, BigInt.asUintN(64, r[rt]) >> (r[rs] & 63n)); break;
          case 23: set(rd, r[rt] >> (r[rs] & 63n)); break;
          case 24: { const p = BigInt(s32(r[rs])) * BigInt(s32(r[rt])); this.lo = BigInt.asIntN(32, p); this.hi = BigInt.asIntN(32, p >> 32n); set(rd, this.lo); break; }
          case 25: { const p = BigInt(u32(r[rs])) * BigInt(u32(r[rt])); this.lo = BigInt.asIntN(32, p); this.hi = BigInt.asIntN(32, p >> 32n); set(rd, this.lo); break; }
          case 26: { const a = BigInt(s32(r[rs])), b = BigInt(s32(r[rt])); if (b !== 0n) { this.lo = BigInt.asIntN(32, a / b); this.hi = BigInt.asIntN(32, a % b); } break; }
          case 27: { const a = BigInt(u32(r[rs])), b = BigInt(u32(r[rt])); if (b !== 0n) { this.lo = BigInt.asIntN(32, a / b); this.hi = BigInt.asIntN(32, a % b); } break; }
          case 28: { const p = r[rs] * r[rt]; this.lo = BigInt.asIntN(64, p); this.hi = BigInt.asIntN(64, p >> 64n); set(rd, this.lo); break; }
          case 29: { const p = BigInt.asUintN(64, r[rs]) * BigInt.asUintN(64, r[rt]); this.lo = BigInt.asIntN(64, p); this.hi = BigInt.asIntN(64, p >> 64n); set(rd, this.lo); break; }
          case 30: if (r[rt] !== 0n) { this.lo = r[rs] / r[rt]; this.hi = r[rs] % r[rt]; } break;
          case 31: { const a = BigInt.asUintN(64, r[rs]), b = BigInt.asUintN(64, r[rt]); if (b !== 0n) { this.lo = BigInt.asIntN(64, a / b); this.hi = BigInt.asIntN(64, a % b); } break; }
          case 32: case 33: sext32(rd, r[rs] + r[rt]); break;
          case 34: case 35: sext32(rd, r[rs] - r[rt]); break;
          case 36: set(rd, r[rs] & r[rt]); break;
          case 37: set(rd, r[rs] | r[rt]); break;
          case 38: set(rd, r[rs] ^ r[rt]); break;
          case 39: set(rd, ~(r[rs] | r[rt])); break;
          case 42: set(rd, r[rs] < r[rt] ? 1n : 0n); break;
          case 43: set(rd, BigInt.asUintN(64, r[rs]) < BigInt.asUintN(64, r[rt]) ? 1n : 0n); break;
          case 44: case 45: set(rd, r[rs] + r[rt]); break;
          case 46: case 47: set(rd, r[rs] - r[rt]); break;
          case 56: set(rd, r[rt] << BigInt(sa)); break;
          case 58: set(rd, BigInt.asUintN(64, r[rt]) >> BigInt(sa)); break;
          case 59: set(rd, r[rt] >> BigInt(sa)); break;
          case 60: set(rd, r[rt] << BigInt(sa + 32)); break;
          case 62: set(rd, BigInt.asUintN(64, r[rt]) >> BigInt(sa + 32)); break;
          case 63: set(rd, r[rt] >> BigInt(sa + 32)); break;
          default: throw new Error(`special ${fn} at 0x${pc.toString(16)}`);
        }
        break;
      case 8: case 9: sext32(rt, r[rs] + BigInt(imm)); break;
      case 10: set(rt, r[rs] < BigInt(imm) ? 1n : 0n); break;
      case 11: set(rt, BigInt.asUintN(64, r[rs]) < BigInt.asUintN(64, BigInt(imm)) ? 1n : 0n); break;
      case 12: set(rt, r[rs] & BigInt(uimm)); break;
      case 13: set(rt, r[rs] | BigInt(uimm)); break;
      case 14: set(rt, r[rs] ^ BigInt(uimm)); break;
      case 15: set(rt, BigInt(imm) << 16n); break;
      case 24: case 25: set(rt, r[rs] + BigInt(imm)); break;
      case 28: {
        const prod = (a, b) => a * b;
        switch (fn) {
          case 0x10: set(rd, this.hi1); break;
          case 0x11: this.hi1 = r[rs]; break;
          case 0x12: set(rd, this.lo1); break;
          case 0x13: this.lo1 = r[rs]; break;
          case 0x18: { const p = prod(BigInt(s32(r[rs])), BigInt(s32(r[rt]))); this.lo1 = BigInt.asIntN(32, p); this.hi1 = BigInt.asIntN(32, p >> 32n); set(rd, this.lo1); break; }
          case 0x19: { const p = prod(BigInt(u32(r[rs])), BigInt(u32(r[rt]))); this.lo1 = BigInt.asIntN(32, p); this.hi1 = BigInt.asIntN(32, p >> 32n); set(rd, this.lo1); break; }
          case 0x1a: { const a = BigInt(s32(r[rs])), b = BigInt(s32(r[rt])); if (b !== 0n) { this.lo1 = BigInt.asIntN(32, a / b); this.hi1 = BigInt.asIntN(32, a % b); } break; }
          case 0x1b: { const a = BigInt(u32(r[rs])), b = BigInt(u32(r[rt])); if (b !== 0n) { this.lo1 = BigInt.asIntN(32, a / b); this.hi1 = BigInt.asIntN(32, a % b); } break; }
          default: throw new Error(`mmi ${fn} at 0x${pc.toString(16)}`);
        }
        break;
      }
      case 32: set(rt, BigInt(((this.read8(addr()) << 24) >> 24))); break;
      case 33: set(rt, BigInt(sx16(this.read16(addr())))); break;
      case 35: sext32(rt, this.read32(addr())); break;
      case 36: set(rt, BigInt(this.read8(addr()))); break;
      case 37: set(rt, BigInt(this.read16(addr()))); break;
      case 39: set(rt, BigInt(this.read32(addr()))); break;
      case 40: this.write8(addr(), Number(r[rt] & 255n)); break;
      case 41: this.write16(addr(), Number(r[rt] & 0xffffn)); break;
      case 43: { const a = addr(); this.write32(a, Number(BigInt.asUintN(32, r[rt]))); if (this.trace) this.trace.push({ pc, address: a, value: u32(r[rt]) }); break; }
      case 42: { const a = addr(), k = a & 3; for (let i = 0; i <= k; i++) this.write8((a & ~3) + i, Number((r[rt] >> BigInt(8 * (3 - k + i))) & 255n)); break; }
      case 46: { const a = addr(), k = a & 3; for (let i = k; i < 4; i++) this.write8((a & ~3) + i, Number((r[rt] >> BigInt(8 * (i - k))) & 255n)); break; }
      case 26: { const a = addr(), k = a & 7; let v = BigInt.asUintN(64, r[rt]); for (let i = 0; i <= k; i++) { const sh = BigInt(8 * (7 - k + i)); v = (v & ~(255n << sh)) | (BigInt(this.read8((a & ~7) + i)) << sh); } set(rt, BigInt.asIntN(64, v)); break; }
      case 27: { const a = addr(), k = a & 7; let v = BigInt.asUintN(64, r[rt]); for (let i = k; i < 8; i++) { const sh = BigInt(8 * (i - k)); v = (v & ~(255n << sh)) | (BigInt(this.read8((a & ~7) + i)) << sh); } set(rt, BigInt.asIntN(64, v)); break; }
      case 44: { const a = addr(), k = a & 7; for (let i = 0; i <= k; i++) this.write8((a & ~7) + i, Number((BigInt.asUintN(64, r[rt]) >> BigInt(8 * (7 - k + i))) & 255n)); break; }
      case 45: { const a = addr(), k = a & 7; for (let i = k; i < 8; i++) this.write8((a & ~7) + i, Number((BigInt.asUintN(64, r[rt]) >> BigInt(8 * (i - k))) & 255n)); break; }
      case 49: this.f[rt] = this.read32(addr()); break;
      case 57: this.write32(addr(), this.f[rt]); break;
      case 55: set(rt, BigInt.asIntN(64, this.read64(addr()))); break;
      case 63: this.write64(addr(), r[rt]); break;
      case 17: this.cop1(w, pc); break;
      case 18: this.cop2(w, pc); break;
      case 30: { const a = addr() & ~15; set(rt, BigInt.asIntN(64, this.read64(a))); this.rhi[rt] = BigInt.asIntN(64, this.read64(a + 8)); break; }
      case 31: { const a = addr() & ~15; this.write64(a, r[rt]); this.write64(a + 8, this.rhi[rt]); break; }
      case 54: for (let i = 0; i < 4; i++) this.vf[rt][i] = this.read32(addr() + 4 * i); break;
      case 62: for (let i = 0; i < 4; i++) this.write32(addr() + 4 * i, this.vf[rt][i]); break;
      default: throw new Error(`opcode ${op} at 0x${pc.toString(16)}`);
    }
    return null;
  }

  cop2(w, pc) {
    const rs = (w >>> 21) & 31, rt = (w >>> 16) & 31, rd = (w >>> 11) & 31;
    if (rs === 1) { this.r[rt] = BigInt(this.vf[rd][(w >>> 0) & 3] | 0); return; }
    if (rs === 5) { this.vf[rd][0] = Number(BigInt.asUintN(32, this.r[rt])); return; }
    if (rs < 16) throw new Error(`cop2 rs ${rs} at 0x${pc.toString(16)}`);
    const dest = (w >>> 21) & 15, ft = (w >>> 16) & 31, fs = (w >>> 11) & 31, fd = (w >>> 6) & 31, fn = w & 63;
    const lane = (i) => dest & (8 >> i);
    const get = (r, i) => ee.asFloat(this.vf[r][i]);
    const put = (r, i, v) => { this.vf[r][i] = ee.floatBits(v); };
    const bc = fn & 3;
    const each = (f) => { for (let i = 0; i < 4; i++) if (lane(i)) f(i); };
    if (fn >= 0x3c) {
      const id = (((w >>> 6) & 31) << 2) | (w & 3);
      const sb = id & 3;
      const A = (i) => get(fs, i), Tb = (i) => get(ft, sb), Ti = (i) => get(ft, i);
      const accSet = (f) => each((i) => { this.acc[i] = ee.floatBits(f(i)); });
      const accOf = (i) => ee.asFloat(this.acc[i]);
      const Q = () => ee.asFloat(this.q), I = () => ee.asFloat(this.vi[22] >>> 0);
      if (id === 0x30) { each((i) => { this.vf[ft][i] = this.vf[fs][i]; }); return; }
      if (id === 0x31) { const t = [this.vf[fs][1], this.vf[fs][2], this.vf[fs][3], this.vf[fs][0]]; each((i) => { this.vf[ft][i] = t[i]; }); return; }
      if (id < 0x04) return accSet((i) => ee.add(A(i), Tb(i)));
      if (id < 0x08) return accSet((i) => ee.sub(A(i), Tb(i)));
      if (id < 0x0c) return accSet((i) => ee.add(accOf(i), ee.mul(A(i), Tb(i))));
      if (id < 0x10) return accSet((i) => ee.sub(accOf(i), ee.mul(A(i), Tb(i))));
      if (id < 0x14) { const sc = [1, 16, 4096, 32768][sb]; return each((i) => { this.vf[ft][i] = ee.floatBits(ee.div(this.vf[fs][i] | 0, sc)); }); }
      if (id < 0x18) { const sc = [1, 16, 4096, 32768][sb]; return each((i) => { const v = Math.trunc(A(i) * sc); this.vf[ft][i] = Math.max(-2147483648, Math.min(2147483647, v)) >>> 0; }); }
      if (id < 0x1c) return accSet((i) => ee.mul(A(i), Tb(i)));
      if (id === 0x1c) return accSet((i) => ee.mul(A(i), Q()));
      if (id === 0x1d) return each((i) => { this.vf[ft][i] = this.vf[fs][i] & 0x7fffffff; });
      if (id === 0x1e) return accSet((i) => ee.mul(A(i), I()));
      if (id === 0x20) return accSet((i) => ee.add(A(i), Q()));
      if (id === 0x21) return accSet((i) => ee.add(accOf(i), ee.mul(A(i), Q())));
      if (id === 0x22) return accSet((i) => ee.add(A(i), I()));
      if (id === 0x23) return accSet((i) => ee.add(accOf(i), ee.mul(A(i), I())));
      if (id === 0x24) return accSet((i) => ee.sub(A(i), Q()));
      if (id === 0x25) return accSet((i) => ee.sub(accOf(i), ee.mul(A(i), Q())));
      if (id === 0x26) return accSet((i) => ee.sub(A(i), I()));
      if (id === 0x27) return accSet((i) => ee.sub(accOf(i), ee.mul(A(i), I())));
      if (id === 0x28) return accSet((i) => ee.add(A(i), Ti(i)));
      if (id === 0x29) return accSet((i) => ee.add(accOf(i), ee.mul(A(i), Ti(i))));
      if (id === 0x2a) return accSet((i) => ee.mul(A(i), Ti(i)));
      if (id === 0x2c) return accSet((i) => ee.sub(A(i), Ti(i)));
      if (id === 0x2d) return accSet((i) => ee.sub(accOf(i), ee.mul(A(i), Ti(i))));
      if (id === 0x38) { this.q = ee.floatBits(ee.div(get(fs, (w >>> 21) & 3), get(ft, (w >>> 23) & 3))); return; }
      if (id === 0x39) { this.q = ee.floatBits(ee.sqrt(get(ft, (w >>> 23) & 3))); return; }
      if (id === 0x3a) { this.q = ee.floatBits(ee.div(get(fs, (w >>> 21) & 3), ee.sqrt(get(ft, (w >>> 23) & 3)))); return; }
      throw new Error(`vu0 special2 0x${id.toString(16)} at 0x${pc.toString(16)}`);
    }
    const operand = (i) => (fn < 0x10 || (fn >= 0x18 && fn < 0x1c)) ? get(ft, bc) : get(ft, i);
    const arith = (name, f, acc) => each((i) => { const v = f(get(fs, i), operand(i), i); if (acc) this.acc[i] = ee.floatBits(v); else put(fd, i, v); });
    if (fn < 0x04) return arith('add', (a, b) => ee.add(a, b));
    if (fn < 0x08) return arith('sub', (a, b) => ee.sub(a, b));
    if (fn < 0x0c) return arith('madd', (a, b, i) => ee.add(ee.asFloat(this.acc[i]), ee.mul(a, b)));
    if (fn < 0x10) return arith('msub', (a, b, i) => ee.sub(ee.asFloat(this.acc[i]), ee.mul(a, b)));
    if (fn >= 0x18 && fn < 0x1c) return arith('mul', (a, b) => ee.mul(a, b));
    if (fn >= 0x10 && fn < 0x14) return arith('max', (a, b) => (a > b ? a : b));
    if (fn >= 0x14 && fn < 0x18) return arith('min', (a, b) => (a < b ? a : b));
    if (fn === 0x2b) return arith('max', (a, b) => (a > b ? a : b));
    if (fn === 0x2f) return arith('min', (a, b) => (a < b ? a : b));
    if (fn === 0x1c) return arith('mulq', (a) => ee.mul(a, ee.asFloat(this.q)));
    if (fn === 0x1e) return arith('muli', (a) => ee.mul(a, ee.asFloat(this.vi[22] >>> 0)));
    if (fn === 0x20) return arith('addq', (a) => ee.add(a, ee.asFloat(this.q)));
    if (fn === 0x22) return arith('addi', (a) => ee.add(a, ee.asFloat(this.vi[22] >>> 0)));
    if (fn === 0x24) return arith('subq', (a) => ee.sub(a, ee.asFloat(this.q)));
    if (fn === 0x26) return arith('subi', (a) => ee.sub(a, ee.asFloat(this.vi[22] >>> 0)));
    if (fn === 0x28) return arith('add', (a, b) => ee.add(a, b));
    if (fn === 0x2c) return arith('sub', (a, b) => ee.sub(a, b));
    if (fn === 0x2a) return arith('mul', (a, b) => ee.mul(a, b));
    if (fn === 0x29) return arith('madd', (a, b, i) => ee.add(ee.asFloat(this.acc[i]), ee.mul(a, b)));
    if (fn === 0x2d) return arith('msub', (a, b, i) => ee.sub(ee.asFloat(this.acc[i]), ee.mul(a, b)));
    throw new Error(`vu0 fn 0x${fn.toString(16)} at 0x${pc.toString(16)}`);
  }
  fv(i) { return ee.flushIn(ee.asFloat(this.f[i])); }
  fset(i, v) { this.f[i] = ee.floatBits(v); }
  cop1(w, pc) {
    const rs = (w >>> 21) & 31, rt = (w >>> 16) & 31, fs = (w >>> 11) & 31, fd = (w >>> 6) & 31, fn = w & 63;
    if (rs === 0) { this.r[rt] = BigInt(this.f[fs] | 0); return; }
    if (rs === 4) { this.f[fs] = Number(BigInt.asUintN(32, this.r[rt])); return; }
    if (rs !== 16 && rs !== 20) throw new Error(`cop1 rs ${rs} at 0x${pc.toString(16)}`);
    const a = this.fv(fs), b = this.fv(rt);
    switch (fn) {
      case 0: this.fset(fd, ee.add(a, b)); break;
      case 1: this.fset(fd, ee.sub(a, b)); break;
      case 2: this.fset(fd, ee.mul(a, b)); break;
      case 3: this.fset(fd, ee.div(a, b)); break;
      case 4: this.fset(fd, ee.sqrt(b)); break;
      case 5: this.fset(fd, Math.abs(a)); break;
      case 6: this.f[fd] = this.f[fs]; break;
      case 7: this.fset(fd, -a); break;
      case 36: if (rs === 16) this.f[fd] = Math.trunc(a) | 0; break;
      case 32: if (rs === 20) this.fset(fd, this.f[fs] | 0); break;
      case 48: this.fcc = false; break;
      case 50: this.fcc = a === b; break;
      case 52: case 60: this.fcc = a < b; break;
      case 54: case 62: this.fcc = a <= b; break;
      default: throw new Error(`cop1 fn ${fn} at 0x${pc.toString(16)}`);
    }
  }
}

export const REG = { zero: 0, at: 1, v0: 2, v1: 3, a0: 4, a1: 5, a2: 6, a3: 7, t0: 8, t1: 9, t2: 10, t3: 11, t4: 12, t5: 13, t6: 14, t7: 15, s0: 16, s1: 17, s2: 18, s3: 19, s4: 20, s5: 21, s6: 22, s7: 23, t8: 24, t9: 25, k0: 26, k1: 27, gp: 28, sp: 29, fp: 30, ra: 31 };

const norm = (w) => {
  const op = w >>> 26;
  if (op === 2 || op === 3) return (op << 26) >>> 0;
  if (op === 15) return (w & 0xffff0000) >>> 0;
  const rs = (w >>> 21) & 31;
  if (op >= 8 && ![16, 17, 18, 28].includes(op) && rs === 28) return (w & 0xffff0000) >>> 0;
  return w >>> 0;
};

/** The ROM 2.30 entry of an HDD OSD function: the ROM address whose first 16 instructions agree on 13 or more (match_functions.mjs). */
export function romEntry(hddAddress, hdd = new Machine(loadImage('hdd')), rom = loadImage('rom').segments[0]) {
  const head = []; for (let i = 0; i < 16; i++) head.push(norm(hdd.read32(hddAddress + 4 * i)));
  let best = { same: -1, at: 0 };
  for (let a = 0x200000; a < 0x2a0000; a += 4) {
    let same = 0;
    for (let i = 0; i < 16; i++) if (norm(rom.bytes.readUInt32LE(a - rom.base + 4 * i)) === head[i]) same++;
    if (same > best.same) best = { same, at: a };
  }
  if (best.same < 13) throw new Error(`no ROM match for 0x${hddAddress.toString(16)} (${best.same}/16)`);
  return best.at;
}

const functionEnd = (m, entry) => {
  let far = entry;
  for (let a = entry; a < entry + 0x2000; a += 4) {
    const w = m.read32(a), op = w >>> 26;
    if ((op >= 4 && op <= 7) || (op >= 20 && op <= 23) || op === 1 || (op === 17 && ((w >>> 21) & 31) === 8)) far = Math.max(far, a + 4 + (((w << 16) >> 16) << 2));
    const ret = w === 0x03e00008 || op === 2;
    if (ret && a + 8 > far) return a + 8;
  }
  throw new Error(`no end for 0x${entry.toString(16)}`);
};
const calls = (m, from, to) => { const out = []; for (let a = from; a < to; a += 4) { const w = m.read32(a), op = w >>> 26, target = ((w & 0x3ffffff) << 2) >>> 0; if (op === 3 || (op === 2 && (target < from || target >= to))) out.push({ at: a, target }); } return out; };

export const PAL = process.env.CLOCK_VIDEO === 'pal';
export const ROM_GP = PAL ? 0x2d05e8 : 0x2cfef0;
export const FPS = PAL ? 50 : 60;

/**
 * One build ready to run: `entry(hdd)` is the function's address in the build in use; `machine(hooks)` a fresh memory
 * where `hooks` maps HDD OSD addresses of callees to JS functions (the ROM address of a callee is found from the
 * HDD function that calls it, by position among the jal targets).
 */
export function openBuild(roots = [], romEntries = {}) {
  const hdd = new Machine(loadImage('hdd'));
  const rom = BUILD === 'rom' ? loadImage('rom') : null;
  const romM = rom ? new Machine(rom) : null;
  const map = new Map();
  const callee = new Map();
  const entry = (a) => { if (BUILD === 'hdd') return a; if (romEntries[a]) return romEntries[a]; if (callee.has(a)) return callee.get(a); if (!map.has(a)) map.set(a, romEntry(a, hdd, rom.segments[0])); return map.get(a); };
  const learn = (a) => {
    if (BUILD === 'hdd') return;
    const h = entry(a);
    const hc = calls(hdd, a, functionEnd(hdd, a)), rc = calls(romM, h, functionEnd(romM, h));
    hc.slice(0, rc.length).forEach((c, i) => { if (!callee.has(c.target)) callee.set(c.target, rc[i].target); });
  };
  roots.forEach(learn);
  const translate = (a) => (BUILD === 'hdd' ? a : callee.get(a) ?? (() => { try { return entry(a); } catch { throw new Error(`no ROM address for 0x${a.toString(16)}`); } })());
  return {
    entry,
    learn,
    machine(hooks = {}, raw = {}) {
      const image = BUILD === 'hdd' ? loadImage('hdd') : loadImage('rom');
      const m = new Machine(image, { ...raw, ...Object.fromEntries(Object.entries(hooks).map(([a, f]) => [translate(Number(a)), f])) });
      m.trace = [];
      return m;
    },
  };
}

/** The absolute addresses a function's loads and stores name through lui+offset or lui+addiu, in code order, up to its end. */
export function memoryOps(m, entry, end = functionEnd(m, entry)) {
  const high = {}, ops = [];
  for (let a = entry; a < end; a += 4) {
    const w = m.read32(a), op = w >>> 26, rs = (w >>> 21) & 31, rt = (w >>> 16) & 31, imm = (w << 16) >> 16;
    if (op === 15) high[rt] = (w & 0xffff) << 16;
    else if (op === 9 && high[rs] !== undefined) high[rt] = high[rs] + imm;
    else if (op === 13 && high[rs] !== undefined) high[rt] = (high[rs] | (w & 0xffff)) >>> 0;
    else if ([32, 33, 35, 36, 37, 40, 41, 43, 49, 57].includes(op) && high[rs] !== undefined) ops.push({ at: a, op, address: (high[rs] + imm) >>> 0 });
    else if (rt && op !== 43 && op !== 41 && op !== 40 && op !== 57 && op < 48) delete high[rt];
  }
  return ops;
}

/** The absolute address of the gp-relative load or store at `at` (the build's gp is known). */
export function gpAddress(m, at, gp) {
  const w = m.read32(at);
  if ((w >>> 21) & 31 !== 28 && ((w >>> 21) & 31) !== 28) throw new Error(`0x${at.toString(16)} is not gp-relative`);
  return (gp + ((w << 16) >> 16)) >>> 0;
}
