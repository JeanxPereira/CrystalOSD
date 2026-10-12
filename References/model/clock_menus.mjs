// The menus' own code, as far as it moves the clock's state: the main menu, System Configuration
// and its list, the entries' callbacks that reach the clock (Clock Adjustment), and the clock
// thread's step between two frames (leaving the clock). Pad words in, ramps and modes out; text,
// sounds and the configuration items are left out. Read in HDD OSD 1.10U:
//
//   module_clock_232458   the pages function: after the cubes and the menu ramp,
//     module_clock_231E48   System Configuration: its ramp, func_00230FD8, func_00231C50
//     func_00232408         the main menu: its ramp, func_002320B0, menupos_p3_p8_tgt
//   clock_input_check_handler_p6_p7_tgt (0x002259B8)   the thread's loop around the frame function
//
// The ramp object { length, counter, changed, state } is the clock's (clock_math.mjs, tickRamp):
// state 0 hidden, 1 rising, 2 full, 3 falling.
import { tickRamp } from './clock_math.mjs';
import { dateCheck, secondsOf, dateOf, BASE_ZONE } from './clock_date.mjs';

const PAD_UP = 0x1000, PAD_DOWN = 0x4000, PAD_CROSS = 0x20, PAD_CIRCLE = 0x40, PAD_SQUARE = 0x80, PAD_TRIANGLE = 0x10;
const STEP = 3000;

const state = (ramp) => ramp.readInt32LE(12);
const counter = (ramp) => ramp.readInt32LE(4);
/** func_00234AC0: from hidden, start rising. */
export const show = (ramp) => { if (state(ramp) === 0) { ramp.writeInt32LE(0, 4); ramp.writeInt32LE(1, 12); ramp.writeInt32LE(1, 8); } };
/** func_00234AE0: from full, start falling. */
export const hide = (ramp) => { if (state(ramp) === 2) { ramp.writeInt32LE(1, 8); ramp.writeInt32LE(3, 12); ramp.writeInt32LE(ramp.readInt32LE(0), 4); } };

/** func_00239018 / func_00238FB8: the orbs' sprite ramp, which turns round where it is when moving. */
const spritesHide = (m) => { const r = m.at('spriteFade'); if (state(r) === 2) hide(r); else if (state(r) === 1) r.writeInt32LE(3, 12); };
const spritesShow = (m) => { const r = m.at('spriteFade'); if (state(r) === 0) show(r); else if (state(r) === 3) r.writeInt32LE(1, 12); };

/** func_0022F078 / func_0022F110: the rods' appearance ramp, every rod's length cleared. */
function appearance(m, up) {
  const ramp = m.at('appearance');
  if (state(ramp) !== (up ? 0 : 2)) return;
  if (up) { ramp.fill(0, 4, 16); show(ramp); } else hide(ramp);
  const block = m.at('state'), current = block.readUInt32LE(0);
  for (let i = 0; i < 12; i++) block.writeInt32LE(0, 0x10 + ((i + current) % 12) * 0x30);
}

/** func_00234C28(mode): the overlay mode, its level and the fade rectangle. */
export function setMode(m, mode) {
  const fade = m.at('fadeRecord'), screen = m.at('screen');
  m.setInt('mode', mode);
  fade.writeInt32LE(screen.readInt32LE(4) << 4, 0x24);
  fade.writeInt32LE(screen.readInt32LE(0) << 4, 0x20);
  if (mode === 1) { m.setInt('overlayLevel', 0); for (const o of [0, 4, 8]) fade.writeInt32LE(0xff, o); }
  else if (mode === 3) { for (const o of [4, 0, 8]) fade.writeInt32LE(0, o); m.setInt('overlayLevel', 0x80); hide(m.at('vignetteRamp')); }
  else if (mode === 2 || mode === 4) { for (const o of [4, 0, 8]) fade.writeInt32LE(0, o); m.setInt('overlayLevel', 0); }
}

const pressed = (m) => m.int('pad', 4);

/**
 * config_get_aspect_ratio (HDD 0x00203D30, ROM 0x002041C8): bits 1 and 2 of the console's settings
 * word, 3 read as 0. Bit 3 of the ROM's word (0x00204230) is the video output, item 2.
 */
export function aspectOf(m) {
  const ratio = (m.int('mechaconParam', 0) >>> 1) & 3;
  return ratio < 3 ? ratio : 0;
}

