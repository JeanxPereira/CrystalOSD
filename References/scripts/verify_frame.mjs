// End to end: from the clock's state at the start of a frame, the model in
// References/model/clock_frame.mjs produces every packet the frame function sends and the state
// it leaves; this compares the packets, write by write and in order, with the ones the build
// really sent, checks the state against the next frame's, and says how much of the frame that is.
//
//   the frame function (HDD 0x00225e80, ROM 0x00221558): the snapshot, read by probes on its
//     first instructions, before anything of the frame has run
//   the entry of each part it calls: where that part's packets start in the trace
//
// A trace taken with an earlier version's two probes (frame function and rods) is still read:
// then only the rods, orbs and extra passes are compared, with the matrices the rods were handed.
//
// CLOCK_BUILD=hdd|rom node verify_frame.mjs <trace.jsonl> [--carry | --resync]
//   --carry    run every frame from the state the model left, not from the frame's own snapshot;
//              only the inputs listed in EXTERNAL are taken from the snapshot
//   --resync   the same, but a piece of state found different is taken from the snapshot and
//              reported, so that one difference does not hide the others
import { dataPath } from '../lib/data.mjs';
import fs from 'node:fs';
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, BUILD === 'hdd' ? [...PROBES, ...TEXT_PROBES] : PROBES);
import { GifPath } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/gif.js';
import { frame, between, REG } from '../model/clock_frame.mjs';
import { Memory, LAYOUT, ranges, addressOf } from '../model/clock_memory.mjs';
import { pick, range, pc, BUILD, BUILD_NAME } from './builds.mjs';
process.argv[1] ??= '';
const { readContext, PROBES: TEXT_PROBES } = await import('./verify_text2.mjs');
const { expand, readFont } = await import('./extract_font.mjs');
const { elfImage, languageOf, languageTable, langId, tablePointers, LANGUAGE_WORD } = await import('../model/clock_text.mjs');

// The text of a frame (HDD OSD 1.10U only: the model has no ROM 2.30 font code). A capture taken with
// verify_text2's probes as well as these holds, for every string the frame draws or measures, the
// string's own bytes (or its language table pointer), the font state its caller set and, at every
// character, the library's context; the model draws the strings from those, in order, and the
// carried context is checked against the library's at every frame's first character.
const PUTS = 0x00213ba8, MEASURE = 0x00213d38, PUTC = 0x00291858, FONT_STATE = 0x003969b0;

// The frame function and the parts it calls, in the order it calls them.
const A = pick({
  rom: { start: 0x00221558, parts: { camera: 0x00221610, head: 0x002216d8, rods: 0x0022beb8, overlay: 0x00231478, pages: 0x0022e738, bars: 0x002219a0, text: 0x002219d8, hint: 0x00222160, column: 0x00222210, logic: 0x0022b1c0 } },
  hdd: { start: 0x00225e80, parts: { camera: 0x00225f38, head: 0x00226000, rods: 0x0022fe98, overlay: 0x00234e70, pages: 0x00232458, bars: 0x002262c8, text: 0x00226300, hint: 0x002269e0, column: 0x00226a88, logic: 0x0022f1a0 } },
});

/**
 * State that the menus' own code writes when something happens (a button, a page opening). The
 * model runs that code (clock_menus.mjs); a piece taken here from the snapshot after the pages
 * function, because the model's value differs, is counted as an event. With the menus' pieces
 * in the capture every event is a fault of the model; captures taken before they were probed
 * still need the events.
 */
export const EVENTS = {
  menuRamp: 'the ramp between System Configuration and the clock alone, started by the menus',
  cubeRamp: 'the ramp of the cubes, started and ended by the list',
  cubeList: 'the list position: a move asked by up or down, the pulse of a confirmed value',
  cubeMode: 'ROM 2.30: standing cubes or ring, chosen when the list opens',
  standing: 'ROM 2.30: the pulse of a confirmed value on a standing cube',
  mode: 'the overlay mode, set by the mode setter',
  orbRandom: 'the random direction of each orb, drawn by the mode setter',
  overlayLevel: 'the overlay level, reset by the mode setter',
  fadeRecord: 'the colour and size of the fade rectangle and size, written by the mode setter',
  scaleTarget: 'the target of the scene scale',
  greyRamp: 'the ramp of the background grey, started when System Configuration opens',
  vignetteRamp: 'the ramp of the vignette, sent down when System Configuration opens',
  appearance: 'the appearance ramp of the rods, started and ended by the menus',
  spriteFade: 'the sprite ramp of the orbs, hidden and shown by Clock Adjustment',
};

