import { fileURLToPath } from 'node:url';
// One emulator session driven by a JSON step list, for the sound captures (no verifier PROBES involved).
//
//   node with_emulator.mjs node sound_session.mjs <steps.json>
//
// Steps: { "call": "<watson tool>", "args": {...} }, { "iopDump": { "address": "0x90130", "length": 45056, "out": "<file>" } },
// { "iopFind": { "text": "SDR driver version 2.0.0", "from": "0x80000", "to": "0xA0000", "label": "x" } },
// { "gzip": "<file>" } (gzip a finished trace, delete the plain file only after the gzip tests clean),
// { "note": "<text>" } (printed). watson_launch is first in the list; watson_kill is added by this script.
import { Client } from 'file:///D:/CodingProjects/Watson/Server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from 'file:///D:/CodingProjects/Watson/Server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import { DebugServerClient } from 'file:///D:/CodingProjects/Watson-wt/sound/Server/dist/debug-server-client.js';
import fs from 'node:fs';
import zlib from 'node:zlib';

const steps = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const SERVER = process.env.WATSON_SERVER ?? 'D:/CodingProjects/Watson/Server/dist/index.js';
const client = new Client({ name: 'sound-session', version: '0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER, '--config', (process.env.WATSON_CONFIG ?? fileURLToPath(new URL('../../watson.json', import.meta.url)))], env: { ...process.env } }), { timeout: 600000 });
const call = async (tool, args = {}) => {
  const result = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 7200000 });
  const text = result.content.map((c) => c.text).join('\n');
  if (result.isError) {
    if (tool === 'watson_load_state_file' && /may yet take effect/.test(text)) {
      await new Promise((resolve) => setTimeout(resolve, 45000));
      console.log('state load slow; waited 45 s');
      return text;
    }
    throw new Error(`${tool}: ${text.slice(0, 600)}`);
  }
  return text;
};
const readIop = async (address, length) => {
  const chunks = [];
  for (let at = 0; at < length; at += 4096) {
    const n = Math.min(4096, length - at);
    const text = await call('watson_read_memory', { address: `0x${(address + at).toString(16)}`, length: n, format: 'hex', cpu: 'iop' });
    chunks.push(Buffer.from(text.split('\n').pop().trim(), 'hex'));
  }
  return Buffer.concat(chunks);
};
let launched = false;
let port = null;
let debug = null;
let status = 0;
try {
  for (const step of steps) {
    if (step.note) console.log(step.note);
    else if (step.call) {
      const text = await call(step.call, step.args ?? {});
      if (step.call === 'watson_launch') { launched = true; const m = /port (\d+)/.exec(text); port = m ? Number(m[1]) : null; }
      console.log(step.call === 'watson_launch' ? text.split('\n')[0] : text);
    } else if (step.ringPush) {
      const r = step.ringPush;
      const headText = await call('watson_read_memory', { address: '0x1f0a60', length: 4, format: 'hex', cpu: 'ee' });
      const head = Buffer.from(headText.split('\n').pop().trim(), 'hex').readUInt32LE(0);
      const entry = Buffer.alloc(8);
      [r.cmd, r.a1, r.a2, r.a3].forEach((v, k) => entry.writeUInt16LE(v & 0xffff, 2 * k));
      await call('watson_write_memory', { address: `0x${(0x1f0658 + 8 * (head & 127)).toString(16)}`, data: entry.toString('hex') });
      const next = Buffer.alloc(4);
      next.writeUInt32LE(head + 1);
      await call('watson_write_memory', { address: '0x1f0a60', data: next.toString('hex') });
      console.log(`ring push ${JSON.stringify(r)} at head ${head}`);
    } else if (step.iopWrite) {
      if (!debug) { debug = new DebugServerClient('127.0.0.1', port); await debug.connect(); }
      const written = await debug.writeMemory(step.iopWrite.address, step.iopWrite.hex, 'iop');
      console.log(`iop write ${step.iopWrite.address} ${written} bytes`);
    } else if (step.snapshot) {
      const stem = step.snapshot;
      fs.writeFileSync(`${stem}.start.osdsnd.bin`, await readIop(0x90130, 45056));
      fs.writeFileSync(`${stem}.start.iopsound.bin`, await readIop(0xeb000, 61440));
      await call('watson_spu_read', { path: `${stem}.start`, ram: false, regs: false, state: true });
      console.log(`snapshot ${stem}`);
    } else if (step.iopDump) {
      const d = step.iopDump;
      const data = await readIop(Number(d.address), d.length);
      fs.writeFileSync(d.out, data);
      console.log(`iop ${d.address} +${d.length} -> ${d.out}`);
    } else if (step.iopFind) {
      const d = step.iopFind;
      const from = Number(d.from);
      const data = await readIop(from, Number(d.to) - from);
      const at = data.indexOf(Buffer.from(d.text, 'latin1'));
      console.log(`${d.label ?? 'find'}: ${at < 0 ? 'not found' : `0x${(from + at).toString(16)}`}`);
    } else if (step.gzip) {
      const gz = `${step.gzip}.gz`;
      fs.writeFileSync(gz, zlib.gzipSync(fs.readFileSync(step.gzip), { level: 9 }));
      zlib.gunzipSync(fs.readFileSync(gz));
      fs.unlinkSync(step.gzip);
      console.log(`gzip ${step.gzip} -> ${fs.statSync(gz).size} bytes`);
    }
  }
} catch (error) {
  console.error(error.message);
  status = 1;
} finally {
  if (launched) await call('watson_kill').catch(() => undefined);
  await client.close();
}
process.exit(status);
