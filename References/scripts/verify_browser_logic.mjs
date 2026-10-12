// The Browser shell's logic, pass by pass from the words the code reads and the pad edge:
// the HDD error dialog (counter D_003708F0, direction D_00370BE4, closed by Circle only when fully faded in),
// the leave request by Circle at the root page (0x254840 -> 0x24EBF0), the leave counter D_003706A8 and the
// thread's exit condition (0x24F0A0..0x24F0E0), the exit stores of browser_exit_previous_module (0x24ED20).
// Words and addresses: verify_browser_enter.mjs (A), References/readings/browser-shell-scout.md.
// node verify_browser_logic.mjs <trace.jsonl>
import { BUILD, BUILD_NAME } from '../lib/index.mjs';
import { stepShell, DIALOG_LENGTH, LEAVE_LIMIT, CIRCLE, SHELL_PROBES, A, walk } from '../model/browser_shell.mjs';

export const PROBES = SHELL_PROBES;
const PAL = process.env.CLOCK_VIDEO === 'pal';
const IO = BUILD === 'hdd' ? 0x003705fc : 0x002c8b34;
const LEAVE = BUILD === 'hdd' ? 0x003706a8 : 0x002c8c00;
const DIALOG_WORD = { f0: 0x003708f0, be4: 0x00370be4, be8: 0x00370be8, e8: 0x003708e8, ec: 0x003708ec };
const first = (list, kind) => list.find((e) => e.kind === kind);

