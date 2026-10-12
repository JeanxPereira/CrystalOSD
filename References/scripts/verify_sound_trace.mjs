// The SPU2 trace reader (../model/sound_trace.mjs) against what the captures hold.
//
// What is recomputed: every write names a known SPU2 register; the end record's counts equal the lists; the frame records
// number the frames; the OSDSND RPCs documented for a capture are read back with their words (hide, show, boot-a, boot-b);
// the DMA records of boot-a cover the sound banks' ranges of SPU2 RAM; and, for a capture that has a start and an end
// state, replaying its writes on the start state's registers gives the end state's voice, mix, ATTR and master volume
// registers (so each register name the replay uses is the register the emulator holds under that name; boot-a replays from
// the reset state to the state boot-b starts from, reverb registers included. Core 1 of the emulator state holds the two
// DIFF source registers under swapped names, DIFF_L_SRC as diffRSrc: a measured difference of the two namings).
// node verify_sound_trace.mjs <capture>.spu.jsonl
import fs from 'node:fs';
import { readSpuTrace, spuRegister, rpcCommands, diffWrites } from '../model/sound_trace.mjs';

const [file] = process.argv.slice(2);
const trace = readSpuTrace(file);
let compared = 0;
const failures = [];
const check = (ok, what) => { compared += 1; if (!ok) failures.push(what); };

for (const w of trace.writes) {
  const r = spuRegister(w.address);
  check(r.kind !== 'unknown', { address: w.address.toString(16), why: 'unknown register' });
  check(typeof r.name === 'string' && !/^ADDR_/.test(r.name), { address: w.address.toString(16), why: 'unnamed register' });
}

check(trace.end.writes === trace.writes.length, { why: 'writes count' });
check(trace.end.dmas === trace.dmas.length, { why: 'dmas count' });
check(trace.end.probes === trace.probes.length, { why: 'probes count' });
check(trace.frames.length > 0, { why: 'no frame records' });
trace.frames.forEach((f, i) => check(f.captureFrame === i, { why: 'frame index', i, got: f.captureFrame }));
for (let i = 1; i < trace.writes.length; i++) {
  const a = trace.writes[i - 1], b = trace.writes[i];
  check(b.cycle >= a.cycle && b.captureFrame >= a.captureFrame, { why: 'writes out of order', i });
}

const rpcs = rpcCommands(trace);
const documented = {
  hide: [[0x6300, 2, 0x180], [0x6300, 3, 0x6f8]],
  show: [[0x6300, 0, 0xffff8000], [0x6300, 1, 0x708]],
};
const name = Object.keys(documented).find((k) => file.includes(`-sound-${k}.`));
if (name) {
  check(rpcs.length === documented[name].length, { why: 'rpc count', got: rpcs.length });
  documented[name].forEach(([id, effect, volume], i) => {
    const c = rpcs[i];
    check(c !== undefined && c.id === id && c.words[1] === effect && c.words[2] === volume, { why: 'rpc words', i, got: c });
  });
}
if (file.includes('-sound-boot-a.')) {
  const ids = new Set(rpcs.map((c) => c.id));
  for (const id of [0x6010, 0x6060, 0x6090, 0x6130, 0x6310, 0x6120, 0x6150]) check(ids.has(id), { why: 'boot RPC missing', id: id.toString(16) });
  const starts = rpcs.filter((c) => c.id === 0x6150 && c.words[0] === 1 && c.words[1] === 0 && c.words[2] === 0);
  check(starts.length === 1, { why: '0x6150 (1,0,0) once', got: starts.length });
  const covered = (lo, hi) => trace.dmas.filter((d) => d.core === 1).reduce((n, d) => n + Math.max(0, Math.min(d.tsaValue * 2 + d.words * 2, hi) - Math.max(d.tsaValue * 2, lo)), 0);
  check(covered(0x5010, 0x5010 + 356112) === 356112, { why: 'SNDBOOTB range uploaded by DMA', got: covered(0x5010, 0x5010 + 356112) });
  check(covered(0x85010, 0x85010 + 54400) === 54400, { why: 'SNDOSDDB range uploaded by DMA', got: covered(0x85010, 0x85010 + 54400) });
}
if (file.includes('-sound-boot-b.')) {
  const want = [[6, 0xf], [4, null], [2, 0x180], [3, 0x6f8], [0, 0xffff8000], [1, 0x708]];
  const effects = rpcs.filter((c) => c.id === 0x6300);
  check(effects.length === want.length, { why: 'boot-b effects', got: effects.length });
  want.forEach(([effect, f2], i) => check(effects[i]?.words[0] === 1 && effects[i]?.words[1] === effect && (f2 === null || effects[i]?.words[2] === f2), { why: 'boot-b effect words', i, got: effects[i]?.words }));
}

