// The Version page (triangle on the main menu), as far as it moves state: its ramp, its record
// (rows, selected row, first shown row), the button panel words it sets, the job that fetches the
// version strings, and the front page it can push. Pad words and the console's answers in; ramps,
// record and panel words out. Text is clock_text.mjs's; sounds are left out. HDD OSD 1.10U only.
//
//   menupos_p3_p8_tgt (0x002322E0)   the main menu's input: triangle -> func_0022A298 (open)
//   module_clock_22A990              every frame, from the pages function after module_clock_229828:
//     func_00234B10                    the ramp's tick
//     func_0022A360                    rising at counter 1: poll the job (func_00212448), hold the
//                                      ramp at 0 until it is done, then fill the rows
//                                      (do_show_version_info); hidden again: panels off
//     func_0022A410                    the drawing; here only its panel words (func_002266C0/C8)
//     func_0022A7A8                    the button hints, the arrows, up/down/triangle/circle
//   module_clock_229828              the front page's tick (*D_003701C0 + 0x1C), before the rest
//
// The ramp object { length, counter, changed, state } is the clock's (clock_math.mjs, tickRamp).
import { tickRamp } from './clock_math.mjs';
import { show, hide } from './clock_menus.mjs';

/** HDD OSD 1.10U addresses of every word the page reads or writes. */
export const V = {
  record: 0x002b2fe8,      // title (+0), rows (+4), count (+8), shown rows (+0xc), selected (+0x10), first shown (+0x14), ramp (+0x18)
  ramp: 0x002b3000,
  job: 0x00370a84,         // the handle callback_queue_submit returned
  jobEntry: 0x0020aad8,    // D_0020AAD8, the job: the version list at 0x001F1298
  list: 0x001f1298,        // label, value, id: 12 bytes a row, ended by a null label, at most 0x20
  front: 0x003701c0,       // the front page: a record of the page stack, its ramp at +0x1c
  page: 0x003701d0,        // the page func_0022AAF0 answers
  stack: 0x00404370,       // the page stack: 30 records of 0x54
  enable: 0x00370140,      // func_002266C0
  alpha: 0x0037013c,       // func_002266C8
  hints: 0x002b2300,       // func_002266E0: mode, left id, right id, third
  arrows: 0x002b2310,      // func_002266D0
  pad: 0x00370330,         // held, pressed (+4), released, repeating
  videoMode: 0x002ad228,   // var_curvidmode
  tail: 0x003702d0,
  menu: 0x002b2e60,        // the main menu: count (+8), selected (+0x10), ramp (+0x18)
  configRamp: 0x002b2e04,
  dialogRamp: 0x002b46b8,
  firstRunRamp: 0x002b46d0,
  scene: 0x002b2170,       // +4: the leaving flag
};
export const STACK_RECORD = 0x54, ROWS = 0x20, ROW = 0x10, LIST_ROW = 0xc;
const PAD_UP = 0x1000, PAD_DOWN = 0x4000, PAD_CROSS = 0x20, PAD_CIRCLE = 0x40, PAD_TRIANGLE = 0x10;

const i32 = (m, address) => m.view(address, 4).readInt32LE(0);
const set = (m, address, value) => m.view(address, 4).writeInt32LE(value | 0, 0);
const rampAt = (m, address) => m.view(address, 0x10);
const state = (ramp) => ramp.readInt32LE(12);
/** func_00234A70: counter x scale / length, C division. */
const fraction = (ramp, scale) => Math.trunc((ramp.readInt32LE(4) * scale) / ramp.readInt32LE(0));
const frontRamp = (m) => rampAt(m, (i32(m, V.front) >>> 0) + 0x1c);
const rowAt = (m, row) => m.view((i32(m, V.record + 4) >>> 0) + row * ROW, ROW);

/** func_0022A1D8: the page's alpha, out of 128: its ramp times what the front page leaves. */
export function alphaOf(m) {
  const product = fraction(rampAt(m, V.ramp), 0x80) * (0x80 - fraction(frontRamp(m), 0x80));
  return (product < 0 ? product + 0x7f : product) >> 7;
}
/** func_00228F40: the front page's ramp, out of 128. */
export const frontAlpha = (m) => fraction(frontRamp(m), 0x80);

/** module_clock_229828: the front page's ramp ticks (the front page's own code is not modelled). */
export function frontTick(m, notes) {
  const ramp = frontRamp(m);
  tickRamp(ramp);
  if (state(ramp) !== 0) notes.push('the front page is shown: its own code (func_00229028, func_00229080, func_002297D0) is not modelled');
}

/**
 * do_show_version_info: the rows from the job's list. Row k: label, value, sub-row count, id;
 * selected is the row whose id is 6 (else 0); first shown is max(0, selected - shown + 1) here;
 * the title is language string 0x59 (not modelled). `subRows(id)` is func_002086A8(id, -1, 0, 0),
 * the number of sub-rows of an id, taken from the console. The sub-pages it also builds in the page
 * stack are not modelled.
 */