/**
 * config_load_clock_osd (HDD 0x00234F88, ROM 0x00231590), as far as the clock draws it: with the gate
 * at 1 (D_00370300, ROM 0x002C8920) item 0 is read from the settings word. Other items are the
 * configuration code's (`configItems`, taken from outside).
 */
export function reloadItem0(m) {
  if (m.has('configGate') && m.has('mechaconParam') && m.int('configGate') === 1) m.setInt('item0', aspectOf(m));
}

/**
 * The end of every frame (HDD func_00235518, called by the frame function after the logic; ROM
 * 0x00231A40, a jump into config_load_clock_osd): ROM reloads; HDD first saves a dirty
 * configuration (the save writes the items back into the word, so a reload would read what item 0
 * already holds) and reloads when nothing is dirty, being written or waiting.
 */
export function endOfFrame(m) {
  if (m.build === 'hdd' && m.has('configDirty') && dirty(m)) return;
  reloadItem0(m);
}
const setGate = (m, value) => { if (m.has('configGate')) m.setInt('configGate', value); };
const dirty = (m) => { const d = m.at('configDirty'); return d.readInt32LE(0) !== 0 || d.readInt32LE(4) !== 0 || d.readInt32LE(8) !== 0; };

// ---- the entries' callbacks ---------------------------------------------------------------------

/**
 * What an entry's callback does to the clock, by its address. Every callback of the list was
 * followed through the calls it makes (References/scripts reach analysis): only Clock
 * Adjustment's touch the clock. Its enter (D_00226FD0) sets the scale target to 0 and hides the
 * sprites; its confirm (clock_config_change_cb_clock) and cancel (D_00227BE8) set it to 1 and
 * show them. The others edit configuration items and text only.
 */
const CALLBACKS = {
  hdd: {
    // clock_config_change_cb_aspect_ratio: item 0 against the word; a difference marks the configuration dirty (config_mark_dirty).
    0x00227d30: (m) => { if (m.has('configDirty') && m.int('item0') !== aspectOf(m)) m.setInt('configDirty', 1); },
    0x00226fd0: (m, entry) => adjustmentOpens(m, entry),
    0x00227b90: (m) => { m.setFloat('scaleTarget', 1); spritesShow(m); },
    0x00227be8: (m, entry, notes) => { timeFromClock(m, notes); m.setFloat('scaleTarget', 1); spritesShow(m); },
  },
  // ROM 2.30: the same three functions (0x00222760, 0x00223318, 0x00223368).
  rom: {
    0x00222760: (m, entry) => adjustmentOpens(m, entry),
    0x00223318: (m) => { m.setFloat('scaleTarget', 1); spritesShow(m); },
    0x00223368: (m, entry, notes) => { timeFromClock(m, notes); m.setFloat('scaleTarget', 1); spritesShow(m); },
  },
};
/**
 * func_002358F8: the time record from configuration items 6 to 0xB (year, month, day, hour,
 * minute, second), milliseconds 0; the time is marked not yet filled.
 */
function timeFromItems(m) {
  const items = m.at('configItems'), time = m.at('time');
  time.writeInt32LE(0, 0);
  time.writeInt32LE(items.readInt32LE(0xb * 4), 4);
  time.writeInt32LE(items.readInt32LE(0xa * 4), 8);
  time.writeInt32LE(items.readInt32LE(9 * 4), 0xc);
  if (m.has('timeFilled')) m.setInt('timeFilled', 0);
}
/**
 * Cancel, func_00235848 (ROM 0x00231CF0): the time record from the console's clock (the six words
 * the mechacon read left at 0x001F0D1C, ROM 0x001F0CB8: year to second) through func_002358F8,
 * then module_clock_set_anim_offset (ROM 0x00231F88) moves it from the base zone (city 0x33) and
 * no summer time to the configured zone and summer time: the date to seconds, plus
 * ((offset - base) + 60 * summer) * 60, and back to a date; the time record keeps its seconds,
 * minutes and hours (its year, month and day are not part of the model).
 */
