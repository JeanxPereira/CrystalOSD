// The seven per-orb random angles drawn at every start of the clock thread (HDD OSD
// func_0022EF40 0x0022F028..0x0022F054 into D_00405210; ROM 2.30 0x0022B048..0x0022B074 into
// 0x003711E0), from the C library's rand (HDD 0x0029C6E8, ROM 0x00267760):
//   state = state * 0x41C64E6D + 12345 (32 bits, kept whole); rand = state & 0x7FFFFFFF
//   R_k = rand % 65536 (C remainder; rand is never negative)
// The state is in the reentrancy block (_impure_ptr + 0x58). It is seeded 1 and no srand runs
// before the clock on a plain power-on, so R_0..R_6 are the same on every such power-on.
// Against sessions that stopped at the first rand call of that loop (condition ra == the loop's
// return address; v1 = the state) and after the loop (the seven words).
// node verify_rand.mjs <log>...
import fs from 'node:fs';

export function angles(state) {
  const out = [];
  for (let k = 0; k < 7; k++) { state = (Math.imul(state, 0x41c64e6d) + 12345) >>> 0; out.push((state & 0x7fffffff) % 65536); }
  return out;
}
let all = true;
for (const file of process.argv.slice(2)) {
  const text = fs.readFileSync(file, 'utf8');
  const state = parseInt(/v1 += 0x([0-9A-F]{8})\./.exec(text)[1], 16);
  const dump = [...text.matchAll(/\| [0-9a-f]{8}  ([0-9a-f ]+?)\s+\|/g)].map((m) => m[1].replace(/ /g, '')).join('');
  const words = []; const bytes = Buffer.from(dump, 'hex'); for (let i = 0; i < 28; i += 4) words.push(bytes.readInt32LE(i));
  const want = angles(state);
  const ok = want.every((v, i) => v === words[i]);
  all &&= ok;
  console.log(`${file.split(/[\/]/).pop()}: state 0x${state.toString(16)}; sent ${words.map((w) => w.toString(16)).join(' ')}; computed ${want.map((w) => w.toString(16)).join(' ')}; ${ok ? 'equal' : 'DIFFERENT'}`);
}
console.log(`verdict: ${all ? 'FOUND every angle equal' : 'PARTIAL'}`);
