// A MIPS R3000A interpreter for running a few IOP functions over a memory snapshot, with host
// functions standing in for the code behind imports. An instrument for checking models of IOP
// code against the code itself; it is not part of any verifier's verdict.
const SIZE = 0x200000;
const isIo = (a) => ((a >>> 0) & 0x1fffffff) >= 0x1f800000;
const phys = (a) => ((a >>> 0) & 0x1fffffff) >>> 0;

export class IopCpu {
  constructor() {
    this.ram = Buffer.alloc(SIZE);
    this.r = new Int32Array(32);
    this.hi = 0;
    this.lo = 0;
    this.pc = 0;
    this.hooks = new Map();
    this.steps = 0;
    this.trace = null;
    this.mmio = null;
    this.syscall = null;
    this.count = null;
    this.boundary = false;
    this.onBoundary = null;
    this.targets = null;
    this.blocks = null;
    this.loopHeads = null;
    this.blockEnd = -1;
  }

  load(address, bytes) { bytes.copy(this.ram, address); }

  u8(a) { return isIo(a) ? this.mmio.read(phys(a), 1) & 0xff : this.ram[a & (SIZE - 1)]; }
  u16(a) { return isIo(a) ? this.mmio.read(phys(a), 2) & 0xffff : this.ram.readUInt16LE(a & (SIZE - 1)); }
  u32(a) { return isIo(a) ? this.mmio.read(phys(a), 4) >>> 0 : this.ram.readUInt32LE(a & (SIZE - 1)); }
  s8(a) { return (this.u8(a) << 24) >> 24; }
  s16(a) { return (this.u16(a) << 16) >> 16; }
  s32(a) { return this.u32(a) | 0; }

  w8(a, v) { if (isIo(a)) this.mmio.write(phys(a), 1, v & 0xff); else this.ram[a & (SIZE - 1)] = v & 0xff; }
  w16(a, v) { if (isIo(a)) this.mmio.write(phys(a), 2, v & 0xffff); else this.ram.writeUInt16LE(v & 0xffff, a & (SIZE - 1)); }
  w32(a, v) { if (isIo(a)) this.mmio.write(phys(a), 4, v >>> 0); else this.ram.writeUInt32LE(v >>> 0, a & (SIZE - 1)); }

  scanTargets(from, to) {
    if (this.targets === null) this.targets = new Set();
    for (let a = from; a + 4 <= to; a += 4) {
      const w = this.ram.readUInt32LE(a);
      const op = w >>> 26;
      if (op === 1 || (op >= 4 && op <= 7)) this.targets.add((a + 4 + (((w & 0xffff) << 16) >> 16) * 4) >>> 0);
      else if (op === 2 || op === 3) this.targets.add(((((a + 4) & 0xf0000000) | ((w & 0x3ffffff) << 2)) >>> 0));
    }
  }

  compile(start) {
    let a = start;
    for (;;) {
      if (a !== start && (this.blocks.has(a) || (this.loopHeads !== null && this.loopHeads.has(a)))) return a;
      const w = this.u32(a);
      const op = w >>> 26;
      if ((op >= 1 && op <= 7) || (op === 0 && ((w & 63) === 8 || (w & 63) === 9))) return a + 8;
      a += 4;
    }
  }

  scanLoopHeads(from, to) {
    if (this.loopHeads === null) this.loopHeads = new Set();
    for (let a = from; a + 4 <= to; a += 4) {
      const w = this.ram.readUInt32LE(a);
      const op = w >>> 26;
      if (op === 1 || (op >= 4 && op <= 7)) {
        const target = (a + 4 + (((w & 0xffff) << 16) >> 16) * 4) >>> 0;
        if (target <= a) this.loopHeads.add(target);
      }
    }
  }

  hook(address, fn) { this.hooks.set(address >>> 0, fn); }

