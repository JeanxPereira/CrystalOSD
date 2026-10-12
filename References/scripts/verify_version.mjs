// The Version page (triangle on the main menu), recomputed frame by frame by
// References/model/clock_version.mjs and compared with the console: its ramp, its record (row
// count, selected row, first shown row, the rows' label, value and id), the button panel words,
// the job handle, the front page and its ramp. HDD OSD 1.10U only.
//
//   module_clock_22A990 (0x0022A990)   the page's frame: the state it starts from (two probes)
//   0x0022A3B0                         after func_00212448: the job poll's answer (v0)
//   0x0022A3B8                         do_show_version_info is called: the job's list
//   0x00232488                         back in the pages function: what the page left
//   menupos_p3_p8_tgt (0x002322E0)     the main menu's input: the gate's pieces and the pad
//   0x0022A2C8                         after callback_queue_submit: the job queued (v0)
//
// The state is carried: from the first frame's start on, the ramp, the record, the rows, the job
// handle and the front page's ramp are the model's; the pad, the main menu, the other pages'
// ramps, the language string of the title, the page stack and the panel words of other writers
// are taken from each frame's probes. The console's answers (the job poll, the queue, the
// sub-row counts of func_002086A8) are taken where the console gives them.
//
// CLOCK_BUILD=hdd node verify_version.mjs <trace.jsonl>
import { readTraceFor } from '../lib/trace.mjs';
import { Memory } from '../model/clock_memory.mjs';
import { V, STACK_RECORD, ROWS, ROW, LIST_ROW, versionPage, triangle, frontTick } from '../model/clock_version.mjs';
import { BUILD, BUILD_NAME, range, pc } from './builds.mjs';

const readTrace = (file) => readTraceFor(file, PROBES);
const AT = { start: 0x0022a990, poll: 0x0022a3b0, fill: 0x0022a3b8, after: 0x00232488, menu: 0x002322e0, submit: 0x0022a2c8 };
const STACK = 30 * STACK_RECORD;
export const PROBES = BUILD !== 'hdd' ? [] : [
  { pc: pc(AT.start), ranges: [range(V.record, 0x28), `*${pc(V.record + 4)}:0x${(ROWS * ROW).toString(16)}`, range(0x00370130, 0x20), range(V.hints, 0x14), range(V.job, 4), range(V.front, 0x14), `*${pc(V.front)}:0x30`, range(V.pad, 0x10)] },
  { pc: pc(AT.start + 4), ranges: [range(V.videoMode, 4), range(V.tail, 4), range(V.stack, STACK)] },
  { pc: pc(AT.poll), ranges: [] },
  { pc: pc(AT.fill), ranges: [range(V.list, ROWS * LIST_ROW)] },
  { pc: pc(AT.after), ranges: [range(V.record, 0x28), `*${pc(V.record + 4)}:0x${(ROWS * ROW).toString(16)}`, range(0x00370130, 0x20), range(V.hints, 0x14), `*${pc(V.front)}:0x30`, range(V.front, 0x14)] },
  { pc: pc(AT.menu), ranges: [range(V.menu, 0x28), range(V.configRamp, 0x10), range(V.record, 0x28), range(V.dialogRamp, 0x10), range(V.firstRunRamp, 0x10), range(V.front, 0x14), range(V.scene, 0xc), range(V.pad, 0x10)] },
  { pc: pc(AT.submit), ranges: [] },
];

const V0 = 2;
const addressOf = (r) => r.address >>> 0;
const hex = (b) => b.toString('hex');
const words = (b) => Array.from({ length: b.length >> 2 }, (_, i) => b.readInt32LE(i * 4));

/** The pages calls of the trace: from one start probe to the next, each probe record by its role. */
function callsOf(trace) {
  const calls = [];
  for (const p of trace.probes) {
    if (p.pc === AT.start) { calls.push({ start: p, frame: p.frame }); continue; }
    const call = calls.at(-1);
    if (!call) continue;
    const role = Object.entries(AT).find(([, a]) => a === p.pc)?.[0];
    if (role === 'start') continue;
    if (p.pc === AT.start + 4) call.start2 = p;
    else if (role) call[role] = p;
  }
  return calls;
}

