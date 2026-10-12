// Not a verifier: prints what two SPU2 write traces key, per core and voice, so that HDD OSD 1.10U (OSDSND) and
// ROM 2.30 (rspu2_driver, libsnd) can be compared at the SPU2 level.
//
// For every key-on (a write to KON0/KON1 of a core) it lists the voices keyed, and per voice the values the voice's
// registers held at that moment (PITCH, ADSR1, ADSR2, SSA as halfword address, VOLL, VOLR); then, per voice, the number of
// key-ons and the intervals between key-ons in frames. The same list is printed for both traces.
//   node compare_sound_rom.mjs <hdd.spu.jsonl> <rom.spu.jsonl>
import { readSpuTrace, spuRegister } from '../model/sound_trace.mjs';

const [first, second] = process.argv.slice(2);
if (!first || !second) throw new Error('usage: compare_sound_rom.mjs <hdd.spu.jsonl> <rom.spu.jsonl>');

function keyOns(file) {
  const trace = readSpuTrace(file);
  const shadow = new Map();
  const events = [];
  for (const w of trace.writes) {
    const r = spuRegister(w.address);
    if (r.core === null) continue;
    if (r.kind === 'voice' || r.kind === 'voiceaddr') {
      shadow.set(`${r.core}.${r.voice}.${r.name}`, w.value);
      continue;
    }
    const m = /^KON([01])$/.exec(r.name);
    if (!m) continue;
    const base = m[1] === '1' ? 16 : 0;
    for (let bit = 0; bit < 16; bit++) {
      if (!((w.value >> bit) & 1)) continue;
      const voice = base + bit;
      const get = (name) => shadow.get(`${r.core}.${voice}.${name}`);
      events.push({
        core: r.core, voice, frame: w.captureFrame, sample: w.sample,
        pitch: get('PITCH'), adsr1: get('ADSR1'), adsr2: get('ADSR2'),
        ssa: ((get('SSAH') ?? 0) << 16) | (get('SSAL') ?? 0), voll: get('VOLL'), volr: get('VOLR'),
      });
    }
  }
  return { trace, events };
}

const hex = (n, w = 4) => (n === undefined ? '----' : n.toString(16).padStart(w, '0'));

function describe(label, file) {
  const { trace, events } = keyOns(file);
  console.log(`== ${label}: ${file}`);
  console.log(`frames ${trace.frames.length}, writes ${trace.writes.length}, key-ons ${events.length}`);
  const byVoice = new Map();
  for (const e of events) {
    const key = `c${e.core}.v${e.voice}`;
    if (!byVoice.has(key)) byVoice.set(key, []);
    byVoice.get(key).push(e);
  }
  const tuples = new Map();
  for (const [key, list] of [...byVoice.entries()].sort()) {
    const intervals = list.slice(1).map((e, i) => e.frame - list[i].frame);
    console.log(`${key}: ${list.length} key-ons, intervals (frames) ${intervals.slice(0, 12).join(' ') || '-'}${intervals.length > 12 ? ' ...' : ''}`);
    for (const e of list) {
      const t = `pitch ${hex(e.pitch)} adsr ${hex(e.adsr1)}/${hex(e.adsr2)} ssa ${hex(e.ssa, 5)}`;
      tuples.set(t, (tuples.get(t) ?? 0) + 1);
    }
  }
  console.log('key tuples (pitch, adsr1/adsr2, SSA), sorted:');
  for (const [t, n] of [...tuples.entries()].sort()) console.log(`  ${t} x${n}`);
  return { events, tuples };
}

const a = describe('HDD OSD 1.10U', first);
const b = describe('ROM 2.30', second);
const onlyA = [...a.tuples.keys()].filter((t) => !b.tuples.has(t)).length;
const onlyB = [...b.tuples.keys()].filter((t) => !a.tuples.has(t)).length;
const pitchesA = new Set(a.events.map((e) => e.pitch));
const pitchesB = new Set(b.events.map((e) => e.pitch));
const sharedPitches = [...pitchesA].filter((p) => pitchesB.has(p)).length;
console.log(`== summary: ${a.events.length} key-ons on HDD, ${b.events.length} on ROM; distinct key tuples ${a.tuples.size} vs ${b.tuples.size}, ${onlyA} only on HDD, ${onlyB} only on ROM; pitches in common ${sharedPitches} of ${pitchesA.size} and ${pitchesB.size}`);