const stem = file.replace(/\.spu\.jsonl(\.gz)?$/, '');
let registerChecks = 0;
const endFile = [`${stem}.end.spustate.json`, `${stem.replace(/-boot-a$/, '-boot-b')}.start.spustate.json`].find((f) => fs.existsSync(f) && (f.includes('.end.') || /-boot-a$/.test(stem)));
const startFile = fs.existsSync(`${stem}.start.spustate.json`) ? `${stem}.start.spustate.json` : null;
if (endFile && (startFile || /-boot-a$/.test(stem))) {
  const hex = (v) => Number.parseInt(v, 16);
  const end = JSON.parse(fs.readFileSync(endFile, 'utf8'));
  const zero = (state) => {
    const z = JSON.parse(JSON.stringify(state));
    for (const core of z.cores) {
      for (const v of core.voices) { v.volume.left.reg = '0x0'; v.volume.right.reg = '0x0'; v.adsr.reg1 = '0x0'; v.adsr.reg2 = '0x0'; v.pitch = '0x0'; v.startA = '0x0'; }
      for (const k of Object.keys(core.regs)) core.regs[k] = '0x0';
      core.masterVol.left.reg = '0x0'; core.masterVol.right.reg = '0x0';
      for (const k of Object.keys(core.revb)) core.revb[k] = 0;
      core.fxVol = [0, 0];
    }
    return z;
  };
  const start = startFile ? JSON.parse(fs.readFileSync(startFile, 'utf8')) : zero(end);
  const voiceRegisters = (v) => ({ VOLL: hex(v.volume.left.reg), VOLR: hex(v.volume.right.reg), ADSR1: hex(v.adsr.reg1), ADSR2: hex(v.adsr.reg2), PITCH: hex(v.pitch), SSA: v.startA ? hex(v.startA) : 0 });
  const shadow = start.cores.map((core) => ({
    voices: core.voices.map(voiceRegisters),
    vmix: { VMIXL: hex(core.regs.vmixl), VMIXEL: hex(core.regs.vmixel), VMIXR: hex(core.regs.vmixr), VMIXER: hex(core.regs.vmixer) },
    core: { MMIX: hex(core.regs.mmix), ATTR: hex(core.regs.attr), MVOLL: hex(core.masterVol.left.reg), MVOLR: hex(core.masterVol.right.reg), EVOLL: core.fxVol[0] & 0xffff, EVOLR: core.fxVol[1] & 0xffff },
    revb: Object.fromEntries(Object.entries(core.revb).map(([k, v]) => [k, v])),
  }));
  const SWAPPED = { diffLSrc: 'DIFF_R_SRC', diffRSrc: 'DIFF_L_SRC' };
  const regName = (camel, core) => (core === 1 ? SWAPPED[camel] : undefined) ?? camel.replace(/([A-Z])/g, '_$1').toUpperCase();
  const isAddress = (camel) => /(Size|Src|Dst)$/.test(camel);
  const touched = new Set();
  for (const w of trace.writes) {
    const r = spuRegister(w.address);
    if (r.core === null || r.core > 1) continue;
    const c = shadow[r.core];
    if (r.kind === 'voice' && r.name !== 'ENVX' && r.name in c.voices[r.voice]) {
      c.voices[r.voice][r.name] = w.value;
      touched.add(`${r.core}.v${r.voice}.${r.name}`);
    } else if (r.kind === 'voiceaddr' && (r.name === 'SSAH' || r.name === 'SSAL')) {
      const v = c.voices[r.voice];
      v.SSA = r.name === 'SSAH' ? ((w.value & 0xf) << 16) | (v.SSA & 0xffff) : (v.SSA & 0xf0000) | w.value;
      touched.add(`${r.core}.v${r.voice}.SSA`);
    } else if (/^VMIX(L|EL|R|ER)[01]$/.test(r.name)) {
      const key = r.name.slice(0, -1);
      c.vmix[key] = r.name.endsWith('0') ? (c.vmix[key] & 0xff0000) | w.value : (c.vmix[key] & 0xffff) | ((w.value & 0xff) << 16);
      touched.add(`${r.core}.${key}`);
    } else if (r.name in c.core) {
      c.core[r.name] = w.value;
      touched.add(`${r.core}.${r.name}`);
    } else {
      for (const camel of Object.keys(c.revb)) {
        const name = regName(camel, r.core);
        if (isAddress(camel) && (r.name === `${name}H` || r.name === `${name}L`)) {
          c.revb[camel] = r.name.endsWith('H') ? (w.value << 16) | (c.revb[camel] & 0xffff) : (c.revb[camel] & 0x7fff0000) | w.value;
          touched.add(`${r.core}.revb.${camel}`);
        } else if (!isAddress(camel) && r.name === name) {
          c.revb[camel] = (w.value << 16) >> 16;
          touched.add(`${r.core}.revb.${camel}`);
        }
      }
    }
  }
  end.cores.forEach((core, ci) => {
    const c = shadow[ci];
    core.voices.forEach((v, vi) => {
      const want = voiceRegisters(v);
      for (const key of Object.keys(want)) {
        if (!touched.has(`${ci}.v${vi}.${key}`)) continue;
        check(c.voices[vi][key] === want[key], { why: 'voice register at the end', core: ci, voice: vi, key, replay: c.voices[vi][key], state: want[key] });
        registerChecks += 1;
      }
    });
    for (const key of ['VMIXL', 'VMIXEL', 'VMIXR', 'VMIXER']) {
      if (!touched.has(`${ci}.${key}`)) continue;
      check(c.vmix[key] === hex(core.regs[key.toLowerCase()]), { why: 'mix register at the end', core: ci, key, replay: c.vmix[key], state: core.regs[key.toLowerCase()] });
      registerChecks += 1;
    }
    for (const camel of Object.keys(core.revb)) {
      if (!touched.has(`${ci}.revb.${camel}`)) continue;
      check(c.revb[camel] === core.revb[camel], { why: 'reverb register at the end', core: ci, key: camel, replay: c.revb[camel], state: core.revb[camel] });
      registerChecks += 1;
    }
    const wanted = { MMIX: hex(core.regs.mmix), ATTR: hex(core.regs.attr), MVOLL: hex(core.masterVol.left.reg), MVOLR: hex(core.masterVol.right.reg), EVOLL: core.fxVol[0] & 0xffff, EVOLR: core.fxVol[1] & 0xffff };
    for (const key of Object.keys(wanted)) {
      if (!touched.has(`${ci}.${key}`)) continue;
      check(c.core[key] === wanted[key], { why: 'core register at the end', core: ci, key, replay: c.core[key], state: wanted[key] });
      registerChecks += 1;
    }
  });
}

check(diffWrites(trace.writes, trace.writes) === null, { why: 'self diff' });
if (trace.writes.length > 0) {
  const changed = trace.writes.map((w, i) => (i === 0 ? { ...w, value: w.value ^ 1 } : w));
  check(diffWrites(trace.writes, changed)?.index === 0, { why: 'diff misses a changed value' });
}

if (compared === 0) throw new Error('compared nothing: not a verifier');
console.log(`compared ${compared} items, ${failures.length} differ (${trace.writes.length} writes, ${trace.frames.length} frames, ${rpcs.length} RPCs, ${registerChecks} register values against the end state)`);
for (const f of failures.slice(0, 10)) console.log(JSON.stringify(f));
console.log(failures.length === 0 ? `verdict: FOUND ${compared} items equal` : `verdict: PARTIAL ${failures.length} of ${compared} differ`);
process.exit(failures.length === 0 ? 0 : 1);
