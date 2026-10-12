// The illegal-disc scene of the opening module (HDD OSD 1.10U, module 4): everything it draws
// besides the cubes (verify_opening_illegal_cubes.mjs) and the flat draws (verify_opening_flat.mjs,
// verify_opening_ghost.mjs), recomputed from probed inputs and compared write by write.
//
//   0x00223608  func_00223608: the seven particles' turn and their place on a circle (state probed
//               at entry; the result is checked against the next function's entry); the colour
//               scale D_00370A78 written just before by func_002243F8
//   0x00223980  func_00223980: seven triangle fans (17 vertices each, from D_003DFB10)
//   0x00223E48  func_00223E48: seven more fans (from D_003E0280), then func_00223230's glows
//   0x00222EE0  func_00222EE0: one glow sprite (five per frame)
//   0x0021E950  func_0021E950: 128 small boxes drifting toward the camera
//   0x0021DD90  func_0021DD90: the banner's alpha;  0x0021DC08: the banner's draw (after the language)
//
// node verify_opening_illegal.mjs <trace.jsonl>
export const PROBES = [
  { pc: '0x00223608', ranges: ['0x003dfb10:0x1000', '0x00370000:0x4', '0x0036fb00:0x60', '0x00370a78:0x4', '0x002b0c60:0x10'] },
  { pc: '0x00223980', ranges: ['0x003dfb10:0x1000', '0x70000060:0x280', '0x002b0c20:0x20', '0x00370a78:0x4', '0x002b0cc0:0xb0'] },
  { pc: '0x00223e48', ranges: ['0x003dfb10:0x1000', '0x70000060:0x280', '0x002b0c20:0x20', '0x00370a78:0x4', '0x002b0cc0:0xb0'] },
  { pc: '0x00222ee0', ranges: ['0x003dfb10:0x1000', '0x70000060:0x280', '0x00370000:0x4', '0x0036fae8:0x18', '0x001f0ca0:0x1c', '0x002b0cc0:0xb0', '0x002b00e0:0x20', '0x00370a78:0x4'] },
  { pc: '0x0021e950', ranges: ['0x003da4e0:0x1120', '0x002b0c20:0x50', '0x002b0d80:0x88', '0x00370000:0x60', '0x0036f998:0x24', '0x70000060:0x280', '0x002b0cc0:0xb0', '0x002af960:0x20'] },
  { pc: '0x0021dd90', ranges: ['0x00370a6c:0x8', '0x00370000:0x8', '0x003700f4:0x4', '0x002b0c60:0x10'] },
  { pc: '0x0021dc08', ranges: ['0x003653b8:0x30', '0x002b04a0:0x5a0', '0x001f0ca0:0x1c', '0x002b0cc0:0xb0', '0x00370000:0x8'] },
];
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { GifPath } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/gif.js';
import { f, add, sub, quotient, toInt, asBits, vector, matrix, mulMatrix, rotMatrix, transMatrix, combine } from '../model/opening-lib.mjs';
import { sinf, cosf } from '../model/opening-libm.mjs';
import { transformVertex, clipAll, pack } from './verify_opening_lights_v2.mjs';
import { PAL } from './builds.mjs';
import { word } from './elf_words.mjs';

const [UPDATE, FAN1, FAN2, GLOW, BOXES, BANNER, BANNER_DRAW] = PROBES.map((probe) => parseInt(probe.pc, 16));
const REG = { PRIM: 0, RGBAQ: 1, ST: 2, UV: 3, XYZF2: 4, XYZ2: 5, ALPHA: 0x42, PABE: 0x49 };
const big = (x) => BigInt.asUintN(64, BigInt(x));
const same = (a, b) => asBits(a) === asBits(b);
const clamp255 = (v) => (v < 0x100 ? (v > -1 ? v : 0) : 0xff);
const fromBits = (u32) => new Float32Array(new Uint32Array([u32 >>> 0]).buffer)[0];