function fillRows(m, io, notes) {
  const record = m.view(V.record, 0x28);
  record.writeInt32LE(0, 0x10);
  record.writeInt32LE(0, 0x14);
  let count = 0;
  for (; count < ROWS; count++) {
    const entry = m.view(V.list + count * LIST_ROW, LIST_ROW);
    if (entry.readUInt32LE(0) === 0) break;
    const id = entry.readInt32LE(8);
    const subRows = io.subRows(count, id);
    if (id === 6) record.writeInt32LE(count, 0x10);
    const row = rowAt(m, count);
    row.writeUInt32LE(entry.readUInt32LE(4), 4);
    row.writeInt32LE(subRows, 8);
    row.writeUInt32LE(entry.readUInt32LE(0), 0);
    row.writeInt32LE(id, 0xc);
    if (subRows > 0) notes.push(`row ${count} has ${subRows} sub-rows: its page in the page stack is not modelled`);
  }
  record.writeInt32LE(count, 8);
  const selected = record.readInt32LE(0x10), top = record.readInt32LE(0x14);
  const low = selected - record.readInt32LE(0xc) + 1;
  record.writeInt32LE(top < low ? low : Math.min(top, selected), 0x14);
}

/** func_002266E0: the button hints; outside Japan (mode > 0) the two sides change places, 0x55 and 0x56 swapped. */
function hints(m, mode, left, right, third) {
  const out = m.view(V.hints, 0x10);
  out.writeInt32LE(mode, 0);
  if (i32(m, V.videoMode) > 0) {
    out.writeInt32LE(left !== 0x55 ? left : 0x56, 8);
    out.writeInt32LE(right !== 0x56 ? right : 0x55, 4);
  } else {
    out.writeInt32LE(right, 8);
    out.writeInt32LE(left, 4);
  }
  out.writeInt32LE(third, 0xc);
}

/**
 * module_clock_22A990. `io.poll()` answers func_00212448(1, job, 0): 1 when the job is done.
 * Returns what was written, for the verifier: { polled, filled, panels, hints }.
 */
export function versionPage(m, io, notes) {
  const ramp = rampAt(m, V.ramp), record = m.view(V.record, 0x28);
  const out = { polled: false, filled: false, panels: false, hints: false };
  tickRamp(ramp);
  // func_0022A360
  if (state(ramp) === 1 && ramp.readInt32LE(4) === 1) {
    out.polled = true;
    if (io.poll()) { fillRows(m, io, notes); out.filled = true; }
    else ramp.writeInt32LE(0, 4);
  }
  if (state(ramp) === 0 && ramp.readInt32LE(8) !== 0) set(m, V.enable, 0);
  // func_0022A410: the panel words, before its text
  const alpha = alphaOf(m);
  if (state(ramp) !== 0 && state(frontRamp(m)) !== 2) {
    set(m, V.enable, 1);
    const front = frontAlpha(m);
    set(m, V.alpha, alpha < front ? front : alpha);
    out.panels = true;
  }
  // func_0022A7A8
  if (state(ramp) === 0 || alphaOf(m) < frontAlpha(m)) return out;
  const selected = record.readInt32LE(0x10), count = record.readInt32LE(8);
  hints(m, 1, 0x55, 1, rowAt(m, selected).readInt32LE(8) !== 0 ? 0x57 : 1);
  const up = selected === 0 ? 0 : PAD_UP;
  set(m, V.arrows, selected + 1 < count ? up | PAD_DOWN : up);
  out.hints = true;
  if (state(ramp) !== 2 || state(frontRamp(m)) !== 0) return out;
  const pad = i32(m, V.pad + 4);
  if (pad & PAD_UP) {
    const s = record.readInt32LE(0x10) - 1;
    if (s >= 0) record.writeInt32LE(s, 0x10);
    const top = record.readInt32LE(0x14);
    record.writeInt32LE(top - (record.readInt32LE(0x10) < top ? 1 : 0), 0x14);
  } else if (pad & PAD_DOWN) {
    const s = record.readInt32LE(0x10) + 1;
    if (s < record.readInt32LE(8)) record.writeInt32LE(s, 0x10);
    const top = record.readInt32LE(0x14);
    record.writeInt32LE(top + (record.readInt32LE(0x10) < top + record.readInt32LE(0xc) ? 0 : 1), 0x14);
  } else if (pad & PAD_TRIANGLE) {
    const s = record.readInt32LE(0x10);
    // func_00228F68: the row's page becomes the front page, its ramp rising. Cross does nothing here.
    if (rowAt(m, s).readInt32LE(8) !== 0 && state(frontRamp(m)) === 0) {
      set(m, V.front, V.stack + s * STACK_RECORD);
      show(frontRamp(m));
    }
  } else if (pad & PAD_CIRCLE) {
    // func_0022A308
    hide(ramp);
  }
  return out;
}

/** func_00232020: no other page in front of the main menu. */
function nothingElse(m) {
  for (const address of [V.configRamp, V.ramp, V.dialogRamp, V.firstRunRamp]) if (state(rampAt(m, address)) !== 0) return false;
  return i32(m, V.page) === 0;
}

/**
 * menupos_p3_p8_tgt's triangle: with the main menu full, nothing in front, not leaving, and no up,
 * down or cross pressed, func_0022A298 opens the page from hidden when the job is queued.
 * `io.submit()` answers callback_queue_submit(D_0020AAD8): true when queued. Returns whether the
 * job was asked for.
 */
export function triangle(m, io) {
  if (state(rampAt(m, V.menu + 0x18)) !== 2 || !nothingElse(m) || i32(m, V.scene + 4) !== 0) return false;
  const pad = i32(m, V.pad + 4);
  if (pad & (PAD_UP | PAD_DOWN | PAD_CROSS) || !(pad & PAD_TRIANGLE)) return false;
  const ramp = rampAt(m, V.ramp);
  if (state(ramp) !== 0) return false;
  const queued = io.submit();
  set(m, V.job, queued ? V.jobEntry : 0);
  if (queued) show(ramp);
  return true;
}
