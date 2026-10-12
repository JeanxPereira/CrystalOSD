// Export the cold-start init probes of one capture (References/scripts/cold_init_probes.mjs) as JSON: for each init function the
// registers at its entry, the memory it wrote (the words that differ between its entry and its exit, in the probed ranges), and
// the RAM image at the entry of module_clock_init_resources.
//
//   node tools/scene/export_cold.mjs <capture> --out <dir>
//   capture: hddosd-110U-cold-init-{ntsc,pal}, rom-0230A-cold-init-ntsc, rom-0230E-cold-init-pal (the Watson captures folder)
//   writes init-<function>.json for each of the thirteen functions and image-init-start.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const capture = argv[0];
const outAt = argv.indexOf('--out');
if (!capture || outAt < 0) { console.error('usage: node export_cold.mjs <capture> --out <dir>'); process.exit(2); }
const out = argv[outAt + 1];
const build = capture.startsWith('hddosd') ? 'hdd' : 'rom';
const video = capture.includes('pal') ? 'pal' : 'ntsc';
process.env.CLOCK_BUILD = build;
if (video === 'pal') process.env.CLOCK_VIDEO = 'pal'; else delete process.env.CLOCK_VIDEO;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.join(HERE, '../../References/scripts');
const url = (file) => pathToFileURL(file).href;
const probes = await import(url(path.join(SCRIPTS, 'cold_init_probes.mjs')));
const trace = await import(url(path.join(HERE, '../../References/lib/trace.mjs')));
const CAPTURES = process.env.CRYSTALOSD_CAPTURES ?? 'D:/CodingProjects/Watson/Runtime/captures';
const file = path.isAbsolute(capture) ? capture : path.join(CAPTURES, `${capture}.trace.jsonl`);
const loaded = trace.readTraceFor(file, probes.PROBES);
if (!loaded.complete) throw new Error(`${capture}: ${loaded.reason}`);
const records = trace.probesOf(loaded, probes.PROBES);
const at = (pc) => {
  const index = probes.PROBES.findIndex((p) => parseInt(p.pc, 16) === pc);
  if (index < 0 || records[index].length === 0) throw new Error(`${capture}: no probe record at 0x${pc.toString(16)}`);
  return records[index];
};
const hex8 = (v) => (v >>> 0).toString(16).padStart(8, '0');
const hex = (buffer) => (buffer ? buffer.toString('hex') : null);

const sites = probes.SITES;
const address = (name) => probes.FUNCTIONS.find((f) => f[0] === name)[build === 'hdd' ? 1 : 2];
const INIT = address('module_clock_init_resources');
const EXPORTED = ['func_00238F10', 'func_00235E98', 'func_00235848', 'func_00234F78', 'func_00234B88', 'do_load_font', 'func_0022EF40', 'func_002324C8', 'func_00232858', 'func_0022CB50', 'func_00234C28', 'clock_stuff1', 'module_clock_225D98'];

/** The words that differ between two probe records' memory. */
function diff(before, after) {
  const words = [];
  before.mem.forEach((range, i) => {
    const a = range.bytes, b = after.mem[i].bytes;
    if (!a || !b) return;
    for (let o = 0; o + 4 <= a.length; o += 4) {
      const x = a.readUInt32LE(o), y = b.readUInt32LE(o);
      if (x !== y) words.push({ address: `0x${hex8(range.address + o)}`, before: `0x${hex8(x)}`, after: `0x${hex8(y)}` });
    }
  });
  return words;
}
const registers = (record) => ({ gpr: record.gpr.map((v) => `0x${hex8(v)}`), fpr: record.fpr.map((v) => `0x${hex8(v)}`) });

fs.mkdirSync(out, { recursive: true });
let count = 0;
for (const name of EXPORTED) {
  const entry = at(address(name))[0];
  let exit;
  let exitPc;
  const chain = sites.findIndex((s) => s.name === name);
  if (chain >= 0) {
    exitPc = chain + 1 < sites.length ? sites[chain + 1].site : INIT + 0xb8;
    exit = at(exitPc)[0];
  } else {
    const slots = probes.THREAD_EXITS[name];
    exitPc = slots[slots.length - 1];
    exit = at(exitPc)[0];
  }
  const record = {
    function: name, build, video, address: `0x${hex8(address(name))}`, entryFrame: entry.frame, entry: registers(entry),
    exit: { pc: `0x${hex8(exitPc)}`, frame: exit.frame }, writes: diff(entry, exit),
  };
  fs.writeFileSync(path.join(out, `init-${name}.json`), `${JSON.stringify(record, null, 1)}\n`);
  count++;
}
const start = at(INIT)[0];
const image = { function: 'module_clock_init_resources', build, video, entryFrame: start.frame, entry: registers(start), ranges: start.mem.map((r) => ({ address: `0x${hex8(r.address)}`, hex: hex(r.bytes) })) };
fs.writeFileSync(path.join(out, 'image-init-start.json'), `${JSON.stringify(image)}\n`);
console.log(`${capture}: ${count} function files and the start image in ${out}`);