export function verify(file) {
  const trace = readTrace(file);
  if (!trace.complete) throw new Error(`${file}: ${trace.reason}`);
  const calls = callsOf(trace).filter((c) => c.start2 && c.after && c.menu);
  const out = { writes: 0, frames: 0, compared: 0, equal: 0, opens: 0, held: 0, fills: 0, closes: 0, moves: 0, fronts: 0, rising: 0, shown: 0, falling: 0, problems: [], notes: new Set() };
  if (calls.length === 0) return out;
  const first = calls[0];
  const rowsAddress = addressOf(first.start.mem[1]);
  const blocks = [[V.record, 0x28], [rowsAddress, ROWS * ROW], [0x00370130, 0x20], [V.hints, 0x14], [V.job, 4], [V.front, 0x14], [V.stack, STACK], [V.pad, 0x10],
    [V.videoMode, 4], [V.tail, 4], [V.list, ROWS * LIST_ROW], [V.menu, 0x28], [V.configRamp, 0x10], [V.dialogRamp, 0x10], [V.firstRunRamp, 0x10], [V.scene, 0xc]];
  const m = new Memory('hdd', blocks.map(([address, length]) => ({ address, bytes: Buffer.alloc(length) })));
  const load = (record) => { for (const r of record.mem) { if (r.bytes) r.bytes.copy(m.view(addressOf(r), r.bytes.length)); } };
  const bytesAt = (record, address, length) => {
    for (const r of record.mem) { const a = addressOf(r); if (r.bytes && address >= a && address + length <= a + r.bytes.length) return r.bytes.subarray(address - a, address - a + length); }
    return null;
  };
  const check = (what, model, console_, frame) => {
    out.compared += 1;
    if (model.equals(console_)) out.equal += 1;
    else out.problems.push(`frame ${frame}: ${what}: model ${words(model).join(',')} console ${words(console_).join(',')}`);
  };
  const frontAddress = () => m.view(V.front, 4).readUInt32LE(0);
  /** The modelled words of the record (count, selected, first shown, ramp) and of the rows (label, value, id). */
  const compareState = (record, frame, where) => {
    // +0xc, the number of rows shown, is the program's data (a capture may write it): not compared.
    check(`${where} record count, selected, first shown, ramp`, Buffer.concat([m.view(V.record + 8, 4), m.view(V.record + 0x10, 0x18)]), Buffer.concat([bytesAt(record, V.record + 8, 4), bytesAt(record, V.record + 0x10, 0x18)]), frame);
    // Every row of the table, filled or not: rows past the count must stay as they were.
    const rows = bytesAt(record, rowsAddress, ROWS * ROW);
    for (let k = 0; k < ROWS; k++) {
      const model = m.view(rowsAddress + k * ROW, ROW), seen = rows.subarray(k * ROW, k * ROW + ROW);
      check(`${where} row ${k} label, value, sub-rows, id`, model, seen, frame);
    }
  };

  load(first.start); load(first.start2);
  const writes = trace.inputs.filter((i) => i.type === 'write' && i.frame > first.frame).map((i) => ({ ...i }));
  for (let n = 0; n < calls.length; n++) {
    const c = calls[n], frame = c.frame, notes = [];
    out.frames += 1;
    // A capture's memory writes (stimuli): one recorded at frame F is first seen by the pages call of frame F + 1.
    for (const w of writes) if (!w.done && w.frame < frame) {
      w.done = true;
      for (let k = 0; k < w.bytes.length; k++) { try { m.view(w.address + k, 1)[0] = w.bytes[k]; } catch { /* not a piece of the page */ } }
      out.writes += 1;
    }
    if (n > 0) {
      compareState(c.start, frame, 'start');
      check('start job handle', m.view(V.job, 4), bytesAt(c.start, V.job, 4), frame);
      check('start front page', m.view(V.front, 4), bytesAt(c.start, V.front, 4), frame);
      const front = frontAddress();
      check('start front ramp', m.view(front + 0x1c, 0x10), bytesAt(c.start2, front + 0x1c, 0x10), frame);
      // From outside: the title string, the shown-row count, the pad, the panel words, the page stack but the front ramp.
      const ramp = Buffer.from(m.view(front + 0x1c, 0x10));
      load(c.start2);
      ramp.copy(m.view(front + 0x1c, 0x10));
      m.view(V.record, 4).set(bytesAt(c.start, V.record, 4));
      m.view(V.record + 0xc, 4).set(bytesAt(c.start, V.record + 0xc, 4));
      for (const [address, length] of [[V.pad, 0x10], [0x00370130, 0x20], [V.hints, 0x14]]) m.view(address, length).set(bytesAt(c.start, address, length));
      m.view(V.page, 4).set(bytesAt(c.start, V.page, 4));
      // The rows' sub-row counts are func_002086A8's (and a capture may write them): from outside.
      const rows = bytesAt(c.start, rowsAddress, ROWS * ROW);
      for (let k = 0; k < ROWS; k++) m.view(rowsAddress + k * ROW + 8, 4).set(rows.subarray(k * ROW + 8, k * ROW + 12));
    }
    const state = m.view(V.ramp + 12, 4).readInt32LE(0);
    if (c.fill) load(c.fill);
    const io = {
      poll: () => {
        if (!c.poll) { out.problems.push(`frame ${frame}: the model polls the job, the console does not`); return false; }
        return c.poll.gpr[V0] !== 0;
      },
      subRows: (k) => {
        const rows = bytesAt(c.after, rowsAddress, ROWS * ROW);
        return rows.readInt32LE(k * ROW + 8);
      },
      submit: () => {
        if (!c.submit) { out.problems.push(`frame ${frame}: the model queues the job, the console does not`); return false; }
        return c.submit.gpr[V0] !== 0;
      },
    };
    const frontState = () => m.view(frontAddress() + 0x1c + 12, 4).readInt32LE(0);
    const before = { state, selected: m.view(V.record + 0x10, 4).readInt32LE(0), front: frontState() };
    const did = versionPage(m, io, notes);
    if (c.poll && !did.polled) out.problems.push(`frame ${frame}: the console polls the job, the model does not`);
    if (did.polled && !did.filled) out.held += 1;
    if (did.filled) { out.fills += 1; if (!c.fill) out.problems.push(`frame ${frame}: the model fills the rows, the console does not`); }
    else if (c.fill) out.problems.push(`frame ${frame}: the console fills the rows, the model does not`);
    const after = m.view(V.ramp + 12, 4).readInt32LE(0);
    if (before.state === 2 && after === 3) out.closes += 1;
    if (m.view(V.record + 0x10, 4).readInt32LE(0) !== before.selected) out.moves += 1;
    if (before.front === 0 && frontState() === 1) out.fronts += 1;
    if (after === 1) out.rising += 1; else if (after === 2) out.shown += 1; else if (after === 3) out.falling += 1;

    compareState(c.after, frame, 'after');
    check('after front page', m.view(V.front, 4), bytesAt(c.after, V.front, 4), frame);
    const front = frontAddress();
    check('after front ramp', m.view(front + 0x1c, 0x10), bytesAt(c.after, front + 0x1c, 0x10), frame);
    // The front page's own code (not modelled) writes the panel words before the page runs: they are
    // the page's while the front page is not full, and the hints while the page's alpha leads.
    const frontNow = m.view(front + 0x1c + 12, 4).readInt32LE(0);
    if (frontNow !== 2) check('after panel enable, alpha', Buffer.concat([m.view(0x00370140, 4), m.view(0x0037013c, 4)]), Buffer.concat([bytesAt(c.after, 0x00370140, 4), bytesAt(c.after, 0x0037013c, 4)]), frame);
    if (frontNow === 0 || did.hints) check('after hints, arrows', m.view(V.hints, 0x14), bytesAt(c.after, V.hints, 0x14), frame);

    // The main menu's input: the gate's pieces from the console, the page's from the model.
    check('menu record count, selected, first shown, ramp', Buffer.concat([m.view(V.record + 8, 4), m.view(V.record + 0x10, 0x18)]), Buffer.concat([bytesAt(c.menu, V.record + 8, 4), bytesAt(c.menu, V.record + 0x10, 0x18)]), frame);
    for (const [address, length] of [[V.menu, 0x28], [V.configRamp, 0x10], [V.dialogRamp, 0x10], [V.firstRunRamp, 0x10], [V.scene, 0xc], [V.pad, 0x10]]) m.view(address, length).set(bytesAt(c.menu, address, length));
    m.view(V.page, 4).set(bytesAt(c.menu, V.page, 4));
    const asked = triangle(m, io);
    if (asked) out.opens += 1;
    if (c.submit && !asked) out.problems.push(`frame ${frame}: the console queues the job, the model does not`);
    // The next frame's module_clock_229828 ticks the front page before the page runs again.
    if (n + 1 < calls.length) frontTick(m, notes);
    for (const note of notes) out.notes.add(note);
  }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('verify_version.mjs')) {
  if (BUILD !== 'hdd') { console.log('verdict: PARTIAL the Version page is modelled for HDD OSD 1.10U only (CLOCK_BUILD=hdd)'); process.exit(0); }
  const r = verify(process.argv[2]);
  console.log(`build: ${BUILD_NAME}   frames ${r.frames}; opens ${r.opens}, frames held for the job ${r.held}, fills ${r.fills}, closes ${r.closes}, row moves ${r.moves}, front pages pushed ${r.fronts}, memory writes applied ${r.writes}`);
  console.log(`  frames ending rising ${r.rising}, shown ${r.shown}, falling ${r.falling}`);
  console.log(`  comparisons ${r.equal} of ${r.compared} equal`);
  for (const note of r.notes) console.log(`  note: ${note}`);
  for (const t of r.problems.slice(0, 16)) console.log(`  ! ${t}`);
  const ok = r.problems.length === 0 && r.compared > 0 && r.equal === r.compared && r.opens > 0;
  console.log(`verdict: ${ok ? `FOUND ${r.frames} frames of the Version page, ${r.compared} comparisons equal` : 'PARTIAL see the lines marked !'}`);
}
