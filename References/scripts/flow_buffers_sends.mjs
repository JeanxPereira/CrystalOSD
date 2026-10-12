import { fileURLToPath } from 'node:url';
// What the four frame-sized buffers hold between the sends of a frame (checkpoint item 9).
//
//   node with_emulator.mjs node flow_buffers_sends.mjs --build hdd|rom [--state clock|config] [--stops 200]
//        [--png first|rods|all|none] [--name hddosd-110U-flow-sends-clock]
//
// Under the recompilers a breakpoint sits right after the path sync that opens the DMA kick of the
// send function (HDD OSD 0x00233468 in func_00233438, ROM 0x0022F9A0 in the body at 0x0022F7F8): the
// previous send has then been fully handed to the GIF. At each stop the GS thread is drained
// (watson_gs_read), the four buffers are decoded, and compared with the stops before: the pixels
// the previous send changed, and where. The caller of the send that is about to start is the return
// address its function saved at 0x10(sp), so stop n reports "after send n-1, whose caller was ...".
import { Client } from 'file:///D:/CodingProjects/Watson/Server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from 'file:///D:/CodingProjects/Watson/Server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import fs from 'node:fs';
import { word32, png } from './extract_buffers.mjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => { const at = argv.indexOf(`--${name}`); return at >= 0 ? argv[at + 1] : fallback; };
const build = option('build', 'hdd');
const stateName = option('state', 'clock');
const stops = Number(option('stops', 200));
const settle = Number(option('settle', 0));
const pngMode = option('png', 'rods');
const name = option('name', `${build === 'hdd' ? 'hddosd-110U' : 'rom-0230A'}-flow-sends-${stateName}`);
const outDir = `D:/CodingProjects/CrystalOSD-Data/textures/buffers/${name}`;
const rawFile = `${process.env.TEMP ?? 'C:/Windows/Temp'}/${name}.gsmem`;

const BUILDS = {
  hdd: {
    launch: { build: 'hddosd-1.10U-host', state: stateName },
    after: '0x00233468',
    sendEntry: 0x238DB0,
    regions: [['cube', 0x237350, 0x237860], ['cube-hl', 0x237860, 0x237A28], ['rod', 0x237A28, 0x2384C8], ['extra-rod', 0x2384C8, 0x238DB0]],
  },
  rom: {
    launch: { build: 'rom-0230A', state: stateName },
    after: '0x0022F9A0',
    sendEntry: 0x235350,
    regions: [['cube', 0x233928, 0x233DD8], ['cube-hl', 0x233DD8, 0x233F60], ['rod', 0x233F60, 0x234A68], ['extra-rod', 0x234A68, 0x2353A0]],
  },
}[build];

const W = 640, H = 224, bw = W >> 6;
const BUFFERS = [['display-0', 0], ['display-1', (W * H) >> 11], ['work-1', (W * H) >> 9], ['work-0', (3 * W * H) >> 11]];

const client = new Client({ name: 'flow-sends', version: '0' });
await client.connect(new StdioClientTransport({
  command: process.execPath,
  args: [process.env.WATSON_SERVER ?? 'D:/CodingProjects/Watson/Server/dist/index.js', '--config', (process.env.WATSON_CONFIG ?? fileURLToPath(new URL('../../watson.json', import.meta.url)))],
  env: { ...process.env },
}));
const call = async (tool, args = {}) => {
  const result = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 7200000 });
  const text = result.content.map((c) => c.text).join('\n');
  if (result.isError) throw new Error(`${tool}: ${text.slice(0, 400)}`);
  return text;
};