  call(address, args = [], stack = 0x1f0000, limit = 5_000_000) {
    this.r.fill(0);
    this.r[29] = stack;
    this.r[31] = 0xfffffff0 | 0;
    args.forEach((v, i) => { this.r[4 + i] = v | 0; });
    this.pc = address >>> 0;
    this.steps = 0;
    while ((this.pc >>> 0) !== 0xfffffff0) {
      this.step();
      if (++this.steps > limit) throw new Error(`step limit at pc 0x${this.pc.toString(16)}`);
    }
    return this.r[2];
  }

  step() {
    if (this.blocks !== null) {
      const at = this.pc >>> 0;
      if (this.boundary || at === this.blockEnd) {
        this.boundary = false;
        let end = this.blocks.get(at);
        if (end === undefined) { end = this.compile(at); this.blocks.set(at, end); }
        this.blockEnd = end;
        if (this.onBoundary) this.onBoundary(this);
      }
    } else if (this.targets && this.targets.has(this.pc >>> 0)) this.boundary = true;
    if (this.blocks === null && this.boundary) { this.boundary = false; if (this.onBoundary) this.onBoundary(this); }
    const hook = this.hooks.get(this.pc >>> 0);
    if (hook) {
      const result = hook(this);
      if (result !== undefined) this.r[2] = result | 0;
      this.pc = this.r[31] >>> 0;
      return;
    }
    const at = this.pc >>> 0;
    const word = this.u32(at);
    this.exec(word, at);
    this.r[0] = 0;
  }