function timeFromClock(m, notes) {
  if (!m.has('rtcMirror') || !m.has('mechaconParam')) { notes.push('the console clock is not in the capture: the time after a cancel is not modelled'); return; }
  const mirror = m.at('rtcMirror'), param = m.at('mechaconParam').readUInt32LE(0);
  const date = [0, 1, 2, 3, 4, 5].map((i) => mirror.readInt32LE(i * 4));
  const offset = (param << 12) >> 21, summer = (param >>> 29) & 1;
  const moved = dateOf(secondsOf(...date) + BigInt(((offset - BASE_ZONE) + summer * 60) * 60));
  const time = m.at('time');
  time.writeInt32LE(0, 0);
  time.writeInt32LE(moved[5], 4);
  time.writeInt32LE(moved[4], 8);
  time.writeInt32LE(moved[3], 0xc);
  if (m.has('timeFilled')) m.setInt('timeFilled', 0);
}

/** D_00226FD0 (ROM 0x00222760): Clock Adjustment opens with the seconds at 0. */
// D_003655B0 (ROM 0x002C4820): the year, month and day fields with their full ranges.
const DATE_FIELDS = { year: [6, 2000, 2099], month: [7, 1, 12], day: [8, 1, 31] };
/** func_00226E68 (ROM 0x002225F8): the first three fields in the order of the date format. */
function orderFields(m) {
  if (!m.has('adjustFields') || !m.has('mechaconParam')) return;
  const format = m.at('mechaconParam').readUInt32LE(4) & 3;
  const order = format === 1 ? ['month', 'day', 'year'] : format === 2 ? ['day', 'month', 'year'] : format === 0 ? ['year', 'month', 'day'] : null;
  if (!order) return;
  const fields = m.at('adjustFields');
  order.forEach((name, k) => DATE_FIELDS[name].forEach((value, i) => fields.writeInt32LE(value, k * 12 + i * 4)));
}

function adjustmentOpens(m, entry) {
  orderFields(m);
  m.setFloat('scaleTarget', 0);
  spritesHide(m);
  m.at('configItems').writeInt32LE(0, 0xb * 4);
  timeFromItems(m);
  checkDate(m, entry);
}

/** func_00227488 (ROM 0x00222BF0) on the items, and the fields' ranges written back (clock_date.mjs). */
function checkDate(m, entry) {
  if (!m.has('adjustFields') || !m.has('mechaconParam')) return;
  const items = m.at('configItems'), fields = m.at('adjustFields');
  const now = [6, 7, 8, 9, 10, 11].map((i) => items.readInt32LE(i * 4));
  const { items: out, ranges } = dateCheck(now, m.at('mechaconParam').readUInt32LE(0));
  out.forEach((value, i) => items.writeInt32LE(value, (6 + i) * 4));
  for (let k = 0; k < entry.readInt32LE(4); k++) {
    const item = fields.readInt32LE(k * 12);
    if (item < 6 || item > 11) continue;
    fields.writeInt32LE(ranges[item - 6][0], k * 12 + 4);
    fields.writeInt32LE(ranges[item - 6][1], k * 12 + 8);
  }
}

const EDITOR = { hdd: 0x00227ad0, rom: 0x00223258 };
/**
 * D_00227AD0 (ROM 0x00223258), every frame while Clock Adjustment is entered: with the menu ramp
 * hidden, the field editor (func_00227940, ROM 0x002230A8): left and right move the cursor over
 * the fields, up and down (the repeating pad word) change the field's configuration item within
 * its range, wrapping; then the time from the items.
 */
function adjustmentFrame(m, notes) {
  const page = m.at('configPage');
  const entry = m.view(page.readUInt32LE(4) + page.readInt32LE(0x10) * 0x38, 0x38);
  if (entry.readUInt32LE(0x1c) !== EDITOR[m.build]) return;
  if (state(m.at('menuRamp')) === 0 && m.has('adjustFields')) {
    const pad = pressed(m), repeat = m.int('pad', 0xc), count = entry.readInt32LE(4);
    let cursor = entry.readInt32LE(8);
    if (pad & 0x8000) { cursor -= 1; if (cursor < 0) cursor += count; }
    if (pad & 0x2000) { cursor += 1; if (cursor === count) cursor = 0; }
    entry.writeInt32LE(cursor, 8);
    const field = m.at('adjustFields').subarray(cursor * 12, cursor * 12 + 12);
    const items = m.at('configItems'), at = field.readInt32LE(0) * 4;
    const [low, high] = [field.readInt32LE(4), field.readInt32LE(8)];
    if (repeat & 0x1000) {
      const value = items.readInt32LE(at) + 1;
      items.writeInt32LE(value > high ? low : value, at);
      checkDate(m, entry);
    }
    if (repeat & 0x4000) {
      const value = items.readInt32LE(at) - 1;
      items.writeInt32LE(value < low ? high : value, at);
      checkDate(m, entry);
    }
  }
  timeFromItems(m);
}