/** pktSetAlphaBlend: PABE off when blending is on; the mode's selectors and the fixed alpha. */
function blend(modes, on, mode, fix) {
  const [a, b, c, d] = [0, 4, 8, 12].map((o) => modes.readInt32LE(mode * 16 + o));
  return [[REG.PABE, on < 1 ? 1n : 0n], [REG.ALPHA, big(a | (b << 2) | (c << 4) | (d << 6)) | (big(fix) << 32n)]];
}
/** pktSetTexRect (0x0021B7A0), as verify_opening_overlays.mjs has it. */
function rectangle(place, source, colour, blended, z, width, height) {
  const ox = 0x800 - (width >> 1), oy = 0x800 - (height >> 1);
  return [
    [REG.PRIM, big((blended << 6) | 0x116)],
    // The alpha word is shifted by 24 unmasked (pktSetTexRect), so a word past 0xFF spills into Q.
    [REG.RGBAQ, big(colour[0] | (colour[1] << 8) | (colour[2] << 16)) | (big(colour[3] >>> 0) << 24n) | (0xfe00n << 46n)],
    [REG.UV, big(source[0] * 16 + 8) | (big(source[1] * 16 + 8) << 16n)],
    [REG.XYZ2, big((place[0] + ox) << 4) | (big((place[1] + oy) << 4) << 16n) | (big(z) << 32n)],
    [REG.UV, big((source[0] + source[2]) << 4) | (big((source[1] + source[3]) << 4) << 16n)],
    [REG.XYZ2, big(((place[0] + ox + place[2]) << 4) - 8) | (big(((place[1] + oy + place[3]) << 4) - 8) << 16n) | (big(z) << 32n)],
  ];
}
/** A wrap loop: while the value is past the limit, step it back. */
const wrapDown = (x, limit, step) => { if (limit < x) do x = sub(x, step); while (limit < x); return x; };
const wrapUp = (x, limit, step) => { if (x < limit) do x = add(x, step); while (x < limit); return x; };

/** func_002243F8: the colour scale of the particles, from the camera's z. */
export const colourScale = (z, k) => f(quotient(f(sub(740, sub(1160, z)) * 128), 740) * k);

/** func_00223608: the particles' angles (D_003E0A30) and places (D_003E0AA0), for frame counter n. */
export function particles(angles, places, n, K) {
  const c = (address) => K.readFloatLE(address - 0x0036fb00);
  const r = n % 201;
  const shift = sub(f(r * 0.03125), c(0x0036fb0c));
  const outAngles = angles.map((a) => [...a]), outPlaces = places.map((p) => [...p]);
  for (let i = 0; i < 7; i++) {
    const k = i + 1;
    const a = outAngles[i];
    a[0] = add(a[0], f(k * c(0x0036fb10)));
    a[2] = add(a[2], f(k * c(0x0036fb14)));
    a[1] = add(a[1], f(k * c(0x0036fb18)));
    a[0] = wrapUp(wrapDown(a[0], c(0x0036fb0c), c(0x0036fb1c)), c(0x0036fb20), c(0x0036fb24));
    a[1] = wrapUp(wrapDown(a[1], c(0x0036fb28), c(0x0036fb2c)), c(0x0036fb30), c(0x0036fb34));
    a[2] = wrapUp(wrapDown(a[2], c(0x0036fb38), c(0x0036fb3c)), c(0x0036fb40), c(0x0036fb44));
    const square = f((7 - i) * (7 - i) * c(0x0036fb48));
    const radius = quotient(add(square, square), 64);
    const angle = wrapUp(wrapDown(add(radius, shift), c(0x0036fb48), c(0x0036fb4c)), c(0x0036fb50), c(0x0036fb54));
    outPlaces[i][0] = f(f(cosf(angle) * radius) * 0.5);
    outPlaces[i][1] = f(f(sinf(angle) * radius) * 0.5);
  }
  return { angles: outAngles, places: outPlaces };
}

/** RotMatrix(M+0x240, M, angle), TransMatrix(M+0x80, M+0x240, place), MulMatrix(M+0x40, M+0xC0, M+0x80). */
const objectMatrix = (block, angle, place) => mulMatrix(matrix(block, 0xc0), transMatrix(rotMatrix(matrix(block, 0), angle), place));

