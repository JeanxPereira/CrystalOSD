// The cosf of ee_libm.mjs against the program's own: every call the cube placement (HDD
// module_clock_2306B0) makes in a capture taken with verify_cubes.mjs's probes (the argument at
// 0x002307B0, the result at 0x002307B8), bit for bit.
//
// node check_cosf.mjs <trace.jsonl> ...
import { readTrace } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/trace.js';
import { cosf } from './ee_libm.mjs';
import { asFloat, floatBits } from './clock_math.mjs';
let total = 0, equal = 0; const bad = []; const seen = new Set();
for (const file of process.argv.slice(2)) {
  const trace = readTrace(file);
  let angle = null;
  for (const p of trace.probes) {
    if (p.pc === 0x2307b0) angle = p.fpr[12];
    else if (p.pc === 0x2307b8 && angle !== null) {
      total += 1; seen.add(angle);
      const got = floatBits(cosf(asFloat(angle)));
      if (got === p.fpr[0]) equal += 1; else if (bad.length < 5) bad.push(`${asFloat(angle)}: sent ${p.fpr[0].toString(16)} computed ${got.toString(16)}`);
      angle = null;
    }
  }
}
console.log(`cosf: ${equal} of ${total} results equal bit for bit, ${seen.size} distinct arguments`);
for (const text of bad) console.log(`  ! ${text}`);
console.log(`verdict: ${total > 0 && equal === total ? 'FOUND every result equal' : 'PARTIAL'}`);