/**
 * func_002311E8, the list's drawing of the selected entry when the page is not inside an entry:
 * its string callback (+0x18). Clock Adjustment's (D_00227420, ROM 0x00222B88) first puts the
 * three date fields back in the order and full ranges of the date format (func_00226E68), then
 * draws the date text. The text itself is not modelled. The entry that is leaving (D_003702A0)
 * is drawn the same way; it adds nothing: the fields are narrowed only inside the entry, where
 * no move is possible, and the selected entry's drawing restores them on the first frame outside.
 */
const STRING_CALLBACK = { hdd: 0x00227420, rom: 0x00222b88 };
// The other entries' string callback, clock_config_get_item_str (HDD 0x00228470, ROM 0x002239D8): it first
// puts the entry's value index (+8) where the entry's item sits in its value table (func_002283C0).
const ITEM_STRING = { hdd: 0x00228470, rom: 0x002239d8 };
// The values of the aspect entry's table (HDD 0x002B2810, ROM 0x0028ACE0): 0, 1, 2, one every 0x20 bytes.
const ASPECT_VALUES = [0, 1, 2];
function valueIndex(m, entry, values) {
  const item = m.int('configItems', entry.readInt32LE(0xc) * 4), count = entry.readInt32LE(4);
  if (item === values[entry.readInt32LE(8)] || count <= 0) return;
  entry.writeInt32LE(0, 8);
  for (let n = 0; n < count; n++) if (item === values[n]) { entry.writeInt32LE(n, 8); return; }
}
function stringCallback(m, notes) {
  const page = m.at('configPage');
  const entry = m.view(page.readUInt32LE(4) + page.readInt32LE(0x10) * 0x38, 0x38);
  const address = entry.readUInt32LE(0x18);
  if (address === STRING_CALLBACK[m.build]) orderFields(m);
  else if (address === ITEM_STRING[m.build] && entry.readInt32LE(0xc) === 0) valueIndex(m, entry, ASPECT_VALUES);
}

function callback(m, at, notes) {
  const page = m.at('configPage');
  const entry = m.view(page.readUInt32LE(4) + page.readInt32LE(0x10) * 0x38, 0x38);
  CALLBACKS[m.build][entry.readUInt32LE(at)]?.(m, entry, notes);
}

// ---- System Configuration --------------------------------------------------------------------

/** func_00230860(direction): ask the cubes' list to move one place. */
function listMove(m, direction) {
  const list = m.at('cubeList');
  const pal = m.int('videoMode') === 2;
  const rate = Math.trunc(pal ? 50 : m.float('listConstants', 0));
  const half = (rate + (rate >>> 31)) >> 1;
  const left = list.readInt32LE(0xc) + direction * STEP;
  list.writeInt32LE(left, 0xc);
  const speed = Math.trunc((Math.abs(left) * 2) / half);
  list.writeInt32LE(speed, 0x10);
  list.writeInt32LE(Math.trunc(speed / half), 0x14);
}

/** func_00230E10: the list's alpha from the page ramp and the menu ramp (0 while either is low). */
function listAlpha(m) {
  const page = m.at('configRamp'), menu = m.at('menuRamp');
  const tail = m.int('tail'), body = m.int('body'), first = m.int('menuLengths', 0);
  const clamp = (x) => (x < 0 ? 0 : Math.min(x, tail));
  const a = Math.trunc((clamp(counter(page) - (body + first)) << 7) / tail);
  return Math.trunc((a * clamp(tail - counter(menu))) / tail);
}
/** func_00230C28: the menu ramp's part above the body, out of 128. */
const menuAlpha = (m) => { const c = counter(m.at('menuRamp')) - m.int('body'), tail = m.int('tail'); return Math.trunc(((c < 0 ? 0 : Math.min(c, tail)) << 7) / tail); };

/** ROM 2.30, 0x0022C330: the cubes' ramp up, standing cubes or ring chosen by the list's length. */
function cubesUp(m) {
  const cubes = m.at('cubeRamp');
  if (m.build === 'rom' && state(cubes) === 0) m.setInt('cubeMode', m.int('configPage', 8) < 6 ? 5 : 6);
  show(cubes);
}

/**
 * module_clock_231E48 (ROM 0x0022E0B8): the page's ramp, its schedule (func_00230FD8, ROM
 * 0x0022D160) and its input (func_00231C50, ROM 0x0022DFD8).
 */