/** func_00223980 (first = true) or func_00223E48: the seven fans, as the writes of each fan's packet (null when clipped). */
export function fans(input, first) {
  const { data, block, clip, scale } = input;
  const at = (address) => address - 0x003dfb10;
  const ints = (address) => [0, 4, 8, 0x10, 0x14, 0x18].map((o) => data.readInt32LE(at(address) + o));
  const colour = ints(first ? 0x003e09f0 : 0x003e0a10).map((v) => clamp255(toInt(f(f(v * scale) * 0.015625))));
  const centre = colour.slice(0, 3), rim = colour.slice(3);
  const angles = [...Array(7).keys()].map((i) => vector(data, at(0x003e0a30) + i * 16));
  const places = [...Array(7).keys()].map((i) => vector(data, at(0x003e0aa0) + i * 16));
  const out = [];
  for (let i = 0; i < 7; i++) {
    const m = objectMatrix(block, angles[i], places[i]);
    const base = (first ? 0x003dfb10 : 0x003e0280) + i * 0x110;
    const vertices = [...Array(17).keys()].map((j) => vector(data, at(base) + j * 16));
    if (clipAll(vector(clip, 0), vector(clip, 0x10), m, vertices)) { out.push(null); continue; }
    const writes = [[REG.PRIM, 0x14dn]];
    const emit = (v, c) => {
      const { ints: p, q } = transformVertex(m, v);
      writes.push([REG.RGBAQ, big(c[0] | (c[1] << 8) | (c[2] << 16)) | 0x80000000n | (big(asBits(q)) << 32n)], [REG.XYZF2, pack(p[0], p[1], p[2])]);
    };
    // The first function sends the centre, sixteen rim vertices and the first rim vertex again;
    // the second sends its seventeen vertices, the first in the centre colour, and its second again.
    if (first) { emit(vertices[0], centre); for (let j = 1; j <= 16; j++) emit(vertices[j], rim); emit(vertices[1], rim); }
    else { for (let j = 0; j < 17; j++) emit(vertices[j], j === 0 ? centre : rim); emit(vertices[1], rim); }
    out.push(writes);
  }
  return { out, angles, places };
}

/** func_00222EE0 (size, fix, r, g, b, scale): a glow on particle 0's centre; returns its blend and rectangle writes. */
export function glow(input) {
  const { data, block, frame, K, screen, modes, size, fix, rgb, scale, alpha } = input;
  const c = (address) => K.readFloatLE(address - 0x0036fae8);
  const at = (address) => address - 0x003dfb10;
  let angle = f(add(49, frame & 0x1f) * c(0x0036faec));
  angle = wrapUp(wrapDown(angle, c(0x0036fae8), c(0x0036faf0)), c(0x0036faf4), c(0x0036faf8));
  const radius = f(49 * c(0x0036fafc));
  const place = vector(data, at(0x003e0aa0));
  place[0] = f(cosf(angle) * radius);
  place[1] = f(sinf(angle) * radius);
  const m = objectMatrix(block, vector(data, at(0x003e0a30)), place);
  const p = combine(m, vector(data, at(0x003dfb10)));
  const q = quotient(1, p[3]);
  const x = toInt(f(p[0] * q)) - 0x800, y = toInt(f(p[1] * q)) - 0x800;
  const width = screen.readInt32LE(0x14), height = screen.readInt32LE(0x18);
  const cx = toInt(add(f(x * scale), Math.trunc(width / 2))), cy = toInt(add(f(y * scale), Math.trunc(height / 2)));
  return {
    place,
    writes: [...blend(modes, 1, 0, fix), ...rectangle([cx - size, cy - Math.trunc(size / 2), size * 2, size], [0, 0, 0x80, 0x80], [...rgb, alpha], 1, 0xffffff, width, height)],
  };
}

