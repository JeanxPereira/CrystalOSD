import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { syntheticEvents, syntheticFeeds } from './SyntheticEvents.mjs';

const [modelDir, capturesDir, expectedFile] = process.argv.slice(2);
const root = path.resolve(modelDir, '..');
const load = (file) => import(pathToFileURL(path.resolve(file)).href);
const { IopCpu } = await load(path.join(root, 'lib/iop_cpu.mjs'));
const { loadSnapshot, OSDSND_BASE } = await load(path.join(modelDir, 'sound_snapshot.mjs'));
const { makeModel } = await load(path.join(modelDir, 'sound_osdsnd.mjs'));
const { effectWrites } = await load(path.join(modelDir, 'sound_osdsnd_effects.mjs'));
const { initWrites } = await load(path.join(modelDir, 'sound_osdsnd_init.mjs'));

const stem = path.join(capturesDir, 'hddosd-110U-sound-boot-b');
const needed = ['hddosd-110U-sound-libsd.bin', 'hddosd-110U-sound-boot-b.start.osdsnd.bin', 'hddosd-110U-sound-boot-b.start.iopsound.bin', 'hddosd-110U-sound-boot-b.start.spustate.json'].map((f) => path.join(capturesDir, f));
const missing = needed.filter((f) => !fs.existsSync(f));
if (missing.length) {
  console.log(`SKIPPED: missing ${missing.join(', ')}`);
  process.exit(77);
}
const libsd = fs.readFileSync(path.join(capturesDir, 'hddosd-110U-sound-libsd.bin'));
const events = syntheticEvents();
const { tickGroups, allocationReads } = syntheticFeeds(events);

let tickIndex = 0;
let allocationIndex = -1;
const feeds = {
  tick: (voice) => { if (voice === 0) tickIndex += 1; return tickGroups[tickIndex - 1]?.[voice] ?? 0; },
  allocation: (voice) => { if (voice === 0) allocationIndex += 1; return allocationReads[voice][allocationIndex] ?? 0; },
};
const model = makeModel(loadSnapshot(stem), libsd, feeds, true);
const seed = new Map(model.state.regs.values);

const snapshot = loadSnapshot(stem);
const cpu = new IopCpu();
cpu.load(0x80000, libsd);
cpu.load(OSDSND_BASE, snapshot.osdsnd);
cpu.load(0xeb000, snapshot.iop);
const values = new Map(seed);
for (const [address, value] of [[0x1f9007c0, 0xc032], [0x1f9007c6, 0x900], [0x1f9007c8, 0x200], [0x1f9007ca, 0x8]]) values.set(address, value);
let cpuTick = 0;
let cpuAllocation = -1;
let cpuWrites = [];
cpu.mmio = {
  read: (address, size) => {
    const off = address & 0x7ff;
    const inCore = off & 0x3ff;
    if ((address >>> 16) === 0x1f90 && off < 0x800 && inCore < 0x180 && (inCore & 0xf) === 0xa) {
      const core = (off >> 10) & 1;
      const voice = inCore >> 4;
      if (core === 1) { const v = tickGroups[cpuTick - 1]?.[voice] ?? 0; if (process.env.CROSS_ENVX && cpuTick === 1) console.log(`cpu ENVX v${voice} = ${v}`); return v; }
      return allocationReads[voice][cpuAllocation] ?? 0;
    }
    return values.get(address) ?? 0;
  },
  write: (address, size, value) => {
    if (cpu.pc >= 0x8d200 && cpu.pc < 0x8d600) return;
    values.set(address, value & 0xffff);
    if ((address >>> 16) === 0x1f90) cpuWrites.push({ address, value: value & 0xffff });
  },
};
cpu.hook(OSDSND_BASE + 0x8624, (c) => { for (let k = 0; k < c.r[6]; k++) c.w8(c.r[4] + k, c.r[5]); return c.r[4]; });
cpu.hook(OSDSND_BASE + 0x861c, (c) => { for (let k = 0; k < c.r[6]; k++) c.w8(c.r[4] + k, c.u8(c.r[5] + k)); return c.r[4]; });
const step = cpu.step.bind(cpu);
cpu.step = function () {
  const pc = this.pc >>> 0;
  if (pc < 0x80000) {
    this.r[2] = 0;
    this.pc = this.r[31] >>> 0;
    return;
  }
  return step();
};

const BUFFER = 0x993d0;
const same = (a, b) => a.length === b.length && a.every((w, i) => w.address === b[i].address && w.value === b[i].value);
const byId = new Map();
const lines = [];
events.forEach((event, index) => {
  let want;
  let got;
  let id;
  if (event.kind === 'tick') {
    id = 'tick';
    want = model.sequencer.tick();
    cpuWrites = [];
    cpuTick += 1;
    cpu.call(OSDSND_BASE + 0x2470, [], 0x1f0000, 5_000_000);
    got = cpuWrites;
  } else {
    id = `0x${event.command.id.toString(16)}`;
    const command = event.command;
    const result = command.id === 0x6300 ? effectWrites(model.state, command, (core, voice) => feeds.allocation(voice)) : initWrites(model.state, command);
    want = result.writes;
    cpuWrites = [];
    if (command.id === 0x6300) cpuAllocation += 1;
    cpu.w32(BUFFER, 0);
    command.words.forEach((w, k) => cpu.w32(BUFFER + 4 + 4 * k, w));
    cpu.call(0x90868, [command.id, BUFFER, 0x40], 0x1f0000, 5_000_000);
    got = cpuWrites;
  }
  const entry = byId.get(id) ?? { events: 0, equal: 0, differ: [] };
  entry.events += 1;
  if (same(want.map((w) => ({ address: w.address, value: w.value & 0xffff })), got)) entry.equal += 1;
  else entry.differ.push(index);
  byId.set(id, entry);
});

const NL = String.fromCharCode(10);
for (const [id, entry] of byId) lines.push(`${id} events ${entry.events} equal ${entry.equal} differ ${entry.differ.length}${entry.differ.length ? ` at ${entry.differ.join(',')}` : ''}`);
const report = lines.join(NL) + NL;
process.stdout.write(report);
if (expectedFile) {
  const expected = fs.readFileSync(expectedFile, 'utf8').replaceAll(String.fromCharCode(13), '');
  if (expected !== report) {
    process.stderr.write(`the real-code cross-check differs from ${expectedFile}${NL}`);
    process.exit(1);
  }
}