function configPage(m, notes) {
  const hdd = m.build === 'hdd';
  const page = m.at('configPage'), ramp = m.at('configRamp');
  tickRamp(ramp);
  const first = m.int('menuLengths', 0), third = m.int('menuLengths', 8), tail = m.int('tail'), body = m.int('body');
  // func_00230FD8
  if (state(ramp) === 1) {
    if (counter(ramp) === first) cubesUp(m);
  } else if (state(ramp) === 3) {
    if (ramp.readInt32LE(0) - counter(ramp) === tail) hide(m.at('cubeRamp'));
    if (state(m.at('dialogRamp')) === 0) {
      if (counter(ramp) === first + body) show(m.at('vignetteRamp'));
      else if (counter(ramp) === first) hide(m.at('greyRamp'));
      else if (counter(ramp) === third) appearance(m, false);
    }
  } else if (state(ramp) === 2 && page.readInt32LE(0x18) === 2) {
    if (hdd) { if (!dirty(m)) page.writeInt32LE(0, 0x18); }
    else if (m.int('romWrite', 0xc) === 8) {
      // ROM 2.30 waits for the clock's write to the drive (0x001F00B0 at 8), then marks it seen.
      page.writeInt32LE(0, 0x18);
      m.setInt('romWrite', 5, 0xc);
      m.setInt('romWrite', 0, 0);
    }
  }
  // The selected entry's glow: a counter running up by 0x136 a frame and wrapping into
  // -n..n, n = rate x 0x7AA8 / 60 with the rate 60 or 50.
  const n = Math.trunc(((m.int('videoMode') === 2 ? 50 : 60) * 0x7aa8) / 60);
  const glow = page.readInt32LE(0x34) + 0x136;
  page.writeInt32LE(glow < n ? glow : glow - 2 * n, 0x34);

  // The list's drawing (browser_str_related, ROM 0x0022D728) runs the selected entry's
  // per-frame callback; Clock Adjustment's edits the fields and sets the time from them.
  if (state(ramp) !== 0 && state(m.at('menuRamp')) !== 2) {
    if (page.readInt32LE(0x18) === 1) adjustmentFrame(m, notes);
    else stringCallback(m, notes);
  }

  const active = m.at('entryActive');
  if (!hdd) {
    // ROM 0x0022DFD8: the entry is marked while the page is full and the menu ramp hidden.
    if (state(ramp) === 2 && state(m.at('menuRamp')) === 0) {
      if (active.readInt32LE(0) === 0) active.writeInt32LE(1, 0);
      if (page.readInt32LE(0x18) === 0) listInput(m, notes);
      else if (page.readInt32LE(0x18) === 1) entryInput(m, notes);
    } else if (active.readInt32LE(0) !== 0) active.writeInt32LE(0, 0);
    return;
  }
  // func_00231C50
  if (state(ramp) === 1) {
    if (listAlpha(m) !== 0 && active.readInt32LE(0) === 0) active.writeInt32LE(1, 0);
  } else if (state(ramp) === 3) {
    if (listAlpha(m) === 0 && active.readInt32LE(0) !== 0) active.writeInt32LE(0, 0);
  } else if (state(ramp) === 2) {
    const menu = m.at('menuRamp');
    if (state(menu) === 1) { if (menuAlpha(m) !== 0 && active.readInt32LE(0) !== 0) active.writeInt32LE(0, 0); }
    else if (state(menu) === 3) { if (menuAlpha(m) === 0 && active.readInt32LE(0) === 0) active.writeInt32LE(1, 0); }
    if (state(menu) === 0) {
      if (page.readInt32LE(0x18) === 0) listInput(m, notes);
      else if (page.readInt32LE(0x18) === 1) entryInput(m, notes);
    }
  }
}

