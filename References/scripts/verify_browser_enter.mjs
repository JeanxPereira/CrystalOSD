// The Browser module's entry and its fade overlay, recomputed pass by pass from the words the code reads.
//
// First pass: the thread's init (leave counter 0, PAL flag), the fade-in start (module_browser_24CE60 with 0x5A NTSC /
// 0x4B PAL), the entry scan's dialog request. Every pass: the fade overlay func_0024CEB0 (state, counter, length, the
// alpha it draws with) from the words at its entry. Shared reading of the capture (walk) is used by verify_browser_logic.mjs.
// Addresses: HDD OSD 1.10U first, ROM 2.30 in References/readings/browser-shell-scout.md.
// node verify_browser_enter.mjs <trace.jsonl>
import { BUILD, BUILD_NAME } from '../lib/index.mjs';
import { startShell, stepShell, scanKind, FADE_LENGTH, SHELL_PROBES, A, walk, fadeOf } from '../model/browser_shell.mjs';

const PAL = process.env.CLOCK_VIDEO === 'pal';

export const PROBES = SHELL_PROBES;

const first = (list, kind) => list.find((e) => e.kind === kind);

if (process.argv[1] && process.argv[1].endsWith('verify_browser_enter.mjs')) {
  const { masters, before } = walk(process.argv[2]);
  console.log(`build: ${BUILD_NAME}${PAL ? ' (PAL)' : ''}; ${masters.length} passes`);
  const problems = [];
  let compared = 0;
  const tally = (what, want, got) => { compared++; if (want !== got) problems.push(`${what}: model ${want}, console ${got}`); };

  // First pass: the thread start
  const startEvent = first(before, 'start');
  let startedAt = null;
  if (startEvent && masters.length) {
    const w = masters[0].words;
    const pre = fadeOf(startEvent.img);
    const length = PAL ? FADE_LENGTH.pal : FADE_LENGTH.ntsc;
    tally('24CE60 argument', length, startEvent.gpr[4]);
    const openEvent = first(before, 'open');
    const e8 = openEvent ? openEvent.img.s32(0x003708e8) : w.e8;
    const ec = openEvent ? openEvent.img.s32(0x003708ec) : w.ec;
    if (A.open) {
      const want = scanKind(e8, ec);
      tally('scan asks for a dialog', want === null ? 'no' : `kind ${want}`, openEvent ? `kind ${openEvent.gpr[4]}` : 'no');
    }
    const model = startShell({ pal: PAL, e8, ec, fadeBefore: pre, stale: { dest: w.dest, exec: w.exec, be8: w.be8, colour: w.fade.colour, exit: w.exit, gate: w.gate, misc: w.misc } });
    tally('first pass: leave counter', model.leave, w.leave);
    tally('first pass: PAL flag', model.pal, w.pal);
    tally('first pass: fade state', model.fade.state, w.fade.state);
    tally('first pass: fade counter', model.fade.count, w.fade.count);
    tally('first pass: fade length', model.fade.length, w.fade.length);
    if (A.open) {
      tally('first pass: dialog fade counter', model.f0, w.f0);
      tally('first pass: dialog direction', model.be4, w.be4);
      if (model.kind !== null) tally('first pass: dialog kind', model.be8, w.be8);
      tally('first pass: HDD status 1', model.e8, w.e8);
      tally('first pass: HDD status 2', model.ec, w.ec);
    }
    startedAt = masters[0].e.frame;
  }

  // Every pass: the fade overlay
  let drawn = 0, ended = 0, held = 0, fadeOut = 0, fadeIn = 0;
  for (const m of masters) {
    const w = m.words;
    const io = first(m.events, 'check');
    const step = stepShell(w, { padEdge: w.edge, discState: { dvdError: w.dvdError, discError: w.discError, io: io ? io.img.s32(BUILD === 'hdd' ? 0x003705fc : 0x002c8b34) : w.io }, pal: !!w.pal, request: first(m.events, 'request') !== undefined ? true : false });
    const fi = first(m.events, 'fadeIn');
    tally(`frame ${m.e.frame}: fade runs`, step.trail.fadeIn.state !== 0 ? 'yes' : 'no', fi ? 'yes' : 'no');
    if (!fi) continue;
    const got = fadeOf(fi.img);
    const pre = step.trail.fadeIn;
    for (const key of ['state', 'count', 'colour', 'length']) tally(`frame ${m.e.frame}: fade ${key} at its entry`, pre[key], got[key]);
    const al = first(m.events, 'alpha');
    const fe = first(m.events, 'fadeEnd');
    tally(`frame ${m.e.frame}: draws`, step.trail.alpha !== null ? 'yes' : 'no', al ? 'yes' : 'no');
    tally(`frame ${m.e.frame}: ends`, step.trail.alpha === null ? 'yes' : 'no', fe ? 'yes' : 'no');
    const post = step.trail.fadeOut;
    if (al) {
      const seen = fadeOf(al.img);
      tally(`frame ${m.e.frame}: alpha`, step.trail.alpha, al.gpr[19] | 0);
      tally(`frame ${m.e.frame}: fade state after`, post.state, seen.state);
      tally(`frame ${m.e.frame}: fade counter after`, post.count, seen.count);
      drawn++;
      if (pre.state === 1) held++;
      if (pre.state === 3) fadeOut++;
      if (pre.state === 2) fadeIn++;
    }
    if (fe) { tally(`frame ${m.e.frame}: fade state after the end`, post.state, fadeOf(fe.img).state); ended++; }
    // the next pass starts with what the pass left
    if (m.next) {
      tally(`frame ${m.e.frame}: next pass fade state`, post.state, m.next.words.fade.state);
      tally(`frame ${m.e.frame}: next pass fade counter`, post.count, m.next.words.fade.count);
    }
  }

  // Positive control: a model with the wrong fade length must disagree with the console
  let control = 0;
  for (const m of masters) {
    const w = m.words;
    if (w.fade.state === 0) continue;
    const bad = stepShell({ ...w, fade: { ...w.fade, length: w.fade.length + 1 } }, { padEdge: 0, discState: { dvdError: 0, discError: 0, io: 0 }, pal: !!w.pal, request: false });
    const al = first(m.events, 'alpha');
    if (al && bad.trail.alpha !== (al.gpr[19] | 0)) control++;
  }

  for (const line of problems.slice(0, 12)) console.log(`  ${line}`);
  console.log(`first pass checked: ${startedAt === null ? 'no (the capture does not hold the thread start)' : `frame ${startedAt}`}`);
  console.log(`items ${compared - problems.length} of ${compared} equal; fade draws: ${drawn} (fade-in ${fadeIn}, black hold ${held}, fade-out ${fadeOut}); fade-in ended ${ended}; control: ${control} alphas the wrong length misses`);
  const ok = compared > 0 && problems.length === 0 && drawn > 0 && control > 0;
  const gaps = masters.length - 1 - masters.filter((m) => m.next).length;
  const hole = startedAt === null ? 'the capture does not hold the thread start' : gaps ? `${gaps} passes have no consecutive next pass` : '';
  console.log(`verdict: ${ok && !hole ? 'FOUND every compared item equal' : `PARTIAL ${problems.length ? `${problems.length} items differ` : hole || 'nothing compared'}`}`);
  process.exit(ok && !hole ? 0 : 3);
}
