// The generator state at the clock thread's start, from the calls that precede it (HDD OSD 1.10U).
//   rand  0x0029C6E8: state = state * 0x41C64E6D + 0x3039 (32 bits, kept whole); returns state & 0x7FFFFFFF
//   srand 0x0029C6D8: state = argument
//   state word: *(_impure_ptr_0 0x00347384) + 0x58; the ELF holds 1 there (block 0x00347098 + 0x58)
// A log (cold_rand.mjs) records every call from power-on with its caller and the state before it, the state at
// module_clock_init_resources (0x00225DB0) and the seven angles func_0022EF40 draws next (D_00405210).
// This verifier recomputes: every call's state from the one before it (no call is missing), the state at the
// init from the calls (so it is LCG^n of the ELF's seed on a plain power-on), and the angles from that state.
//
// node verify_cold_rand_chain.mjs <log>...
import { logPath } from './cold_writes.mjs';
import { word } from './elf_words.mjs';
import fs from 'node:fs';

const next = (state) => (Math.imul(state, 0x41c64e6d) + 0x3039) >>> 0;
const ELF_SEED = word(word(0x347384) + 0x58);
const ANGLE_CALLER = 0x22f030;

let all = true;
const fail = (text) => { all = false; console.log(`  DIFFERENT ${text}`); };
const opening = [];
for (const file of process.argv.slice(2)) {
  const log = JSON.parse(fs.readFileSync(logPath(file, 'rand'), 'utf8'));
  const calls = log.calls;
  let state = calls[0].state >>> 0;
  let missing = 0;
  let before = 0;
  const counts = {};
  calls.forEach((call, i) => {
    if ((call.state >>> 0) !== state) { missing++; state = call.state >>> 0; }
    if (i < log.initCalls) before++;
    const key = `${call.kind} ${call.ra}`;
    counts[key] = (counts[key] ?? 0) + 1;
    state = call.kind === 'rand' ? next(state) : call.arg >>> 0;
    if (i + 1 === log.initCalls) log.recomputedInit = state;
  });
  if (log.initCalls === 0) log.recomputedInit = calls[0].state >>> 0;
  const srands = calls.filter((c) => c.kind === 'srand').length;
  const fromStart = !log.state;
  const initOk = log.recomputedInit === (log.initState >>> 0);
  const seedOk = !fromStart || (calls[0].state >>> 0) === ELF_SEED;
  const afterInit = calls.slice(log.initCalls).filter((c) => c.kind === 'rand' && parseInt(c.ra, 16) === ANGLE_CALLER);
  let angleOk = afterInit.length === 7;
  if (angleOk) {
    let s = afterInit[0].state >>> 0;
    afterInit.forEach((c, k) => { s = next(s); angleOk &&= ((s & 0x7fffffff) % 65536) === (log.orbRandom[k] >>> 0); });
  }
  console.log(`${file.split(/[\/]/).pop()}: ${calls.length} calls (${before} before the init, ${srands} srand), ${missing} states not the successor of the one before, `
    + `init state 0x${(log.initState >>> 0).toString(16)}, recomputed 0x${log.recomputedInit.toString(16)}, first state 0x${(calls[0].state >>> 0).toString(16)}${fromStart ? ` (ELF seed ${ELF_SEED})` : ' (loaded state)'}`);
  console.log(`  callers ${Object.entries(counts).map(([k, v]) => `${k} x${v}`).join('; ')}`);
  console.log(`  angles after the init ${afterInit.length}: ${log.orbRandom.map((v) => v.toString(16)).join(' ')} ${angleOk ? 'equal' : 'DIFFERENT'}`);
  if (missing) fail('a call is missing between two probed states');
  if (!initOk) fail('the init state is not the state the calls lead to');
  if (!seedOk) fail('the first state is not the ELF seed');
  if (!angleOk) fail('the seven angles are not the seven draws');
  if (log.args?.includes('BootOpening') || log.state) opening.push(log.initState >>> 0);
}
if (opening.length > 1 && new Set(opening).size !== 1) fail(`the runs through the opening (with and without a play history) end in different states: ${opening.map((s) => `0x${s.toString(16)}`).join(' ')}`);
else if (opening.length > 1) console.log(`  runs through the opening, with and without a play history: the same init state 0x${opening[0].toString(16)}`);
console.log(`verdict: ${all ? 'FOUND every state follows from the calls; the angles are the seven draws after the init' : 'PARTIAL'}`);
