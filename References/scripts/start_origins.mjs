// The start state's fields against the HDD OSD 1.10U image: for every field of the four start JSONs
// (resources/clock/start.json, start-boot.json, resources/menus/start-menu.json, start-clock.json),
// its address, its section, the value the ELF image holds there, the value in each JSON and whether the ELF
// value equals it. A field is one leaf of a piece (a piece is a named range of clock_memory.mjs LAYOUT, decoded by
// PIECES of tools/scene/instrument.mjs); its byte offset is found by changing one byte at a time and seeing which
// leaf of the decoded piece moves.
//
// node start_origins.mjs                 per-piece summary, then the totals by origin class
// node start_origins.mjs --fields        also every field: piece.path address section elf | json values | = or !
// node start_origins.mjs --piece <name>  only that piece (with its fields)
// node start_origins.mjs --writers       the origin table (class, writer, note) of each piece
// node start_origins.mjs --md             the piece table as markdown (the table of the reading)
//
// Env: CLOCK_DUMPS (dumps folder, holds hddosd-host/hddosd.elf), CRYSTALOSD_DATA (data home), CLOCK_START (folder holding tests/data/start, default this repository).
// Sections come from the link script of CrystalOSD (OSDSYS_link.ld): the ELF has one PT_LOAD and no section headers.
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import { dataPath } from '../lib/data.mjs';
const here = fileURLToPath(new URL('.', import.meta.url));
const references = `${here}../`;
const startRoot = (process.env.CLOCK_START ?? `${here}../..`).replace(/\\/g, '/').replace(/\/$/, '');
const dumps = process.env.CLOCK_DUMPS ? process.env.CLOCK_DUMPS.split(path.sep).join('/').replace(/\/$/, '') : dataPath('dumps');
const elfPath = `${dumps}/hddosd-host/hddosd.elf`;
const { LAYOUT } = await import(pathToFileURL(`${references}model/clock_memory.mjs`).href);
const { PIECES } = await import(pathToFileURL(`${here}../../tools/scene/instrument.mjs`).href);

const JSONS = [
  ['start', 'tests/data/start/start.json'],
  ['boot', 'tests/data/start/start-boot.json'],
  ['menu', 'tests/data/start/start-menu.json'],
  ['sqr', 'tests/data/start/start-clock.json'],
];
const starts = JSONS.map(([name, file]) => ({ name, json: JSON.parse(fs.readFileSync(`${startRoot}/${file}`, 'utf8')) }));

const elf = fs.readFileSync(elfPath);
const phoff = elf.readUInt32LE(28);
const load = { off: elf.readUInt32LE(phoff + 4), va: elf.readUInt32LE(phoff + 8), size: elf.readUInt32LE(phoff + 16) };
const inImage = (a, n) => a >= load.va && a + n <= load.va + load.size;
const image = (a, n) => (inImage(a, n) ? Buffer.from(elf.subarray(load.off + a - load.va, load.off + a - load.va + n)) : null);

const SECTIONS = [[0x200000, 0x2a47a0, '.text'], [0x2a47a0, 0x3477e0, '.data'], [0x3477e0, 0x36f980, '.rodata'], [0x36f980, 0x3709a0, '.sdata'],
  [0x3709a0, 0x370c98, '.sbss'], [0x370c98, 0x50a780, '.bss'], [0x50a780, 0x5ae830, '.module_storage']];
export const sectionOf = (a) => (a < 0x200000 ? 'lowmem' : SECTIONS.find(([lo, hi]) => a >= lo && a < hi)?.[2] ?? '?');

const leaves = (value, path = '', out = new Map()) => {
  if (value !== null && typeof value === 'object') for (const [k, v] of Object.entries(value)) leaves(v, path ? (Array.isArray(value) ? `${path}[${k}]` : `${path}.${k}`) : k, out);
  else out.set(path, value);
  return out;
};

const offsetsOf = (decode, bytes) => {
  const base = leaves(decode(bytes));
  const at = new Map();
  for (let i = 0; i < bytes.length; i++) {
    const b = Buffer.from(bytes);
    b[i] ^= 0x5a;
    let moved;
    try { moved = leaves(decode(b)); } catch { continue; }
    for (const [p, v] of moved) if (base.get(p) !== v && !at.has(p)) at.set(p, i);
  }
  return { base, at };
};