/** func_002316B8: the list itself. */
function listInput(m, notes) {
  const page = m.at('configPage'), pad = pressed(m), count = page.readInt32LE(8);
  // ROM 2.30 moves the ring only when it shows the ring.
  const ring = m.build === 'hdd' || m.int('cubeMode') >= 6;
  if (pad & PAD_UP) {
    if (ring) listMove(m, 1);
    const selected = page.readInt32LE(0x10) - 1;
    page.writeInt32LE(selected < 0 ? count - 1 : selected, 0x10);
  } else if (pad & PAD_DOWN) {
    if (ring) listMove(m, -1);
    const selected = page.readInt32LE(0x10) + 1;
    page.writeInt32LE(selected < count ? selected : 0, 0x10);
  } else if (pad & PAD_CROSS) {
    callback(m, 0x14, notes);
    page.writeInt32LE(1, 0x18);
    // Inside an entry the items are not reloaded: -1 for the first entry, 0 for the others.
    setGate(m, page.readInt32LE(0x10) === 0 ? -1 : 0);
  } else if (pad & PAD_SQUARE) {
    // func_00230C80: the clock alone.
    show(m.at('menuRamp'));
  } else if (pad & PAD_CIRCLE) {
    // func_00230F80: back to the main menu.
    hide(m.at('configRamp'));
  } else if (pad & PAD_TRIANGLE && (m.build === 'hdd' || page.readInt32LE(0x10) === 0)) {
    notes.push('the Options dialog of System Configuration (triangle) is not modelled');
  }
}

/** func_00231B38: inside an entry, confirm or cancel. */
function entryInput(m, notes) {
  const page = m.at('configPage'), pad = pressed(m);
  if (pad & PAD_CROSS) {
    const list = m.at('cubeList');
    if (m.build === 'hdd' || m.int('cubeMode') >= 6) {
      // The pulse of the confirmed value: -0.1 on the selected place.
      list.writeFloatLE(m.float('listConstants', 8), 0);
      list.writeInt32LE(Math.trunc((list.readInt32LE(8) + list.readInt32LE(0xc)) / STEP), 4);
    } else {
      // ROM 2.30, standing cubes: the pulse on the selected cube itself.
      m.at('standing').writeFloatLE(m.float('listConstants', 0xc), page.readInt32LE(0x10) * 0x30 + 0x20);
    }
    callback(m, 0x20, notes);
    page.writeInt32LE(0, 0x34);
    if (m.build === 'hdd') { page.writeInt32LE(dirty(m) ? 2 : 0, 0x18); setGate(m, 1); }
    else if (m.int('romWrite', 0xc) === 5 && m.int('romWrite', 0) === 0x12) page.writeInt32LE(2, 0x18);   // ROM 2.30: wait (level 2) while the clock's write to the drive is under way, the gate stays
    else { page.writeInt32LE(0, 0x18); setGate(m, 1); }
  } else if (pad & PAD_CIRCLE) {
    callback(m, 0x24, notes);
    page.writeInt32LE(0, 0x18);
    // Cancel opens the gate and reloads every item from the console's words.
    setGate(m, 1);
    reloadItem0(m);
    page.writeInt32LE(0, 0x34);
  }
}

// ---- the main menu -------------------------------------------------------------------------------

/** func_00232020: no other page in the way. */
function nothingElse(m) {
  for (const name of ['configRamp', 'versionRamp', 'dialogRamp', 'firstRunRamp']) if (state(m.at(name)) !== 0) return false;
  // func_0022AAF0 answers the page in front, if any.
  return m.int('pagePointers', 0x10) === 0;
}

/** func_00232408: the main menu's ramp, its appearing and leaving (func_002320B0), its input. */
function mainMenu(m, notes) {
  const menu = m.at('mainMenu'), ramp = menu.subarray(0x18, 0x28);
  tickRamp(ramp);
  const weight = m.int('overlayLevel'), mode = m.int('mode');
  if (nothingElse(m)) {
    if (state(ramp) === 0) { if (mode === 2 && weight === 0x80 - m.int('tail')) show(ramp); }
    else if (state(ramp) === 2 && mode === 3 && weight === 0x80) hide(ramp);
  }
  // menupos_p3_p8_tgt
  if (state(ramp) !== 2 || !nothingElse(m) || m.int('scene', 4) !== 0) return;
  const pad = pressed(m);
  if (pad & PAD_UP) { const s = menu.readInt32LE(0x10) - 1; if (s >= 0) menu.writeInt32LE(s, 0x10); }
  else if (pad & PAD_DOWN) { const s = menu.readInt32LE(0x10) + 1; if (s < menu.readInt32LE(8)) menu.writeInt32LE(s, 0x10); }
  else if (pad & PAD_CROSS) {
    const selected = menu.readInt32LE(0x10);
    if (selected === 0 && mode === 0) hide(ramp);                         // the Browser: func_00231FB0
    else if (selected === 1) startSystemConfiguration(m, notes);
  } else if (pad & PAD_TRIANGLE) notes.push('the version page (triangle on the main menu) is not modelled');
}

