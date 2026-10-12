// One frame of a GS dump as a fixture for the native renderer: the frame in native units
// (frame.json), the textures and start buffers it reads, and the oracle's result per draw.
//   node tools/parity/make_fixture.mjs <dump.gs> <out dir> [frame]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runOracle } from './oracle.mjs';
import { png } from '../../References/scripts/extract_buffers.mjs';
import { GifPath, pixels16, pixels32, readPng, replayUploads } from './vram.mjs';

const DIST = (process.env.WATSON_DIST ?? 'D:/CodingProjects/Watson/Server/dist').replace(/\\/g, '/').replace(/\/$/, '');
const { parseGsDump } = await import(`file:///${DIST}/gs/parse.js`);
const { decodeRegister } = await import(`file:///${DIST}/gs/registers.js`);
const { dumpPackets } = await import(`file:///${DIST}/gsdump.js`);
const { GsState } = await import(`file:///${DIST}/gs/state.js`);

const TERM = ['Source', 'Destination', 'Zero'];
const FACTOR = ['SourceAlpha', 'DestinationAlpha', 'Fixed'];
const ZTEST = ['Never', 'Always', 'GreaterEqual', 'Greater'];
const WRAP = ['Repeat', 'Clamp', 'RegionClamp', 'RegionRepeat'];
const SIZE = { point: 1, line: 2, linestrip: 2, triangle: 3, tristrip: 3, trifan: 3, sprite: 2 };
const ORACLE_KIND = { TRIANGLE: ['Triangles', 3], SPRITE: ['Sprites', 2], LINE: ['Lines', 2] };
const VRAM_BYTES = 0x400000;
const STATE_TAIL = (16 + 4) * 4 + 4;
const MAX_LEFT = 16;

const hex = (n, width) => n.toString(16).padStart(width, '0');

function fields(state, name) {
  if (!(name in state)) throw new Error(`the draw state has no ${name}`);
  const decoded = decodeRegister(name, BigInt(state[name]));
  return new Proxy(decoded, { get(target, key) {
    if (typeof key === 'string' && !(key in target)) throw new Error(`${name} has no field ${key}; it has ${Object.keys(target).join(', ')}`);
    return target[key];
  } });
}

const MIP_REGISTER = { 0x34: 'MIPTBP1_1', 0x35: 'MIPTBP1_2', 0x36: 'MIPTBP2_1', 0x37: 'MIPTBP2_2' };

/** The values each MIPTBP register takes in a dump: its start state, then every write. */
export function mipRegisters(data) {
  const headerSize = data.readUInt32LE(4), stateSize = data.readUInt32LE(12);
  const state = GsState.fromBlob(data.subarray(8 + headerSize, 8 + headerSize + stateSize));
  const values = new Map(Object.values(MIP_REGISTER).map((name) => [name, new Set([state.get(name)])]));
  const paths = [new GifPath(), new GifPath(), new GifPath(), new GifPath()];
  const sink = { write(reg, value) { if (MIP_REGISTER[reg]) values.get(MIP_REGISTER[reg]).add(value); }, image() {} };
  for (const packet of dumpPackets(data)) if (packet.type === 'transfer') paths[packet.path].feed(packet.data, sink);
  return values;
}

/** The TBP and TBW of mip levels 1 to 6 for a context, from the values mipRegisters found; null if a register changes during the dump. */
export function mipLevels(values, ctxt) {
  const one = values.get(`MIPTBP1_${ctxt + 1}`), two = values.get(`MIPTBP2_${ctxt + 1}`);
  if (one.size !== 1 || two.size !== 1) return null;
  const [a] = one, [b] = two;
  const field = (v, at, bits) => Number((v >> BigInt(at)) & ((1n << BigInt(bits)) - 1n));
  const levels = [null];
  for (const [v, first] of [[a, 1], [b, 4]]) for (let i = 0; i < 3; i++) levels[first + i] = { tbp: field(v, i * 20, 14), tbw: field(v, i * 20 + 14, 6) };
  return levels;
}

