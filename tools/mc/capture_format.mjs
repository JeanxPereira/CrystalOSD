import { fileURLToPath } from 'node:url';
// The OSD's own formatted image: boots the HDD OSD, opens the Browser, enters an unformatted memory
// card slot, answers the Format dialog with Yes and waits for "Formatting completed.". The instance
// that ran the session has its card changed by the OSD; that card is copied to <captures>/<name>.ps2
// and the instance's file is put back as it was.
//   node References/scripts/with_emulator.mjs node tools/mc/capture_format.mjs --name hddosd-110U-browser-format-yes
import { Client } from 'file:///D:/CodingProjects/Watson/Server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from 'file:///D:/CodingProjects/Watson/Server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const option = (name, fallback) => { const at = argv.indexOf(`--${name}`); return at >= 0 ? argv[at + 1] : fallback; };
const name = option('name');
if (!name) throw new Error('--name is required');
const RUNTIME = process.env.WATSON_RUNTIME ?? 'D:/CodingProjects/Watson/Runtime';
const CAPTURES = process.env.CRYSTALOSD_CAPTURES ?? `${RUNTIME}/captures`;
const SERVER = process.env.WATSON_SERVER ?? 'D:/CodingProjects/Watson/Server/dist/index.js';
const INSTANCES = [1, 2, 3, 4];
const cards = INSTANCES.flatMap((i) => [1, 2].map((s) => ({ i, file: `${RUNTIME}/instance-${i}/PCSX2/memcards/Mcd00${s}.ps2` })));
const keep = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-format-'));
cards.forEach((card, n) => { card.copy = path.join(keep, String(n)); fs.copyFileSync(card.file, card.copy); });

const client = new Client({ name: 'capture_format', version: '0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER, '--config', (process.env.WATSON_CONFIG ?? fileURLToPath(new URL('../../watson.json', import.meta.url)))], env: { ...process.env } }));
const call = async (tool, args = {}) => {
  const result = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 7200000 });
  const text = result.content.map((c) => c.text).join('\n');
  if (result.isError) throw new Error(`${tool}: ${text.slice(0, 300)}`);
  return text;
};
const press = async (button, held, wait) => { await call('watson_pad', { buttons: [button], frames: held }); if (wait) await call('watson_frame_advance', { frames: wait }); };
let launched = false;
let status = 0;
try {
  console.log((await call('watson_launch', { build: 'hddosd-1.10U-host', state: 'menu', interpreter: false })).split('\n')[0]);
  launched = true;
  for (let attempt = 1; ; attempt++) { try { await call('watson_pause'); break; } catch (error) { if (attempt === 3) throw error; } }
  await press('cross', 6, 400);
  await press('circle', 6, 150);
  await press('right', 6, 60);
  await press('cross', 6, 70);
  await press('left', 6, 20);
  await press('cross', 6, 60);
  await call('watson_frame_advance', { frames: 420 });
  console.log((await call('watson_snapshot', { path: `${CAPTURES}/${name}.png` })).split('\n')[0]);
} catch (error) {
  console.error(error.message);
  status = 1;
} finally {
  if (launched) await call('watson_kill').catch(() => undefined);
  await client.close();
  const changed = cards.filter((card) => !fs.readFileSync(card.file).equals(fs.readFileSync(card.copy)));
  if (changed.length === 1) {
    fs.copyFileSync(changed[0].file, `${CAPTURES}/${name}.ps2`);
    console.log(`card changed: instance ${changed[0].i}, ${path.basename(changed[0].file)} -> ${name}.ps2`);
  } else { console.error(`cards changed: ${changed.length}`); status = 1; }
  for (const card of changed) fs.copyFileSync(card.copy, card.file);
  fs.rmSync(keep, { recursive: true, force: true });
}
process.exit(status);