if (process.argv[1] && process.argv[1].endsWith('verify_browser_logic.mjs')) {
  const { masters } = walk(process.argv[2]);
  console.log(`build: ${BUILD_NAME}${PAL ? ' (PAL)' : ''}; ${masters.length} passes`);
  const problems = [];
  let compared = 0;
  const tally = (what, want, got) => { compared++; if (want !== got) problems.push(`${what}: model ${want}, console ${got}`); };
  const cover = { killed: 0, ignored: 0, closed: 0, opened: 0, requests: 0, edgesBlocked: 0, exits: 0, counted: 0, atRoot: 0 };
  const length = PAL ? DIALOG_LENGTH.pal : DIALOG_LENGTH.ntsc;
  let requestFrame = null, edgeFrame = null, exitFrame = null, clockFrame = null;

  const stepOf = (m, override = {}) => {
    const w = m.words;
    const check = first(m.events, 'check');
    const discState = { dvdError: w.dvdError, discError: w.discError, io: check ? check.img.s32(IO) : w.io };
    return stepShell(w, { padEdge: w.edge, discState, pal: !!w.pal, request: BUILD === 'hdd' ? undefined : first(m.events, 'request') !== undefined, ...override });
  };

  masters.forEach((m) => {
    const w = m.words;
    const step = stepOf(m);
    const req = first(m.events, 'request');
    const check = first(m.events, 'check');
    const exitIn = first(m.events, 'exitIn');
    const exitOut = first(m.events, 'exitOut');
    const circle = (w.edge & CIRCLE) !== 0;

    // The leave request
    tally(`frame ${m.e.frame}: leave requested`, step.trail.requested ? 'yes' : 'no', req ? 'yes' : 'no');
    if (req) {
      tally(`frame ${m.e.frame}: destination argument`, 2, req.gpr[4]);
      cover.requests++;
      requestFrame = m.e.frame;
      edgeFrame = m.e.frame;
      if (w.gate.kind === 0) cover.atRoot++;
    } else if (circle) cover.edgesBlocked++;
    if (BUILD === 'rom') {
      // ROM 2.30: the Circle predicate (0x24E440..0x24E5F0) is only partly read; every request must have met the conditions that are
      const g = w.gate;
      const met = circle && w.leave === 0 && w.dvdError === 0 && w.discError === 0 && g.extra === 0 && g.view === 1 && g.fadeIn === 0x1a && g.b678 !== 1 && g.b771 !== 0 && g.kind === 0;
      if (req) tally(`frame ${m.e.frame}: request met the read conditions`, 'yes', met ? 'yes' : 'no');
      else if (met) cover.unasked = (cover.unasked ?? 0) + 1;
    }

    // The dialog
    if (A.open) {
      if (w.f0 > 0 && w.f0 < length && w.be4 === 1 && circle && step.state.leave === w.leave) {
        cover.ignored++;
        if (m.next) tally(`frame ${m.e.frame}: Circle while fading in leaves the direction`, 1, m.next.words.be4);
      }
      if (w.f0 === length && w.be4 === 1 && circle) cover.closed++;
      if (w.f0 > 0 && (w.leave !== 0 || w.dvdError !== 0 || w.discError !== 0)) cover.killed++;
      if (w.f0 === 1 && w.be4 === 1) cover.opened++;
    }

    // The leave counter and the thread's check
    if (check) {
      tally(`frame ${m.e.frame}: counter at the check`, step.trail.checked, check.img.s32(LEAVE));
      if (step.trail.checked !== 0) cover.counted++;
    }
    tally(`frame ${m.e.frame}: exit`, step.trail.exited ? 'yes' : 'no', exitIn ? 'yes' : 'no');
    if (exitIn) {
      cover.exits++;
      exitFrame = exitIn.frame;
      tally(`frame ${m.e.frame}: exit leaves`, 1, exitOut ? 1 : 0);
      const e = step.state.exit;
      const now = exitOut.img;
      const got = BUILD === 'hdd'
        ? { w648: now.s32(0x001f0648), w64C: now.s32(0x001f064c), w010: now.s32(0x001f0010), w644: now.s32(0x001f0644), w014: now.s32(0x001f0014) }
        : { w648: now.s32(0x001f05e8), w64C: now.s32(0x001f05ec), w010: now.s32(0x001f0014), w644: now.s32(0x001f05e4), w014: now.s32(0x001f0018) };
      for (const key of Object.keys(e)) tally(`frame ${m.e.frame}: exit store ${key}`, e[key], got[key]);
    }

    // The next pass starts with the words this one left
    if (m.next) {
      const x = m.next.words;
      const s = step.state;
      tally(`frame ${m.e.frame}: next leave counter`, s.leave, x.leave);
      tally(`frame ${m.e.frame}: next destination`, s.dest, x.dest);
      tally(`frame ${m.e.frame}: next execute type`, s.exec, x.exec);
      for (const key of Object.keys(s.exit)) tally(`frame ${m.e.frame}: next exit word ${key}`, s.exit[key], x.exit[key]);
      if (A.open) for (const key of ['f0', 'be4', 'be8', 'e8', 'ec']) if (!m.next.written.has(DIALOG_WORD[key])) tally(`frame ${m.e.frame}: next ${key}`, s[key], x[key]);
      if (s.misc) for (const key of Object.keys(s.misc)) tally(`frame ${m.e.frame}: next ${key}`, s.misc[key], x.misc[key]);
    }
  });

  // The first clock frame after the exit
  const clocks = masters.flatMap((m) => m.events).filter((e) => e.kind === 'clock' && exitFrame !== null && e.frame > exitFrame);
  if (clocks.length) clockFrame = clocks[0].frame;

  // Positive control: the other video mode's limits must disagree with the console
  let control = 0;
  for (const m of masters) {
    const w = m.words;
    const check = first(m.events, 'check');
    const bad = stepShell(w, { padEdge: w.edge, discState: { dvdError: w.dvdError, discError: w.discError, io: check ? check.img.s32(IO) : w.io }, pal: !w.pal, request: BUILD === 'hdd' ? undefined : first(m.events, 'request') !== undefined });
    const exited = first(m.events, 'exitIn') !== undefined;
    if (bad.trail.exited !== exited || (m.next && (bad.state.f0 !== m.next.words.f0 || bad.state.be4 !== m.next.words.be4))) control++;
  }

  for (const line of problems.slice(0, 12)) console.log(`  ${line}`);
  const limit = PAL ? LEAVE_LIMIT.pal : LEAVE_LIMIT.ntsc;
  console.log(`items ${compared - problems.length} of ${compared} equal`);
  console.log(`covered: dialog opened ${cover.opened}, Circle ignored while fading in ${cover.ignored}, Circle closing the dialog ${cover.closed}, dialog cut by an error or a leave ${cover.killed}, Circle edges that asked nothing ${cover.edgesBlocked}, `
    + `leave requests ${cover.requests} (at the root ${cover.atRoot}; ROM: root Circles that met the read conditions and asked nothing ${cover.unasked ?? 0}), thread checks ${cover.counted}, exits ${cover.exits}; control: ${control} passes the other mode's limits miss`);
  if (requestFrame !== null && exitFrame !== null) {
    console.log(`request in the pass of frame ${requestFrame}; the thread's last pass is frame ${exitFrame - 1} = request + ${exitFrame - 1 - requestFrame} (${exitFrame - requestFrame} passes; the check passes when the counter reads ${limit}); first clock frame ${clockFrame === null ? 'not in the capture' : `${clockFrame} = request + ${clockFrame - requestFrame} (${clockFrame - exitFrame} frames between the last Browser pass and it)`}`);
  }
  const need = [];
  if (!cover.requests) need.push('no leave request');
  if (!cover.exits) need.push('no exit');
  if (A.open && !cover.ignored) need.push('no Circle during the dialog fade-in');
  if (A.open && !cover.closed && !cover.killed) need.push('the dialog is neither closed by Circle nor cut by a leave or an error');
  if (!cover.counted) need.push('no thread check with a leave in progress');
  if (clockFrame === null) need.push('no clock frame after the exit');
  const gaps = masters.length - 1 - masters.filter((m) => m.next).length;
  if (gaps) need.push(`${gaps} passes have no consecutive next pass`);
  if (!control) need.push('the control found nothing');
  const ok = compared > 0 && problems.length === 0 && need.length === 0;
  console.log(`verdict: ${ok ? 'FOUND every compared item equal' : `PARTIAL ${problems.length ? `${problems.length} items differ` : need.join(', ') || 'nothing compared'}`}`);
  process.exit(ok ? 0 : 3);
}
