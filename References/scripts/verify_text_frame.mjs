// The text of whole frames from the carried font state (References/model/clock_text.mjs): from the
// library's context at a frame's first character, every string of the frame is run through the
// model in order, the context carried from character to character and string to string, and every
// packet compared byte for byte with what was sent; the carried cache list is compared with the
// library's at every character. Each string arrives with the program's font state its caller set
// (place, colour, size: checked by verify_text2.mjs). Build: HDD OSD 1.10U.
//
// CLOCK_BUILD=hdd node verify_text_frame.mjs <trace.jsonl> (a capture taken with verify_text2's PROBES)
import { dataPath } from '../lib/data.mjs';
import fs from 'node:fs';
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { readContext } from './verify_text2.mjs';
import { expand, readFont } from './extract_font.mjs';
import { putString, elfImage, languageOf, languageTable, langId, tablePointers, LANGUAGE_WORD } from '../model/clock_text.mjs';

const PUTS = 0x00213ba8, MEASURE = 0x00213d38, PUTC = 0x00291858, STATE = 0x003969b0;
export const PROBES = (await import('./verify_text2.mjs')).PROBES;

export function verify(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const data = expand(fs.readFileSync(dataPath('dumps/hddosd-host/FNTOSD')));
  const font = readFont(data);
  const image = elfImage(fs.readFileSync(dataPath('dumps/hddosd-host/hddosd.elf')));
  const inTables = tablePointers(image);
  const languages = new Set(), words = new Set();
  const probes = trace.probes.filter((probe) => !probe.preroll);
  const result = { frames: 0, strings: 0, packets: [0, 0], lists: [0, 0], heads: new Map(), table: [0, 0, 0], fixed: [0, 0], problems: [] };
  const problem = (text) => { if (result.problems.length < 12) result.problems.push(text); };
  const sameList = (a, b) => a.length === b.length && a.every((e, i) => e.code === b[i].code && e.cell === b[i].cell && e.loaded === b[i].loaded && e.block === b[i].block);

  // The packet's room when a string opens: 0x1FF less the quadwords of its head.
  const frames = new Map();
  probes.forEach((probe, n) => { if (probe.pc === PUTS || probe.pc === MEASURE) (frames.get(probe.frame) ?? frames.set(probe.frame, []).get(probe.frame)).push(n); });
  // The language word is carried state: read once, at the capture's first string that holds it, and checked at every later one.
  const holds = probes.find((p) => p.pc === PUTS && p.mem.some((m) => m.address === LANGUAGE_WORD && m.bytes));
  const language = holds ? holds.mem.find((m) => m.address === LANGUAGE_WORD).bytes.readUInt32LE(0) : null;
  if (language !== null) words.add(language);
  // --table=<address>: D_002AD220 written alone by the capture's stimulus (a pointer from langtblptrs), not through the language word.
  const given = process.argv.find((a) => a.startsWith('--table='));
  const override = given ? Number(given.slice(8)) : null;
  if (override !== null && ![0, 1, 2, 3, 4, 5, 6, 7].some((l) => languageTable(image, l) === override)) throw new Error(`${given} is not an entry of langtblptrs`);
  let carried = null;
  for (const [number, starts] of frames) {
    const first = probes.slice(starts[0]).find((p) => p.pc === PUTC);
    if (!first || !first.mem[0].bytes) continue;
    // With --carry the context is read once, at the capture's first character, and carried across frames.
    if (!carried || !process.argv.includes('--carry')) carried = { font, data, ctx: readContext(first.mem[0].bytes, STATE), headRoom: 0x1ff - 4 };
    let state = carried;
    result.frames += 1;
    for (const n of starts) {
      const start = probes[n];
      const [text, own] = start.mem.map((m) => m.bytes);
      if (!text || !own) { problem(`frame ${number}: a string was not readable`); break; }
      const measuring = start.pc === MEASURE;
      let shown = text.subarray(0, text.indexOf(0));
      if (process.argv.includes('--carry')) {
        const word = start.mem.find((m) => m.address === LANGUAGE_WORD)?.bytes?.readUInt32LE(0);
        if (word !== undefined && word !== language) problem(`frame ${number}: the language word ${word.toString(16)} is not the capture's ${language?.toString(16)}`);
        const table = override ?? (language === null ? null : languageTable(image, languageOf(language)));
        const pointer = start.gpr[4] >>> 0, id = table === null ? -1 : langId(image, table, pointer);
        const fixed = id < 0 ? image.string(pointer) : null;
        if (id < 0 && inTables.has(pointer)) { result.table[1] += 1; problem(`frame ${number}: "${shown.toString('latin1')}" at ${pointer.toString(16)} is in another language's table, not language ${languageOf(language)}'s`); }
        else if (id < 0 && fixed && fixed.length > 0 && fixed.equals(shown)) { result.fixed[0] += 1; result.fixed[1] += 1; shown = fixed; }
        else if (id < 0 && fixed && fixed.length > 0) { result.fixed[1] += 1; problem(`frame ${number}: the ELF holds "${fixed.toString('latin1')}" at ${pointer.toString(16)}, drawn "${shown.toString('latin1')}"`); }
        else if (id < 0) result.table[2] += 1;
        else {
          const made = image.string(pointer);
          result.table[1] += 1;
          if (made.equals(shown)) { result.table[0] += 1; shown = made; languages.add(languageOf(language)); }
          else problem(`frame ${number}: id ${id} of language ${languageOf(language)} gives "${made.toString('latin1')}", drawn "${shown.toString('latin1')}"`);
        }
      }
      // The head's size is the program's; it is the same for every string.
      const calls = [];
      for (let i = n + 1; i < probes.length && probes[i].pc === PUTC; i++) calls.push(probes[i]);
      if (!measuring && calls[0]) {
        const ctx = readContext(calls[0].mem[0].bytes, STATE), ownNow = calls[0].mem[1].bytes;
        const head = ctx.room - ((ownNow.readUInt32LE(0x158) - ownNow.readUInt32LE(0x15c) + 15) >>> 4);
        result.heads.set(head, (result.heads.get(head) ?? 0) + 1);
      }
      const out = putString(state, shown, own, measuring);
      result.strings += 1;
      // Packets.
      if (!measuring) {
        out.packets.forEach((p, i) => {
          const sent = trace.packets[start.at + i];
          result.packets[1] += 1;
          let equal = sent && sent.bytes.length === p.bytes.length;
          if (equal && p.kind === 'picture') {
            const end = p.pictureAt + p.written, rest = p.pictureAt + p.pictureBytes;
            equal = sent.bytes.subarray(0, end).equals(p.bytes.subarray(0, end)) && sent.bytes.subarray(rest).equals(p.bytes.subarray(rest));
          } else if (equal) equal = sent.bytes.equals(p.bytes);
          if (equal) result.packets[0] += 1;
          else problem(`frame ${number} "${shown.toString('latin1')}" packet ${i} (${p.kind}) differs`);
        });
      }
      // The carried list against the library's after the string: at the next character asked for.
      const next = probes.slice(n + 1).find((p) => p.pc === PUTC && !calls.includes(p));
      state = out.state;
      carried = state;
      if (next && next.frame === number && next.mem[0].bytes) {
        const held = readContext(next.mem[0].bytes, STATE);
        result.lists[1] += 1;
        if (sameList(state.ctx.list, held.list) && state.ctx.block === held.block) result.lists[0] += 1;
        else {
          const i = state.ctx.list.findIndex((e, k) => !held.list[k] || e.code !== held.list[k].code || e.cell !== held.list[k].cell || e.loaded !== held.list[k].loaded || e.block !== held.list[k].block);
          const show = (e) => (e ? `${e.code.toString(16)}/${e.cell}/${e.loaded}/${e.block.toString(16)}` : '-');
          problem(`frame ${number} after "${shown.toString('latin1')}": carried list differs at ${i}: ${show(state.ctx.list[i])} against ${show(held.list[i])}; block ${state.ctx.block.toString(16)}/${held.block.toString(16)} setUp ${state.ctx.setUp}/${held.setUp}`);
        }
      }
    }
  }
  result.words = words;
  return result;
}

