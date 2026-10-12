import { fileURLToPath } from 'node:url';
// CLOCK_BUILD=hdd|rom [CLOCK_VIDEO=pal] node tcap2.mjs <verifier> <state|boot> <name> <frames> [hold] [presses json] [writes json] [advance] [args]
import { Client } from 'file:///D:/CodingProjects/Watson/Server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from 'file:///D:/CodingProjects/Watson/Server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
const [verifier, state, name, frames, hold = '', presses = '[]', writes = '[]', advance = '0', extraArgs = ''] = process.argv.slice(2);
const { PROBES } = await import(new URL(`./${verifier}`, import.meta.url).href);
const hdd = process.env.CLOCK_BUILD === 'hdd', pal = process.env.CLOCK_VIDEO === 'pal', bios = process.env.CLOCK_BIOS;
const MEGA = 'D:/CodingProjects/CrystalOSD-Data/bios/megadump/';
const STATES = 'D:/CodingProjects/Watson/Runtime/states';
const launch = { interpreter: true };
if (pal || bios) {
  launch.bios = `${MEGA}${bios ?? "ps2-0230e-20080220.bin"}`;
  if (hdd) { launch.elf = 'D:/CodingProjects/CrystalOSD-Data/dumps/hddosd-host/hddosd.elf'; launch.args = `SkipSearchLater${extraArgs ? ' ' + extraArgs : ''}`; }
  if (state !== 'boot') launch.state = state.includes('/') ? state : `${STATES}/${hdd ? 'hddosd-1.10U-host' : 'rom-0230E'}${pal ? '-pal' : ''}-${state}.p2s`;
} else {
  launch.build = hdd ? 'hddosd-1.10U-host' : 'rom-0230A';
  if (hdd) launch.args = `SkipSearchLater${extraArgs ? ' ' + extraArgs : ''}`;
  if (state !== 'boot') launch.state = state;
}
const client = new Client({ name: 'text2', version: '0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ['D:/CodingProjects/Watson/Server/dist/index.js', '--config', (process.env.WATSON_CONFIG ?? fileURLToPath(new URL('../../watson.json', import.meta.url)))] }));
const call = async (tool, args = {}) => { const r = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 5400000 }); const t = r.content.map((c) => c.text).join('\n'); console.log(`--- ${tool}${r.isError ? ' ERROR' : ''}: ${t.split('\n').filter((l) => /verdict|launched|pressed|rror|frame/.test(l)).join(' | ').slice(0, 260)}`); return r.isError; };
let ok = false, launched = false;
for (let attempt = 0; attempt < 60 && !launched; attempt++) { launched = !(await call('watson_launch', launch)); if (!launched) await new Promise((r) => setTimeout(r, 20000)); }
if (launched) {
  ok = true;
  const steps = [['watson_pause', {}]];
  if (Number(advance)) steps.push(['watson_frame_advance', { frames: Number(advance) }]);
  for (const [buttons, held, wait] of JSON.parse(presses)) { steps.push(['watson_pad', { buttons, frames: held }]); if (wait) steps.push(['watson_frame_advance', { frames: wait }]); }
  for (const [address, data] of JSON.parse(writes)) steps.push(['watson_write_memory', { address, data }]);
  steps.push(['watson_gif_trace', { frames: Number(frames), path: `D:/CodingProjects/Watson/Runtime/captures/${name}.png`, probes: PROBES, hold: hold && hold !== '-' ? hold.split(',') : [] }]);
  for (const step of steps) if (await call(...step)) { ok = false; break; }
  await call('watson_kill');
}
await client.close();
process.exit(ok ? 0 : 1);