// The snapshot: every piece of clock_memory.mjs, merged into ranges, eight to a probe, on the
// frame function's first instructions (nothing has run yet at any of them).
// Pieces added after the first captures sit in a probe of their own, after the others, so that the
// ranges of the earlier probes (which a capture's header names) stay as they were.
const LATE = ['rtcMirror'];
// The reload gate: a probe of its own after the rtc one, for the same reason.
const LATER = ['configGate'];
const SNAPSHOT = ranges(BUILD, Object.keys(LAYOUT).filter((name) => !LATE.includes(name) && !LATER.includes(name)));
const snapshotProbes = [];
for (let n = 0; n < SNAPSHOT.length; n += 8) snapshotProbes.push({ pc: pc(A.start + 4 * (n / 8)), ranges: SNAPSHOT.slice(n, n + 8).map(([address, length]) => range(address, length)) });
snapshotProbes.push({ pc: pc(A.start + 4 * snapshotProbes.length), ranges: ranges(BUILD, LATE).map(([address, length]) => range(address, length)) });
snapshotProbes.push({ pc: pc(A.start + 4 * snapshotProbes.length), ranges: ranges(BUILD, LATER).map(([address, length]) => range(address, length)) });
if (snapshotProbes.length > 5) throw new Error('the snapshot needs more probes than the frame function has instructions before its first call');
// What the menus changed in a frame is read when the pages function has returned: at the entry
// of the bars function, on its first two instructions (eight ranges to a probe).
const EVENT_RANGES = ranges(BUILD, Object.keys(EVENTS)).map(([address, length]) => range(address, length));
if (EVENT_RANGES.length > 16) throw new Error('the event pieces need more than two probes');
export const PROBES = [
  ...snapshotProbes,
  ...Object.entries(A.parts).map(([name, address]) => ({ pc: pc(address), ranges: name === 'rods' ? ['a0:0x40', 'a1:0x40'] : name === 'bars' ? EVENT_RANGES.slice(0, 8) : [] })),
  ...(EVENT_RANGES.length > 8 ? [{ pc: pc(A.parts.bars + 4), ranges: EVENT_RANGES.slice(8) }] : []),
];

/** Item 0 is the model's, not an external input, when the capture holds the gate and the settings word it is reloaded from. */
const modelsItem0 = (memory) => memory.has('configGate') && memory.has('mechaconParam');

/** The pieces the menus' model (clock_menus.mjs) keeps; captures without them cannot check them. */
const MENU_PIECES = ['configPage', 'configRamp', 'configEntries', 'mainMenu', 'versionRamp', 'dialogRamp', 'firstRunRamp', 'pagePointers', 'entryActive',
  'menuLengths', 'listConstants', 'screenCode', 'adjustFields'];

/** What the model takes from outside each frame when it carries its own state. */
export const EXTERNAL = {
  time: 'the time record, as the time keeper leaves it',
  index: 'which display buffer is drawn to',
  scene: 'the field flag (offset 8); the scale (offset 0) and the leaving flag (offset 4) stay the model\'s',
  disc: 'the disc state the drive reports',
  rtcMirror: 'the console clock as the mechacon read left it',
  configDirty: 'whether the configuration is being saved (the save runs outside the clock)',
  configItems: 'the configuration items, as the configuration code leaves them (Clock Adjustment edits items 6 to 0xB; see the note on the editor)',
  romWrite: 'ROM 2.30: the state of the write of the clock to the drive',
  mechaconParam: 'the console settings word (time zone, summer time, aspect ratio), read from the drive',
  item0: 'configuration item 0; captures that probed the reload gate leave it to the model (reloadItem0 in clock_menus.mjs)',
  pad: 'the pad words, as the pad reader leaves them at the end of the frame before',
  wide: 'whether the clock was entered from the opening',
  timeFilled: 'HDD OSD: whether the time keeper has filled the time record yet',
  display: 'the display block: the buffer swap between frames writes the offset of the next field into it (every packet sent from it has its offset written first)',
};

