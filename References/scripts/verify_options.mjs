// The dialog pushed by triangle in System Configuration (the entry's options page): its ramp,
// when the page is opened and when the dialog closes, recomputed frame by frame.
//
//   HDD OSD: push func_0022D558(page), tick func_0022D5D8 (once a frame, from the pages
//   function), close func_0022D5A0, open the page func_0022ABC8(page).
//   ROM 2.30: push 0x002288B8 (no page argument), tick 0x00228918, close 0x002288E0,
//   open 0x00226B68.
//
// A ramp is {length, value, changed, state}; state 0 hidden, 1 rising, 2 shown, 3 falling.
// CLOCK_BUILD=hdd|rom node verify_options.mjs <trace.jsonl>
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { pick, range, pc, BUILD_NAME } from './builds.mjs';

const A = pick({
  hdd: { push: 0x0022d558, tick: 0x0022d5d8, close: 0x0022d5a0, open: 0x0022abc8, ramp: 0x002b46b8, terms: 0x003702cc },
  rom: { push: 0x002288b8, tick: 0x00228918, close: 0x002288e0, open: 0x00226b68, ramp: 0x00293ba8, terms: null },
});
export const PROBES = [
  { pc: pc(A.tick), ranges: [range(A.ramp, 0x10), ...(A.terms ? [range(A.terms, 8)] : [])] },
  { pc: pc(A.push), ranges: [range(A.ramp, 0x10), ...(A.terms ? [range(A.terms, 8)] : [])] },
  { pc: pc(A.close), ranges: [range(A.ramp, 0x10)] },
  { pc: pc(A.open), ranges: ['a0:0x20'] },
];

const ramp = (b) => ({ length: b.readInt32LE(0), value: b.readInt32LE(4), changed: b.readInt32LE(8), state: b.readInt32LE(12) });
/** func_00234B10 */
export function step(r) {
  const n = { ...r, changed: 0 };
  if (r.state === 1) { n.value += 1; if (n.value === n.length) { n.changed = 1; n.state = 2; } }
  else if (r.state === 3) { n.value -= 1; if (n.value === 0) { n.changed = 1; n.state = 0; } }
  return n;
}
/** func_00234AC0, func_00234AE0 */
const show = (r) => (r.state === 0 ? { ...r, value: 0, state: 1, changed: 1 } : r);
const hide = (r) => (r.state === 2 ? { ...r, value: r.length, state: 3, changed: 1 } : r);
const same = (a, b) => ['length', 'value', 'changed', 'state'].every((k) => a[k] === b[k]);

export function verify(file) {
  const trace = readTrace(file);
  if (!trace.complete) throw new Error(`${file}: ${trace.reason}`);
  const probes = trace.probes.filter((p) => [A.tick, A.push, A.close, A.open].includes(p.pc)).sort((a, b) => a.at - b.at);
  const out = { ticks: 0, steps: 0, pushes: 0, closes: 0, opens: 0, problems: [], lengths: [] };
  let expected = null;
  let previous = null;
  for (const p of probes) {
    if (p.pc === A.tick) {
      const r = ramp(p.mem[0].bytes);
      out.ticks += 1;
      if (expected) { if (same(expected, r)) out.steps += 1; else out.problems.push(`frame ${p.frame}: ramp ${JSON.stringify(r)}, computed ${JSON.stringify(expected)}`); }
      const after = step(r);
      // The page opens on the frame the rising value reaches the second term (HDD: D_003702CC).
      if (A.terms && r.state === 1 && after.value === p.mem[1].bytes.readInt32LE(0)) out.wantOpen = p.frame;
      expected = after;
      previous = p;
    } else if (p.pc === A.push) {
      out.pushes += 1;
      const r = ramp(p.mem[0].bytes);
      if (A.terms) {
        const length = p.mem[1].bytes.readInt32LE(0) + p.mem[1].bytes.readInt32LE(4);
        out.lengths.push(length);
        expected = show({ ...r, length });
      } else expected = null;
    } else if (p.pc === A.close) {
      out.closes += 1;
      const r = ramp(p.mem[0].bytes);
      if (expected && !same(expected, r)) out.problems.push(`close at frame ${p.frame}: ramp ${JSON.stringify(r)}, computed ${JSON.stringify(expected)}`);
      expected = hide(r);
    } else if (p.pc === A.open) {
      out.opens += 1;
      if (A.terms && out.wantOpen !== p.frame) out.problems.push(`page opened at frame ${p.frame}, computed ${out.wantOpen}`);
    }
  }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('verify_options.mjs')) {
  const r = verify(process.argv[2]);
  console.log(`build: ${BUILD_NAME}   ticks ${r.ticks}, steps equal ${r.steps}, pushes ${r.pushes} (lengths ${r.lengths.join(', ')}), page opened ${r.opens}, closes ${r.closes}`);
  for (const t of r.problems.slice(0, 12)) console.log(`  ! ${t}`);
  console.log(`verdict: ${r.problems.length === 0 && r.steps > 0 ? `FOUND ${r.ticks} frames of the options dialog, every ramp value equal` : 'PARTIAL see the lines marked !'}`);
}
