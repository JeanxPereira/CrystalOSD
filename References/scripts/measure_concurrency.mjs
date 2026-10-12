import { fileURLToPath } from 'node:url';
// How many interpreter emulators to run at once: N sessions of the same capture side by side,
// each from launch to kill; prints wall time and traced frames per second for each N.
// Run with no other emulator running.
//   node measure_concurrency.mjs [frames] [counts, e.g. 1,3,5]
import { Client } from 'file:///D:/CodingProjects/Watson/Server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from 'file:///D:/CodingProjects/Watson/Server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const frames = Number(process.argv[2] ?? 20);
const counts = (process.argv[3] ?? '1,3,5').split(',').map(Number);
const SERVER = process.env.WATSON_SERVER ?? 'D:/CodingProjects/Watson/Server/dist/index.js';
const CONFIG = (process.env.WATSON_CONFIG ?? fileURLToPath(new URL('../../watson.json', import.meta.url)));
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'watson-concurrency-'));

async function session(n, k) {
  const client = new Client({ name: `concurrency-${n}-${k}`, version: '0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER, '--config', CONFIG], env: { ...process.env } }));
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 3600000 });
    const text = result.content.map((c) => c.text).join('\n');
    if (result.isError) throw new Error(`${name}: ${text.slice(0, 300)}`);
    return text;
  };
  const started = Date.now();
  let traced = 0;
  try {
    await call('watson_launch', { build: 'hddosd-1.10U-host', state: 'clock', interpreter: true });
    await call('watson_pause');
    const before = Date.now();
    await call('watson_gif_trace', { frames, path: path.join(OUT, `n${n}-${k}.png`) });
    traced = (Date.now() - before) / 1000;
  } finally {
    await call('watson_kill').catch(() => undefined);
    await client.close();
  }
  return { total: (Date.now() - started) / 1000, traced };
}

for (const n of counts) {
  const started = Date.now();
  const results = await Promise.all(Array.from({ length: n }, (_, k) => session(n, k)));
  const wall = (Date.now() - started) / 1000;
  const slowest = Math.max(...results.map((r) => r.traced));
  console.log(`${n} at once: wall ${wall.toFixed(0)} s; trace of ${frames} frames ${results.map((r) => r.traced.toFixed(0)).join(' / ')} s; `
    + `${((n * frames) / wall).toFixed(2)} traced frames per second overall, ${(frames / slowest).toFixed(2)} per session`);
}
fs.rmSync(OUT, { recursive: true, force: true });
