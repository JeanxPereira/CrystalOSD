// Exports, per Task 2-4 capture, what the native scene must reproduce: the pad words of each frame and the commands the EE queued
// (enqueue probe 0x00200C00), as text for SoundCommandsTest.
// node export_command_probes.mjs <References> <captures> <out> <capture name>...
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

process.env.CLOCK_BUILD = 'hdd';
const [referencesDir, capturesDir, outDir, ...names] = process.argv.slice(2);
const lib = (rel) => import(pathToFileURL(path.join(referencesDir, rel)).href);
const { readTraceFor, probesOf } = await lib('lib/trace.mjs');
const menu = await lib('scripts/verify_sound_menu_senders.mjs');
const clock = await lib('scripts/verify_sound_clock_senders.mjs');
const opening = await lib('scripts/verify_sound_opening_senders.mjs');

const u16 = (n) => Number(BigInt.asUintN(16, BigInt(n)));
const wordAt = (probes, r, slot, address) => {
  const base = Number(probes[r.probe].ranges[slot].split(':')[0]);
  return r.mem[slot].bytes.readUInt32LE(address - base);
};
// slot of the pad words, and of the state words, per menu probe: [probe index, pad slot]
const PADS = new Map([[2, 4], [5, 1], [6, 2], [7, 2], [10, 0], [11, 1]]);

function load(file, probes) {
  const trace = readTraceFor(file, probes);
  if (!trace.complete) throw new Error(`${file}: ${trace.reason}`);
  const groups = probesOf(trace, probes);
  const kind = new Map();
  groups.forEach((records, i) => records.forEach((r) => kind.set(r, i)));
  const records = trace.probes.filter((r) => kind.has(r) && !r.preroll);
  for (const r of records) r.probe = kind.get(r);
  return { trace, records };
}

function frames(records) {
  const byFrame = new Map();
  for (const r of records) {
    if (!byFrame.has(r.frame)) byFrame.set(r.frame, { number: r.frame, emu: r.frame, records: [] });
    byFrame.get(r.frame).records.push(r);
  }
  const first = Math.min(...byFrame.keys()), last = Math.max(...byFrame.keys());
  const all = [];
  for (let n = first; n <= last; n++) all.push(byFrame.get(n) ?? { number: n, emu: n, records: [] });
  return all;
}

function enqueues(frame, enqueueProbe, probes) {
  return frame.records.filter((r) => r.probe === enqueueProbe).map((r) => ({
    a: [r.gpr[4], r.gpr[5], r.gpr[6], r.gpr[7]].map(u16), head: r.mem[0].bytes.readUInt32LE(4), ra: r.gpr[31] >>> 0,
  }));
}

fs.mkdirSync(outDir, { recursive: true });
for (const name of names) {
  const file = path.join(capturesDir, `${name}.trace.jsonl`);
  const out = [`capture ${name}`];
  const kindOf = name.includes('-sound-menu-') ? 'menu' : name.includes('-sound-opening-') ? 'opening' : 'clock';
  out.push(`kind ${kindOf}`);
  const probes = kindOf === 'menu' ? menu.PROBES : kindOf === 'opening' ? opening.PROBES : clock.PROBES;
  const { trace, records } = load(file, probes);
  out.push(`pad ${trace.padSpec ?? ""}`);
  let held = null;
  for (const f of frames(records)) {
    if (kindOf === 'menu') {
      let words = null;
      for (const r of f.records) if (PADS.has(r.probe)) { words = wordAt(probes, r, PADS.get(r.probe), 0x00370330); const b = r.mem[PADS.get(r.probe)].bytes; const base = Number(probes[r.probe].ranges[PADS.get(r.probe)].split(':')[0]); const o = 0x00370330 - base; words = [0, 4, 8, 12].map((i) => b.readUInt32LE(o + i)); break; }
      if (words && held === null) held = words[0];
      if (words) held = words[0];
      out.push(`F ${f.number} ${words ? words.join(' ') : `${held ?? 0} 0 0 0`}${words ? '' : ' nopad'}`);
      const state = f.records.find((r) => r.probe === 2);
      if (state) out.push(`T ${f.number} sel ${wordAt(probes, state, 0, 0x002b2e70)} count ${wordAt(probes, state, 0, 0x002b2e68)} main ${wordAt(probes, state, 0, 0x002b2e84)} sys ${wordAt(probes, state, 2, 0x002b2e10)} ver ${wordAt(probes, state, 3, 0x002b300c)}`);
      const menuState = f.records.find((r) => r.probe === 5);
      if (menuState) out.push(`M ${f.number} menu ${wordAt(probes, menuState, 0, 0x002b578c)}`);
    } else if (kindOf === 'opening') {
      const e = f.records.find((r) => r.probe === 3);
      if (e) out.push(`O ${f.number} ${f.emu} ${wordAt(probes, e, 0, 0x00370000)}`);
      for (const r of f.records) {
        if (r.probe === 1) out.push(`START ${f.number} ${f.emu} module ${wordAt(probes, r, 0, 0x001f0648)}`);
        if (r.probe === 2) out.push(`STAGE2 ${f.number} ${f.emu} counter ${wordAt(probes, r, 0, 0x00370000)} pending ${wordAt(probes, r, 1, 0x00370090) | 0} go ${wordAt(probes, r, 1, 0x00370094)} forced ${wordAt(probes, r, 2, 0x002ad22c)} ready ${wordAt(probes, r, 2, 0x002ad230)} exec ${wordAt(probes, r, 2, 0x002ad234) | 0} disc ${wordAt(probes, r, 3, 0x001f000c)}`);
      }
    } else {
      out.push(`F ${f.number} 0 0 0 0 nopad`);
    }
    for (const q of enqueues(f, 0, probes)) out.push(`Q ${f.number} ${f.emu} ${q.a.join(' ')} ${q.head} ${q.ra}`);
  }
  fs.writeFileSync(path.join(outDir, `${name}.commands.txt`), `${out.join('\n')}\n`);
  console.log(`${name}: ${out.length} lines`);
}