/** The Q range of a draw and a lazy source of its mip levels' addresses, as describeState takes them. */
export function mipOf(vertices, levelsOf) {
  let lo = Infinity, hi = -Infinity;
  for (const v of vertices) if (Number.isFinite(v.q)) { lo = Math.min(lo, v.q); hi = Math.max(hi, v.q); }
  return lo > hi ? null : { q: [lo, hi], levelsOf };
}

/**
 * Which mip level of a mip-mapped texture a draw samples, as PCSX2's software renderer decides it (GSVertexTrace.cpp, GSRendererSW.cpp):
 * the level of detail runs from -log2(Q) * 2^L + K at the draw's largest and smallest Q, and the draw is drawable when that is
 * all at or below 0 (level 0 at the magnification filter) or all at or above MXL (the last level, constant).
 */
function mipChoice(tex1, fst, mip, primitive, ctxt) {
  if (!mip) return { reason: 'mip-mapped texture' };
  if (primitive === 'Sprites') return { reason: 'mip-mapped sprite' };
  const k = tex1.K / 16;
  if (tex1.LCM === 0 && !fst && mip.q[0] <= 0) return { reason: 'mip level from a Q at or below 0' };
  const lods = tex1.LCM === 0 && !fst ? mip.q.map((q) => -Math.log2(q) * (1 << tex1.L) + k) : [k, k];
  const low = Math.min(...lods), high = Math.max(...lods);
  if (high <= 0) return { level: 0, filter: tex1.MMAG ? 'Bilinear' : 'Nearest' };
  if (Math.abs(low - tex1.MXL) < 0.05 || Math.abs(high) < 0.05) return { reason: 'mip level on a boundary' };
  if (Math.trunc(low) < tex1.MXL) return { reason: 'mip level varies within the draw' };
  if (tex1.MTBA) return { reason: 'mip addresses derived by MTBA' };
  const level = Math.min(tex1.MXL, 6);
  const levels = mip.levelsOf(ctxt);
  if (!levels) return { reason: 'mip addresses change during the dump' };
  return { level, filter: tex1.MMIN >= 4 ? 'Bilinear' : 'Nearest', at: levels[level] };
}