  exec(word, at) {
    if (this.count !== null) this.tally(word);
    const r = this.r;
    const op = word >>> 26;
    const rs = (word >>> 21) & 31;
    const rt = (word >>> 16) & 31;
    const rd = (word >>> 11) & 31;
    const sh = (word >>> 6) & 31;
    const imm = word & 0xffff;
    const simm = (imm << 16) >> 16;
    let next = (at + 4) >>> 0;
    let target = null;
    let link = null;
    const delay = () => {
      const w = this.u32(next);
      this.exec2(w, next);
    };
    const branch = (taken, to) => {
      if (taken) target = to;
      delay();
      this.pc = (taken ? target : (next + 4)) >>> 0;
    };
    switch (op) {
      case 0: {
        const fn = word & 63;
        switch (fn) {
          case 0x00: r[rd] = r[rt] << sh; break;
          case 0x02: r[rd] = r[rt] >>> sh; break;
          case 0x03: r[rd] = r[rt] >> sh; break;
          case 0x04: r[rd] = r[rt] << (r[rs] & 31); break;
          case 0x06: r[rd] = r[rt] >>> (r[rs] & 31); break;
          case 0x07: r[rd] = r[rt] >> (r[rs] & 31); break;
          case 0x08: { const to = r[rs] >>> 0; delay(); this.pc = to; return; }
          case 0x09: { const to = r[rs] >>> 0; const ra = (at + 8) | 0; delay(); r[rd] = ra; this.pc = to; return; }
          case 0x0c: if (!this.syscall) throw new Error(`syscall at 0x${at.toString(16)}`); r[2] = this.syscall(this, at) | 0; break;
          case 0x0d: throw new Error(`break at 0x${at.toString(16)}`);
          case 0x10: r[rd] = this.hi; break;
          case 0x11: this.hi = r[rs]; break;
          case 0x12: r[rd] = this.lo; break;
          case 0x13: this.lo = r[rs]; break;
          case 0x18: { const p = BigInt(r[rs]) * BigInt(r[rt]); this.lo = Number(BigInt.asIntN(32, p)); this.hi = Number(BigInt.asIntN(32, p >> 32n)); break; }
          case 0x19: { const p = BigInt(r[rs] >>> 0) * BigInt(r[rt] >>> 0); this.lo = Number(BigInt.asIntN(32, p)); this.hi = Number(BigInt.asIntN(32, p >> 32n)); break; }
          case 0x1a: if (r[rt] !== 0) { this.lo = Math.trunc(r[rs] / r[rt]) | 0; this.hi = (r[rs] % r[rt]) | 0; } break;
          case 0x1b: if (r[rt] !== 0) { this.lo = Math.trunc((r[rs] >>> 0) / (r[rt] >>> 0)) | 0; this.hi = ((r[rs] >>> 0) % (r[rt] >>> 0)) | 0; } break;
          case 0x20: case 0x21: r[rd] = (r[rs] + r[rt]) | 0; break;
          case 0x22: case 0x23: r[rd] = (r[rs] - r[rt]) | 0; break;
          case 0x24: r[rd] = r[rs] & r[rt]; break;
          case 0x25: r[rd] = r[rs] | r[rt]; break;
          case 0x26: r[rd] = r[rs] ^ r[rt]; break;
          case 0x27: r[rd] = ~(r[rs] | r[rt]); break;
          case 0x2a: r[rd] = r[rs] < r[rt] ? 1 : 0; break;
          case 0x2b: r[rd] = (r[rs] >>> 0) < (r[rt] >>> 0) ? 1 : 0; break;
          default: throw new Error(`SPECIAL 0x${fn.toString(16)} at 0x${at.toString(16)}`);
        }
        break;
      }
      case 1: {
        const cond = rt;
        const neg = (cond & 1) === 0;
        const taken = neg ? r[rs] < 0 : r[rs] >= 0;
        const linkIt = (cond & 0x10) !== 0;
        const ra = (at + 8) | 0;
        branch(taken, (next + (simm << 2)) >>> 0);
        if (linkIt) r[31] = ra;
        return;
      }
      case 2: { const to = ((next & 0xf0000000) | ((word & 0x3ffffff) << 2)) >>> 0; delay(); this.pc = to; return; }
      case 3: { const to = ((next & 0xf0000000) | ((word & 0x3ffffff) << 2)) >>> 0; const ra = (at + 8) | 0; delay(); r[31] = ra; this.pc = to; return; }
      case 4: branch(r[rs] === r[rt], (next + (simm << 2)) >>> 0); return;
      case 5: branch(r[rs] !== r[rt], (next + (simm << 2)) >>> 0); return;
      case 6: branch(r[rs] <= 0, (next + (simm << 2)) >>> 0); return;
      case 7: branch(r[rs] > 0, (next + (simm << 2)) >>> 0); return;
      case 8: case 9: r[rt] = (r[rs] + simm) | 0; break;
      case 10: r[rt] = r[rs] < simm ? 1 : 0; break;
      case 11: r[rt] = (r[rs] >>> 0) < (simm >>> 0) ? 1 : 0; break;
      case 12: r[rt] = r[rs] & imm; break;
      case 13: r[rt] = r[rs] | imm; break;
      case 14: r[rt] = r[rs] ^ imm; break;
      case 15: r[rt] = imm << 16; break;
      case 32: r[rt] = this.s8((r[rs] + simm) >>> 0); break;
      case 33: r[rt] = this.s16((r[rs] + simm) >>> 0); break;
      case 35: r[rt] = this.s32((r[rs] + simm) >>> 0); break;
      case 36: r[rt] = this.u8((r[rs] + simm) >>> 0); break;
      case 37: r[rt] = this.u16((r[rs] + simm) >>> 0); break;
      case 40: this.w8((r[rs] + simm) >>> 0, r[rt]); break;
      case 41: this.w16((r[rs] + simm) >>> 0, r[rt]); break;
      case 43: this.w32((r[rs] + simm) >>> 0, r[rt]); break;
      default: throw new Error(`opcode ${op} at 0x${at.toString(16)}`);
    }
    r[0] = 0;
    this.pc = next;
    void target; void link;
  }

  tally(word) {
    const c = this.count;
    const op = word >>> 26;
    c.insn += 1;
    if (op >= 1 && op <= 7) this.boundary = true;
    else if (op === 0 && ((word & 63) === 8 || (word & 63) === 9)) this.boundary = true;
    if (op >= 32 && op <= 37) c.load += 1;
    else if (op >= 40 && op <= 43) c.store += 1;
    else if (op === 0) {
      const fn = word & 63;
      if (fn >= 0x18 && fn <= 0x19) c.mult += 1;
      else if (fn >= 0x1a && fn <= 0x1b) c.div += 1;
    }
  }

  exec2(word, at) {
    const savedPc = this.pc;
    this.exec(word, at);
    this.pc = savedPc;
  }
}