/** func_0021E950: the 128 boxes; their new angles and places, and each drawn box's packet. */
export function boxes(input) {
  const { data, camera, tables, vars, K, block, modes } = input;
  const c = (address) => K.readFloatLE(address - 0x0036f998);
  const at = (address) => address - 0x003da4e0;
  const z = camera.readFloatLE(0x48);
  const frame = vars.readUInt32LE(0);
  let fade = 128;
  if (z < 672) {
    fade = f(quotient(f(sub(c(0x0036f998), sub(672, z)) * 128), c(0x0036f998)) * 4);
    if (128 < fade) fade = 128;
  }
  // A tile of 3 x 3 vertices (D_003DA4E0) sent as four strips of four (D_002B0D80), with a colour
  // (D_003DA570) and a texture coordinate pair (D_002B0DC0) per vertex; only the first eight
  // vertices are given to the clip test (t0 = 8 at 0x0021EC70).
  const vertices = [...Array(9).keys()].map((j) => vector(data, at(0x003da4e0) + j * 16));
  const colours = [...Array(9).keys()].map((j) => [0, 4, 8].map((o) => data.readInt32LE(at(0x003da570) + j * 16 + o)));
  const strips = [...Array(16).keys()].map((j) => tables.readInt32LE(j * 4));
  const st = [...Array(9).keys()].map((j) => [tables.readFloatLE(0x40 + j * 8), tables.readFloatLE(0x44 + j * 8)]);
  const clipMin = vector(camera, 0), clipMax = vector(camera, 0x10);
  const angles = [], places = [], out = [];
  for (let i = 0; i < 128; i++) {
    const n = i + 1;
    const angle = vector(data, at(0x003dae00) + i * 16);
    const place = vector(data, at(0x003da600) + i * 16);
    let turn = f(n * c(0x0036f99c));
    if ((frame & 1) === 0) turn = -turn;
    angle[2] = wrapUp(wrapDown(add(angle[2], turn), c(0x0036f9a0), c(0x0036f9a4)), c(0x0036f9a8), c(0x0036f9ac));
    const step = toInt(add(f(n * c(0x0036f9b0)), c(0x0036f9b4)));
    const front = add(z, c(0x0036f9b8));
    place[2] = sub(place[2], step);
    let near = 64, skip = false;
    const ahead = sub(front, place[2]);
    if (ahead < 192) { near = ahead; if (near < 0) skip = true; else near = quotient(f(near * 64), 192); }
    if (!skip) {
      const behind = sub(sub(place[2], z), 32);
      if (behind < 192) {
        near = behind;
        if (behind < 0) { place[2] = front; skip = true; } else near = quotient(f(near * 64), 192);
      }
    }
    angles.push(angle); places.push(place);
    if (skip) { out.push(null); continue; }
    const alpha = toInt(f(f((near < 0 ? 0 : 64 < near ? 64 : near) * fade) * 0.0078125));
    const m = objectMatrix(block, angle, place);
    if (clipAll(clipMin, clipMax, m, vertices.slice(0, 8))) { out.push(null); continue; }
    const writes = [...blend(modes, 1, 0, alpha)];
    for (let s = 0; s < 4; s++) {
      writes.push([REG.PRIM, 0x5cn]);
      for (let j = 0; j < 4; j++) {
        const index = strips[s * 4 + j];
        const { ints: p, q } = transformVertex(m, vertices[index]);
        const col = colours[index];
        writes.push([REG.RGBAQ, big(col[0] | (col[1] << 8) | (col[2] << 16)) | 0x80000000n | (big(asBits(q)) << 32n)],
          [REG.ST, big(asBits(f(st[index][0] * q))) | (big(asBits(f(st[index][1] * q))) << 32n)], [REG.XYZF2, pack(p[0], p[1], p[2])]);
      }
    }
    out.push(writes);
  }
  return { angles, places, out };
}

