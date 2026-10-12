// Probes at the entry and exit of the clock thread's init functions, for capture.mjs (--verifiers cold_init_probes.mjs):
// register and memory inputs at each function's entry, the memory at its exit. HDD OSD 1.10U and ROM 2.30.
//
//   module_clock_init_resources (HDD OSD 0x225DB0, ROM 0x221488) calls, in this order: 238F10, 235E98, 235848, 234F78, 234B88,
//   clock_load_texture (2334A8), 2347D8 x 10, do_load_font (226B10), 22EF40, 2324C8, 232858, 22CB50, 234C28 (a0 = 2), then stores
//   the camera offset. The state a function leaves is the state at the next call's jal (nothing runs between a return and the
//   next jal); the last function's, at 0x225E68. clock_stuff1 (225950) and module_clock_225D98 are called by the thread: their
//   exits are their `jr ra` delay slots.
// Memory: the pieces of clock_memory.mjs LAYOUT (merged), the font heap window at the init's entry and exit.
// node cold_init_probes.mjs        prints the probes of CLOCK_BUILD
import { DATA_HOME } from '../lib/data.mjs';
import fs from 'node:fs';
import { BUILD, PAL } from './builds.mjs';
import { LAYOUT } from '../model/clock_memory.mjs';

const REFERENCES = DATA_HOME;
const hdd = BUILD === 'hdd';
const INIT = hdd ? 0x225db0 : 0x221488;
export const FUNCTIONS = [
  ['module_clock_init_resources', 0x225db0, 0x221488],
  ['func_00238F10', 0x238f10, 0x2354c8],
  ['func_00235E98', 0x235e98, 0x232310],
  ['func_00235848', 0x235848, 0x231cf0],
  ['func_00234F78', 0x234f78, 0x231580],
  ['func_00234B88', 0x234b88, 0x231190],
  ['clock_load_texture', 0x2334a8, 0x22f9d8],
  ['func_002347D8', 0x2347d8, 0x230e10],
  ['do_load_font', 0x226b10, 0x222298],
  ['func_0022EF40', 0x22ef40, 0x22af60],
  ['func_002324C8', 0x2324c8, 0x22e7a8],
  ['func_00232858', 0x232858, 0x22eaf0],
  ['func_0022CB50', 0x22cb50, 0x228ad8],
  ['func_00234C28', 0x234c28, 0x231230],
  ['clock_stuff1', 0x225950, 0x220ff8],
  ['module_clock_225D98', 0x225d98, 0x221470],
];
const address = (entry) => (hdd ? entry[1] : entry[2]);
const CHAIN = ['func_00238F10', 'func_00235E98', 'func_00235848', 'func_00234F78', 'func_00234B88', 'clock_load_texture',
  ...Array(10).fill('func_002347D8'), 'do_load_font', 'func_0022EF40', 'func_002324C8', 'func_00232858', 'func_0022CB50', 'func_00234C28'];
const byName = Object.fromEntries(FUNCTIONS.map((f) => [f[0], f]));

const image = () => {
  if (hdd) {
    const elf = fs.readFileSync(`${REFERENCES}/dumps/hddosd-host/hddosd.elf`);
    const phoff = elf.readUInt32LE(28);
    const off = elf.readUInt32LE(phoff + 4), va = elf.readUInt32LE(phoff + 8), size = elf.readUInt32LE(phoff + 16);
    return (a) => (a >= va && a + 4 <= va + size ? elf.readUInt32LE(off + a - va) : null);
  }
  const dump = fs.readFileSync(`${REFERENCES}/dumps/${PAL ? 'rom-0230E-pal-clock-ee-00100000.bin' : 'rom-0230A-clock-ee-00100000.bin'}`);
  return (a) => (a >= 0x100000 && a + 4 <= 0x100000 + dump.length ? dump.readUInt32LE(a - 0x100000) : null);
};
const word = image();

/** The call sites of module_clock_init_resources, checked against the image: each is a jal to the expected function. */
export function chainSites() {
  const sites = [];
  let at = INIT + 8;
  for (const name of CHAIN) {
    const w = word(at);
    const target = ((w & 0x03ffffff) << 2) >>> 0;
    if (w >>> 26 !== 3 || target !== address(byName[name])) {
      at += 4;
      const again = word(at);
      if (again >>> 26 !== 3 || ((again & 0x03ffffff) << 2) >>> 0 !== address(byName[name])) throw new Error(`${BUILD}: no jal to ${name} near 0x${at.toString(16)}`);
    }
    sites.push({ name, site: at });
    at += 8;
  }
  return sites;
}
const jrSlots = (start, length) => {
  const slots = [];
  for (let at = start; at < start + length; at += 4) if (word(at) === 0x03e00008) slots.push(at + 4);
  return slots;
};

const merge = (ranges, gap) => {
  const sorted = ranges.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [start, end] of sorted) {
    const last = out[out.length - 1];
    if (last && start <= last[1] + gap) last[1] = Math.max(last[1], end); else out.push([start, end]);
  }
  return out;
};
const fmt = (a) => `0x${a.toString(16).padStart(8, '0')}`;
export const RANGES = merge(Object.values(LAYOUT).filter(([h, r]) => (hdd ? h : r) != null).map(([h, r, n]) => [hdd ? h : r, (hdd ? h : r) + n]), 0x1000)
  .flatMap(([s, e]) => Array.from({ length: Math.ceil((e - s) / 0x10000) }, (_, k) => `${fmt(s + k * 0x10000)}:0x${Math.min(0x10000, e - s - k * 0x10000).toString(16)}`));
export const HEAP = hdd ? [0, 1, 2, 3, 4].map((k) => `${fmt(0x420000 + k * 0x10000)}:0x10000`) : [];

export const SITES = chainSites();
export const PROBES = [];
const add = (pc, ranges = RANGES) => PROBES.push({ pc: fmt(pc), ranges });
add(INIT, [...RANGES, ...HEAP]);
for (const entry of FUNCTIONS.slice(1)) add(address(entry));
for (const { site } of SITES) add(site);
add(INIT + 0xb8);
for (const slot of jrSlots(INIT, 0x100)) add(slot, [...RANGES, ...HEAP]);
export const THREAD_EXITS = {};
for (const name of ['clock_stuff1', 'module_clock_225D98']) {
  THREAD_EXITS[name] = jrSlots(address(byName[name]), name === 'clock_stuff1' ? 0x80 : 0x30);
  for (const slot of THREAD_EXITS[name]) add(slot);
}

if (process.argv[1]?.endsWith('cold_init_probes.mjs')) {
  console.log(`${BUILD}${PAL ? ' pal' : ''}: ${PROBES.length} probes; ranges ${RANGES.join(' ')} ${HEAP.join(' ')}`);
  console.log(SITES.map((s) => `${s.name}@${s.site.toString(16)}`).join(' '));
  console.log(PROBES.map((p) => p.pc.slice(2).replace(/^0+/, '')).join(' '));
}
