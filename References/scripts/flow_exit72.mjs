import { fileURLToPath } from 'node:url';
// The 0x72 exit with its gate word written at the decision breakpoint.
//   node with_emulator.mjs node flow_exit72.mjs hdd|rom <log name> [gate value, default 1]
// Writes the log in the format verify_exits.mjs reads, to Watson/Runtime/captures/<name>.log.
import { Client } from 'file:///D:/CodingProjects/Watson/Server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from 'file:///D:/CodingProjects/Watson/Server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import fs from 'node:fs';

const [build, name, gateArg = '1'] = process.argv.slice(2);
const B = {
  hdd: { state: 'hddosd-1.10U-host-menu', build: 'hddosd-1.10U-host', decision: '0x225A4C', end: '0x225CD4', gate: '0x1F0D58', app: '0x1f0010', module: '0x1f0648', weight: '0x370ab4' },
  rom: { state: 'rom-0230A-menu', build: 'rom-0230A', decision: '0x2210D4', end: '0x2213AC', gate: '0x1F0CF8', app: '0x1f0014', module: '0x1f05e8' },
}[build];
const out = [];
const log = (tool, text) => { out.push(`--- ${tool}: ${text}`.replace(/\| +\| /g, '| ')); console.log(out.at(-1).slice(0, 240)); };
const client = new Client({ name: 'flow_exit72', version: '0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ['D:/CodingProjects/Watson/Server/dist/index.js', '--config', (process.env.WATSON_CONFIG ?? fileURLToPath(new URL('../../watson.json', import.meta.url)))], env: { ...process.env } }));
const call = async (tool, args = {}, tolerate = false) => {
  const result = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 7200000 });
  const text = result.content.map((c) => c.text).join('\n');
  if (result.isError && !tolerate) throw new Error(`${tool}: ${text.slice(0, 400)}`);
  log(tool + (result.isError ? ' ERROR' : ''), text.replace(/\n/g, ' | '));
  return text;
};
let launched = false, status = 0;
try {
  log('watson_launch', (await client.callTool({ name: 'watson_launch', arguments: { build: B.build } })).content.map((c) => c.text).join('\n').split('\n')[0]);
  launched = true;
  for (let i = 1; ; i++) { try { await call('watson_pause'); break; } catch (e) { if (i === 3) throw e; } }
  await call('watson_load_state_file', { path: `D:/CodingProjects/Watson/Runtime/states/${B.state}.p2s` });
  await call('watson_set_breakpoint', { address: B.decision });
  await call('watson_frame_advance', { frames: 3 }, true);
  await call('watson_write_register', { category: 0, index: 16, value: '72' });
  const word = Buffer.alloc(4); word.writeInt32LE(Number(gateArg));
  await call('watson_write_memory', { address: B.gate, data: word.toString('hex') });
  await call('watson_read_memory', { address: B.gate, length: 4 });
  await call('watson_clear_all_breakpoints');
  await call('watson_frame_advance', { frames: 1 });
  if (B.weight) await call('watson_read_memory', { address: B.weight, length: 8 });
  await call('watson_set_breakpoint', { address: B.end });
  await call('watson_frame_advance', { frames: 400 }, true);
  await call('watson_read_registers');
  await call('watson_read_memory', { address: B.app, length: 4 });
  await call('watson_read_memory', { address: B.module, length: 8 });
} catch (e) { console.error(e.message); status = 1; }
finally {
  if (launched) await client.callTool({ name: 'watson_kill', arguments: {} }).catch(() => undefined);
  await client.close();
  fs.writeFileSync(`D:/Watson-placeholder`.replace('D:/Watson-placeholder', `D:/CodingProjects/Watson/Runtime/captures/${name}.log`), out.join('\n') + '\n');
}
process.exit(status);
