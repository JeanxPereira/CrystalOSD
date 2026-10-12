// The scene fixture: for every frame of a whole-frame capture, the clock's named state at the
// frame function's entry and every value the JS model (References/model/clock_*.mjs) computes from
// it, run as References/scripts/verify_frame.mjs --carry runs it (state carried from the first
// frame, only its EXTERNAL inputs taken from each snapshot). The native ports are tested against it
// bit for bit. Refuses to write when the model does not reproduce the capture.
//
// CLOCK_BUILD=hdd node tools/scene/export_fixture.mjs <trace.jsonl> [out.json]
//   default out: D:/CodingProjects/CrystalOSD-Data/fixtures/<capture>/scene.json
//
// Schema. Floats are their 32-bit pattern as "0x" and 8 hex digits; every number is an integer;
// a matrix is 4 rows of 4 (rows as the model holds them); a colour is [r, g, b, a].
// { capture, build: "hdd", frames: [ {
//   index,
//   input: the state at the frame's entry, one key per piece of clock_memory.mjs (decoders: PIECES
//          in instrument.mjs): time {ms, seconds, minutes, hours}, eased {secondHand, hourHand,
//          progress, fraction}, state {currentRod, secondsAngle, rodAngle, rods[12] {appearance,
//          progress, base, reflection}, accent, fourth, progressTarget, accentFrame, currentTarget},
//          rings[7] {head, count, full, entries[50] {x, y, z, colour}}, template (a rod record),
//          ramps {length, counter, changed, state}, rectangle records {colour, x0, y0, u0, v0, x1,
//          y1, u1, v1, z, blend, textured}, ...
//   expect: {
//     drawOrder: ["rod 5", "orb 3", ...]          the draw list, deepest first
//     camera: { screen, view, cameraOffset }      cameraOffset: after the frame's decay
//     rods[12], in draw order: { number, record (the rod record handed to transform), local,
//       matrix (local through the view), centre {cx, cy, cz}, pieces [{piece "A"|"B", record,
//       faces}] (a split rod), faces[record.faces]: { index, flag, normal, edge, vertices[4] {eye,
//       screen, q, s, t, x, y, z, f}, refracted[], textured[], reflected[] } }
//       each emitter call: { phase "rod"|"extra pass 0"|"extra pass 1", piece "whole"|"A"|"B",
//       refracted: extra, centre [cx, cy]; textured: colour, ds, dt; reflected: colour;
//       prim, vertices[4] } with the GS values sent: x, y (12.4), z (24 bits), f, u, v, r, g, b, a,
//       q, s, t (each as its register holds it)
//     orbs[7], by orb number k: { k, drawn (place among the orbs drawn), centre {cx, cy, cz},
//       position [x, y, z], colour, ring (after the frame), trail[2] {header, prim, vertices},
//       sprites[2] {glow, disc}: [0] to the frame, [1] to the refraction buffer }
//     head: { background[] (strips), blur[], copies[], tint, vignette[], fade, blurAfter[] (the
//       trips after the rods), bars[], column }: each a draw { label, prim, vertices }
//     after: the state the frame leaves, decoded as `input`
//     text: { text[], hint[], pages[] } the strings of the date and time, the button hint and the menu pages
//     stages: { cubes, menuStep, menus, endOfFrame }, each { before, after } (STAGE_PIECES of instrument.mjs;
//       menus also notes), null for a stage the model did not call
//     cubes[]: the packets cubes() sent that hold vertices { label, prim, fbp (FRAME_1's page), vertices }
//     listFade: { first, second, secondIndex } at the list function's probe, when the frame draws the list
//   } , between: null for frame 0, else { before, after, notes } around the clock thread's step (between())
//   input also: the menus' pieces (pad, configPage, configEntries[9], mainMenu, cubeList, ...) and listFade
//   } } ] }
import fs from 'node:fs';
import path from 'node:path';

process.env.CLOCK_BUILD ??= 'hdd';
if (process.env.CLOCK_BUILD !== 'hdd') throw new Error('the scene fixture is HDD OSD 1.10U only (CLOCK_BUILD=hdd)');

const { install, REFERENCES } = await import('./instrument.mjs');

/**
 * What the alpha rules of the date, time and button hint read (verify_text2.mjs dateAlpha and panelsOf, HDD OSD
 * 1.10U), from the text probes at func_00230008 and func_002269E0 that precede the frame's date and hint strings:
 * ramps as { length, counter, changed, state }, words as integers. The menus' code writes them; the clock screen
 * only reads them. Written into each frame's input as `textRamps`.
 */