const NAME = Object.fromEntries(Object.entries(REG).map(([name, value]) => [value, name]));
const vector = (buffer, at) => [0, 4, 8, 12].map((k) => buffer.readFloatLE(at + k));
const matrix = (buffer) => [0, 16, 32, 48].map((k) => vector(buffer, k));
const bytesOf = (words) => { const out = Buffer.alloc(words.length * 4); words.forEach((word, i) => out.writeUInt32LE(parseInt(word, 16), i * 4)); return out; };

function meshes() {
  const rod = JSON.parse(fs.readFileSync(new URL('../../facts/data/rod-mesh.json', import.meta.url), 'utf8'));
  const mesh = { positions: bytesOf(rod.positions.bits), normals: bytesOf(rod.normals.bits), coordinates: bytesOf(rod.coordinates.bits) };
  const cubeFile = new URL('../model/cube-mesh.json', import.meta.url);
  if (fs.existsSync(cubeFile)) {
    const cube = JSON.parse(fs.readFileSync(cubeFile, 'utf8'));
    mesh.cube = { positions: bytesOf(cube.positions.bits), normals: bytesOf(cube.normals.bits), coordinates: bytesOf(cube.coordinates.bits) };
  }
  return mesh;
}

const writesOf = (packet) => [...new GifPath().feed(packet.bytes)].filter((event) => event.kind === 'write');

/** Compare one model packet with one sent packet; tally and report. */
function compareText(expected, packet, result, where) {
  const tally = (result.kinds[`text  ${expected.label}`] ??= { packets: [0, 0], writes: [0, 0] });
  tally.packets[1] += 1;
  tally.writes[1] += expected.bytes.length >> 4;
  let equal = !!packet && packet.bytes.length === expected.bytes.length;
  if (equal && expected.picture) {
    const { at, written, size } = expected.picture, end = at + written, rest = at + size;
    equal = packet.bytes.subarray(0, end).equals(expected.bytes.subarray(0, end)) && packet.bytes.subarray(rest).equals(expected.bytes.subarray(rest));
  } else if (equal) equal = packet.bytes.equals(expected.bytes);
  if (equal) { tally.packets[0] += 1; tally.writes[0] += expected.bytes.length >> 4; return true; }
  if (result.problems.length < 14) result.problems.push(`${where} (text ${expected.label} "${expected.string}"): the packet differs from the one sent`);
  return false;
}

function compare(expected, packet, result, where) {
  if (expected.kind === 'text') return compareText(expected, packet, result, where);
  const sent = packet ? writesOf(packet) : [];
  const key = `${expected.kind}  ${expected.label}`;
  const tally = (result.kinds[key] ??= { packets: [0, 0], writes: [0, 0] });
  tally.packets[1] += 1;
  tally.writes[1] += expected.writes.length;
  let equal = sent.length === expected.writes.length;
  let first = null;
  expected.writes.forEach(([reg, value], w) => {
    if (sent[w] && sent[w].reg === reg && sent[w].value === value) tally.writes[0] += 1;
    else { equal = false; first ??= w; }
  });
  if (equal) { tally.packets[0] += 1; if (expected.kind === 'vertex' && expected.writes.length === 0) { result.empty += 1; (result.emptyLabels ??= {})[expected.label] = (result.emptyLabels[expected.label] ?? 0) + 1; } return true; }
  if (result.problems.length < 14) {
    result.problems.push(`${where} (${expected.label}): ${sent.length} writes sent, ${expected.writes.length} computed`
      + (first === null ? '' : `; write ${first}: sent ${sent[first] ? `${NAME[sent[first].reg] ?? sent[first].reg} = 0x${sent[first].value.toString(16)}` : 'nothing'}, computed ${NAME[expected.writes[first][0]]} = 0x${expected.writes[first][1].toString(16)}`));
  }
  return false;
}

/** The earlier two-probe capture: rods, orbs and extra passes only. */
function verifyScene(trace, result, mesh) {
  const starts = trace.probes.filter((probe) => probe.pc === A.start && !probe.preroll);
  starts.forEach((start, n) => {
    const next = starts[n + 1];
    const rods = trace.probes.find((probe) => probe.pc === A.parts.rods && !probe.preroll && probe.at >= start.at && (!next || probe.at < next.at));
    if (!rods || !next) return;
    if ([...start.mem, ...rods.mem].some((piece) => !piece.bytes)) { result.problems.push(`frame ${start.frame}: a probed range was not readable`); return; }
    const memory = new Memory(BUILD, [...start.mem, ...rods.mem.slice(2)]);
    const model = frame({ memory, view: matrix(rods.mem[0].bytes), screen: matrix(rods.mem[1].bytes) }, mesh);
    for (const note of model.notes) result.notes.add(note);
    if (rods.at + model.packets.length > trace.packets.length) return;
    result.frames += 1;
    if (result.orders.length < 2) result.orders.push(`frame ${start.frame}: ${model.order.join(', ')}`);
    model.packets.forEach((expected, i) => { if (compare(expected, trace.packets[rods.at + i], result, `frame ${start.frame} packet ${i}`)) result.coverage.modelled += 1; });
    result.coverage.frame += next.at - start.at;
  });
}

