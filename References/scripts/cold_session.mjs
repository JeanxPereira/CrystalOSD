// One emulator session driven through Watson's DebugServer directly, for the cold-start measurements:
// write watchpoints that name the store that wrote, scripted pad and frame stepping.
// Run it under with_emulator.mjs (one launch-to-kill session per command).
import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = 'D:/CodingProjects/Watson';
const CONFIG = (process.env.WATSON_CONFIG ?? fileURLToPath(new URL('../../watson.json', import.meta.url)));
const load = (file) => import(pathToFileURL(`${ROOT}/Server/dist/${file}`).href);
const { DebugServerClient } = await load('debug-server-client.js');
const { claimInstance, launchAndWait, reusingProbe, kill, systemHost, debugPort, releaseClaim } = await load('lifecycle.js');
const { loadCatalog, resolveLaunch } = await load('catalog.js');

export const hex = (value, width = 8) => `0x${(value >>> 0).toString(16).padStart(width, '0')}`;

/** Launch a build and connect. options: build, state, args, interpreter, bios, elf. */
export async function openSession(options = {}) {
  const catalog = loadCatalog(CONFIG);
  const files = resolveLaunch(catalog, { build: options.build ?? 'hddosd-1.10U-host', state: options.state, bios: options.bios, elf: options.elf });
  const instance = await claimInstance(systemHost, ROOT, catalog.instances);
  const { probe, current } = reusingProbe(async () => {
    const client = new DebugServerClient('127.0.0.1', debugPort(instance));
    try { await client.connect(); return client; } catch (error) { client.disconnect(); throw error; }
  });
  try {
    await launchAndWait(systemHost, ROOT, { ...files, interpreter: Boolean(options.interpreter), gameArgs: options.args, instance }, probe, { timeoutMs: 60000, intervalMs: 500, logTail: () => '' });
  } catch (error) {
    current()?.disconnect();
    releaseClaim(ROOT, instance);
    throw error;
  }
  const d = current();
  const session = {
    d,
    hits: [],
    async close() { d.disconnect(); await kill(systemHost, ROOT, instance).catch(() => undefined); },
    async status() { return d.getStatus(); },
    async frame() { return (await d.getStatus()).frame; },
    async word(address) { return (await d.readMemoryBuffer(hex(address), 4)).readUInt32LE(0); },
    async bytes(address, length) { return d.readMemoryBuffer(hex(address), length); },
  };
  await d.pause();
  active = session;
  return session;
}