async function addTextRamps(traceFile, frames) {
  const { readTraceFor } = await import(`${REFERENCES}lib/trace.mjs`);
  const { PROBES } = await import(`${REFERENCES}scripts/verify_text2.mjs`);
  const trace = readTraceFor(traceFile, PROBES);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const probes = trace.probes.filter((probe) => !probe.preroll);
  const before = (pc, at) => probes.filter((probe) => probe.pc === pc && probe.at <= at).at(-1);
  const reader = (probe) => {
    const word = (address) => {
      for (const m of probe.mem) if (m.bytes && address >= m.address && address + 4 <= m.address + m.bytes.length) return m.bytes.readInt32LE(address - m.address);
      throw new Error(`0x${(address >>> 0).toString(16)} was not probed at 0x${probe.pc.toString(16)}`);
    };
    return { word, ramp: (address) => ({ length: word(address), counter: word(address + 4), changed: word(address + 8), state: word(address + 12) }) };
  };
  for (const frame of frames) {
    const text = frame.expect.text;
    if (!text?.text.length || !text.hint.length) continue;
    const date = reader(before(0x00230008, text.text[0].at)), panels = reader(before(0x002269e0, text.hint[0].at));
    const index = panels.word(0x002b2ff8);
    frame.input.textRamps = {
      config: date.ramp(0x002b2e04), dialogClosing: date.ramp(0x002b46b8), firstRun: date.ramp(0x002b46d0), lead: date.word(0x003702e0),
      body: date.word(0x003702cc), tail: date.word(0x003702d0), weight: date.word(0x00370ab8),
      mainMenu: panels.ramp(0x002b2e78), version: panels.ramp(0x002b3000), menu: panels.ramp(0x002b5780), dialog: panels.ramp(panels.word(0x003701c0) + 0x1c),
      panel7: panels.word(0x002b2e00), panel8On: panels.word(0x00370140), panel8: panels.word(0x0037013c), adjustRow: panels.word(panels.word(0x002b2fec) + index * 16 + 8),
      panelConfig: panels.ramp(0x002b2e04), panelLead: panels.word(0x003702e0), panelBody: panels.word(0x003702cc), panelTail: panels.word(0x003702d0), panelWeight: panels.word(0x00370ab8),
    };
  }
}

/**
 * The list entries' crossfade (D_0037029C first, D_003702A0 second, D_003702A4 second's index; writers func_002316B8
 * and func_00230FD8, the disassembly (CRYSTALOSD_ASM)), read at the list function's probe (0x00231388, verify_text2 PROBES, gp words
 * 0x00370130 + 0x1C0). expect.listFade: the frame's own words (after func_00230FD8). input.listFade: the frame
 * before's; frame 0 starts at rest: func_00230FD8 saturates first to 128 and second to 0 within 16 frames, so a
 * capture that starts at rest starts at (128, 0, index).
 */
async function addListFade(traceFile, frames) {
  const { readTraceFor } = await import(`${REFERENCES}lib/trace.mjs`);
  const { PROBES } = await import(`${REFERENCES}scripts/verify_text2.mjs`);
  const trace = readTraceFor(traceFile, PROBES);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const probes = trace.probes.filter((p) => !p.preroll);
  const word = (probe, address) => {
    for (const m of probe.mem) if (m.bytes && address >= m.address && address + 4 <= m.address + m.bytes.length) return m.bytes.readInt32LE(address - m.address);
    throw new Error(`${traceFile}: 0x${(address >>> 0).toString(16)} was not probed at 0x${probe.pc.toString(16)}`);
  };
  let last = null;
  frames.forEach((frame) => {
    const pages = frame.expect.text?.pages ?? [];
    const list = pages.length ? probes.filter((p) => p.pc === 0x00231388 && p.at <= pages.at(-1).at).at(-1) : null;
    const fade = list ? { first: word(list, 0x0037029c), second: word(list, 0x003702a0), secondIndex: word(list, 0x003702a4) } : null;
    if (frame.index === 0) {
      if (fade && (fade.first !== 128 || fade.second !== 0)) throw new Error(`${traceFile}: the list fade moves at frame 0`);
      frame.input.listFade = fade ?? { first: 128, second: 0, secondIndex: 0 };
    } else if (last) frame.input.listFade = last;
    if (fade) { frame.expect.listFade = fade; last = fade; }
  });
}