/** The native description of a draw's state, and why it cannot be drawn if it cannot; `mip` is mipOf's answer for a mip-mapped texture. */
export function describeState(state, targetOfBlock, primitive, mip = null) {
  const prim = fields(state, 'PRIM'), frame = fields(state, 'FRAME'), zbuf = fields(state, 'ZBUF');
  const test = fields(state, 'TEST'), alpha = fields(state, 'ALPHA'), scissor = fields(state, 'SCISSOR');
  const reasons = [];
  const zpsm = zbuf.PSM & 0xf;
  if (zpsm > 1) reasons.push(`depth format 0x${hex(0x30 | zpsm, 2)}`);
  if (frame.PSM !== 0) reasons.push(`frame format 0x${hex(frame.PSM, 2)}`);
  if (frame.FBMSK !== 0) reasons.push('frame mask');
  if (test.ATE) reasons.push('alpha test');
  if (test.DATE) reasons.push('destination alpha test');
  if (prim.FGE) reasons.push('fog');
  if (fields(state, 'DTHE').DTHE) reasons.push('dithering');
  if (fields(state, 'PABE').PABE && (prim.ABE || (prim.AA1 && primitive !== 'Sprites'))) reasons.push('per-pixel alpha with blending (no capture exercises it)');
  if (!fields(state, 'COLCLAMP').CLAMP) reasons.push('colour wrap');

  // AA1 on a line or triangle forces the blend with ALPHA as it stands, even with ABE 0 (GSDrawScanline.cpp: abe || aa1).
  // With ABE 1, AA1 replaces the alpha only where it is 0x80 (GSDrawScanline.cpp); the renderer replaces it always.
  if (prim.ABE && prim.AA1 && primitive !== 'Sprites') reasons.push('antialiasing with alpha blending');
  if (primitive === 'Lines' && !prim.AA1) reasons.push('line without antialiasing');
  let blend = null;
  if (prim.ABE || (prim.AA1 && primitive !== 'Sprites')) {
    if (alpha.A > 2 || alpha.B > 2 || alpha.C > 2 || alpha.D > 2) reasons.push('reserved blend term');
    else blend = { a: TERM[alpha.A], b: TERM[alpha.B], c: FACTOR[alpha.C], d: TERM[alpha.D], fixed: alpha.FIX };
  }

  let texture = null;
  if (prim.TME) {
    const tex0 = fields(state, 'TEX0'), tex1 = fields(state, 'TEX1'), clamp = fields(state, 'CLAMP'), texa = fields(state, 'TEXA');
    const mipMapped = tex1.MXL > 0 && tex1.MMIN >= 2 && tex1.MMIN <= 5;
    const choice = mipMapped ? mipChoice(tex1, prim.FST, mip, primitive, prim.CTXT) : { level: 0, filter: tex1.MMAG ? 'Bilinear' : 'Nearest' };
    const level = choice.level ?? 0;
    const block = choice.at ? choice.at.tbp : tex0.TBP0, pages = choice.at ? choice.at.tbw : tex0.TBW;
    const sourceIsTarget = targetOfBlock.has(block);
    if (tex0.PSM !== 0 && tex0.PSM !== 1 && tex0.PSM !== 2) reasons.push(`texture format 0x${hex(tex0.PSM, 2)}`);
    else if (tex0.PSM === 2 && sourceIsTarget) reasons.push('texture format 0x02 read from a target');
    if (tex0.TFX !== 0 || tex0.TCC !== 1) reasons.push('texture function other than modulate with alpha');
    if (choice.reason) reasons.push(choice.reason);
    else if (!mipMapped && (tex1.MMIN > 1 || tex1.MMAG !== tex1.MMIN)) reasons.push('minification filter differs from magnification');
    else if (level > 0 && sourceIsTarget) reasons.push('mip level read from a target');
    const width = Math.max(1, (1 << tex0.TW) >> level), height = Math.max(1, (1 << tex0.TH) >> level);
    const id = `t${hex(block, 4)}-${pages}-${tex0.PSM}-${Math.log2(width)}x${Math.log2(height)}`;
    texture = {
      source: sourceIsTarget ? { target: targetOfBlock.get(block) } : { image: id },
      block, pages,
      width, height,
      coordinates: prim.FST ? 'Texel' : 'Projective',
      addressU: { mode: WRAP[clamp.WMS], min: clamp.MINU >> level, max: clamp.MAXU >> level },
      addressV: { mode: WRAP[clamp.WMT], min: clamp.MINV >> level, max: clamp.MAXV >> level },
      filter: choice.filter ?? (tex1.MMAG ? 'Bilinear' : 'Nearest'),
      level,
      alpha: tex0.PSM === 1 ? { mode: 'Constant', value: texa.TA0, zeroWhenBlack: !!texa.AEM }
        : tex0.PSM === 2 ? { mode: 'Texel16', value: texa.TA0, valueHigh: texa.TA1, zeroWhenBlack: !!texa.AEM } : { mode: 'Texel' },
      format: tex0.PSM,
    };
  }

  return {
    block: frame.FBP * 32, pages: frame.FBW,
    scissor: [scissor.SCAX0, scissor.SCAY0, scissor.SCAX1, scissor.SCAY1],
    blend, antialias: !!prim.AA1, smooth: !!prim.IIP,
    depth: { test: test.ZTE ? ZTEST[test.ZTST] : 'Always', write: !zbuf.ZMSK, format: zpsm === 1 ? 'Z24' : 'Z32' },
    perPixelAlpha: !!fields(state, 'PABE').PABE, alphaCorrection: !!fields(state, 'FBA').FBA,
    texture, skip: reasons.length ? reasons.join('; ') : null,
    field: (Number(BigInt(state.XYOFFSET) >> 32n) & 0xf) === 8 ? 1 : 0,
  };
}