if (process.argv[1] && process.argv[1].endsWith('verify_text_frame.mjs')) {
  const result = verify(process.argv[2]);
  console.log(`frames: ${result.frames}   strings run through the model: ${result.strings}`);
  console.log(`  packets equal: ${result.packets[0]} of ${result.packets[1]}`);
  console.log(`  carried cache list equal to the library's: ${result.lists[0]} of ${result.lists[1]}`);
  if (process.argv.includes('--carry')) console.log(`  strings from the language table (id found for the argument's pointer, text read from the ELF): ${result.table[0]} equal of ${result.table[1]}; ${result.fixed[0]} equal of ${result.fixed[1]} at fixed ELF addresses outside the table; ${result.table[2]} in RAM buffers filled by the caller (date and time); language words ${[...result.words].map((w) => w.toString(16)).join(' ')}`);
  console.log(`  room at a string's first character: ${[...result.heads].map(([h, c]) => `${h} x ${c}`).join(', ')}`);
  for (const text of result.problems) console.log(`  ! ${text}`);
  const whole = result.frames > 0 && result.packets[0] === result.packets[1] && result.lists[0] === result.lists[1] && result.table[0] === result.table[1] && result.fixed[0] === result.fixed[1] && result.problems.length === 0;
  console.log(`verdict: ${whole ? `FOUND ${result.frames} frames of text from the carried state, every packet equal` : 'PARTIAL see the lines marked !'}`);
  process.exit(whole ? 0 : 3);
}
