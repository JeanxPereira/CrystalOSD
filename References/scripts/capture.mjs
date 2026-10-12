// One capture for several verifiers, from launch to kill, in one emulator session.
//
//   node capture.mjs --verifiers verify_frame.mjs,verify_orbs.mjs --state clock --frames 30 --name hddosd-110U-x
//       [--build hdd|rom] [--video pal] [--mode exact|trace|fast] [--navigate fast] [--hold up,cross]
//       [--presses '[["cross",6,60]]']
//       [--pad '[{"frame":0,"press":["cross"],"frames":6}]'] [--writes '[{"frame":30,"address":"0x1F000C","hex":"74000000"}]']
//       [--writes @file.json]   the writes read from a file
//       [--gs-after 0x3a9800:0x8000]   after the capture, write that part of GS memory to <name>.gsmem
//       [--args "SkipSearchLater BootOpening"] [--bios <file>] [--elf <file>] [--state-file <p2s>]
//
// --mode exact (the default): watson_frame_capture under the interpreters: probes and packets with
//   the interpreters' arithmetic, without packet origins (their stack walk is most of a traced
//   frame's cost). --mode trace: watson_gif_trace, with origins. --mode fast: watson_frame_capture
//   under the recompilers, at full speed, but its float results differ in the last bits: not for
//   bit-for-bit checks. --navigate fast: launch and press under the recompilers, then switch to
//   the interpreters for the capture.
// The verifiers' PROBES are taken with CLOCK_BUILD / CLOCK_VIDEO set as given and merged; probes
// at the same address with other ranges are all kept, and each verifier reads only its own
// (References/lib/trace.mjs readTraceFor). A PROBES entry may carry fromFrame / untilFrame: it
// then records only in capture frames [fromFrame, untilFrame).
// --pad and --writes are applied by the emulator at the start of a capture frame, on the CPU
// thread, before the EE runs it; frame 0 is the first frame the dump holds. Each is recorded in
// the trace ("pad" and "write" records). A write lands only after the program's code is loaded:
// a code patch written before that is overwritten. Run it through with_emulator.mjs.
import { Client } from 'file:///D:/CodingProjects/Watson/Server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from 'file:///D:/CodingProjects/Watson/Server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const option = (name, fallback) => { const at = argv.indexOf(`--${name}`); return at >= 0 ? argv[at + 1] : fallback; };
const build = option('build', 'hdd');
const video = option('video');
process.env.CLOCK_BUILD = build;
if (video) process.env.CLOCK_VIDEO = video;
const { mergeProbes } = await import('../lib/trace.mjs');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = process.env.WATSON_SERVER ?? 'D:/CodingProjects/Watson/Server/dist/index.js';
const CAPTURES = process.env.CRYSTALOSD_CAPTURES ?? 'D:/CodingProjects/Watson/Runtime/captures';
const mode = option('mode', 'exact');
const navigateFast = option('navigate') === 'fast' && mode !== 'fast';
const name = option('name');
if (!name) throw new Error('--name is required');

const lists = [];
for (const verifier of (option('verifiers', '') || '').split(',').filter(Boolean)) {
  lists.push((await import(`file:///${(path.isAbsolute(verifier) ? verifier : path.join(HERE, verifier)).replace(/\\/g, '/')}`)).PROBES ?? []);
}
const probes = mergeProbes(...lists);

const launch = { interpreter: mode !== 'fast' && !navigateFast };
const state = option('state'), stateFile = option('state-file');
if (option('bios') || option('elf') || stateFile) {
  if (option('bios')) launch.bios = option('bios');
  if (option('elf')) launch.elf = option('elf');
  if (stateFile) launch.state = stateFile;
} else {
  launch.build = build === 'hdd' ? 'hddosd-1.10U-host' : 'rom-0230A';
  if (state) launch.state = state;
}
if (option('args')) launch.args = option('args');

const client = new Client({ name: 'capture', version: '0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER, '--config', (process.env.WATSON_CONFIG ?? fileURLToPath(new URL('../../watson.json', import.meta.url)))], env: { ...process.env } }));
const call = async (tool, args = {}) => {
  const result = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 7200000 });
  const text = result.content.map((c) => c.text).join('\n');
  if (result.isError) throw new Error(`${tool}: ${text.slice(0, 400)}`);
  return text;
};
let launched = false;
let status = 0;
try {
  console.log((await call('watson_launch', launch)).split('\n')[0]);
  launched = true;
  // Under load the first pause after a launch can come back late; it is safe to ask again.
  for (let attempt = 1; ; attempt++) {
    try { await call('watson_pause'); break; } catch (error) { if (attempt === 3) throw error; }
  }
  for (const [buttons, held, wait] of JSON.parse(option('presses', '[]'))) {
    await call('watson_pad', { buttons, frames: held });
    if (wait) await call('watson_frame_advance', { frames: wait });
  }
  if (navigateFast) { await call('watson_set_cpu_mode', { mode: 'interpreter' }); await call('watson_pause'); }
  const hold = option('hold') ? option('hold').split(',') : [];
  const started = Date.now();
  const pad = JSON.parse(option('pad', '[]'));
  const writesArg = option('writes', '[]');
  const writes = JSON.parse(writesArg.startsWith('@') ? fs.readFileSync(writesArg.slice(1), 'utf8') : writesArg);
  const common = { frames: Number(option('frames', 10)), path: `${CAPTURES}/${name}.png`, probes, hold, pad, writes };
  const report = mode === 'trace' ? await call('watson_gif_trace', common)
    : await call('watson_frame_capture', { ...common, cpu: mode === 'fast' ? 'recompiler' : 'interpreter' });
  console.log(report.split('\n').filter((line) => /^(frames|probes|inputs|  frame |verdict|time)/.test(line)).join('\n'));
  console.log(`${probes.length} probes; ${((Date.now() - started) / 1000).toFixed(1)} s`);
  if (option('gs-after')) {
    const [offset, length] = option('gs-after').split(':').map(Number);
    const file = `${CAPTURES}/${name}.gsmem`;
    let last = null;
    for (let attempt = 0; attempt < 9; attempt++) {
      await call('watson_gs_read', { path: file, offset, length });
      const now = fs.readFileSync(file);
      if (last && now.equals(last)) break;
      last = now;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    console.log(`gs memory 0x${offset.toString(16)}+0x${length.toString(16)} -> ${name}.gsmem`);
  }
} catch (error) {
  console.error(error.message);
  status = 1;
} finally {
  // Only an emulator this session launched is killed.
  if (launched) await call('watson_kill').catch(() => undefined);
  await client.close();
}
process.exit(status);