const sites = new Map();
const region = (ra) => {
  for (const [label, from, to] of BUILDS.regions) if (ra >= from && ra < to) return `${label}.s${sites.get(ra) ?? '?'}`;
  return 'other';
};
const findSites = async () => {
  const jal = (0x0C000000 | (BUILDS.sendEntry >>> 2)) >>> 0;
  for (const [, from, to] of BUILDS.regions) {
    let k = 0;
    for (let at = from; at < to; at += 4096) {
      const text = await call('watson_read_memory', { address: `0x${at.toString(16)}`, length: Math.min(4096, to - at), format: 'hex' });
      const hex = text.slice(text.indexOf(':') + 1).replace(/0x/g, '').replace(/[^0-9a-fA-F]/g, '');
      for (let i = 0; i + 8 <= hex.length; i += 8) {
        const word = Buffer.from(hex.slice(i, i + 8), 'hex').readUInt32LE(0);
        if (word === jal) sites.set(at + i / 2 + 8, ++k);
      }
    }
  }
};
const readWord = async (address) => {
  const text = await call('watson_read_memory', { address: `0x${address.toString(16)}`, length: 4, format: 'u32_array' });
  if (!readWord.shown) { readWord.shown = 1; console.log('mem sample: ' + JSON.stringify(text) + ' at ' + address.toString(16)); }
  const m = text.match(/(?:0x)?([0-9a-fA-F]{1,8})\s*$/m) ?? text.match(/(?:0x)?([0-9a-fA-F]{8})/);
  return parseInt(m[1], 16);
};
const register = (text, reg) => {
  const m = text.match(new RegExp(`^\\s*${reg}\\s*=\\s*0x([0-9A-F]{8})\\.[0-9A-F]{8}\\.[0-9A-F]{8}\\.[0-9A-F]{8}`, 'im'));
  if (!m) throw new Error(`register ${reg} not found in: ${text.slice(0, 300)}`);
  return parseInt(m[1], 16);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const untilPaused = async () => {
  for (let i = 0; i < 6000; i++) {
    const text = await call('watson_status');
    if (/Paused:\s*true/i.test(text)) return text;
    await sleep(25);
  }
  throw new Error('no stop at the breakpoint');
};

const decode = (memory, bp) => {
  const words = new Uint32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) words[y * W + x] = memory.readUInt32LE(word32(bp, bw, x, y) * 4);
  return words;
};
const toPng = (words, alphaOnly) => {
  const rgba = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const v = words[i];
    if (alphaOnly) { const a = Math.min(255, (v >>> 24) * 2); rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = a; } else { rgba[i * 4] = v & 255; rgba[i * 4 + 1] = (v >>> 8) & 255; rgba[i * 4 + 2] = (v >>> 16) & 255; }
    rgba[i * 4 + 3] = 255;
  }
  return png(W, H, rgba);
};