export function verify(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const result = { scales: [0, 0], updates: [0, 0], fans: [0, 0], clippedFans: 0, glows: [0, 0], boxes: [0, 0], boxState: [0, 0], skipped: 0, banners: [0, 0], bannerDraws: [0, 0], writes: [0, 0], problems: [], glowAlpha: new Set() };
  const problem = (text) => { if (result.problems.length < 20) result.problems.push(text); };
  const writesOf = (packet) => [...new GifPath().feed(packet.bytes)].filter((event) => event.kind === 'write');
  const compare = (expected, sent, tally, label) => {
    tally[1] += 1;
    result.writes[1] += expected.length;
    let equal = sent.length === expected.length, bad = null;
    expected.forEach(([reg, value], i) => { if (sent[i] && sent[i].reg === reg && sent[i].value === value) result.writes[0] += 1; else { equal = false; bad ??= i; } });
    if (equal) tally[0] += 1;
    else problem(`${label}: ${sent.length} writes sent, ${expected.length} computed${bad === null ? '' : `; write ${bad}: sent ${sent[bad] ? `reg 0x${sent[bad].reg.toString(16)} = 0x${sent[bad].value.toString(16)}` : 'nothing'}, computed reg 0x${expected[bad][0].toString(16)} = 0x${expected[bad][1].toString(16)}`}`);
  };
  const probes = trace.probes.filter((probe) => !probe.preroll);
  const until = (n) => { for (let j = n + 1; j < probes.length; j++) if (probes[j].at > probes[n].at) return probes[j].at; return trace.packets.length; };
  /** The writes of the packets sent after probe n and before the next probe that comes after a packet, filtered. */
  const packetsFrom = (n, test) => {
    const out = [];
    for (let at = probes[n].at; at < Math.min(until(n), trace.packets.length); at++) { const w = writesOf(trace.packets[at]); if (w.length && test(w)) out.push(w); }
    return out;
  };

  let expectedFan = null, boxState = null, lastBanner = null;
  probes.forEach((probe, n) => {
    if (![UPDATE, FAN1, FAN2, GLOW, BOXES, BANNER, BANNER_DRAW].includes(probe.pc)) return;
    if (probe.mem.some((range) => !range.bytes)) { problem(`frame ${probe.frame} 0x${probe.pc.toString(16)}: a probed range was not readable`); return; }
    const mem = probe.mem.map((range) => range.bytes);
    if (probe.pc === UPDATE) {
      const [data, vars, K, scale, camera] = mem;
      const want = colourScale(camera.readFloatLE(8), K.readFloatLE(0x58));
      result.scales[1] += 1;
      if (same(want, scale.readFloatLE(0))) result.scales[0] += 1; else problem(`frame ${probe.frame}: colour scale ${scale.readFloatLE(0)}, computed ${want}`);
      const at = (address) => address - 0x003dfb10;
      const angles = [...Array(7).keys()].map((i) => vector(data, at(0x003e0a30) + i * 16));
      const places = [...Array(7).keys()].map((i) => vector(data, at(0x003e0aa0) + i * 16));
      expectedFan = particles(angles, places, vars.readUInt32LE(0), K);
    } else if (probe.pc === FAN1 || probe.pc === FAN2) {
      const [data, block, clip, scale] = mem;
      const first = probe.pc === FAN1;
      const got = fans({ data, block, clip, scale: scale.readFloatLE(0) }, first);
      if (first && expectedFan) {
        result.updates[1] += 1;
        const equal = expectedFan.angles.every((a, i) => a.every((x, j) => same(x, got.angles[i][j]))) && expectedFan.places.every((p, i) => p.every((x, j) => same(x, got.places[i][j])));
        if (equal) result.updates[0] += 1; else problem(`frame ${probe.frame}: particles' angles or places differ from func_00223608's computed ones`);
      }
      expectedFan = null;
      const sent = packetsFrom(n, (w) => w[0].reg === REG.PRIM && w[0].value === 0x14dn);
      const drawn = got.out.filter((x) => x);
      result.clippedFans += got.out.length - drawn.length;
      if (sent.length !== drawn.length) problem(`frame ${probe.frame} fans ${first ? 1 : 2}: ${sent.length} fan packets sent, ${drawn.length} computed`);
      drawn.forEach((writes, i) => compare(writes, sent[i] ?? [], result.fans, `frame ${probe.frame} fans ${first ? 1 : 2} #${i}`));
    } else if (probe.pc === GLOW) {
      const [data, block, vars, K, screen, modes] = mem;
      const sent = packetsFrom(n, (w) => w[0].reg === REG.PABE || w[0].reg === REG.PRIM).flat();
      // func_00222EE0 never writes the fourth word of the colour it hands to vif1SetTexRect (sp+0x2C):
      // what the stack holds there is sent. Taken as the float 1.0 that was measured there every time.
      const sentAlpha = 0x3f800000;
      if (sent[3] && sent[3].reg === REG.RGBAQ) result.glowAlpha.add(`0x${(sent[3].value >> 24n).toString(16)}`);
      const want = glow({ data, block, frame: vars.readUInt32LE(0), K, screen, modes, size: probe.gpr[4] | 0, fix: probe.gpr[5] | 0, rgb: [probe.gpr[6] | 0, probe.gpr[7] | 0, probe.gpr[8] | 0], scale: fromBits(probe.fpr[12]), alpha: sentAlpha });
      compare(want.writes, sent, result.glows, `frame ${probe.frame} glow ${probe.gpr[4] | 0}`);
    } else if (probe.pc === BOXES) {
      const [data, camera, probedTables, vars, K, block, modes] = mem;
      // The strip and coordinate tables are constant data; a capture whose range stops at 0x80
      // misses the last coordinate pair, which is then taken from the executable.
      const tables = Buffer.alloc(0x88);
      probedTables.copy(tables);
      if (probedTables.length < 0x88) for (let o = probedTables.length; o < 0x88; o += 4) tables.writeUInt32LE(word(0x002b0d80 + o), o);
      if (boxState) {
        const at = (address) => address - 0x003da4e0;
        result.boxState[1] += 1;
        const equal = boxState.angles.every((a, i) => a.every((x, j) => same(x, vector(data, at(0x003dae00) + i * 16)[j]))) && boxState.places.every((p, i) => p.every((x, j) => same(x, vector(data, at(0x003da600) + i * 16)[j])));
        if (equal) result.boxState[0] += 1; else problem(`frame ${probe.frame}: the boxes' angles or places differ from the previous frame's computed ones`);
      }
      const got = boxes({ data, camera, tables, vars, K, block, modes });
      boxState = got;
      const drawn = got.out.filter((x) => x);
      result.skipped += got.out.length - drawn.length;
      const sent = packetsFrom(n, (w) => w[0].reg === REG.PABE && w.length > 2);
      if (sent.length !== drawn.length) problem(`frame ${probe.frame} boxes: ${sent.length} box packets sent, ${drawn.length} computed`);
      drawn.forEach((writes, i) => compare(writes, sent[i] ?? [], result.boxes, `frame ${probe.frame} box #${i}`));
    } else if (probe.pc === BANNER) {
      const [flags, , ended, camera] = mem;
      let on = flags.readInt32LE(0);
      if (800 < camera.readFloatLE(8) && on === 0) on = 1;
      lastBanner = null;
      if (on === 1) {
        let a = flags.readInt32LE(4);
        if (ended.readInt32LE(0) !== 0) { if (a > 0) a -= 1; } else a += 1;
        lastBanner = { frame: probe.frame, alpha: a < 0x71 ? a : 0x70 };
      }
    } else if (probe.pc === BANNER_DRAW) {
      const [rects, , screen, modes, vars] = mem;
      const alpha = probe.gpr[18] | 0;
      result.banners[1] += 1;
      if (lastBanner && lastBanner.alpha === alpha) result.banners[0] += 1; else problem(`frame ${probe.frame}: banner alpha ${alpha}, computed ${lastBanner ? lastBanner.alpha : 'no draw'}`);
      if (vars.readInt32LE(4) !== 1) return;
      const width = screen.readInt32LE(0x14), height = screen.readInt32LE(0x18);
      const place = [0, 4, 8, 12].map((o) => rects.readInt32LE(o));
      const source = [0, 4, 8, 12].map((o) => rects.readInt32LE(0x10 + o));
      if (PAL) for (const k of [1, 3]) place[k] = Math.trunc((place[k] * rects.readDoubleLE(0x20)) / rects.readDoubleLE(0x28));
      const want = [...blend(modes, 1, 5, alpha), ...rectangle(place, source, [alpha, alpha, alpha, 0x80], 1, 0xffffff, width, height)];
      const sent = packetsFrom(n, (w) => w[0].reg === REG.PABE || w[0].reg === REG.PRIM).flat();
      compare(want, sent, result.bannerDraws, `frame ${probe.frame} banner`);
    }
  });
  return result;
}

