// Dump a range of live EE memory from the running Watson emulator to a file, with provenance.
// node dump_ee.mjs <out.bin> <start hex> <end hex> <build id> <state name>
import fs from 'node:fs';
import crypto from 'node:crypto';
import { DebugServerClient } from 'file:///D:/CodingProjects/Watson/Server/dist/debug-server-client.js';

const [out, startText, endText, build, state] = process.argv.slice(2);
const start = parseInt(startText, 16);
const end = parseInt(endText, 16);
const client = new DebugServerClient('127.0.0.1', 21512);
await client.connect();
const status = await client.getStatus();
const parts = [];
for (let at = start; at < end; at += 0x1000) {
  parts.push(await client.readMemoryBuffer(`0x${at.toString(16)}`, Math.min(0x1000, end - at)));
}
client.disconnect();
const data = Buffer.concat(parts);
if (data.length !== end - start) throw new Error(`read ${data.length} bytes, wanted ${end - start}`);
fs.writeFileSync(out, data);
fs.writeFileSync(`${out}.provenance.json`, JSON.stringify({
  what: 'live EE memory read through Watson',
  build, state, start: startText, end: endText, bytes: data.length,
  frame: status.frame, paused: status.paused,
  sha256: crypto.createHash('sha256').update(data).digest('hex'),
  captured: new Date().toISOString(),
}, null, 2));
console.log(`${out}: ${data.length} bytes, frame ${status.frame}, paused ${status.paused}`);
