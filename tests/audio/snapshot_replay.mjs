import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [modelDir, capturesDir, builtDir, budgetFile, mode] = process.argv.slice(2);
const load = (name) => import(pathToFileURL(path.join(modelDir, name)).href);
const { readSpuTrace, rpcCommands } = await load('sound_trace.mjs');
const { makeModel } = await load('sound_osdsnd.mjs');
const { effectWrites } = await load('sound_osdsnd_effects.mjs');
const { initWrites } = await load('sound_osdsnd_init.mjs');
const { loadSnapshot } = await load('sound_snapshot.mjs');

const TICK = 0x925a0;
const TICK_ENVX = 0x95e20;
const ALLOC_ENVX = 0x98358;

const trace = readSpuTrace(path.join(capturesDir, 'hddosd-110U-sound-boot-a.spu.jsonl'));
const events = [];
const tickGroups = [];
const allocationReads = Array.from({ length: 24 }, () => []);
for (const p of trace.probes) {
  if (p.pcValue === TICK) { tickGroups.push([]); events.push({ kind: 'tick', cycle: p.cycle }); }
  else if (p.pcValue === TICK_ENVX && tickGroups.length > 0) tickGroups.at(-1).push(p.gpr[2] & 0xffff);
  else if (p.pcValue === ALLOC_ENVX) {
    const at = p.gpr[4] - 0xbf900000;
    if (at >= 0 && at < 0x400) allocationReads[(at >> 4) & 0x1f].push(p.gpr[2] & 0xffff);
  }
}
for (const c of rpcCommands(trace)) events.push({ kind: 'rpc', cycle: c.cycle, command: c });
events.sort((a, b) => a.cycle - b.cycle);

function run(snapshot, libsd) {
  let tickIndex = 0;
  let allocationIndex = -1;
  const feeds = {
    tick: (voice) => { if (voice === 0) tickIndex += 1; return tickGroups[tickIndex - 1]?.[voice] ?? 0; },
    allocation: (voice) => { if (voice === 0) allocationIndex += 1; return allocationReads[voice][allocationIndex] ?? 0; },
  };
  const model = makeModel(snapshot, libsd, feeds, false);
  const writes = [];
  for (const e of events) {
    if (e.kind === 'tick') for (const w of model.sequencer.tick()) writes.push(`t ${w.address} ${w.value}`);
    else {
      const result = e.command.id === 0x6300 ? effectWrites(model.state, e.command, (core, voice) => feeds.allocation(voice)) : initWrites(model.state, e.command);
      for (const w of result.writes) writes.push(`${e.command.id} ${w.address} ${w.value}`);
    }
  }
  return { writes, ram: model.state.mem.ram };
}

const reference = run(loadSnapshot(path.join(capturesDir, 'hddosd-110U-sound-boot-b')), fs.readFileSync(path.join(capturesDir, 'hddosd-110U-sound-libsd.bin')));
const derived = run({ osdsnd: fs.readFileSync(path.join(builtDir, 'built.osdsnd.bin')), iop: fs.readFileSync(path.join(builtDir, 'built.iopsound.bin')) },
  fs.readFileSync(path.join(builtDir, 'built.libsd.bin')));

if (reference.writes.length === 0 || reference.writes.length !== derived.writes.length || reference.writes.some((w, i) => w !== derived.writes[i])) {
  console.error('the writes of the boot events differ between the capture snapshot and the built one');
  process.exit(1);
}
console.log(`replay: ${derived.writes.length} writes of the boot events equal`);

const classes = fs.readFileSync(budgetFile, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => {
  const [name, from, to, bytes] = l.split(' ');
  return { name, from: parseInt(from, 16), to: parseInt(to, 16), bytes: Number(bytes), seen: 0 };
});
let differ = 0;
for (let at = 0; at < reference.ram.length; at++) {
  if (reference.ram[at] === derived.ram[at]) continue;
  differ += 1;
  const owner = classes.find((c) => at >= c.from && at < c.to);
  if (!owner) { console.error(`byte ${at.toString(16)} differs after the replay and no class owns it`); process.exit(1); }
  owner.seen += 1;
}
let bad = false;
for (const c of classes) {
  console.log(`${c.name.padEnd(26)} ${c.from.toString(16).padStart(6, '0')}..${c.to.toString(16).padStart(6, '0')} ${String(c.seen).padStart(6)} bytes`);
  if (c.seen !== c.bytes) { console.error(`class ${c.name}: ${c.seen} bytes differ, the budget says ${c.bytes}`); bad = true; }
}
if (bad) process.exit(1);
console.log(`replay: after the boot events ${differ} bytes of IOP RAM differ between the two runs, all in budgeted classes`);
