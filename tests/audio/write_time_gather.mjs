import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TICK = 0x925a0;
const TICK_ENVX = 0x95e20;
const ALLOC_ENVX = 0x98358;
const RPC = 0x90868;
const BUFFER = 0x993d0;
const DMA_CODE = (pc) => pc >= 0x8d200 && pc < 0x8d600;

export async function gather(modelDir, capturesDir, name, snapshotName, options = {}) {
  const root = path.resolve(modelDir, '..');
  const load = (file) => import(pathToFileURL(path.resolve(file)).href);
  const { IopCpu } = await load(path.join(root, 'lib/iop_cpu.mjs'));
  const { loadSnapshot, OSDSND_BASE } = await load(path.join(modelDir, 'sound_snapshot.mjs'));
  const { makeModel } = await load(path.join(modelDir, 'sound_osdsnd.mjs'));
  const { readSpuTrace, rpcCommands } = await load(path.join(modelDir, 'sound_trace.mjs'));
  const trace = readSpuTrace(path.join(capturesDir, `${name}.spu.jsonl`));
  const libsd = fs.readFileSync(path.join(capturesDir, 'hddosd-110U-sound-libsd.bin'));
  const stem = path.join(capturesDir, snapshotName);

  const events = [];
  const tickGroups = [];
  const allocationReads = Array.from({ length: 24 }, () => []);
  for (const p of trace.probes) {
    if (p.pcValue === TICK) { tickGroups.push([]); events.push({ kind: 'tick', cycle: p.cycle }); }
    else if (p.pcValue === TICK_ENVX && tickGroups.length > 0) tickGroups.at(-1).push(p.gpr[2] & 0xffff);
    else if (p.pcValue === ALLOC_ENVX) {
      const at = p.gpr[4] - 0xbf900000;
      if (at >= 0 && at < 0x400) allocationReads[(at >> 4) & 0x1f].push({ value: p.gpr[2] & 0xffff, cycle: p.cycle });
    }
  }
  for (const c of rpcCommands(trace)) events.push({ kind: 'rpc', cycle: c.cycle, id: c.id, words: c.words });
  events.sort((a, b) => a.cycle - b.cycle);
  const dmaDone = trace.writes.filter((w) => DMA_CODE(w.pc) && (w.address & 0x3ff) === 0x19a && (w.value & 0x30) === 0).map((w) => w.cycle);
  events.forEach((e, i) => {
    if (e.kind !== 'rpc') return;
    const until = events.slice(i + 1).find((n) => n.kind === 'rpc')?.cycle ?? Infinity;
    e.dmaDone = dmaDone.filter((c) => c >= e.cycle && c < until).map((c) => c - e.cycle);
  });
  const allocByEvent = events.map(() => Array.from({ length: 24 }, () => []));
  for (let voice = 0; voice < 24; voice++) {
    for (const read of allocationReads[voice]) {
      let lo = 0;
      let hi = events.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (events[mid].cycle <= read.cycle) lo = mid; else hi = mid - 1; }
      if (events[lo].cycle <= read.cycle) allocByEvent[lo][voice].push(read.value);
    }
  }
  const observed = trace.writes.filter((w) => !DMA_CODE(w.pc) && (w.address >>> 16) === 0x1f90);

  let tickIndex = 0;
  let allocationIndex = -1;
  const feeds = {
    tick: (voice) => { if (voice === 0) tickIndex += 1; return tickGroups[tickIndex - 1]?.[voice] ?? 0; },
    allocation: (voice) => { if (voice === 0) allocationIndex += 1; return allocationReads[voice][allocationIndex]?.value ?? 0; },
  };
  const warm = options.warm ?? false;
  const model = makeModel(loadSnapshot(stem), libsd, feeds, warm);
  const seed = new Map(model.state.regs.values);
  const snapshot = loadSnapshot(stem);
  const cpu = new IopCpu();
  cpu.load(0x80000, model.state.lib.image);
  cpu.load(OSDSND_BASE, snapshot.osdsnd);
  cpu.load(0xeb000, snapshot.iop);
  if (options.targets) { cpu.scanTargets(0x80000, 0x80000 + libsd.length); cpu.scanTargets(OSDSND_BASE, OSDSND_BASE + snapshot.osdsnd.length); }
  if (options.blocks) cpu.blocks = new Map();
  if (options.loops) { cpu.scanLoopHeads(0x80000, 0x80000 + libsd.length); cpu.scanLoopHeads(OSDSND_BASE, OSDSND_BASE + snapshot.osdsnd.length); }
  const values = new Map(seed);
  for (const [address, value] of [[0x1f9007c0, 0xc032], [0x1f9007c6, 0x900], [0x1f9007c8, 0x200], [0x1f9007ca, 0x8]]) values.set(address, value);
  const fresh = () => ({ insn: 0, load: 0, store: 0, mult: 0, div: 0, ioRead: 0, ioWrite: 0, stubs: 0, hookBytes: 0, hooks: 0 });
  let seen = fresh();
  cpu.onBoundary = (c) => { seen = { ...c.count }; };
  let cpuTick = 0;
  let cpuAllocation = -1;
  let current = null;
  const predicted = [];
  cpu.count = fresh();
  cpu.mmio = {
    read: (address) => {
      const off = address & 0x7ff;
      const inCore = off & 0x3ff;
      cpu.count.ioRead += 1;
      if (options.onRead) options.onRead(cpu, address, predicted.length);
      if ((address >>> 16) === 0x1f90 && off < 0x800 && inCore < 0x180 && (inCore & 0xf) === 0xa) {
        const core = (off >> 10) & 1;
        const voice = inCore >> 4;
        const value = core === 1 ? tickGroups[cpuTick - 1]?.[voice] ?? 0 : allocByEvent[current.index]?.[voice]?.shift() ?? 0;
        if (current.envx) current.envx.push({ core, voice, value });
        return value;
      }
      return values.get(address) ?? 0;
    },
    write: (address, size, value) => {
      cpu.count.ioWrite += 1;
      if (DMA_CODE(cpu.pc)) return;
      values.set(address, value & 0xffff);
      if ((address >>> 16) === 0x1f90) predicted.push({ address, value: value & 0xffff, event: current, pc: cpu.lastPc, count: { ...cpu.count }, seen: { ...seen } });
    },
  };
  const calls = [];
  cpu.hook(OSDSND_BASE + 0x8624, (c) => { calls.push({ target: 0x8624 + OSDSND_BASE, args: [c.r[4], c.r[5], c.r[6]], at: predicted.length, insn: c.count.insn, mult: c.count.mult }); c.count.hooks += 1; c.count.hookBytes += c.r[6]; for (let k = 0; k < c.r[6]; k++) c.w8(c.r[4] + k, c.r[5]); return c.r[4]; });
  cpu.hook(OSDSND_BASE + 0x861c, (c) => { calls.push({ target: 0x861c + OSDSND_BASE, args: [c.r[4], c.r[5], c.r[6]], at: predicted.length, insn: c.count.insn, mult: c.count.mult }); c.count.hooks += 1; c.count.hookBytes += c.r[6]; for (let k = 0; k < c.r[6]; k++) c.w8(c.r[4] + k, c.u8(c.r[5] + k)); return c.r[4]; });
  const step = cpu.step.bind(cpu);
  const stubLog = [];
  cpu.step = function () {
    const pc = this.pc >>> 0;
    this.lastPc = pc;
    if (options.onStep) options.onStep(this, pc, predicted.length);
    if (pc < 0x80000) {
      this.count.stubs += 1;
      calls.push({ target: pc, args: [this.r[4], this.r[5], this.r[6]], at: predicted.length, insn: this.count.insn, mult: this.count.mult });
      stubLog.push(pc);
      this.r[2] = 0;
      this.pc = this.r[31] >>> 0;
      return;
    }
    return step();
  };
  let callsStart = 0;
  const ran = [];
  if (options.prewarm && cpu.blocks) {
    const ramCopy = Buffer.from(cpu.ram);
    const valuesCopy = new Map(values);
    const first = events.find((e) => e.kind === 'rpc' && e.id === 0x6010);
    if (first) {
      current = { index: -1 };
      cpu.count = fresh();
      cpu.boundary = true;
      cpu.w32(BUFFER, 0);
      first.words.forEach((w, k) => cpu.w32(BUFFER + 4 + 4 * k, w));
      cpu.call(RPC, [first.id, BUFFER, 0x40], 0x1f0000, 50_000_000);
    }
    ramCopy.copy(cpu.ram);
    values.clear();
    for (const [k, v] of valuesCopy) values.set(k, v);
    predicted.length = 0;
    calls.length = 0;
    stubLog.length = 0;
  }
  const limit = options.limit ?? events.length;
  for (let index = 0; index < limit; index++) {
    const event = events[index];
    current = { index, ...event, envx: [] };
    ran.push(current); cpu.curEvent = index;
    callsStart = calls.length;
    cpu.count = fresh();
    seen = fresh();
    cpu.boundary = true;
    if (event.kind === 'tick') {
      cpuTick += 1;
      cpu.call(OSDSND_BASE + 0x2470, [], 0x1f0000, 50_000_000);
    } else {
      if (event.id === 0x6300) cpuAllocation += 1;
      cpu.w32(BUFFER, 0);
      event.words.forEach((w, k) => cpu.w32(BUFFER + 4 + 4 * k, w));
      cpu.call(RPC, [event.id, BUFFER, 0x40], 0x1f0000, 50_000_000);
    }
    current.total = { ...cpu.count };
    current.calls = calls.slice(callsStart);
  }
  return { events, observed, predicted, stubLog, trace, calls, ran, seed, warm };
}
