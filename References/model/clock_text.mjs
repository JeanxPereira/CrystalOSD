// The text of a clock frame, HDD OSD 1.10U: from the strings a frame draws, in order, and the font
// state carried from the character before, every packet the font code sends. The font library's
// context (the glyph cache's list and cells, the block laid out, the colour table, the room left
// in the packet) is carried from one character, and one string, to the next; nothing is read back
// from the console between them.
//
// What a frame draws, where, in which colour, at which size and alpha, is the rule of each caller:
// verify_text2.mjs holds them (date and time, the main menu's items, the button hints, System
// Configuration's title, entries, values and arrow, the clock's value, the version page) and checks
// them against the program's font state; here a string arrives with that state already set.
//
//   textFrame({ ctx, font, data }, strings) -> { packets, ctx }
//     ctx      the library context at the frame's first character (readContext in verify_text2.mjs)
//     font     readFont(expand(FNTOSD)), data the expanded file (extract_font.mjs)
//     strings  [{ text: Buffer, own: Buffer (0x160 bytes of the program's font state as the
//              caller left it: place, colour, size, fixed width), measuring: bool }], in order
import { putCharacter, stringOf, openString } from '../scripts/verify_text2.mjs';
import { glyphOf } from '../scripts/extract_font.mjs';

/**
 * The strings of the language table, from the ELF image (HDD OSD 1.10U). config_set_langtbl
 * (0x00208170) copies langtblptrs[language] (0x002AD200, eight pointers) into D_002AD220;
 * get_lang_string (0x002081B8) returns the pointer at D_002AD220 + 4 x id; ids 0x56 and 0x55 read
 * +0x154 and +0x158 when get_vidmode_with_fallback is not 0, which is the same slot as 4 x id. The
 * language is bits 4 to 8 of the word at 0x00371818, read as 1 when 0 (config_get_osd_language,
 * 0x00203DD8).
 */
export const LANGUAGE_IDS = 0x400;
export const LANGTBLPTRS = 0x002ad200, LANGUAGE_WORD = 0x00371818;
export function elfImage(elf) {
  const phoff = elf.readUInt32LE(28), size = elf.readUInt16LE(42), count = elf.readUInt16LE(44), segs = [];
  for (let i = 0; i < count; i++) {
    const at = phoff + i * size;
    if (elf.readUInt32LE(at) === 1) segs.push({ off: elf.readUInt32LE(at + 4), va: elf.readUInt32LE(at + 8), size: elf.readUInt32LE(at + 16) });
  }
  const at = (address, length) => {
    for (const s of segs) if (address >= s.va && address + length <= s.va + s.size) return s.off + address - s.va;
    return -1;
  };
  return {
    word: (address) => { const o = at(address, 4); return o < 0 ? null : elf.readUInt32LE(o); },
    string: (address) => {
      const o = at(address, 1);
      if (o < 0) return null;
      return elf.subarray(o, elf.indexOf(0, o));
    },
  };
}
export const languageOf = (word) => ((word >>> 4) & 0x1f) || 1;
export const languageTable = (image, language) => image.word(LANGTBLPTRS + 4 * language);
/** The pointer get_lang_string gives for id. */
export const langPointer = (image, table, id) => image.word(table + 4 * id);
/** The id whose entry is the pointer, or -1; the text is the ELF's string at it. */
export function tablePointers(image) {
  const all = new Set();
  for (let language = 0; language < 8; language++) {
    const table = languageTable(image, language);
    for (let id = 0; id < LANGUAGE_IDS; id++) all.add(langPointer(image, table, id));
  }
  return all;
}
const ids = new Map();
export function langId(image, table, pointer) {
  if (!ids.has(table)) {
    const byPointer = new Map();
    for (let id = LANGUAGE_IDS - 1; id >= 0; id--) byPointer.set(langPointer(image, table, id), id);
    ids.set(table, byPointer);
  }
  return ids.get(table).get(pointer) ?? -1;
}