const same = (a, b) => a.flat().every((x, i) => Object.is(x, b.flat()[i]));
const add = (table, key, n) => { if (n > 0) table[key] = (table[key] ?? 0) + n; };

/** The font, the ELF image and the language of a capture that holds the text probes; null without them or on ROM 2.30. */
function textSetup(probes) {
  if (BUILD !== 'hdd' || !probes.some((probe) => probe.pc === PUTS)) return null;
  const data = expand(fs.readFileSync(dataPath('dumps/hddosd-host/FNTOSD')));
  const image = elfImage(fs.readFileSync(dataPath('dumps/hddosd-host/hddosd.elf')));
  const holds = probes.find((probe) => probe.pc === PUTS && probe.mem.some((piece) => piece.address === LANGUAGE_WORD && piece.bytes));
  const language = holds ? holds.mem.find((piece) => piece.address === LANGUAGE_WORD).bytes.readUInt32LE(0) : null;
  return { font: readFont(data), data, image, inTables: tablePointers(image), language, table: language === null ? null : languageTable(image, languageOf(language)), state: null };
}

/**
 * The strings of one frame for the model, by the part of the frame function that draws them. A
 * string's own bytes are the probe's (the caller's buffers: date and time); when the caller handed
 * the font code a pointer into the language table or to a fixed string of the ELF image, the text is
 * the image's at that pointer, and the probe only checks it. The font state of the caller (place,
 * colour, size: 0x160 bytes) is the probe's. Returns null when the frame holds no character.
 */
function textInput(setup, inside, anchors, result, number, carry) {
  const first = inside.find((probe) => probe.pc === PUTC && probe.mem[0]?.bytes);
  if (!first) return null;
  const held = readContext(first.mem[0].bytes, FONT_STATE);
  const sameList = (a, b) => a.length === b.length && a.every((e, i) => e.code === b[i].code && e.cell === b[i].cell && e.loaded === b[i].loaded && e.block === b[i].block);
  if (setup.state && carry) {
    result.text.lists[1] += 1;
    if (sameList(setup.state.ctx.list, held.list) && setup.state.ctx.block === held.block) result.text.lists[0] += 1;
    else if (result.problems.length < 14) result.problems.push(`frame ${number}: the carried font cache differs from the library's at the frame's first character`);
  }
  if (!setup.state || !carry) setup.state = { font: setup.font, data: setup.data, ctx: held, headRoom: 0x1ff - 4 };
  const index = (name) => (anchors[name] ? inside.indexOf(anchors[name]) : -1);
  const bounds = { pages: [index('pages'), index('bars')], text: [index('text'), index('hint')], hint: [index('hint'), index('column')] };
  const strings = { pages: [], text: [], hint: [] };
  inside.forEach((start, n) => {
    if (start.pc !== PUTS && start.pc !== MEASURE) return;
    const key = Object.keys(bounds).find((name) => bounds[name][0] >= 0 && bounds[name][1] >= 0 && n > bounds[name][0] && n < bounds[name][1]);
    if (!key) { result.text.outside += 1; return; }
    const [bytes, own] = start.mem.map((piece) => piece.bytes);
    if (!bytes || !own) { result.text.unread += 1; return; }
    let shown = bytes.subarray(0, bytes.indexOf(0));
    const pointer = start.gpr[4] >>> 0, id = setup.table === null ? -1 : langId(setup.image, setup.table, pointer);
    const other = id < 0 && setup.inTables.has(pointer);
    const fixed = id < 0 && !other ? setup.image.string(pointer) : null;
    const made = id >= 0 ? setup.image.string(pointer) : fixed && fixed.length > 0 ? fixed : null;
    if (other) {
      result.text.table[1] += 1;
      if (result.problems.length < 14) result.problems.push(`frame ${number}: "${shown.toString('latin1')}" at ${pointer.toString(16)} is in another language's table`);
    } else if (made) {
      const slot = id >= 0 ? 'table' : 'fixed';
      result.text[slot][1] += 1;
      if (made.equals(shown)) { result.text[slot][0] += 1; shown = made; }
      else if (result.problems.length < 14) result.problems.push(`frame ${number}: the image holds "${made.toString('latin1')}" at ${pointer.toString(16)}, drawn "${shown.toString('latin1')}"`);
    } else result.text.probed += 1;
    strings[key].push({ text: shown, own, measuring: start.pc === MEASURE, at: start.at });
    result.text.strings += 1;
  });
  return { state: setup.state, strings };
}

