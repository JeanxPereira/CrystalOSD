// A cold-run start JSON against an old start JSON (the capture of someone else's run), field by field, with a second cold run of the
// same route at another time of day to say what follows the clock.
//   node tools/scene/cold_run_compare.mjs <old.json> <new.json> <repeat.json> [--all]
// The pieces the design lists as fed from the capture (time, rtcMirror, configItems, mechaconParam, videoMode, pad, orbRandom) and the values
// that follow the time (eased, state) are exempt as pieces. template and rings (the rod record the draws leave behind, the orbs' trails)
// follow the clock too: a leaf of them may differ if it also differs between <new> and <repeat>, two cold runs of one route started minutes
// apart. template.number is the rod drawn last, (state.currentRod + 11) % 12 while the rods are drawn, in both JSONs. Every other leaf that
// differs between <old> and <new> is unexplained. Metadata (capture, build, frame) is exempt. The pieces <new> does not hold are listed.
import fs from 'node:fs';
import { compareLeaves } from './cold_compare.mjs';

const EXEMPT_PIECES = {
  time: 'RTC input',
  rtcMirror: 'RTC input',
  configItems: 'settings and RTC input (items 6 to 11 follow the RTC)',
  mechaconParam: 'settings input',
  videoMode: 'video mode input',
  pad: 'controller input',
  orbRandom: 'rand state',
  eased: 'follows the time (func_0022EBD0)',
  state: 'follows the time (func_0022EBD0, func_0022EF40)',
  capture: 'metadata', build: 'metadata', frame: 'metadata',
};

const [oldFile, newFile, repeatFile] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!oldFile || !newFile || !repeatFile) { console.error('usage: node cold_run_compare.mjs <old.json> <new.json> <repeat.json> [--all]'); process.exit(2); }
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const rows = compareLeaves(read(oldFile), read(newFile));
const repeat = new Set(compareLeaves(read(newFile), read(repeatFile)).filter((r) => !r.equal).map((r) => r.piece + r.leaf));

const FOLLOW_PIECES = new Set(['template', 'rings']);
const relation = (json) => json.template.number === (json.appearance.counter > 0 ? (json.state.currentRod + 11) % 12 : 0);
const oldJson = read(oldFile), newJson = read(newFile);
const numberRule = relation(oldJson) && relation(newJson);
let compared = 0;
const missing = {};
const exempt = {};
const followed = {};
const unexplained = [];
for (const row of rows) {
  if (row.b === undefined) { missing[row.piece] = (missing[row.piece] ?? 0) + 1; continue; }
  compared++;
  if (row.equal) continue;
  if (row.piece in EXEMPT_PIECES) { exempt[row.piece] = (exempt[row.piece] ?? 0) + 1; continue; }
  if (row.piece === 'template' && row.leaf === '.number' && numberRule) { followed['template.number'] = 1; continue; }
  if (FOLLOW_PIECES.has(row.piece) && repeat.has(row.piece + row.leaf)) { followed[row.piece] = (followed[row.piece] ?? 0) + 1; continue; }
  unexplained.push(row);
}
const total = (o) => Object.values(o).reduce((a, b) => a + b, 0);
console.log(`${newFile} against ${oldFile}: ${compared} leaves compared, ${compared - total(exempt) - total(followed) - unexplained.length} equal`);
console.log(`  exempt pieces (${total(exempt)} leaves): ${Object.entries(exempt).map(([k, v]) => `${k} ${v} (${EXEMPT_PIECES[k]})`).join('; ')}`);
console.log(`  leaves that follow the clock (${total(followed)}; template.number by the rod before the current one, the rest as they also differ between two cold runs): ${Object.entries(followed).map(([k, v]) => `${k} ${v}`).join('; ')}`);
console.log(`  not in the new JSON (${total(missing)}): ${Object.entries(missing).map(([k, v]) => `${k} ${v}`).join('; ')}`);
for (const row of unexplained) console.log(`  UNEXPLAINED ${row.piece}${row.leaf} old ${JSON.stringify(row.a)} new ${JSON.stringify(row.b)}`);
console.log(`verdict: ${unexplained.length ? `PARTIAL ${unexplained.length} leaves differ without a cause` : 'FOUND every difference is an input or follows the clock'}`);