/**
 * The Version page's own state (clock_version.mjs, verified by verify_version.mjs), read at the probes the capture holds:
 * the frame's start (module_clock_22A990), the page's drawing (func_0022A410: the record as the strings are drawn from it)
 * and the pages function's return (0x00232488: the page's input done). Rows are decoded to what the native page holds:
 * the label as the English language id of its string, the value as the string, the sub-row count and the id.
 * input.versionPage / input.versionList; expect.stages.menus.before.versionPage (the frame's start, with the number of job
 * polls before it), .after.versionPage (after the page's input), .after.versionDrawn (the record at the drawing, with its ramp).
 * The values the job reads from the console (D_00383F00, D_00383F18: the Console name and the CD Player's version, in bss)
 * are the strings the capture draws for them.
 */
const CONSOLE_VALUES = new Map([[0x00383f00, 'Unknown'], [0x00383f18, '1.30']]);
async function addVersionPage(traceFile, frames) {
  const { readTraceFor, readTrace, mergeProbes } = await import(`${REFERENCES}lib/trace.mjs`);
  const text2 = await import(`${REFERENCES}scripts/verify_text2.mjs`);
  const versionVerifier = await import(`${REFERENCES}scripts/verify_version.mjs`);
  const { elfImage, languageTable, langId, LANGUAGE_IDS } = await import(`${REFERENCES}model/clock_text.mjs`);
  const trace = readTraceFor(traceFile, mergeProbes(versionVerifier.PROBES, text2.PROBES));
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const probes = trace.probes;
  if (!probes.some((probe) => probe.pc === 0x0022a410)) return;
  const image = elfImage(fs.readFileSync(new URL("dumps/hddosd-host/hddosd.elf", REFERENCES)));
  const english = languageTable(image, 1);
  const bytesAt = (probe, address, length) => {
    for (const m of probe.mem) if (m.bytes && address >= (m.address >>> 0) && address + length <= (m.address >>> 0) + m.bytes.length) return m.bytes.subarray(address - (m.address >>> 0), address - (m.address >>> 0) + length);
    throw new Error(`${traceFile}: 0x${address.toString(16)} was not probed at 0x${probe.pc.toString(16)}`);
  };
  const word = (probe, address) => bytesAt(probe, address, 4).readInt32LE(0);
  const valueOf = (pointer) => {
    if (pointer === 0) return '';
    const text = image.string(pointer);
    if (text && text.length) return text.toString('latin1');
    if (CONSOLE_VALUES.has(pointer)) return CONSOLE_VALUES.get(pointer);
    throw new Error(`${traceFile}: the version string at 0x${pointer.toString(16)} is not known`);
  };
  const rowsOf = (bytes, count) => Array.from({ length: count }, (_, k) => {
    const label = bytes.readUInt32LE(k * 16), value = bytes.readUInt32LE(k * 16 + 4);
    return { label: label === 0 ? 0 : langId(image, english, label), value: valueOf(value), subRows: bytes.readInt32LE(k * 16 + 8), id: bytes.readInt32LE(k * 16 + 12) };
  });
  const RECORD = 0x002b2fe8, { V: VP } = await import(`${REFERENCES}model/clock_version.mjs`);
  const rampAt = (probe, address) => ({ length: word(probe, address), counter: word(probe, address + 4), changed: word(probe, address + 8), state: word(probe, address + 12) });
  const titleOf = (probe) => { const title = word(probe, RECORD); return title >= LANGUAGE_IDS ? langId(image, english, title) : title; };
  const recordOf = (probe) => ({ title: titleOf(probe), count: word(probe, RECORD + 8), shown: word(probe, RECORD + 0xc), selected: word(probe, RECORD + 0x10), first: word(probe, RECORD + 0x14) });
  const rowsPointer = (probe) => word(probe, RECORD + 4) >>> 0;
  const calls = new Map();
  for (const probe of probes) {
    const call = calls.get(probe.frame) ?? calls.set(probe.frame, {}).get(probe.frame);
    const role = { 0x0022a990: 'start', 0x0022a3b0: 'poll', 0x0022a3b8: 'fill', 0x00232488: 'after', 0x0022a410: 'draw', 0x0022a2c8: 'submit' }[probe.pc];
    if (probe.pc === 0x0022a994) call.start2 = probe; else if (role) call[role] = probe;
  }
  // The pages function's probes carry the frame counter one above the frame function's entry in the same pass.
  const frameNumbers = readTrace(traceFile).probes.filter((probe) => probe.pc === 0x00225e80 && !probe.preroll).map((probe) => probe.frame + 1);
  const list = [];
  for (const [, call] of [...calls].sort((a, b) => a[0] - b[0])) if (call.fill) {
    const bytes = bytesAt(call.fill, 0x001f1298, 0x180);
    const rows = rowsOf(bytesAt(call.after, rowsPointer(call.after), 0x200), 0x20);
    for (let k = 0; k < 0x20 && bytes.readUInt32LE(k * 12) !== 0; k++) {
      const label = bytes.readUInt32LE(k * 12), value = bytes.readUInt32LE(k * 12 + 4), id = bytes.readInt32LE(k * 12 + 8);
      list.push({ label: langId(image, english, label), value: valueOf(value), subRows: rows[k].subRows, id });
    }
    break;
  }
  const panel = (probe) => ({ panelOn: word(probe, 0x00370140), panelAlpha: word(probe, 0x0037013c), hints: [0, 4, 8, 12].map((o) => word(probe, VP.hints + o)), arrows: word(probe, VP.arrows) });
  let polls = 0;
  frames.forEach((frame, k) => {
    const call = calls.get(frameNumbers[k]);
    if (!call?.start || !call.after || !call.draw) { if (call?.start) throw new Error(`${traceFile}: frame ${frameNumbers[k]} has no version probes`); return; }
    const start = { ...recordOf(call.start), rows: rowsOf(bytesAt(call.start, rowsPointer(call.start), 0x200), 0x20), job: word(call.start, VP.job), ...panel(call.start), polls };
    const next = calls.get(frameNumbers[k + 1]);
    const after = { ...recordOf(call.after), rows: rowsOf(bytesAt(call.after, rowsPointer(call.after), 0x200), 0x20), ...panel(call.after), job: next?.start ? word(next.start, VP.job) : start.job };
    after.polls = call.submit ? 0 : polls + (call.poll ? 1 : 0);
    const draw = { ...recordOf(call.draw), rows: after.rows, ramp: rampAt(call.draw, RECORD + 0x18) };
    polls = after.polls;
    frame.input.versionPage = start;
    frame.input.versionList = list;
    frame.expect.stages.menus.before.versionPage = start;
    frame.expect.stages.menus.before.versionList = list;
    frame.expect.stages.menus.after.versionPage = after;
    frame.expect.stages.menus.after.versionDrawn = draw;
    const closing = frame.expect.stages.endOfFrame;
    if (closing) {
      closing.before.versionPage = after;
      closing.before.versionList = list;
      closing.after.versionPage = after;
    }
  });
}