// ---- the origin table: what the disassembly says writes each piece (HDD OSD 1.10U, the disassembly (CRYSTALOSD_ASM)) ------------
// Classes: ELF-constant (no store to it found by the writer search; value read from the image),
//          init-writer(<function>) (set once when the clock module starts), per-frame-state (value depends on the
//          frames that ran, or on menu input), opening-hand-off, external (RTC, console settings, drive, controller,
//          video mode), no-writer-found.
// `fields`: [leaf-path regex, class] first match wins; else `class`. Writer search: a register-tracking pass over
// every function of the disassembly (CRYSTALOSD_ASM) (lui/addiu %hi/%lo/%gp_rel of a block, sw/sh/sb/swc1/sq at an offset), plus the
// functions that are handed the block's address; addresses are HDD OSD 1.10U.
const E = 'external', F = 'per-frame-state', C = 'ELF-constant', O = 'opening-hand-off';
const I = (fn) => `init-writer(${fn})`;
const rampRule = (initFn) => [['(^|\\.)length$', I(initFn)], ['(^|\\.)(counter|changed|state)$', F]];
const rect = (...more) => [[`^(x1|y1|u1|v1${more.map((m) => `|${m}`).join('')})$`, F]];
const ORIGINS = {
  time: { class: E, writers: 'init func_00235848 (0x235848, called by module_clock_init_resources) -> func_002358F8 (0x2358F8) stores seconds/minutes/hours/day/month/year from rtcMirror (0x1F0D1C..0x1F0D30) and clears ms; per frame func_00235B10 (0x235B10) adds the frame period to ms and resyncs to the RTC', note: 'RTC time; frame-dependent after the first frame' },
  eased: { class: F, writers: 'init func_0022E9C8 (0x22E9C8, from func_0022EF40) sets the hands from the time; per frame func_0022EBD0 (0x22EBD0); module_clock_22F760 (0x22F760) stores the fraction (+8)' },
  state: { class: F, writers: 'init func_0022EF40 (0x22EF40): +0x250/+0x260 from D_002B5660/D_002B5650, per rod +0x10 and +0x14 = 0, +0x20 base colour from the table, current rod from the time (func_0022E9C8); per frame func_0022F1A0 (+0x10, +0x14), func_0022EBD0 (+0, +4, +6, +0x270), func_0022EE20 (+0x280..0x290), func_0022E8C0 (colour chase via func_00238D00)' },
  appearance: { class: F, fields: rampRule('func_0022EF40'), writers: 'init func_0022EF40 stores length = D_003702E8 (set to 1 by func_00234B88); per frame func_0022F1A0 ticks it; func_0022F078/func_0022F110 start it' },
  colours: { class: F, writers: 'func_0022EAD0 (0x22EAD0) and func_0022EB50 (0x22EB50) pick the next table entry, func_00238D00 chases the colour; called per frame by func_0022EE20' },
  cycleCounters: { class: F, writers: 'func_0022EAD0 (+0, +4), func_0022EB50 (+8, +0xC), func_0022EE20 (+0x10); per frame' },
  cycleTables: { class: C, writers: 'none found (func_0022EAD0/func_0022EB50 read it)' },
  logicConstants: { class: C, writers: 'none found' },
  scene: { class: F, fields: [['^scale$', F], ['^leaving$', F], ['^field$', F]], writers: 'scale: module_clock_225D98 (0x225D98) stores 1.0 at thread start, func_00232640 (0x232640) per frame; leaving (+4): clock_input_check_handler_p6_p7_tgt (0x2259B8) clears at entry, sets at exit; field (+8): the same handler copies evenOddField (0x1F0CA4) each frame' },
  scaleTarget: { class: F, writers: 'clock_config_change_cb_clock, D_00227BE8, func_0022D760, func_0022D828, D_00226FD0 (menus, first run, Clock Adjustment)' },
  scaleFactor: { class: C, writers: 'none found' },
  timeFilled: { class: F, writers: 'func_002358F8 clears it (init and RTC resync); func_00235B10 sets it to 1 after the first resync' },
  mode: { class: F, writers: 'init func_00234B88 (0x234B88) stores 0, then module_clock_init_resources calls func_00234C28 (0x234C28) with 2; per frame func_00234EA8 (0x234EA8)' },
  level: { class: F, writers: 'init func_002324C8 (0x2324C8) stores 0; per frame func_00232640' },
  overlayLevel: { class: F, writers: 'func_00234B88 (0), func_00234C28, func_00234EA8 (per frame)' },
  vignetteRamp: { class: F, fields: rampRule('func_00234B88'), writers: 'init func_00234B88 stores length = fps*80/60 and resets (func_00234AB0); per frame module_clock_234E70 / func_00234D18 tick it' },
  vignetteLength: { class: I('func_00234B88'), writers: 'func_00234B88 stores fps*80/60 (fps 50 PAL, 60 NTSC)' },
  menuRamp: { class: F, fields: rampRule('func_002324C8'), writers: 'init func_002324C8 stores length = body + fps/6; func_002324C8 (+0 write only at init), menu code ticks it' },
  tail: { class: I('func_002324C8'), writers: 'func_002324C8 stores fps/6' },
  body: { class: I('func_002324C8'), writers: 'func_002324C8 stores fps*40/60' },
  counter: { class: F, writers: 'func_00232858 (0x232858) zeroes it at init; func_00232878 (0x232878) adds 1 per frame' },
  proportions: { class: I('clock_stuff1'), writers: 'clock_stuff1 (0x225958), run at each start of the clock thread: ax = 1.0, ay = D_0036FB84 or D_0036FB88 by is_pal_vmode' },
  position: { class: C, writers: 'none found (module_clock_225F38 reads it)' },
  direction: { class: C, writers: 'none found (read by module_clock_225F38 / module_clock_238DC0)' },
  up: { class: C, writers: 'none found' },
  rotation: { class: C, writers: 'none found' },
  cameraOffset: { class: F, writers: 'init module_clock_init_resources (0x225DB0) stores -100.0; per frame module_clock_225F38 (0x225F38) multiplies by 0.97' },
  zmax: { class: C, writers: 'none found' },
  cameraFactor: { class: C, writers: 'none found' },
  greyRamp: { class: F, fields: rampRule('func_00232858'), writers: 'init func_00232858 stores length = D_003702E0; per frame func_00233258 / func_002331C8 / func_00233210' },
  greys: { class: F, writers: 'func_00232858 zeroes at init; func_00233258 per frame' },
  ringRecord: { class: F, fields: [['^(alpha|cx|cy)$', F], ['.*', C]], writers: 'func_00234D60 (0x234D60) stores alpha, cx, cy; rx, ry, z: none found' },
  tint: { class: C, fields: rect(), writers: 'module_clock_226000 (0x226000) stores +0x20..+0x2C from the screen size at each draw' },
  blurRecord: { class: C, fields: rect(), writers: 'func_00236490 (0x236490) stores +0x20..+0x2C at each draw' },
  copyRecord: { class: C, fields: rect('blend'), writers: 'func_00236230 (0x236230) stores +0x20..+0x2C and +0x34 at each draw (uncached alias 0x2000xxxx)' },
  fadeRecord: { class: C, fields: rect('colour\\[[0-3]\\]'), writers: 'func_00234C28 (+0x20, +0x24, colour), func_00234E08 (0x234E08, +0xC alpha, per frame)' },
  bars: { class: C, fields: rect('y0'), writers: 'func_00226158 (0x226158) stores +0x14, +0x20, +0x24 at each draw' },
  column: { class: C, fields: rect('x0'), writers: 'func_00226A88 (0x226A88) stores +0x10, +0x20, +0x24 at each draw' },
  addRecord: { class: C, fields: rect(), writers: 'func_00236110 (0x236110) stores +0x20..+0x2C at each draw' },
  halfRecord: { class: C, fields: rect(), writers: 'func_00236198 (0x236198) stores +0x20..+0x2C at each draw' },
  chainRecord: { class: C, fields: rect(), writers: 'func_00236350 (0x236350) stores +0x20..+0x2C at each draw' },
  template: { class: F, writers: 'module_clock_22F5D0 (0x22F5D0) rewrites the rod record for each of the twelve rods; module_clock_22F760 (orbs), module_clock_22FE98 (0x22FE98); helper module_clock_22F380 is handed the record' },
  rings: { class: F, writers: 'init func_00239E60 (0x239E60) zeroes head/count/full of the seven rings (called from func_0022EF40); module_clock_22F908 / module_clock_239E98 push one entry per orb call' },
  spriteFade: { class: F, fields: rampRule('func_00238F20'), writers: 'init func_00238F20 (0x238F20, from func_0022EF40) stores length = fps*256/60, resets, starts rising; module_clock_239078 ticks it' },
  clearColour: { class: C, writers: 'none found (func_002341C8 reads it)' },
  display: { class: I('InitDraw'), writers: 'boot-level InitDraw (0x20BD58, called from main) -> sceGsSetDefDBuff (0x289018) -> sceGsSetDefClear (0x288E28): clear colour 0; not run by the clock module', note: 'ELF has no value (low memory)' },
  tubeConstants: { class: C, writers: 'none found' },
  orbConstants: { class: C, writers: 'none found' },
  orbColour: { class: C, writers: 'none found (module_clock_22F908 reads it)' },
  orbColours: { class: C, writers: 'none found (module_clock_22F908 reads it)' },
  screen: { class: E, writers: 'boot-level InitDraw (0x20BD58): width 640, height 0xE0 (NTSC) or 0x100 (PAL) by is_pal_vmode_p9_tgt', note: 'video mode' },
  index: { class: F, writers: 'InitDraw stores 1; SwapBuffers toggles it each frame' },
  item0: { class: C, writers: 'none found directly (config_item_change_cb_clock_write_mechacon and config_save_clock_osd are handed the block)' },
  configItems: { class: E, fields: [['^(0|5|12)$', 'no-writer-found']], writers: 'config_load_clock_osd (0x234F88): items 1-4, 6-11, 13-19 stored (items 9, 10, 11 are the time-of-day fields of the settings; run by func_00234F78 from module_clock_init_resources); items 0, 5, 12 are not stored there' },
  mechaconParam: { class: E, writers: 'config_first (0x203BF0, reads the console settings) and config_set_* (0x203xxx): language, aspect, time zone, summer time, date format' },
  videoMode: { class: E, writers: 'handle_get_vidmode (0x20823C) reads rom0:ROMVER once and caches it' },
  wide: { class: O, writers: 'opening_transition_to_clock (0x21AEE4: stores 1 when the opening hands off to the clock), main (0x20E04C), clock_input_check_handler_p6_p7_tgt (0x225CCC at exit), browser_exit_previous_module', note: 'D_001F064C, only in start-boot.json' },
  orbRandom: { class: I('func_0022EF40'), writers: 'func_0022EF40 (0x22EF40) draws seven rand() values (newlib LCG); the values depend on the rand state when the clock starts', note: 'only in start-boot.json' },
  pad: { class: E, writers: 'init func_00235E98 (0x235E98) zeroes D_00370334/38; per frame func_00235EB0 (0x235EB0) stores held/pressed/released/repeating from the controller' },
  disc: { class: E, writers: 'cdvd_handler_proc_prechk (0x211FD4), override_illegal_disc_type (0x211930), main (0x20DCA8)' },
  screenCode: { class: F, writers: 'clock_input_check_handler_p6_p7_tgt (0x2259B8): disc state at entry or 0x64 when entered from the opening (wide = 1), then per disc-state change' },
  configPage: { class: F, fields: [['^(word0|entries|word14|word2c|word30)$', C], ['^count$', I('func_00227F08')], ['^ramp\\.length$', I('func_002324C8')], ['^level$', I('func_002324C8')], ['^(titleWidth|selected|glow|ramp\\.(counter|changed|state))$', F]], writers: 'func_00227F08 (0x227F08, via func_00228220 from func_002324C8) stores count (+8) and selected (+0x10); func_002324C8 stores level (+0x18) and ramp length (+0x1C); browser_str_related2 stores titleWidth (+0xC) at the first draw; func_002316B8, func_00231B38, func_00230F48 / func_00230FD8 (selected, ramp, glow)' },
  configRamp: { class: F, fields: rampRule('func_002324C8'), writers: 'init func_002324C8 (length = D_003702E0 + body + fps/6); func_00230F48 resets; func_00234A98..func_00234B10 ramp helpers tick it' },
  configEntries: { class: F, fields: [['^[0-3]\\.', C], ['^[4-8]\\.', I('func_00227F08')]], writers: 'func_00227F08 (0x227F08) copies the entry templates D_002B2E88, D_002B2EC0, D_002B2EF8, D_002B2F30 .. into the list from entry 3 on, by config items (0x13 ...); entry fields changed by the input handlers are written through pointers: writer not found' },
  mainMenu: { class: F, fields: [['^(word0|items|count|word0c|word14)$', C], ['^ramp\\.length$', I('func_002324C8')], ['^selected$', F], ['^ramp\\.', F]], writers: 'func_002324C8 stores ramp length (+0x18) = fps/6; the menu input handlers write selected through a pointer: writer not found' },
  versionRamp: { class: F, fields: rampRule('func_0022A9C0'), writers: 'init func_0022A9C0 (0x22A9C0, from func_002324C8) stores length = tail; func_0022A360 / func_0022A9C0 reset' },
  dialogRamp: { class: F, writers: 'func_0022D558 (reset), func_0022D5A0, func_0022D5D8, func_0022D6A8 (menus)' },
  firstRunRamp: { class: F, writers: 'func_0022D760, func_0022D828, oobe_handler (first-run path)' },
  pagePointers: { class: F, fields: [['^0$', I('func_0022A9C0')], ['^4$', F], ['.*', C]], writers: 'func_0022A9C0 (0x22A9C0) copies the page template D_002B2F90 (30 entries of 0x54 bytes) to D_00404370 and stores the pointer; func_0022ABC8 / func_0022AD50 store the answered page (+0x10)' },
  entryActive: { class: F, writers: 'func_00231C50 (0x231C50)' },
  menuLengths: { class: I('func_00234B88'), writers: 'func_00234B88 stores +0 = fps*40/60, +4 = fps*80/60, +8 = 1' },
  listConstants: { class: C, writers: 'none found' },
  configGate: { class: F, writers: 'func_00234F78 (0x234F78, init) stores 1; func_00234F50 / func_00234F58 / func_00234F68 store 0, -1, 1 while entries are open' },
  configDirty: { class: F, writers: 'config_mark_dirty (0x2352C0), config_save_clock_osd (0x2352D0), set_ps1drv_config_dirty (0x235438), func_00235448 / func_00235518 / func_00235570' },
  adjustFields: { class: F, writers: 'func_00226E68 (0x226E68) stores the six fields (item, lowest, highest) when Clock Adjustment opens; values equal the ELF in all captures' },
  rtcMirror: { class: E, writers: 'func_00200F88 (0x200F88) defaults to 2000-01-01 00:00:00; func_00200FC0 (0x200FC0) reads the RTC; config_item_change_cb_clock_write_mechacon (0x235170) writes it back on a Clock Adjustment confirm' },
  cubeList: { class: F, writers: 'func_00231B38 (0x231B38), module_clock_230550 (0x230550), func_00230860 (0x230860)' },
  cubeColours: { class: F, writers: 'D_00230410 / module_clock_2308F0 (0x2308F0) hand it to the colour chase func_00238D00; values equal the ELF in all captures' },
  cubeRecord: { class: F, writers: 'module_clock_2306B0 (0x2306B0) and module_clock_2308F0 rewrite the cube record for each cube' },
  spin: { class: F, writers: 'init func_002324C8 stores 0; per frame func_00232640' },
  cubeConstants: { class: C, writers: 'none found' },
  centreFactors: { class: C, writers: 'none found' },
  cubeView: { class: I('func_002324C8'), writers: 'func_002324C8 calls sceVu0UnitMatrix on it' },
  cubeScreen: { class: I('func_002324C8'), writers: 'func_002324C8 calls sceVu0ViewScreenMatrix on it (constants 2048, 1.0, 512 and D_0036FC0C, 65536.0)' },
  layerClear: { class: F, writers: 'module_clock_2308F0 hands it to func_002342F0; values equal the ELF in all captures' },
  cubeRamp: { class: F, fields: rampRule('func_002324C8'), writers: 'init func_002324C8 stores length = body; func_00230380 / func_002303C8 / module_clock_2308F0 / module_clock_230C00 start and tick it' },
};

