// The orb's trail while its ring of 50 entries is still filling (the first 150 frames after the
// clock thread starts): recompute the line strip from the ring the orb function really got and
// compare with what it really sent. With the ring full the strip has 49 points; before that it
// has head - 1, taken from entry head - i, and i is stretched to the 0..49 range for the fade.
//
// node verify_trail_fill.mjs <trace.jsonl>          (probes: verify_orbs.mjs)
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { GifPath } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/gif.js';
import { REG } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/registers.js';
import { BUILD_NAME } from './builds.mjs';
import { ORB, PROBES as ORB_PROBES, expectTrail } from './verify_orbs.mjs';

export const PROBES = ORB_PROBES;

/** Every run of RGBAQ, XYZ2 pairs in a packet that follows a PRIM 0x82 (line strip) write. */
function strips(trace, from, to) {
  const found = [];
  let open = null, colour = null;
  for (let at = from; at < to; at++) {
    for (const event of new GifPath().feed(trace.packets[at].bytes)) {
      if (event.kind !== 'write') continue;
      if (event.reg === REG.PRIM) {
        if (open) found.push(open);
        open = event.value === 0x82n ? [] : null;
        colour = null;
      } else if (open && event.reg === REG.RGBAQ) colour = event.value;
      else if (open && (event.reg === REG.XYZ2 || event.reg === REG.XYZF2) && colour !== null) { open.push({ rgbaq: colour, xyz: event.value }); colour = null; }
      else if (open) { found.push(open); open = null; }
    }
  }
  if (open) found.push(open);
  return found;
}

export function verify(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const result = { calls: { full: 0, filling: 0 }, heads: new Set(), strips: 0, points: [0, 0], colours: [0, 0], lengths: [0, 0], stripsPerCall: {}, problems: [], firstFrame: null, fullFrame: null };
  const problem = (text) => { if (result.problems.length < 12) result.problems.push(text); };
  const hits = trace.probes.filter((probe) => probe.pc === ORB && !probe.preroll);
  hits.forEach((probe, n) => {
    const record = probe.mem[0].bytes;
    if (!record) { problem('an orb record was not readable'); return; }
    const expected = expectTrail(record);
    result.calls[expected.full ? 'full' : 'filling'] += 1;
    result.firstFrame ??= probe.frame;
    if (expected.full) { result.fullFrame ??= probe.frame; return; }
    result.heads.add(expected.head);
    const end = n + 1 < hits.length ? hits[n + 1].at : trace.packets.length;
    const sent = strips(trace, probe.at, end);
    result.stripsPerCall[sent.length] = (result.stripsPerCall[sent.length] ?? 0) + 1;
    for (const strip of sent) {
      result.strips += 1;
      result.lengths[1] += 1;
      if (strip.length === expected.points.length) result.lengths[0] += 1;
      else { problem(`frame ${probe.frame} head ${expected.head}: ${strip.length} points sent, ${expected.points.length} computed`); continue; }
      strip.forEach((point, i) => {
        result.points[1] += 1;
        result.colours[1] += 1;
        if (point.xyz === expected.points[i].xyz) result.points[0] += 1;
        else problem(`frame ${probe.frame} head ${expected.head} point ${i} position: sent 0x${point.xyz.toString(16)}, computed 0x${expected.points[i].xyz.toString(16)}`);
        if (point.rgbaq === expected.points[i].rgbaq) result.colours[0] += 1;
        else problem(`frame ${probe.frame} head ${expected.head} point ${i} colour: sent 0x${point.rgbaq.toString(16)}, computed 0x${expected.points[i].rgbaq.toString(16)}`);
      });
    }
  });
  return result;
}

if (process.argv[1] && process.argv[1].endsWith('verify_trail_fill.mjs')) {
  const result = verify(process.argv[2]);
  const heads = [...result.heads].sort((a, b) => a - b);
  console.log(`build: ${BUILD_NAME}`);
  console.log(`orb calls: ${result.calls.filling} with the ring still filling (head ${heads[0]}..${heads[heads.length - 1]}, ${heads.length} values), ${result.calls.full} with it full`);
  console.log(`first orb call at frame ${result.firstFrame}; first call with a full ring at frame ${result.fullFrame}`);
  console.log(`line strips found per filling call: ${JSON.stringify(result.stripsPerCall)}`);
  console.log(`  strip lengths ${result.lengths[0]} of ${result.lengths[1]} equal`);
  console.log(`  positions     ${result.points[0]} of ${result.points[1]} equal`);
  console.log(`  colours       ${result.colours[0]} of ${result.colours[1]} equal`);
  for (const text of result.problems) console.log(`  ! ${text}`);
  const whole = result.calls.filling > 0 && result.strips > 0 && result.lengths[0] === result.lengths[1] && result.points[0] === result.points[1] && result.colours[0] === result.colours[1] && result.points[1] > 0;
  console.log(`verdict: ${whole ? `FOUND ${result.strips} line strips of filling rings, ${result.points[1]} points, every value equal` : 'PARTIAL'}`);
  process.exit(whole ? 0 : 3);
}