if (process.argv[1] && process.argv[1].endsWith('verify_opening_illegal.mjs')) {
  const r = verify(process.argv[2]);
  console.log(`colour scale ${r.scales[0]}/${r.scales[1]}   particle turns ${r.updates[0]}/${r.updates[1]}   fan packets ${r.fans[0]}/${r.fans[1]} (clipped ${r.clippedFans})   glows ${r.glows[0]}/${r.glows[1]} (rectangle alpha sent: ${[...r.glowAlpha].join(', ')})`);
  console.log(`box packets ${r.boxes[0]}/${r.boxes[1]} (not drawn ${r.skipped})   box state carried ${r.boxState[0]}/${r.boxState[1]}   banner alpha ${r.banners[0]}/${r.banners[1]}   banner draws ${r.bannerDraws[0]}/${r.bannerDraws[1]}   writes ${r.writes[0]}/${r.writes[1]}`);
  for (const text of r.problems) console.log(`  ! ${text}`);
  const whole = r.fans[1] > 0 && r.problems.length === 0;
  console.log(`verdict: ${whole ? `FOUND ${r.fans[0]} fans, ${r.glows[0]} glows, ${r.boxes[0]} boxes and ${r.bannerDraws[0]} banners of the illegal-disc scene, every write equal` : 'PARTIAL see the lines marked !'}`);
  process.exit(whole ? 0 : 3);
}