const pieceOrigins = ORIGINS;

const fields = [];
const pieces = [];
const keys = [...new Set(starts.flatMap((s) => Object.keys(s.json)))].filter((k) => k in LAYOUT && LAYOUT[k][0] !== null && k in PIECES);
for (const key of keys) {
  const [address, , length] = LAYOUT[key];
  const bytes = image(address, length) ?? Buffer.alloc(length);
  const here = inImage(address, length);
  const { base, at } = offsetsOf(PIECES[key], bytes);
  const present = starts.filter((s) => key in s.json);
  const flatJson = Object.fromEntries(present.map((s) => [s.name, leaves(s.json[key])]));
  for (const [path, elfValue] of base) {
    const row = { piece: key, path, address: address + (at.get(path) ?? 0), section: sectionOf(address), elf: here ? elfValue : null, values: {} };
    for (const s of present) row.values[s.name] = flatJson[s.name].get(path);
    row.equal = here && present.every((s) => row.values[s.name] === row.elf);
    row.allSame = present.every((s) => row.values[s.name] === row.values[present[0].name]);
    const origin = pieceOrigins[key];
    row.origin = (origin?.fields?.find(([re]) => new RegExp(re).test(path))?.[1]) ?? origin?.class ?? 'unclassified';
    fields.push(row);
  }
  pieces.push({ key, address, length, section: sectionOf(address), present: present.map((s) => s.name), n: base.size, equal: fields.filter((f) => f.piece === key && f.equal).length });
}