/** The frames of `traceFile` as the fixture's JSON text. */
export async function exportScene(traceFile) {
  const recording = await install();
  const { verify } = await import(`${REFERENCES}scripts/verify_frame.mjs`);
  const result = verify(traceFile, 'carry');
  const unequal = Object.entries(result.kinds).filter(([, { packets }]) => packets[0] !== packets[1]).map(([key]) => key);
  const drift = Object.keys(result.state);
  if (!result.whole || result.frames === 0 || unequal.length || drift.length || result.matrices[0] !== result.matrices[1] || result.sync[0] !== result.sync[1])
    throw new Error(`the model does not reproduce ${traceFile}: ${[...unequal, ...drift, ...result.problems].join('; ')}`);
  if (recording.frames.length !== result.frames) throw new Error(`${recording.frames.length} frames recorded, ${result.frames} compared`);
  await addTextRamps(traceFile, recording.frames);
  if (recording.frames.some((frame) => frame.expect.text)) await addListFade(traceFile, recording.frames);
  await addVersionPage(traceFile, recording.frames);
  const capture = path.basename(traceFile).replace(/\.trace\.jsonl$/, '');
  return { capture, frames: recording.frames.length, text: `${JSON.stringify({ capture, build: 'hdd', frames: recording.frames })}\n` };
}

if (process.argv[1] && process.argv[1].endsWith('export_fixture.mjs')) {
  const trace = process.argv[2];
  if (!trace) throw new Error('usage: node tools/scene/export_fixture.mjs <trace.jsonl> [out.json]');
  const { capture, frames, text } = await exportScene(trace);
  const out = process.argv[3] ?? `D:/CodingProjects/CrystalOSD-Data/fixtures/${capture}/scene.json`;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text);
  console.log(`${out}: ${frames} frames, ${text.length} bytes`);
}