/** A pass's vertices as frame.json holds them: a flat primitive takes its last vertex's colour, a sprite its last vertex's depth. */
export function nativeVertices(primitive, primitives, state) {
  const flat = !state.smooth || primitive === 'Sprites';
  const vertices = [];
  for (const p of primitives) {
    const last = p[p.length - 1];
    for (const v of p) {
      const colour = flat ? last.rgba : v.rgba;
      const depth = primitive === 'Sprites' ? last.z : v.z;
      const st = state.texture?.coordinates === 'Texel' ? [v.u, v.v, 1] : [v.s, v.t, v.q];
      vertices.push([v.px, v.py, depth, ...colour, ...st]);
    }
  }
  return vertices;
}

function oraclePrimitives(text, draw) {
  const kind = /^vertex: # (\w+)/m.exec(text)?.[1];
  if (!ORACLE_KIND[kind]) throw new Error(`draw ${draw}: the oracle lists primitive ${kind}, which the fixture does not carry`);
  const [primitive, size] = ORACLE_KIND[kind];
  const points = [...text.matchAll(/^\s+- \{X:\s*(-?[\d.]+), Y:\s*(-?[\d.]+), Z:\s*(\d+)/gm)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
  if (points.length === 0 || points.length % size) throw new Error(`draw ${draw}: ${points.length} oracle vertices do not make ${primitive}`);
  const out = [];
  for (let i = 0; i < points.length; i += size) out.push(points.slice(i, i + size));
  return { primitive, size, primitives: out };
}

function oracleContext(text) {
  const out = {};
  let section = null;
  for (const line of text.split(/\r?\n/)) {
    const head = /^([A-Z0-9_]+):\s*$/.exec(line);
    if (head) { section = out[head[1]] = {}; continue; }
    const item = /^ {4}([A-Z0-9]+):\s*(-?[\w.]+)/.exec(line);
    if (item && section) section[item[1]] = Number(item[2]);
  }
  return out;
}

const COMPARED = {
  FRAME: ['FBP', 'FBW', 'PSM', 'FBMSK'], TEST: ['ZTE', 'ZTST', 'ATE', 'DATE'], ALPHA: ['A', 'B', 'C', 'D', 'FIX'],
  SCISSOR: ['SCAX0', 'SCAX1', 'SCAY0', 'SCAY1'], ZBUF: ['PSM', 'ZMSK'], PRIM: ['IIP', 'TME', 'ABE', 'AA1', 'FST', 'FGE'],
};
const COMPARED_TEXTURE = { TEX0: ['TBP0', 'TBW', 'PSM', 'TW', 'TH', 'TFX', 'TCC'], CLAMP: ['WMS', 'WMT', 'MINU', 'MAXU', 'MINV', 'MAXV'], TEX1: ['MMAG', 'MMIN'], TEXA: ['AEM', 'TA0'] };

/** The first disagreement between the oracle's printed context and a stream state, or null. */
function disagreement(context, state) {
  const tables = { ...COMPARED, ...(context.PRIM?.TME ? COMPARED_TEXTURE : {}) };
  for (const [name, keys] of Object.entries(tables)) {
    const decoded = fields(state, name);
    for (const key of keys) {
      const wanted = context[name]?.[key];
      const got = name === 'FRAME' && key === 'FBP' ? decoded.FBP * 32 : name === 'ZBUF' && key === 'PSM' ? 0x30 | decoded.PSM : decoded[key];
      if (wanted === undefined) return `${name}.${key} is not in the oracle context`;
      if (wanted !== Number(got)) return `${name}.${key} is ${wanted} in the oracle and ${got} in the dump`;
    }
  }
  return null;
}

const same = (wanted, got) => wanted.length === got.length && wanted.every((p, i) => p[0] === got[i].px && p[1] === got[i].py && p[2] === got[i].z);


/** The frame's start memory from the oracle: a pixel the first time any draw's before-image holds it is its value before the frame. */
export function oracleStart(oracleDir, draws, names, blocks) {
  const targets = new Map([...blocks].map(([block, at]) => [block, Buffer.alloc(at.width * at.height * 4)]));
  const known = new Map([...blocks].map(([block, at]) => [block, new Uint8Array(at.width * at.height)]));
  const depth = { width: 0, height: 0, data: Buffer.alloc(0) };
  const depthKnown = { mask: new Uint8Array(0) };
  const load = (draw, part) => {
    const matches = names.filter((name) => name.startsWith(`${draw}_f`) && name.includes(part) && name.endsWith('.png') && !name.endsWith('_alpha.png'));
    if (matches.length !== 1) throw new Error(`draw ${draw}: ${matches.length} oracle files match ${part}`);
    const file = matches[0];
    const colour = readPng(fs.readFileSync(path.join(oracleDir, file)));
    const alpha = readPng(fs.readFileSync(path.join(oracleDir, file.replace(/\.png$/, '_alpha.png'))));
    const rgba = Buffer.alloc(colour.width * colour.height * 4);
    for (let i = 0; i < colour.width * colour.height; i++) {
      for (let c = 0; c < 3; c++) rgba[i * 4 + c] = colour.data[i * colour.channels + c];
      rgba[i * 4 + 3] = alpha.data[i * alpha.channels];
    }
    return { file, width: colour.width, height: colour.height, rgba };
  };
  const grow = (width, height) => {
    if (width <= depth.width && height <= depth.height) return;
    const w = Math.max(width, depth.width), h = Math.max(height, depth.height);
    const data = Buffer.alloc(w * h * 4), mask = new Uint8Array(w * h);
    for (let y = 0; y < depth.height; y++) {
      depth.data.copy(data, y * w * 4, y * depth.width * 4, (y + 1) * depth.width * 4);
      mask.set(depthKnown.mask.subarray(y * depth.width, (y + 1) * depth.width), y * w);
    }
    depth.width = w; depth.height = h; depth.data = data; depthKnown.mask = mask;
  };
  for (const draw of draws) {
    const before = load(draw, '_rt0_');
    const block = parseInt(/_rt0_([0-9a-f]+)_/.exec(before.file)[1], 16);
    if (!targets.has(block)) throw new Error(`draw ${draw}: its before-image is of block 0x${hex(block, 4)}, which no pass draws into`);
    const target = targets.get(block), mask = known.get(block), width = blocks.get(block).width;
    if (before.width > width || before.height * width * 4 > target.length) throw new Error(`draw ${draw}: its before-image ${before.width}x${before.height} does not fit block 0x${hex(block, 4)}`);
    for (let y = 0; y < before.height; y++) for (let x = 0; x < before.width; x++) {
      if (mask[y * width + x]) continue;
      before.rgba.copy(target, (y * width + x) * 4, (y * before.width + x) * 4, (y * before.width + x) * 4 + 4);
    }
    for (let y = 0; y < before.height; y++) mask.fill(1, y * width, y * width + before.width);

    const z = load(draw, '_rz0_');
    grow(z.width, z.height);
    for (let y = 0; y < z.height; y++) for (let x = 0; x < z.width; x++) {
      const at = y * depth.width + x;
      if (depthKnown.mask[at]) continue;
      z.rgba.copy(depth.data, at * 4, (y * z.width + x) * 4, (y * z.width + x) * 4 + 4);
    }
    for (let y = 0; y < z.height; y++) depthKnown.mask.fill(1, y * depth.width, y * depth.width + z.width);
  }
  return { targets, depth };
}

export async function makeFixture(dump, outDir, frame = 0) {
  const oracleDir = path.join(outDir, 'oracle');
  await runOracle(dump, oracleDir, frame);
  const names = fs.readdirSync(oracleDir);
  const draws = names.filter((name) => name.endsWith('_context.txt')).map((name) => name.slice(0, 5)).sort();
  const oracleFile = (draw, part) => {
    const found = names.filter((name) => name.startsWith(`${draw}_f`) && name.includes(part) && !name.endsWith('_alpha.png'));
    if (found.length !== 1) throw new Error(`draw ${draw}: ${found.length} oracle files match ${part}`);
    return `oracle/${found[0].replace(/\.png$/, '')}`;
  };

  const parsed = path.join(outDir, 'parsed.jsonl');
  parseGsDump(dump, parsed, {});
  const stream = [];
  for (const line of fs.readFileSync(parsed, 'utf8').split('\n')) {
    if (!line) continue;
    const record = JSON.parse(line);
    if (record.type !== 'draw' || record.frame < Math.max(0, frame - 1) || record.frame > frame) continue;
    const size = SIZE[record.primitive];
    if (!size) throw new Error(`draw ${record.index}: primitive ${record.primitive}`);
    for (let i = 0; i < record.indices.length; i += size) stream.push({ vertices: record.indices.slice(i, i + size).map((at) => record.vertices[at]), state: record.state });
  }
  fs.rmSync(parsed);

  // The oracle's draws are flushes of the same primitive stream; it drops the ones it culls.
  let cursor = 0, dropped = 0;
  const matched = [];
  for (const draw of draws) {
    const wanted = oraclePrimitives(fs.readFileSync(path.join(oracleDir, `${draw}_vertex.txt`), 'utf8'), draw);
    const context = oracleContext(fs.readFileSync(path.join(oracleDir, `${draw}_context.txt`), 'utf8'));
    const found = [];
    for (const primitive of wanted.primitives) {
      let why = null;
      while (cursor < stream.length) {
        if (same(primitive, stream[cursor].vertices)) {
          why = disagreement(context, stream[cursor].state);
          if (!why) break;
        }
        cursor++; dropped++;
      }
      if (cursor === stream.length) throw new Error(`draw ${draw}: primitive ${found.length} of the oracle is not in the dump's stream with its state${why ? ` (nearest geometry: ${why})` : ''}`);
      found.push(stream[cursor++]);
    }
    const key = JSON.stringify(found[0].state);
    if (!found.every((p) => JSON.stringify(p.state) === key)) throw new Error(`draw ${draw}: its primitives do not share one state`);
    matched.push({ draw, primitive: wanted.primitive, found, state: found[0].state });
  }

  const left = stream.length - cursor;
  if (left > MAX_LEFT) throw new Error(`the oracle stopped early: ${left} primitives of the frame remain after its last draw (${draws.length} draws)`);

  const blocks = new Map();
  for (const m of matched) {
    const f = fields(m.state, 'FRAME'), s = fields(m.state, 'SCISSOR');
    const at = blocks.get(f.FBP * 32) ?? { width: f.FBW * 64, height: 0, pages: f.FBW };
    at.height = Math.max(at.height, s.SCAY1 + 1);
    blocks.set(f.FBP * 32, at);
  }
  const targetOfBlock = new Map([...blocks.keys()].map((block) => [block, `fb${hex(block, 4)}`]));

  const data = fs.readFileSync(dump);
  const headerSize = data.readUInt32LE(4), stateSize = data.readUInt32LE(12);
  const vram = Buffer.from(data.subarray(8 + headerSize + stateSize - STATE_TAIL - VRAM_BYTES, 8 + headerSize + stateSize - STATE_TAIL));
  if (frame > 0) replayUploads(vram, dumpPackets(data), frame);

  fs.mkdirSync(path.join(outDir, 'start'), { recursive: true });
  fs.mkdirSync(path.join(outDir, 'textures'), { recursive: true });
  const buffers = frame === 0 ? null : oracleStart(oracleDir, draws, names, blocks);
  const targets = [...blocks].map(([block, at]) => {
    const id = targetOfBlock.get(block);
    fs.writeFileSync(path.join(outDir, 'start', `${id}.rgba`), buffers ? buffers.targets.get(block) : pixels32(vram, block, at.pages, at.width, at.height));
    return { id, width: at.width, height: at.height, start: `start/${id}.rgba` };
  });
  let depthStart = oracleFile(draws[0], '_rz0_');
  if (buffers) {
    const width = Math.max(...targets.map((t) => t.width)), height = Math.max(...targets.map((t) => t.height));
    const colour = Buffer.alloc(width * height * 4), alpha = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const at = buffers.depth.width > x && buffers.depth.height > y ? (y * buffers.depth.width + x) * 4 : -1, o = (y * width + x) * 4;
      if (at >= 0) { colour[o] = buffers.depth.data[at]; colour[o + 1] = buffers.depth.data[at + 1]; colour[o + 2] = buffers.depth.data[at + 2]; alpha[o] = alpha[o + 1] = alpha[o + 2] = buffers.depth.data[at + 3]; }
      colour[o + 3] = alpha[o + 3] = 255;
    }
    depthStart = 'start/depth';
    fs.writeFileSync(path.join(outDir, 'start', 'depth.png'), png(width, height, colour));
    fs.writeFileSync(path.join(outDir, 'start', 'depth_alpha.png'), png(width, height, alpha));
  }

  let mipValues = null;
  const levelsOf = (ctxt) => mipLevels(mipValues ??= mipRegisters(data), ctxt);
  const textures = new Map();
  let field = 0;
  const passes = matched.map((m) => {
    const state = describeState(m.state, targetOfBlock, m.primitive, mipOf(m.found.flatMap((p) => p.vertices), levelsOf));
    field ||= state.field;
    if (state.smooth && m.primitive === 'Lines') state.skip ||= 'gouraud line';
    const vertices = nativeVertices(m.primitive, m.found.map((p) => p.vertices), state);
    let texture = null;
    if (state.texture) {
      const { block, pages, ...rest } = state.texture;
      const { format, ...kept } = rest;
      texture = kept;
      if (rest.source.image && !state.skip && !textures.has(rest.source.image)) {
        const file = `textures/${rest.source.image}.rgba`;
        fs.writeFileSync(path.join(outDir, file), (rest.format === 2 ? pixels16 : pixels32)(vram, block, pages, rest.width, rest.height));
        textures.set(rest.source.image, { id: rest.source.image, width: rest.width, height: rest.height, file });
      }
    }
    return {
      index: Number(m.draw), name: `draw-${m.draw.slice(2)}`, target: targetOfBlock.get(state.block), primitive: m.primitive,
      scissor: state.scissor, blend: state.blend, antialias: state.antialias, depth: state.depth, texture, skip: state.skip, vertices,
      perPixelAlpha: state.perPixelAlpha, alphaCorrection: state.alphaCorrection,
      oracle: { colour: oracleFile(m.draw, '_rt1_'), depth: oracleFile(m.draw, '_rz1_') },
    };
  });

  const frameJson = { capture: path.basename(dump, '.gs'), frame, field, targets, depthStart, textures: [...textures.values()], passes };
  fs.writeFileSync(path.join(outDir, 'frame.json'), JSON.stringify(frameJson));
  return { passes: passes.length, skipped: passes.filter((p) => p.skip).length, dropped, left };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dump, outDir, frame] = process.argv.slice(2);
  if (!dump || !outDir) { console.error('usage: node tools/parity/make_fixture.mjs <dump.gs> <out dir> [frame]'); process.exit(2); }
  const done = await makeFixture(dump, outDir, Number(frame ?? 0));
  console.log(`fixture: ${done.passes} passes (${done.skipped} skipped), ${done.dropped} primitives the oracle culled, ${done.left} left after the last draw, in ${outDir}`);
}