/**
 * The cache list after the library is asked for `code` (_scePFont_Putc 0x00291858, 0x00291894..
 * 0x00291978): the entry holding the code, else the first never used, else the last, moves to the
 * head; without a cell it takes the cell of the last entry passed that holds one, which loses it;
 * given a new code it is not loaded and names the code's block, picture and metrics.
 */
export function carryList(list, code, font, data, base) {
  let at = 0, spare = list[0].cell !== -1 ? 0 : null;
  if (list[0].code !== code && list[0].code !== 0 && list.length > 1) {
    for (at = 1; ; at++) {
      if (list[at].code === code) break;
      if (list[at].cell !== -1) spare = at;
      if (at === list.length - 1 || list[at].code === 0) break;
    }
  }
  const out = list.map((entry) => ({ ...entry }));
  const entry = out[at];
  if (entry.cell === -1 && spare !== null && spare !== at) {
    entry.loaded = 0;
    entry.cell = out[spare].cell;
    out[spare].cell = -1;
    out[spare].loaded = 0;
  }
  if (entry.code !== code) {
    entry.loaded = 0;
    entry.code = code;
    const glyph = glyphOf(font, data, code);
    if (glyph) {
      entry.block = base + glyph.block.at;
      entry.picture = base + glyph.picture;
      entry.metrics = base + glyph.block.metrics + (glyph.block.perGlyph ? 16 * glyph.glyph : 0);
    } else entry.block = 0;
  }
  out.splice(at, 1);
  out.unshift(entry);
  return out;
}

const copy = (ctx) => ({ ...ctx, list: ctx.list.map((e) => ({ ...e })) });

/**
 * One string through Font_PutsPackets (0x00213BA8) or calcDrawArea (0x00213D38). The packet opens
 * with room for 0x1FF quadwords less its head; a character the library gives up for room is asked
 * for again in a fresh packet of 0x1FF (scePFontPutsContinue).
 */
export function putString(state, text, own, measuring = false) {
  const { font, data } = state;
  let ctx = copy(state.ctx);
  // scePFontPuts asks for the texture to be set up again at every string drawn.
  if (!measuring) ctx.setUp = 1;
  const packets = measuring ? [] : [{ kind: 'opening', bytes: openString() }];
  let room = measuring ? Infinity : state.headRoom;
  const asked = stringOf(text, own, font, data, measuring ? { colour: ctx.colour } : null);
  let step = asked.next();
  while (!step.done) {
    const c = step.value;
    ctx.list = carryList(ctx.list, c.code, font, data, ctx.data);
    const at = { ...ctx, locate: c.locate, colour: c.colour, matrix: c.matrix, fresh: c.fresh, drawing: measuring ? 0 : 1, room: Infinity };
    const made = putCharacter(at, font, data, c.code, room);
    // The library's layout of the cache and its flags, as the character left them.
    for (const key of ['format', 'cellW', 'cellH', 'cells', 'width', 'height', 'logW', 'logH', 'setUp', 'block']) ctx[key] = made.ctx[key];
    if (made.ctx.list !== at.list) ctx.list = made.ctx.list.map((e) => ({ ...e }));
    for (const p of made.packets) { packets.push(p); room -= p.bytes.length >> 4; }
    if (made.packets.some((p) => p.kind === 'picture')) ctx.list[0].loaded = 1;
    if (made.packets.some((p) => p.kind === 'texture')) ctx.setUp = 0;
    if (made.result === -1) { room = 0x1ff; continue; }
    ctx = { ...ctx, locate: c.locate, colour: c.colour, matrix: c.matrix, fresh: 0 };
    step = asked.next(made.penX);
  }
  return { packets, state: { ...state, ctx }, reach: step.value };
}

/** The text of a frame: the strings in order, the context carried through all of them. */
export function textFrame(state, strings) {
  const packets = [];
  let s = state;
  for (const string of strings) {
    const out = putString(s, string.text, string.own, string.measuring);
    packets.push(...out.packets.map((p) => ({ ...p, string: string.text.toString('latin1') })));
    s = out.state;
  }
  return { packets, ctx: s.ctx };
}