// ---- keys outside LAYOUT/PIECES: textRamps and listFade (words at known addresses), font (the font library's context) ----
const word = (a) => { const b = image(a, 4); return b ? b.readInt32LE(0) : null; };
const RAMP_AT = { config: 0x2b2e04, dialogClosing: 0x2b46b8, firstRun: 0x2b46d0, mainMenu: 0x2b2e78, version: 0x2b3000, menu: 0x2b5780, panelConfig: 0x2b2e04 };
const WORD_AT = { lead: 0x3702e0, body: 0x3702cc, tail: 0x3702d0, weight: 0x370ab8, panel7: 0x2b2e00, panel8On: 0x370140, panel8: 0x37013c, panelLead: 0x3702e0, panelBody: 0x3702cc, panelTail: 0x3702d0, panelWeight: 0x370ab8 };
const RAMP_FIELD = { length: 0, counter: 4, changed: 8, state: 12 };
const TEXT_CLASS = (path) => {
  if (/^(lead|panelLead)$/.test(path)) return I('func_00234B88');
  if (/^(body|tail|panelBody|panelTail)$/.test(path)) return I('func_002324C8');
  if (/^(config|mainMenu|menu|panelConfig)\.length$/.test(path)) return I('func_002324C8');
  if (/^(version|dialog)\.length$/.test(path)) return I('func_0022A9C0');
  return F;
};
const extras = [];
for (const s of starts) {
  if (s.json.textRamps) for (const [path, value] of leaves(s.json.textRamps)) {
    const [head, sub] = path.split('.');
    const address = head in RAMP_AT ? RAMP_AT[head] + RAMP_FIELD[sub] : WORD_AT[head] ?? null;
    let row = extras.find((r) => r.piece === 'textRamps' && r.path === path);
    if (!row) { row = { piece: 'textRamps', path, address, section: address ? sectionOf(address) : 'derived (pointer)', elf: address ? word(address) : null, values: {}, origin: TEXT_CLASS(path) }; extras.push(row); }
    row.values[s.name] = value;
  }
  if (s.json.listFade) for (const [path, value] of leaves(s.json.listFade)) {
    const address = { first: 0x37029c, second: 0x3702a0, secondIndex: 0x3702a4 }[path];
    let row = extras.find((r) => r.piece === 'listFade' && r.path === path);
    if (!row) { row = { piece: 'listFade', path, address, section: sectionOf(address), elf: word(address), values: {}, origin: F }; extras.push(row); }
    row.values[s.name] = value;
  }
  if (s.json.font) for (const [path, value] of leaves(s.json.font)) {
    let row = extras.find((r) => r.piece === 'font' && r.path === path);
    if (!row) {
      const scalar = /^(format|cellW|cellH|cells|width|height|logW|logH|setUp|block|memory|texture|table)$/.test(path);
      row = { piece: 'font', path, address: null, section: 'font library (EE heap)', elf: null, values: {}, origin: scalar ? I('do_load_font') : F };
      extras.push(row);
    }
    row.values[s.name] = value;
  }
}
for (const row of extras) {
  const names = starts.filter((s) => s.json[row.piece]).map((s) => s.name);
  row.equal = row.elf !== null && names.every((n) => row.values[n] === row.elf);
  row.allSame = names.every((n) => row.values[n] === row.values[names[0]]);
  fields.push(row);
}
for (const k of ['textRamps', 'listFade', 'font']) {
  const f = fields.filter((x) => x.piece === k);
  pieces.push({ key: k, address: f[0]?.address ?? 0, length: f.length * 4, section: f[0]?.section ?? '', present: starts.filter((s) => s.json[k]).map((s) => s.name), n: f.length });
}

