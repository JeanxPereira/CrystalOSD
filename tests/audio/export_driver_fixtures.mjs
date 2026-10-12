import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { syntheticEvents, syntheticFeeds } from './SyntheticEvents.mjs';

const [modelDir, capturesDir, outDir, ...items] = process.argv.slice(2);
const load = (name) => import(pathToFileURL(path.join(modelDir, name)).href);
const { readSpuTrace, rpcCommands, spuRegister } = await load('sound_trace.mjs');
const { loadSnapshot } = await load('sound_snapshot.mjs');
const { makeModel } = await load('sound_osdsnd.mjs');
const { effectWrites } = await load('sound_osdsnd_effects.mjs');
const { initWrites } = await load('sound_osdsnd_init.mjs');

fs.mkdirSync(outDir, { recursive: true });

const TICK = 0x925a0;
const TICK_ENVX = 0x95e20;
const ALLOC_ENVX = 0x98358;
const KIND_TICK = 0;
const KIND_RPC = 1;

const records = (rows, width) => {
  const b = Buffer.alloc(4 * width * rows.length);
  rows.forEach((r, i) => r.forEach((v, k) => b.writeUInt32LE(v >>> 0, 4 * (width * i + k))));
  return b;
};

for (const item of items) {
  const synthetic = item === 'synthetic';
  const [name, parts] = synthetic ? ['synthetic', []] : item.includes('=') ? [item.split('=')[0], item.split('=')[1].split('+')] : [item, [item]];
  const traces = parts.map((p) => readSpuTrace(path.join(capturesDir, `${p}.spu.jsonl`)));
  const stems = parts.map((p) => path.join(capturesDir, p));
  const warm = synthetic || fs.existsSync(`${stems[0]}.start.osdsnd.bin`);
  const templateStem = synthetic ? path.join(capturesDir, 'hddosd-110U-sound-boot-b') : process.env.SOUND_TEMPLATE_STEM ?? (warm ? stems[0] : path.join(capturesDir, 'hddosd-110U-sound-boot-b'));

  const events = [];
  const tickGroups = [];
  const allocationReads = Array.from({ length: 24 }, () => []);
  const writes = [];
  const frames = [];
  let frameBase = 0;
  for (const trace of traces) {
    for (const f of trace.frames) frames.push({ cycle: f.cycle, frame: frameBase + f.captureFrame });
    for (const p of trace.probes) {
      if (p.pcValue === TICK) { tickGroups.push([]); events.push({ kind: 'tick', cycle: p.cycle }); }
      else if (p.pcValue === TICK_ENVX && tickGroups.length > 0) tickGroups.at(-1).push(p.gpr[2] & 0xffff);
      else if (p.pcValue === ALLOC_ENVX) {
        const at = p.gpr[4] - 0xbf900000;
        if (at >= 0 && at < 0x400) allocationReads[(at >> 4) & 0x1f].push(p.gpr[2] & 0xffff);
      }
    }
    for (const command of rpcCommands(trace)) events.push({ kind: 'rpc', cycle: command.cycle, command });
    for (const w of trace.writes) writes.push({ ...w, frame: frameBase + w.captureFrame });
    frameBase += trace.frames.length;
  }
  if (synthetic) {
    events.push(...syntheticEvents());
    events.forEach((e, i) => frames.push({ cycle: i, frame: i }));
    const feeds = syntheticFeeds(events);
    tickGroups.push(...feeds.tickGroups);
    feeds.allocationReads.forEach((list, v) => allocationReads[v].push(...list));
  }
  events.sort((a, b) => a.cycle - b.cycle);
  const frameOf = (cycle) => {
    if (frames.length === 0 || cycle < frames[0].cycle) return -1;
    let lo = 0;
    let hi = frames.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (frames[mid].cycle <= cycle) lo = mid; else hi = mid - 1; }
    return frames[lo].frame;
  };

  let tickIndex = 0;
  let allocationIndex = -1;
  const feeds = {
    tick: (voice) => { if (voice === 0) tickIndex += 1; return tickGroups[tickIndex - 1]?.[voice] ?? 0; },
    allocation: (voice) => { if (voice === 0) allocationIndex += 1; return allocationReads[voice][allocationIndex] ?? 0; },
  };
  const model = makeModel(loadSnapshot(templateStem), fs.readFileSync(path.join(capturesDir, 'hddosd-110U-sound-libsd.bin')), feeds, warm);
  const seed = [];
  if (warm) for (const [address, value] of model.state.regs.values) seed.push([address, value]);
  const predicted = [];
  const fills = [];
  for (const event of events) {
    if (event.kind === 'tick') {
      for (const w of model.sequencer.tick()) predicted.push({ source: 'tick', address: w.address, value: w.value, cycle: event.cycle, frame: frameOf(event.cycle) });
      continue;
    }
    const { command } = event;
    const result = command.id === 0x6300 ? effectWrites(model.state, command, (core, voice) => feeds.allocation(voice)) : initWrites(model.state, command);
    for (const w of result.writes) predicted.push({ source: 'rpc', id: command.id, address: w.address, value: w.value, cycle: event.cycle, frame: frameOf(event.cycle) });
    for (const e of result.events ?? []) fills.push([command.id, e.fill.core, e.fill.start, e.fill.bytes, e.fill.transferred]);
  }

  const sequencerClass = /^(VMIXEL|VMIXER|VMIXL|VMIXR|KON|KOFF)[01]$/;
  const classOf = (w) => { const r = spuRegister(w.address); return r.core === 1 && (r.kind === 'voice' || r.kind === 'voiceaddr' || sequencerClass.test(r.name)) ? 0 : 1; };
  const observed = writes.filter((w) => !(w.pc >= 0x8d200 && w.pc < 0x8d600));
  if (!synthetic) {
    for (const w of observed) if ((frameOf(w.cycle) >>> 0) !== (w.frame >>> 0)) throw new Error(`${name}: a write's frame is not the frame of its cycle`);
    const causes = [];
    for (const c of [0, 1]) {
      const own = predicted.filter((w) => classOf(w) === c);
      const seen = observed.filter((w) => classOf(w) === c);
      own.forEach((p, i) => {
        const o = seen[i];
        const crossed = frameOf(p.cycle) !== frameOf(o.cycle);
        const next = frames.find((f) => f.cycle > p.cycle);
        const inside = next !== undefined && next.cycle <= o.cycle;
        if (crossed !== inside) throw new Error(`${name}: class ${c} write ${i}: frame shift without a boundary between the handler entry and the write, or the reverse`);
        if (crossed) causes.push(`${c} ${i} entry ${p.cycle} boundary ${next.cycle} write ${o.cycle}`);
      });
    }
    fs.writeFileSync(path.join(outDir, `${name}.causes.txt`), causes.join(String.fromCharCode(10)) + String.fromCharCode(10));
  }

  const eventRows = events.map((e) => (e.kind === 'tick'
    ? [KIND_TICK, frameOf(e.cycle), 0, 0, 0, 0, 0, 0]
    : [KIND_RPC, frameOf(e.cycle), e.command.id, ...e.command.words]));
  const envxRows = tickGroups.map((g) => Array.from({ length: 24 }, (_, v) => g[v] ?? 0));
  const allocationRows = allocationReads.flatMap((list, voice) => list.map((value) => [voice, value]));
  fs.writeFileSync(path.join(outDir, `${name}.events.bin`), records(eventRows, 8));
  fs.writeFileSync(path.join(outDir, `${name}.tickenvx.bin`), records(envxRows, 24));
  fs.writeFileSync(path.join(outDir, `${name}.allocenvx.bin`), records(allocationRows, 2));
  fs.writeFileSync(path.join(outDir, `${name}.seed.bin`), records(seed, 2));
  fs.writeFileSync(path.join(outDir, `${name}.fills.bin`), records(fills, 5));
  fs.writeFileSync(path.join(outDir, `${name}.model.bin`), records(predicted.map((w) => [w.frame, w.source === 'tick' ? 0 : w.id, w.address, w.value]), 4));
  fs.writeFileSync(path.join(outDir, `${name}.observed.bin`), records(observed.map((w) => [w.frame, classOf(w), w.address, w.value]), 4));
  fs.writeFileSync(path.join(outDir, `${name}.template.txt`), `${path.basename(templateStem)}\n${warm ? 'warm' : 'cold'}\n`);
  console.log(`${name}: ${eventRows.length} events, ${predicted.length} predicted writes, ${observed.length} observed writes`);
}