/** StartSysConfig. */
function startSystemConfiguration(m, notes) {
  const ramp = m.at('configRamp');
  if (state(ramp) !== 0) return;
  if (m.build === 'rom') rebuildList(m, notes);
  ramp.writeInt32LE(m.int('menuLengths', 0) + m.int('body') + m.int('tail'), 0);
  show(ramp);
  hide(m.at('vignetteRamp'));
  show(m.at('greyRamp'));
  appearance(m, true);
}

/**
 * ROM 2.30, 0x002235D8: the last entry's value count (+4) and value table (+0x10), by the
 * language (0x00205830 answers the cached word at 0x0027B388 once the flag at 0x0027B390 is set;
 * the jump table at 0x002C4920 is in language order). It then jumps to 0x002294C0, which fills
 * the record at 0x00295900 the same way (count, table, selected): no piece of the model reads it.
 */
const VALUE_TABLES = [[2, 0x0028a800], [7, 0x0028a860], [7, 0x0028a9b0], [2, 0x0028ac20], [2, 0x0028ab00], [2, 0x0028ab60], [2, 0x0028abc0]];
function valueTable(m, entry, notes) {
  if (!m.has('language')) { notes.push('the language is not in the capture: the value table is not written'); return; }
  const language = m.int('language', 0);
  if (m.int('language', 8) === 0 || language === -1) { notes.push('the language is read from the drive here: not modelled'); return; }
  const table = VALUE_TABLES[language];
  if (!table) return;
  entry.writeInt32LE(table[0], 4);
  entry.writeUInt32LE(table[1], 0x10);
}

/**
 * ROM 2.30, 0x00223710: the list is rebuilt when System Configuration opens. Entry 4 is there
 * only while configuration item 0x13 is set; the last entry follows; the selected entry is found
 * again by its string number, or the first.
 */
function rebuildList(m, notes) {
  const page = m.at('configPage');
  const entry = (i) => m.view(page.readUInt32LE(4) + i * 0x38, 0x38);
  const selectedId = entry(page.readInt32LE(0x10)).readInt32LE(0);
  let count = 4;
  if (m.int('configItems', 0x13 * 4) !== 0) { m.view(0x0028af80, 0x38).copy(entry(4)); count = 5; }
  m.view(0x0028afb8, 0x38).copy(entry(count));
  valueTable(m, entry(count), notes);
  count += 1;
  page.writeInt32LE(count, 8);
  let found = 0;
  for (let i = 0; i < count; i++) if (entry(i).readInt32LE(0) === selectedId) { found = i; break; }
  page.writeInt32LE(found, 0x10);
}

/** The menus' part of the pages function, after the cubes and the menu ramp. */
export function menus(m, notes) {
  if (!m.has('configPage')) return false;
  for (const name of ['versionRamp', 'dialogRamp', 'firstRunRamp']) if (state(m.at(name)) !== 0) notes.push(`${name} is not hidden: that page is not modelled`);
  // module_clock_22A990 ticks the version page's ramp before System Configuration.
  tickRamp(m.at('versionRamp'));
  configPage(m, notes);
  mainMenu(m, notes);
  // func_0022D828 ticks the first-run pages' ramp, func_0022D5D8 the dialog's.
  tickRamp(m.at('firstRunRamp'));
  tickRamp(m.at('dialogRamp'));
  return true;
}

/**
 * The clock thread's step before a frame (clock_input_check_handler_p6_p7_tgt, from 0x00225A28),
 * as far as leaving the clock goes. `disc` is the disc state the drive reports (0x001F000C).
 */
export function between(m, notes) {
  if (!m.has('screenCode')) return;
  const scene = m.at('scene');
  if (scene.readInt32LE(4) !== 0 && state(m.at('firstRunRamp')) === 0) {
    if (m.int('mode') === 0) setMode(m, 3);
    return;
  }
  if (m.int('screenCode') === m.int('disc')) {
    const ramp = m.at('mainMenu').subarray(0x18, 0x28);
    if (state(ramp) === 3 && ramp.readInt32LE(8) !== 0) {
      if (m.int('screenCode') !== 0x74) m.setInt('screenCode', 9999);
      scene.writeInt32LE(1, 4);
    }
  } else notes.push('the disc state changed: the thread branches for a disc are not modelled');
}