const args = process.argv.slice(2);
const only = args.includes('--piece') ? args[args.indexOf('--piece') + 1] : null;
const hexv = (v) => (typeof v === 'number' ? v : String(v));
const show = (v) => (v === undefined ? '-' : v === null ? 'n/a' : hexv(v));

if (args.includes('--writers')) {
  for (const [k, o] of Object.entries(pieceOrigins)) console.log(`${k}\t${o.class}\t${o.writers ?? ''}\t${o.note ?? ''}`);
  process.exit(0);
}

if (args.includes('--md')) {
  console.log('| piece | address | section | fields | ELF = all JSON | classes (fields) | writers |\n|---|---|---|---|---|---|---|');
  for (const p of pieces) {
    const f = fields.filter((x) => x.piece === p.key);
    const classes = [...f.reduce((m, x) => m.set(x.origin, (m.get(x.origin) ?? 0) + 1), new Map())].map(([c, n]) => `${c}: ${n}`).join('; ');
    const o = pieceOrigins[p.key];
    console.log(`| ${p.key} | ${p.address ? `0x${p.address.toString(16)}` : '-'} | ${p.section} | ${p.n} | ${f.filter((x) => x.equal).length} | ${classes} | ${o?.writers ?? ''} |`);
  }
  process.exit(0);
}