/** A trace with the snapshot and the parts' entries: the whole frame. */
function verifyWhole(trace, result, mesh, carry) {
  const probes = trace.probes.filter((probe) => !probe.preroll);
  const starts = probes.map((probe, n) => [probe, n]).filter(([probe]) => probe.pc === A.start);
  let carried = null;
  const setup = textSetup(probes);
  starts.forEach(([start, from], n) => {
    if (!starts[n + 1]) return;                      // only frames the trace holds whole
    const [next, to] = starts[n + 1];
    const inside = probes.slice(from, to);
    const blocks = [];
    for (let k = 0; k < snapshotProbes.length; k++) blocks.push(...(inside.find((probe) => probe.pc === A.start + 4 * k)?.mem ?? []));
    if (blocks.length === 0 || blocks.some((piece) => !piece.bytes)) { result.problems.push(`frame ${start.frame}: the snapshot is not whole`); return; }
    const snapshot = new Memory(BUILD, blocks);
    const anchors = {};
    for (const [name, address] of Object.entries(A.parts)) anchors[name] = inside.find((probe) => probe.pc === address);

    // The clock's state when the pages function has returned, if the capture has it.
    const afterBlocks = [anchors.bars, inside.find((probe) => probe.pc === A.parts.bars + 4)].flatMap((probe) => probe?.mem ?? []).filter((piece) => piece.bytes);
    const after = afterBlocks.length ? new Memory(BUILD, afterBlocks) : null;
    const events = (m) => {
      if (!after) return;
      for (const name of Object.keys(EVENTS)) {
        if (addressOf(BUILD, name) === null || !after.has(name) || !m.has(name)) continue;
        const mine = m.at(name), real = after.at(name);
        if (mine.equals(real)) continue;
        (result.events[name] ??= []).push(start.frame);
        real.copy(mine);
      }
    };

    // The state this frame starts from: the snapshot, or what the model left plus the external inputs.
    let memory = snapshot;
    if (carry && carried) {
      memory = carried;
      // The inputs from outside first, then the clock thread's step between the previous frame
      // and this one, then the comparison of everything else with the snapshot.
      for (const name of Object.keys(EXTERNAL)) {
        if (addressOf(BUILD, name) === null || !snapshot.has(name) || !memory.has(name)) continue;
        if (name === 'item0' && modelsItem0(snapshot)) continue;
        if (name === 'scene') snapshot.at(name).copy(memory.at(name), 8, 8);
        else if (name === 'configItems' && modelsItem0(snapshot)) snapshot.at(name).copy(memory.at(name), 4, 4);
        else snapshot.at(name).copy(memory.at(name));
      }
      const before = [];
      between(memory, before);
      for (const note of before) result.notes.add(note);
      for (const name of Object.keys(LAYOUT)) {
        if (addressOf(BUILD, name) === null || !snapshot.has(name)) continue;
        const mine = memory.at(name), real = snapshot.at(name);
        // The rod record holds the addresses of the frame function's two matrices, on its stack.
        if (name === 'template') real.copy(mine, 0x60, 0x60, 0x68);
        // The page's +0xC is the width of its title, which the title's drawing (text, browser_str_related2) measures.
        if (name === 'configPage') real.copy(mine, 0xc, 0xc, 0x10);
        // The fourth word of a ring entry's position is a stack word the code never sets.
        if (name === 'rings') for (let ring = 0; ring < 7; ring++) for (let n = 0; n < 50; n++) { const at = ring * 0x650 + 0x1c + n * 0x20; real.copy(mine, at, at, at + 4); }
        if (name in EXTERNAL && !(name === 'item0' && modelsItem0(snapshot))) continue;
        // A capture taken before the menus' pieces were probed: the model cannot run the menus there.
        if (MENU_PIECES.includes(name) && !snapshot.has('configPage')) continue;
        if (name in EVENTS && !after && !mine.equals(real)) {
          // A capture without the probe after the pages function: the event is seen a frame late.
          (result.events[name] ??= []).push(start.frame);
          real.copy(mine);
        } else if (!mine.equals(real)) {
          const entry = (result.state[name] ??= { frames: 0, first: start.frame, where: null });
          entry.frames += 1;
          if (entry.where === null) { let o = 0; while (mine[o] === real[o]) o += 1; o &= ~3; entry.where = `+0x${o.toString(16)}: carried 0x${mine.readUInt32LE(o).toString(16)}, snapshot 0x${real.readUInt32LE(o).toString(16)}`; }
          if (carry === 'resync') real.copy(mine);
        }
      }
      result.carried += 1;
    }

    const text = setup ? textInput(setup, inside, anchors, result, start.frame, carry) : null;
    const model = frame({ memory, events, text }, mesh);
    if (text) setup.state = text.state;
    carried = memory;
    for (const note of model.notes) result.notes.add(note);
    result.frames += 1;
    if (result.orders.length < 2) result.orders.push(`frame ${start.frame}: ${model.order.join(', ')}`);

    // The matrices the model computed against the ones the rods were handed.
    if (anchors.rods?.mem[0]?.bytes) {
      result.matrices[1] += 1;
      if (same(model.view, matrix(anchors.rods.mem[0].bytes)) && same(model.screen, matrix(anchors.rods.mem[1].bytes))) result.matrices[0] += 1;
      else if (result.problems.length < 14) result.problems.push(`frame ${start.frame}: the matrices computed are not the ones the rods were handed`);
    }

    // Walk the frame's packets. A mark says where a part starts; a gap runs to the next mark.
    let at = start.at;
    const end = anchors.logic ? anchors.logic.at : next.at;
    model.packets.forEach((item, i) => {
      if (item.mark) {
        const anchor = anchors[item.mark];
        if (!anchor) return;
        result.sync[1] += 1;
        if (anchor.at === at) { result.sync[0] += 1; return; }
        if (result.problems.length < 14) result.problems.push(`frame ${start.frame}: ${item.mark} starts at packet ${anchor.at - start.at} of the frame, the model is at ${at - start.at}`);
        add(result.coverage.others, 'not accounted for', anchor.at - at);
        at = anchor.at;
        return;
      }
      if (item.gap && item.to !== undefined) {
        add(result.coverage.others, item.gap, item.to - at);
        at = Math.max(at, item.to);
        return;
      }
      if (item.gap) {
        const until = model.packets.slice(i + 1).find((other) => other.mark && anchors[other.mark]);
        const stop = until ? anchors[until.mark].at : end;
        add(result.coverage.others, item.gap, stop - at);
        at = Math.max(at, stop);
        return;
      }
      if (compare(item, at < end ? trace.packets[at] : null, result, `frame ${start.frame} packet ${at - start.at}`)) result.coverage.modelled += 1;
      at += 1;
    });
    if (at !== end) {
      if (result.problems.length < 14) result.problems.push(`frame ${start.frame}: the frame function sent ${end - start.at} packets, the model accounts for ${at - start.at}`);
      add(result.coverage.others, 'not accounted for', end - at);
    }
    result.coverage.frame += next.at - start.at;
    add(result.coverage.others, 'sent after the frame function returned', next.at - end);
  });
}

