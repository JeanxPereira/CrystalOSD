import { fileURLToPath } from 'node:url';
// node with_emulator.mjs node text_jprobe.mjs <bios file> <frames...>: boot HDD OSD, stop at each frame count, report where the EE is.
import { Client } from 'file:///D:/CodingProjects/Watson/Server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from 'file:///D:/CodingProjects/Watson/Server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
const [bios, ...stops] = process.argv.slice(2);
const launch = { interpreter: true, bios: `D:/CodingProjects/CrystalOSD-Data/bios/megadump/${bios}`, elf: 'D:/CodingProjects/CrystalOSD-Data/dumps/hddosd-host/hddosd.elf', args: 'SkipSearchLater' };
const client = new Client({ name: 'textj', version: '0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ['D:/CodingProjects/Watson/Server/dist/index.js', '--config', (process.env.WATSON_CONFIG ?? fileURLToPath(new URL('../../watson.json', import.meta.url)))] }));
const call = async (tool, args = {}) => { const r = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 1800000 }); const t = r.content.map((c) => c.text).join('\n'); console.log(`--- ${tool}${r.isError ? ' ERROR' : ''}\n${t.slice(0, 1800)}`); return r.isError; };
let launched = false;
for (let a = 0; a < 30 && !launched; a++) { launched = !(await call('watson_launch', launch)); if (!launched) await new Promise((r) => setTimeout(r, 20000)); }
if (launched) {
  await call('watson_pause');
  if (process.env.ADV) await call('watson_frame_advance', { frames: Number(process.env.ADV) });
  for (const [address, data] of JSON.parse(process.env.WRITES ?? '[]')) await call('watson_write_memory', { address, data });
  await call('watson_read_memory', { address: '0xBA000006', length: 2 });
  let at = Number(process.env.ADV ?? 0);
  for (const s of stops) {
    await call('watson_frame_advance', { frames: Number(s) - at }); at = Number(s);
    await call('watson_read_registers', {});
    await call('watson_disassemble', { address: process.env.DIS ?? '0x8000e130', count: 24 }); await call('watson_get_backtrace', {}); await call('watson_get_threads', {});
    await call('watson_get_modules', {});
  }
  await call('watson_kill');
}
await client.close();