console.log(`elf ${elfPath}: PT_LOAD off 0x${load.off.toString(16)} va 0x${load.va.toString(16)} size 0x${load.size.toString(16)}`);
console.log('json ' + starts.map((s) => `${s.name}=${s.json.capture}@${s.json.frame}`).join(' '));
console.log('\npiece\taddress\tsection\tfields\tELF==all JSON\tJSONs equal to each other\tpresent in	origin classes (fields)');
for (const p of pieces) {
  const f = fields.filter((x) => x.piece === p.key);
  const classes = [...f.reduce((m, x) => m.set(x.origin, (m.get(x.origin) ?? 0) + 1), new Map())].map(([c, n]) => `${c}:${n}`).join(' ');
  console.log(`${p.key}\t0x${p.address.toString(16)}+0x${p.length.toString(16)}\t${p.section}\t${p.n}\t${f.filter((x) => x.equal).length}\t${f.filter((x) => x.allSame).length}\t${p.present.join(',')}\t${classes}`);
}
const missing = starts.flatMap((s) => Object.keys(s.json).filter((k) => !(k in LAYOUT) && !['textRamps', 'listFade', 'font', 'capture', 'build', 'frame'].includes(k)).map((k) => s.name + ':' + k));
console.log(`\nkeys not decoded as pieces: ${missing.join(' ')}`);

if (args.includes('--fields') || only) {
  console.log('\nfield\taddress\tsection\telf\t' + starts.map((s) => s.name).join('\t') + '\telf==json\torigin');
  for (const f of fields) {
    if (only && f.piece !== only) continue;
    console.log(`${f.piece}.${f.path}\t${f.address == null ? "-" : "0x" + f.address.toString(16)}\t${f.section}\t${show(f.elf)}\t${starts.map((s) => show(f.values[s.name])).join('\t')}\t${f.equal ? '=' : '!'}\t${f.origin}`);
  }
}

const byClass = new Map();
for (const f of fields) {
  const c = byClass.get(f.origin) ?? { total: 0, equal: 0 };
  c.total++; if (f.equal) c.equal++;
  byClass.set(f.origin, c);
}
console.log('\norigin class\tfields\tELF == all JSON');
for (const [c, v] of [...byClass].sort()) console.log(`${c}\t${v.total}\t${v.equal}`);
console.log(`total\t${fields.length}\t${fields.filter((f) => f.equal).length}`);
