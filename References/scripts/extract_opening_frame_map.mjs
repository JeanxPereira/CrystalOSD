// What one frame of a GIF trace is made of: every packet with its path, the EE functions on the
// stack when it was sent, and the GS registers it writes. Written for the opening intro of HDD OSD
// 1.10U, whose function names come from the CrystalOSD disassembly.
//
// node extract_opening_frame_map.mjs <trace.jsonl> [frame index, default 0] [v: one line per packet]
import fs from 'node:fs';
import path from 'node:path';
import { readTrace } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/trace.js';
import { GifPath } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/gif.js';

const ASM = process.env.CRYSTALOSD_ASM ?? 'D:/CodingProjects/CrystalOSD-Decomp-Legacy/asm';

/** Every function of the disassembly: [address, name], sorted. */
export function functions() {
  const list = [];
  for (const module of fs.readdirSync(ASM)) {
    const dir = path.join(ASM, module);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.s')) continue;
      const text = fs.readFileSync(path.join(dir, file), 'utf8');
      const found = /^glabel (\S+)[^\n]*\n\s*\/\* \S+ ([0-9A-F]{8}) /m.exec(text);
      if (found) list.push([parseInt(found[2], 16), found[1]]);
    }
  }
  return list.sort((a, b) => a[0] - b[0]);
}

export function namer() {
  const list = functions();
  return (address) => {
    let lo = 0, hi = list.length - 1, best = null;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (list[mid][0] <= address) { best = list[mid]; lo = mid + 1; } else hi = mid - 1; }
    return best ? best[1] : `0x${address.toString(16)}`;
  };
}

export const REG = { 0x00: 'PRIM', 0x01: 'RGBAQ', 0x02: 'ST', 0x03: 'UV', 0x04: 'XYZF2', 0x05: 'XYZ2', 0x06: 'TEX0', 0x08: 'CLAMP', 0x0a: 'FOG', 0x0c: 'XYZF3',
  0x0d: 'XYZ3', 0x14: 'TEX1', 0x16: 'TEX2', 0x18: 'XYOFFSET', 0x1a: 'PRMODECONT', 0x1b: 'PRMODE', 0x34: 'MIPTBP1', 0x36: 'MIPTBP2', 0x3b: 'TEXA', 0x3d: 'FOGCOL',
  0x3f: 'TEXFLUSH', 0x40: 'SCISSOR', 0x42: 'ALPHA', 0x44: 'DIMX', 0x45: 'DTHE', 0x46: 'COLCLAMP', 0x47: 'TEST', 0x49: 'PABE', 0x4a: 'FBA', 0x4c: 'FRAME',
  0x4e: 'ZBUF', 0x50: 'BITBLTBUF', 0x51: 'TRXPOS', 0x52: 'TRXREG', 0x53: 'TRXDIR' };
const SHOWN = new Set(['PRIM', 'ALPHA', 'TEST', 'TEX0', 'FRAME', 'CLAMP', 'ZBUF', 'TEX1', 'BITBLTBUF']);

/** The register writes of a packet, runs of the same register folded. */
export function shapeOf(packet) {
  const out = [];
  let last = null, count = 0;
  const flush = () => { if (last) out.push(count > 1 ? `${last}x${count}` : last); };
  for (const event of new GifPath().feed(packet.bytes)) {
    let word = null;
    if (event.kind === 'write') {
      const name = REG[event.reg] ?? `r${event.reg.toString(16)}`;
      word = SHOWN.has(name) ? `${name}=${event.value.toString(16)}` : name;
    } else if (event.kind === 'image') word = `image(${event.bytes})`;
    if (!word) continue;
    if (word === last) count += 1; else { flush(); last = word; count = 1; }
  }
  flush();
  return out.join(' ');
}

export function frameMap(traceFile, frame = 0) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const nameOf = namer();
  const from = trace.vsyncAt[frame] ?? 0, to = trace.vsyncAt[frame + 1] ?? trace.packets.length;
  const rows = [];
  for (let i = from; i < to; i++) {
    const packet = trace.packets[i];
    const origin = trace.origins.get(packet.sources[0]?.origin);
    const kinds = [...new Set(packet.sources.map((source) => `${source.kind}/${source.space}`))].join(',');
    const stack = (origin?.stack ?? []).map((entry) => nameOf(parseInt(entry.pc, 16)));
    rows.push({ index: i - from, path: packet.path, kinds, stack, shape: shapeOf(packet), bytes: packet.bytes.length });
  }
  return { trace, rows, frameNumber: trace.frame + frame };
}

if (process.argv[1] && process.argv[1].endsWith('extract_opening_frame_map.mjs')) {
  const { rows, trace } = frameMap(process.argv[2], Number(process.argv[3] ?? 0));
  console.log(`packets in the trace: ${trace.packets.length}, vsyncs at ${trace.vsyncAt.join(', ')}; this frame: ${rows.length} packets`);
  if (process.argv[4] === 'v') for (const row of rows) console.log(`${String(row.index).padStart(4)} path${row.path} ${row.kinds} | ${row.stack.slice(0, 4).join(' < ')} | ${row.shape.slice(0, 500)}`);
  const groups = new Map();
  for (const row of rows) {
    const key = `path${row.path} ${row.kinds} | ${row.stack.filter((name) => !/^sceDma|^sceGs/.test(name)).slice(0, -2).join(' < ')}`;
    const group = groups.get(key) ?? { count: 0, bytes: 0 };
    group.count += 1; group.bytes += row.bytes;
    groups.set(key, group);
  }
  for (const [key, group] of groups) console.log(`${String(group.count).padStart(5)} packets ${String(group.bytes).padStart(7)} bytes  ${key}`);
}
