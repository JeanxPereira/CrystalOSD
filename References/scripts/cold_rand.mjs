// Every call of rand and srand of HDD OSD 1.10U (0x0029C6E8, 0x0029C6D8) from power-on to the clock thread's
// init (module_clock_init_resources 0x00225DB0), with the caller, the generator state before the call and the
// frame; then twenty frames more, which cover the seven orb draws of func_0022EF40.
//
//   node with_emulator.mjs node cold_rand.mjs --name <capture> [--args "SkipSearchLater BootOpening"] [--state <p2s>]
//
// The log is <captures>/<name>.rand.json. The state is the word at *(_impure_ptr_0 0x00347384) + 0x58.
import path from 'node:path';
import { openSession, breakAt, runTo, registers, hex, save } from './cold_session.mjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => { const at = argv.indexOf(`--${name}`); return at >= 0 ? argv[at + 1] : fallback; };
const CAPTURES = process.env.CRYSTALOSD_CAPTURES ?? 'D:/CodingProjects/Watson/Runtime/captures';
const name = option('name');
if (!name) throw new Error('--name is required');
const RAND = 0x29C6E8, SRAND = 0x29C6D8, INIT = 0x225DB0, AFTER = Number(option('after', 20));

const session = await openSession({ args: option('args'), state: option('state') });
const log = { capture: name, args: option('args', ''), state: option('state', null), calls: [], initFrame: null, initState: null };
const stateWord = async () => session.word((await session.word(0x347384)) + 0x58);
const caller = async (d) => (await registers(d, false)).gpr;
try {
  log.startState = await stateWord();
  await breakAt(session, RAND, async (s, status) => {
    const gpr = await caller(s.d);
    log.calls.push({ kind: 'rand', ra: hex(Number(gpr.ra.low & 0xFFFFFFFFn)), state: await stateWord(), frame: status.frame });
  });
  await breakAt(session, SRAND, async (s, status) => {
    const gpr = await caller(s.d);
    log.calls.push({ kind: 'srand', ra: hex(Number(gpr.ra.low & 0xFFFFFFFFn)), arg: Number(gpr.a0.low & 0xFFFFFFFFn), state: await stateWord(), frame: status.frame });
  });
  await breakAt(session, INIT, async (s, status) => {
    log.initFrame = status.frame;
    log.initState = await stateWord();
    log.initCalls = log.calls.length;
    session.stopAt = status.frame + AFTER;
  });
  const hardStop = Number(option('limit', 3000));
  await session.d.resume();
  for (let spin = 0; ; spin++) {
    const status = await session.d.getStatus();
    if (status.paused) {
      const handler = session.breakpoints.get(parseInt(status.pc, 16) >>> 0);
      if (handler) await handler(session, status);
      await session.d.resume();
      continue;
    }
    if ((session.stopAt && status.frame >= session.stopAt) || status.frame >= hardStop) { await session.d.pause(); break; }
    await new Promise((r) => setTimeout(r, 2));
  }
  log.endFrame = await session.frame();
  log.endState = await stateWord();
  const orb = await session.bytes(0x405210, 0x1C);
  log.orbRandom = Array.from({ length: 7 }, (_, i) => orb.readInt32LE(i * 4));
  save(path.join(CAPTURES, `${name}.rand.json`), log);
  console.log(`${name}: ${log.calls.length} calls, init at frame ${log.initFrame}, state at init ${log.initState === null ? 'none' : hex(log.initState)}, start state ${hex(log.startState)}, end frame ${log.endFrame}`);
} finally {
  await session.close();
}