/** GS memory once two reads 40 ms apart agree: the renderer's own queue is then empty. */
const stableRead = async () => {
  await call('watson_gs_read', { path: rawFile });
  let last = fs.readFileSync(rawFile);
  for (let i = 0; i < 8; i++) {
    await sleep(40);
    await call('watson_gs_read', { path: rawFile });
    const now = fs.readFileSync(rawFile);
    if (now.equals(last)) return now;
    last = now;
    reads.unsettled++;
  }
  return last;
};
const reads = { unsettled: 0 };
let launched = false;
let status = 0;
const records = [];
try {
  console.log((await call('watson_launch', { ...BUILDS.launch, interpreter: false })).split('\n')[0]);
  launched = true;
  for (let attempt = 1; ; attempt++) { try { await call('watson_pause'); break; } catch (error) { if (attempt === 3) throw error; } }
  fs.mkdirSync(outDir, { recursive: true });
  await call('watson_set_breakpoint', { address: BUILDS.after, description: 'after the path sync of a send' });
  await findSites();
  console.log(`send sites: ${[...sites.keys()].map((v) => '0x' + v.toString(16)).join(' ')}`);
  const everySend = option('all') === '1';
  const interesting = (ra) => ra !== undefined && (everySend || region(ra) !== 'other');
  const callers = [], snapshots = [], emptyAt = new Map();
  const diffOf = (current, old, inside) => {
    const out = {};
    BUFFERS.forEach(([bufferName], b) => {
      let changed = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
      const sumOld = [0, 0, 0], sumNew = [0, 0, 0];
      const alphas = new Set();
      const cur = current[b], prev = old[b];
      for (let i = 0; i < W * H; i++) {
        if (cur[i] === prev[i]) continue;
        const x = i % W, y = (i / W) | 0;
        if (inside && (x < inside[0] || x > inside[2] || y < inside[1] || y > inside[3])) continue;
        changed++;
        for (let c = 0; c < 3; c++) { sumOld[c] += (prev[i] >>> (8 * c)) & 255; sumNew[c] += (cur[i] >>> (8 * c)) & 255; }
        alphas.add(cur[i] >>> 24);
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      out[bufferName] = { changed, alphaValues: [...alphas].sort((p, q) => p - q), box: changed ? [x0, y0, x1, y1] : null, meanBefore: sumOld.map((v) => Math.round(v / (changed || 1))), meanAfter: sumNew.map((v) => Math.round(v / (changed || 1))) };
    });
    return out;
  };
  const text = (d) => Object.entries(d).filter(([, v]) => v.changed).map(([k, v]) => `${k}:${v.changed}[${v.box}] a${v.alphaValues.length > 4 ? v.alphaValues[0] + '..' + v.alphaValues.at(-1) : v.alphaValues.join('/')} rgb ${v.meanBefore}>${v.meanAfter}`).join(' ') || '(nothing)';
  let shown = 0;
  for (let t = 0; t < 8000 && shown < stops; t++) {
    await call('watson_continue');
    const stopText = await untilPaused();
    if (t === 0) console.log(`first stop: ${stopText.split(String.fromCharCode(10)).pop()}`);
    const sp = register(await call('watson_read_registers', { category: 0 }), 'sp');
    callers[t] = await readWord(sp + 0x10);
    snapshots[t] = null;
    if (option('order')) console.log(`order ${t} 0x${callers[t].toString(16)} ${region(callers[t])}`);
    if (!(interesting(callers[t - 3]) || interesting(callers[t - 2]) || interesting(callers[t - 1]))) continue;
    const memory = await stableRead();
    snapshots[t] = BUFFERS.map(([, fbp]) => decode(memory, fbp * 32));
    if (emptyAt.has(t - 3) && snapshots[t - 1]) {
      const first = emptyAt.get(t - 3);
      const late = diffOf(snapshots[t], snapshots[t - 1], first.inside);
      first.record.late = { next: `0x${callers[t - 2].toString(16)} ${region(callers[t - 2])}`, insideBox: first.inside, buffers: late };
      if (Object.values(late).some((v) => v.changed)) console.log(`  late: ${first.record.send} shows ${text(late)} inside its box with the next send (${first.record.late.next})`);
    }
    if (!interesting(callers[t - 2])) continue;
    const label = `0x${callers[t - 2].toString(16)} ${region(callers[t - 2])}`;
    const record = { send: label, buffers: {} };
    const old = snapshots[t - 1];
    if (old) {
      record.buffers = diffOf(snapshots[t], old);
      const anyChange = Object.values(record.buffers).some((v) => v.changed);
      if (!anyChange) {
        const previousRecord = records.at(-1);
        const box = previousRecord ? Object.values(previousRecord.buffers).find((v) => v.changed)?.box : null;
        emptyAt.set(t - 2, { record, inside: box });
      }
    }
    records.push(record);
    shown++;
    console.log(`send ${shown} ${label}: ${old ? text(record.buffers) : '(baseline)'}`);
    const wantPng = pngMode === 'all' || (pngMode === 'rods' && /rod|cube/.test(label)) || (pngMode === 'first' && shown <= 12);
    if (wantPng && old) {
      BUFFERS.forEach(([bufferName], b) => {
        if (!record.buffers[bufferName].changed) return;
        const stem = `${outDir}/send-${String(shown).padStart(3, '0')}-${label.split(' ')[1]}-${bufferName}`;
        fs.writeFileSync(`${stem}.png`, toPng(snapshots[t][b], false));
        fs.writeFileSync(`${stem}-alpha.png`, toPng(snapshots[t][b], true));
      });
    }
    snapshots[t - 3] = null;
  }
  console.log(`unsettled re-reads: ${reads.unsettled}`);
  fs.writeFileSync(`${outDir}/sends.json`, JSON.stringify(records, null, 1));
} catch (error) {
  console.error(error.message);
  status = 1;
} finally {
  if (launched) await call('watson_kill').catch(() => undefined);
  await client.close();
}
process.exit(status);