const STORE = /^(sb|sh|sw|sd|sq|swc1|sdc1|swl|swr|sdl|sdr|swc2|sqc2|sc|scd)\s+(\w+),\s*(?:(-?)0x\s*([0-9a-fA-F]+))?\((\w+)\)/;
const STORE_LIKE = /^s(b|h|w|d|q|c|dc1|wc1|wc2|qc2|wl|wr|dl|dr|cd)\s/;
const WIDTH = { sb: 1, sh: 2, sw: 4, swc1: 4, sd: 8, sdc1: 8, sq: 16, sqc2: 16, swc2: 4, sc: 4, scd: 8, swl: 4, swr: 4, sdl: 8, sdr: 8 };
const NAMES = ['zero', 'at', 'v0', 'v1', 'a0', 'a1', 'a2', 'a3', 't0', 't1', 't2', 't3', 't4', 't5', 't6', 't7', 's0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 't8', 't9', 'k0', 'k1', 'gp', 'sp', 'fp', 'ra'];

/** The registers as { name: BigInt (low 64 bits) } and the float registers as 32-bit words. */
export async function registers(d, wantFpr) {
  const all = await d.readRegisters('ee', 0);
  const gpr = {};
  for (const reg of all.GPR.regs) {
    const parts = String(reg.display).replace(/^0x/, '').split('.');
    gpr[reg.name] = { low: BigInt(`0x${parts[1]}${parts[0]}`), words: parts.map((p) => parseInt(p, 16) >>> 0) };
  }
  let fpr = null;
  if (wantFpr) {
    const f = await d.readRegisters('ee', 2);
    fpr = {};
    for (const reg of f.FPR.regs) fpr[reg.name] = parseInt(String(reg.display).replace(/^0x/, '').split('.').pop(), 16) >>> 0;
  }
  return { gpr, fpr };
}

/** Name the store a watchpoint stopped before: the instruction at pc, or in its delay slot. */
export async function describeHit(d) {
  const status = await d.getStatus();
  const pc = parseInt(status.pc, 16) >>> 0;
  const code = await d.disassemble(hex(pc), 3);
  const text = code.map((i) => `${i.address.toString().toLowerCase()} ${i.disasm.replace(/\s+/g, ' ')}`);
  let at = -1;
  let match = null;
  const BRANCH = /^(j|b)(?!reak)\w*\s/;
  for (let i = 0; i < 2; i++) {
    if (i === 1 && !BRANCH.test(`${code[0].disasm.replace(/\s+/g, ' ')} `)) break;
    const m = STORE.exec(code[i].disasm.replace(/\t/g, ' ').replace(/\s+/g, ' ').replace('0x ', '0x'));
    if (m) { at = i; match = m; break; }
    if (STORE_LIKE.test(code[i].disasm.replace(/\s+/g, ' '))) throw new Error(`unparsed store: ${code[i].disasm}`);
  }
  const out = { frame: status.frame, cycles: status.cycles, pc: hex(pc), code: text.slice(0, 2) };
  if (!match) return { ...out, store: null };
  const [, op, rt, sign, offText, base] = match;
  const off = offText ?? '0';
  const { gpr, fpr } = await registers(d, op === 'swc1' || op === 'sdc1');
  const baseValue = Number(gpr[base].low & 0xFFFFFFFFn) >>> 0;
  const addr = (baseValue + (sign ? -1 : 1) * parseInt(off, 16)) >>> 0;
  let value;
  const width = WIDTH[op];
  if (op === 'swc1') value = BigInt(fpr[rt] >>> 0);
  else if (op === 'sq') value = gpr[rt].words.reduceRight((acc, w) => (acc << 32n) | BigInt(w), 0n);
  else value = gpr[rt].low & ((1n << BigInt(width * 8)) - 1n);
  return { ...out, store: { pc: hex(pc + at * 4), op, addr: hex(addr), width, value: `0x${value.toString(16)}`, ra: hex(Number(gpr.ra.low & 0xFFFFFFFFn)) } };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run until the frame counter reaches `target`, recording every write the watchpoints catch.
 * A stop is described (the store that is about to run) and recorded in session.hits; the resume lets that store run.
 * `actions` = [{ frame, run }]: each runs once, in order, when the counter first reaches its frame.
 */
export async function runTo(session, target, label = '', actions = []) {
  const { d } = session;
  const due = [...actions].sort((a, b) => a.frame - b.frame);
  const deadline = Date.now() + (session.timeoutMs ?? 1800000);
  await d.resume();
  for (;;) {
    if (Date.now() > deadline) throw new Error(`runTo ${target}: timeout`);
    const status = await d.getStatus();
    if (status.paused) {
      const handler = session.breakpoints?.get(parseInt(status.pc, 16) >>> 0);
      if (handler) {
        await handler(session, status);
        if (session.stop) { await d.pause(); return; }
        await d.resume();
        continue;
      }
      const hit = await describeHit(d);
      hit.label = label;
      if (process.env.COLD_VERBOSE) console.error('hit', JSON.stringify(hit));
      if (hit.store) session.hits.push(hit);
      else { session.spurious = (session.spurious ?? 0) + 1; (session.spuriousSamples ??= []).length < 20 && session.spuriousSamples.push({ frame: hit.frame, pc: hit.pc, code: hit.code }); }
      await d.resume();
      continue;
    }
    while (due.length && status.frame >= due[0].frame) {
      const action = due.shift();
      await action.run();
    }
    for (const action of (session.pending ?? []).filter((a) => status.frame >= a.frame)) {
      session.pending.splice(session.pending.indexOf(action), 1);
      await action.run();
    }
    if (status.frame >= target) {
      await d.pause();
      return;
    }
    await sleep(2);
  }
}

/** Call `handler(session, status)` each time the CPU reaches `pc`; the run goes on afterwards (session.stop ends it). */
export async function breakAt(session, pc, handler) {
  session.breakpoints ??= new Map();
  session.breakpoints.set(pc, handler);
  await session.d.setBreakpoint(hex(pc));
}

/** Watch the ranges only between two frames of the run: [{ from, to }] schedules for every later runTo. */
export function watchWindows(session, ranges, windows) {
  session.pending ??= [];
  for (const { from, to } of windows) {
    session.pending.push({ frame: from, run: async () => { await watch(session, ranges); session.windowOpened = (session.windowOpened ?? []).concat({ from, at: await session.frame() }); } });
    session.pending.push({ frame: to, run: async () => {
      for (const { start, end } of ranges) await session.d.removeMemcheck(hex(start), hex(end));
      session.ranges = (session.ranges ?? []).filter((r) => !ranges.includes(r));
      session.windowClosed = (session.windowClosed ?? []).concat({ to, at: await session.frame() });
    } });
  }
}

export async function watch(session, ranges, action = 'break') {
  session.ranges = (session.ranges ?? []).concat(ranges);
  for (const { start, end } of ranges) await session.d.setMemcheck(hex(start), hex(end), { type: 'write', action });
}

/** Hold buttons from frame `from` for `frames` frames: two actions for runTo. */
export const pressActions = (buttons, from, frames) => [
  { frame: from, run: () => session_d().padSet(buttons, 1) },
  { frame: from + frames, run: () => session_d().padSet(buttons, 0) },
];
let active = null;
const session_d = () => active.d;

export const save = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 1)}\n`);

/** A PNG of the frame on screen (advances two frames; the VM is left paused). */
export async function shot(session, file) {
  fs.rmSync(file, { force: true });
  await session.d.queueSnapshot(file, 0);
  await session.d.frameAdvance(2);
  for (let i = 0; i < 50 && !fs.existsSync(file); i++) await sleep(100);
  await sleep(300);
}