export function verify(traceFile, carry = false) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const result = { frames: 0, kinds: {}, problems: [], notes: new Set(), coverage: { frame: 0, modelled: 0, others: {} }, text: { strings: 0, table: [0, 0], fixed: [0, 0], probed: 0, lists: [0, 0], outside: 0, unread: 0 }, orders: [], matrices: [0, 0], sync: [0, 0], state: {}, events: {}, carried: 0, whole: false, empty: 0 };
  const mesh = meshes();
  result.whole = trace.probes.some((probe) => probe.pc === A.parts.logic);
  if (result.whole) verifyWhole(trace, result, mesh, carry);
  else verifyScene(trace, result, mesh);
  return result;
}

if (process.argv[1] && process.argv[1].endsWith('verify_frame.mjs')) {
  const carry = process.argv.includes('--carry') ? 'carry' : process.argv.includes('--resync') ? 'resync' : false;
  const result = verify(process.argv[2], carry);
  console.log(`build: ${BUILD_NAME}   frames compared: ${result.frames}   ${result.whole ? `the whole frame${carry ? `, state carried from the first frame (${result.carried} frames)` : ', each frame from its own snapshot'}` : 'rods, orbs and extra passes only (a capture without the other probes)'}`);
  for (const line of result.orders) console.log(`  draw order, ${line}`);
  let whole = result.frames > 0;
  const total = { vertex: [0, 0], state: [0, 0], text: [0, 0] };
  for (const [key, { packets, writes }] of Object.entries(result.kinds).sort()) {
    console.log(`  ${key.padEnd(62)} packets ${String(packets[0]).padStart(5)} of ${String(packets[1]).padEnd(5)}  writes ${writes[0]} of ${writes[1]}`);
    const kind = key.split(' ')[0];
    total[kind][0] += packets[0];
    total[kind][1] += packets[1];
    if (packets[0] !== packets[1]) whole = false;
  }
  console.log(`  vertex packets ${total.vertex[0]} of ${total.vertex[1]} equal; state packets ${total.state[0]} of ${total.state[1]} equal; sends with no face, equal: ${result.empty}${result.empty ? ` (${Object.entries(result.emptyLabels).map(([l, n]) => `${l} ${n}`).join(", ")})` : ""}`);
  if (result.text.strings) {
    const t = result.text;
    console.log(`  text packets ${total.text[0]} of ${total.text[1]} equal, from ${t.strings} strings of the probes (drawn and measured): ${t.table[0]} of ${t.table[1]} text taken from the language table, ${t.fixed[0]} of ${t.fixed[1]} from fixed strings of the ELF image, ${t.probed} from the caller's buffers as probed (date and time); carried font cache equal to the library's at ${t.lists[0]} of ${t.lists[1]} frame starts${t.outside || t.unread ? `; strings outside the three parts ${t.outside}, unreadable ${t.unread}` : ''}`);
    if (t.table[0] !== t.table[1] || t.fixed[0] !== t.fixed[1] || t.lists[0] !== t.lists[1] || t.outside || t.unread || t.table[1] + t.fixed[1] === 0) whole = false;
  }
  if (result.whole) {
    console.log(`  matrices computed equal to the ones handed to the rods: ${result.matrices[0]} of ${result.matrices[1]}`);
    console.log(`  parts starting where the model has them: ${result.sync[0]} of ${result.sync[1]}`);
    if (result.matrices[0] !== result.matrices[1] || result.sync[0] !== result.sync[1]) whole = false;
    if (carry) {
      const drift = Object.entries(result.state);
      console.log(`  state the model carried, against each frame's snapshot: ${drift.length === 0 ? 'every piece equal in every frame' : `${drift.length} pieces differ`}`);
      for (const [name, { frames, first, where }] of drift) console.log(`    ${name}: differs in ${frames} frames, first in frame ${first} (${where})`);
      for (const [name, text] of Object.entries(EXTERNAL)) console.log(`    taken from outside every frame: ${name} (${text})`);
      if (drift.length) whole = false;
    }
  }
  for (const [name, frames] of Object.entries(result.events)) console.log(`  event: ${name} changed by the menus in ${frames.length} of ${result.frames} frames (${frames.slice(0, 8).join(', ')}${frames.length > 8 ? ', ...' : ''}): ${EVENTS[name]}`);
  const { coverage } = result;
  console.log(`coverage: the model produces ${coverage.modelled} of the ${coverage.frame} packets of these frames (${((100 * coverage.modelled) / Math.max(1, coverage.frame)).toFixed(1)}%)`);
  for (const [label, count] of Object.entries(coverage.others).sort((a, b) => b[1] - a[1])) console.log(`  not produced: ${String(count).padStart(5)}  ${label}`);
  for (const note of result.notes) console.log(`  note: ${note}`);
  for (const text of result.problems) console.log(`  ! ${text}`);
  const what = result.whole ? 'every packet the model produces' : 'every packet of the rods, the orbs and the extra passes';
  console.log(`verdict: ${whole ? `FOUND ${result.frames} frames: ${what} equal` : 'PARTIAL the model does not reproduce every packet'}`);
  process.exit(whole ? 0 : 3);
}
