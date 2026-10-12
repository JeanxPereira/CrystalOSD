// The five glass cubes of the opening's illegal-disc scene (HDD OSD 1.10U, func_00222678 0x00222678,
// called five times by func_00222DD8): verify_opening_cubes.mjs with what func_00222678 does
// otherwise than the intro's func_00220450. Same transform (func_00224EB8), coordinate generators
// and face emitter (func_002254E0); differences, read in the two functions and their per-vertex
// callbacks (D_002221F0 here, D_0021FEB8 in the intro):
//   - the refraction's scale (f13 of func_002246C8) is D_0036FAB8 = 0.8, not 1;
//   - the far-side mirror passes take 0, not -0.25 (the near side 0.5 in both);
//   - the fixed patterns' shifts and the near refraction's pull are D_0036FABC..D_0036FACC
//     (the same values as the intro's D_0036FA38..D_0036FA48);
//   - the buffer coordinates are not clamped to 0..0.625 and 0..0.875;
//   - colour mode 3 is colour x (lift x K1 + K2) with K from D_0036FAA0 (no factor 0.4 on the
//     lift), and green and blue are divided by 3 before the conversion to integers;
//   - no XYOFFSET packet before the passes, a ZBUF write instead.
//
//   0x00224EB8  entry of the transform: a2 = cube number
//   0x002229E8  the transform is done and the cube is not clipped: s0 = the cube's work record
//
// node verify_opening_illegal_cubes.mjs <trace.jsonl>
import { readTraceFor } from '../lib/trace.mjs';
// On a capture shared with other verifiers, only this verifier's probe records.
const readTrace = (file) => readTraceFor(file, PROBES);
import { GifPath } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/gif.js';
import { f, add as exactAdd, sub as exactSub, quotient as exactQuotient, root as exactRoot } from '../model/opening-lib.mjs';
import { apply, mul, vector, matrix, floatBits, toInt, pack, clipAll } from './verify_opening_lights_v2.mjs';

export const PROBES = [
  { pc: '0x00224eb8', ranges: ['0x002b1e20:0xf0', '0x002b0c20:0x70', '0x00370000:0x4', '0x0036fb60:0x24', '0x70000060:0x280', '0x002b2090:0xe0'] },
  { pc: '0x002229e8', ranges: ['s0:0x490', '0x002b1cd0:0x240', '0x002b2090:0xe0', '0x0036faa0:0x30', '0x0036fb80:0x4', '0x001f0ca0:0x1c', '0x002b0cc0:0xb0', '0x70000060:0x280'] },
];
const [ENTRY, READY] = PROBES.map((probe) => parseInt(probe.pc, 16));
const REG = { PRIM: 0, RGBAQ: 1, ST: 2, XYZF2: 4, ALPHA: 0x42, PABE: 0x49 };

// The ten passes, as func_00220450 builds them on its stack (0x00220450..0x0022076C) and calls
// them (0x00220800..0x002209B4): texture, blend on, blend mode, fixed alpha, antialias rule,
// coordinate mode, colour mode; the generator of the texture coordinates and its argument.
const PASSES = [
  { back: 1, texture: 'buffer of the other field', blend: 0, mode: 4, fix: 0x7a, edge: 1, screen: 1, colour: 2, make: 'refract', value: () => 0 },
  { back: 1, texture: 12, blend: 1, mode: 5, fix: 0x80, edge: 0, screen: 0, colour: 0, make: 'fixed', value: (k) => k[7] },
  { back: 1, texture: 10, blend: 1, mode: 8, fix: 0x2a, edge: 0, screen: 0, colour: 3, make: 'mirror', value: () => 0 },
  { back: 1, texture: 11, blend: 1, mode: 5, fix: 0x80, edge: 0, screen: 0, colour: 0, make: 'fixed', value: (k) => k[8] },
  { back: 1, texture: 10, blend: 1, mode: 8, fix: 0x2a, edge: 0, screen: 0, colour: 3, make: 'mirror', value: () => 0 },
  { back: 0, texture: 'extra buffer', blend: 0, mode: 4, fix: 0xf0, edge: 1, screen: 1, colour: 2, make: 'refract', value: (k) => k[9] },
  { back: 0, texture: 12, blend: 1, mode: 5, fix: 0x80, edge: 0, screen: 0, colour: 0, make: 'fixed', value: (k) => k[10] },
  { back: 0, texture: 10, blend: 1, mode: 8, fix: 0x40, edge: 0, screen: 0, colour: 3, make: 'mirror', value: () => 0.5 },
  { back: 0, texture: 11, blend: 1, mode: 5, fix: 0x80, edge: 0, screen: 0, colour: 0, make: 'fixed', value: (k) => k[11] },
  { back: 0, texture: 10, blend: 1, mode: 8, fix: 0x40, edge: 0, screen: 0, colour: 3, make: 'mirror', value: () => 0.5 },
];

// sceVu0 routines, in the order of their VU0 instructions; every operation cut toward zero.
const sub = (a, b) => a.map((x, i) => exactSub(x, b[i]));
const normalize = (v) => {
  const q = exactQuotient(1, exactRoot(exactAdd(exactAdd(f(v[0] * v[0]), f(v[1] * v[1])), f(v[2] * v[2]))));
  return [f(v[0] * q), f(v[1] * q), f(v[2] * q), 0];
};
const outer = (a, b) => [exactSub(f(a[1] * b[2]), f(b[1] * a[2])), exactSub(f(a[2] * b[0]), f(b[2] * a[0])), exactSub(f(a[0] * b[1]), f(b[0] * a[1])), 0];
const inner = (a, b) => exactAdd(exactAdd(f(a[0] * b[0]), f(a[1] * b[1])), f(a[2] * b[2]));
const sameFloats = (a, b) => a.every((x, i) => floatBits(x) === floatBits(b[i]));

/** The turn of a cube: its three angles advance by their rates and wrap (0x00224F08..0x00224FEC). */
function turn(angles, rates, k) {
  const out = angles.map((x, i) => exactAdd(x, rates[i]));
  for (let i = 0; i < 3; i++) {
    if (k[0] < out[i]) out[i] = exactSub(out[i], k[1 + i * 2]);
    if (out[i] < k[2]) out[i] = exactAdd(out[i], k[3 + i * 2]);
  }
  return out;
}

/** Everything func_00224EB8 and func_00224BC0 leave in the work record, from the matrices. */
function transform(input) {
  const { toWorld, toView, toScreen, vertices, faces, camera, colour } = input;
  const out = { world: [], eye: [], screen: [], q: [], ints: [], faces: [] };
  vertices.forEach((v) => {
    const world = apply(toWorld, v);
    out.world.push(world);
    out.eye.push(normalize(apply(toView, world)));
    const p = apply(toScreen, v);
    const q = exactQuotient(1, p[3]);
    const s = p.map((x) => f(x * q));
    out.q.push(q);
    out.screen.push(s);
    out.ints.push([toInt(s[0] * 16), toInt(s[1] * 16), toInt(s[2] * 16) >> 4, toInt(s[3] * 16)]);
  });
  faces.forEach((corners) => {
    const object = outer(sub(vertices[corners[1]], vertices[corners[0]]), sub(vertices[corners[2]], vertices[corners[0]]));
    const world = apply(toWorld, object);
    const view = apply(toView, world);
    const flat = (a, b) => normalize([exactSub(out.screen[a][0], out.screen[b][0]), exactSub(out.screen[a][1], out.screen[b][1]), 0, 0]);
    const a = flat(corners[0], corners[1]), b = flat(corners[0], corners[2]);
    out.faces.push({
      corners, object: normalize(object), world: normalize(world), view: normalize(view),
      facing: exactSub(f(a[0] * b[1]), f(a[1] * b[0])),
      colour: colour.map((x) => Math.min(Math.max(x, 0), 127)),
      edge: [],
    });
    const face = out.faces[out.faces.length - 1];
    for (const corner of corners) {
      const d = inner(face.world, normalize(sub(out.world[corner], camera)));
      face.edge.push(d < 0 ? -d : d);
    }
  });
  return out;
}

/** One pass's vertex packet (func_002254E0 with the callback at 0x0021FEB8). */
function pass(setup, cube, env) {
  const { k, width, height, field, centre, mirrors, fixed } = env;
  const writes = [];
  cube.faces.forEach((face, n) => {
    if ((face.facing < 0 ? 1 : 0) !== setup.back) return;
    // The face's four coordinate pairs.
    let pairs;
    if (setup.make === 'refract') {
      // func_002246C8: the vertex's place on the screen, pushed along the face's normal and pulled toward the cube's centre.
      const pull = setup.value(k);
      pairs = face.corners.map((corner) => {
        const s = cube.screen[corner], q = cube.q[corner];
        const u = exactAdd(exactAdd(exactSub(s[0], 2048), f(Math.trunc(width / 2))), f(f(f(f(face.view[0] * 320) * k[6]) * q) * 4));
        const v = exactAdd(exactAdd(exactSub(s[1], 2048), f(Math.trunc(height / 2))), f(f(f(f(face.view[1] * 112) * k[6]) * q) * 4));
        let x = exactAdd(u, f(exactSub(s[0], centre[0]) * pull)), y = exactAdd(v, f(exactSub(s[1], centre[1]) * pull));
        if (exactSub(width, 1) < x) x = exactSub(width, 1); else if (x < 1) x = 1;
        if (exactSub(height, 1) < y) y = exactSub(height, 1); else if (y < 1) y = 1;
        return [x, y];
      });
    } else if (setup.make === 'mirror') {
      // func_00224938: the direction to the vertex, moved along the face's normal; y and x change places.
      const d = inner(face.object, mirrors[n]);
      const amount = f(-(d < 0 ? -d : d) * setup.value(k));
      const moved = [f(face.view[0] * amount), f(face.view[1] * amount), f(face.view[2] * amount), face.view[3]];
      pairs = face.corners.map((corner) => {
        const e = normalize(cube.eye[corner]);
        return [exactAdd(exactAdd(moved[1], e[1]), 0.5), exactAdd(exactAdd(moved[0], e[0]), 0.5)];
      });
    } else {
      // func_00224B10: the same four pairs for every face, shifted.
      const shift = setup.value(k);
      pairs = fixed.map((pair) => [exactAdd(pair[0], shift), exactSub(pair[1], shift)]);
    }
    const edge = setup.edge !== 0 && (k[12] < face.facing || setup.back !== 0) ? 1 : 0;
    writes.push([REG.PRIM, BigInt((edge << 7) | 0x14 | (setup.blend << 6))]);
    face.corners.forEach((corner, i) => {
      const lift = f(f(exactSub(1, face.edge[i]) * exactSub(1, face.edge[i])) * 0.5);
      let q, s, t;
      if (setup.screen === 1) {
        // Coordinates in the 1024 x 256 buffer, kept inside the picture; half a line up on the odd field for the near faces.
        const half = setup.back === 0 && field !== 0 ? 0.5 : 0;
        q = 1;
        s = f(pairs[i][0] * 0.0009765625);
        t = f(exactSub(pairs[i][1], half) * 0.00390625);
      } else {
        q = cube.q[corner];
        s = f(pairs[i][0] * q);
        t = f(pairs[i][1] * q);
      }
      let rgb;
      const fix = f(setup.fix);
      if (setup.colour === 0) rgb = [0x80, 0x80, 0x80];
      else if (setup.colour === 2) rgb = [0, 1, 2].map((c) => toInt(f(f(exactAdd(face.colour[c], f(lift * 32)) * fix) * 0.0078125)));
      else {
        const scaled = [0, 1, 2].map((c) => f(f(f(face.colour[c] * exactAdd(f(lift * k[c * 2]), k[1 + c * 2])) * fix) * 0.0078125));
        rgb = [toInt(scaled[0]), toInt(exactQuotient(scaled[1], 3)), toInt(exactQuotient(scaled[2], 3))];
      }
      rgb = rgb.map((x) => (x > 0x80 ? 0x80 : x < 0 ? 0 : x));
      writes.push([REG.RGBAQ, BigInt(rgb[0] | (rgb[1] << 8) | (rgb[2] << 16)) | 0x80000000n | (BigInt(floatBits(q)) << 32n)],
        [REG.ST, BigInt(floatBits(s)) | (BigInt(floatBits(t)) << 32n)], [REG.XYZF2, pack(cube.ints[corner][0], cube.ints[corner][1], cube.ints[corner][2])]);
    });
  });
  return writes;
}

export function verify(traceFile) {
  const trace = readTrace(traceFile);
  if (!trace.complete) throw new Error(`${traceFile}: ${trace.reason}`);
  const result = { cubes: 0, clipped: 0, turns: [0, 0], matrices: [0, 0], centres: [0, 0], values: [0, 0], packets: [0, 0], writes: [0, 0], blends: [0, 0], faces: { back: 0, front: 0 }, problems: [] };
  const problem = (text) => { if (result.problems.length < 16) result.problems.push(text); };
  const writesOf = (packet) => [...new GifPath().feed(packet.bytes)].filter((event) => event.kind === 'write');
  const floats = (buffer, at, count) => [...Array(count).keys()].map((i) => buffer.readFloatLE(at + i * 4));
  const check = (tally, equal, text) => { tally[1] += 1; if (equal) tally[0] += 1; else problem(text); };

  const probes = trace.probes.filter((probe) => !probe.preroll && (probe.pc === ENTRY || probe.pc === READY));
  probes.forEach((entry, n) => {
    if (entry.pc !== ENTRY) return;
    const ready = probes[n + 1] && probes[n + 1].pc === READY ? probes[n + 1] : null;
    const index = entry.gpr[6];
    if (!ready) { if (probes[n + 1]) result.clipped += 1; return; }
    if ([...entry.mem, ...ready.mem].some((range) => !range.bytes)) { problem(`frame ${entry.frame}: a probed range was not readable`); return; }
    const [motion, , , wraps] = entry.mem.map((range) => range.bytes);
    const [record, tables, shape, constants, edgeLimit, screen, modes, block] = ready.mem.map((range) => range.bytes);
    const where = `frame ${entry.frame} cube ${index}`;
    result.cubes += 1;

    // The turn and the place.
    const angles = turn(floats(motion, 0x50 + index * 16, 3), floats(motion, 0xa0 + index * 16, 3), floats(wraps, 0, 8));
    check(result.turns, sameFloats(angles, floats(record, 0x450, 3)), `${where}: angles ${floats(record, 0x450, 3)}, computed ${angles}`);
    const place = floats(motion, index * 16, 4);
    const turned = matrix(block, 0x240), toWorld = matrix(block, 0x80), toScreen = matrix(block, 0x40), toView = matrix(block, 0x100), worldToScreen = matrix(block, 0xc0);
    const moved = [turned[0], turned[1], turned[2], [exactAdd(turned[3][0], place[0]), exactAdd(turned[3][1], place[1]), exactAdd(turned[3][2], place[2]), turned[3][3]]];
    check(result.matrices, moved.every((row, i) => sameFloats(row, toWorld[i])), `${where}: the matrix to the world is not the turn moved to the cube's place`);
    check(result.matrices, mul(worldToScreen, moved).every((row, i) => sameFloats(row, toScreen[i])), `${where}: the matrix to the screen is not world-to-screen x the cube's matrix`);
    const projected = apply(toScreen, vector(tables, 0xe0));
    const w = exactQuotient(1, projected[3]);
    // D_002B2090: the origin of the cube on the screen (0x002250A8..0x00225100: z, x, y times 1/w; w set to 1).
    const centre = [f(projected[0] * w), f(projected[1] * w), f(projected[2] * w), 1];
    check(result.centres, sameFloats(centre, vector(shape, 0)), `${where}: centre ${vector(shape, 0)}, computed ${centre}`);

    const vertices = [...Array(8).keys()].map((i) => vector(shape, 0x10 + i * 16));
    const faces = [...Array(6).keys()].map((i) => [0, 4, 8, 12].map((o) => tables.readInt32LE(0x40 + i * 16 + o)));
    const camera = vector(entry.mem[1].bytes, 0x40);
    const cube = transform({ toWorld, toView, toScreen, vertices, faces, camera, colour: vector(shape, 0x90 + index * 16) });
    for (let i = 0; i < 8; i++) {
      check(result.values, sameFloats(cube.world[i], vector(record, 0x80 + i * 16)), `${where} vertex ${i}: world position differs`);
      check(result.values, sameFloats(cube.eye[i], vector(record, 0x100 + i * 16)), `${where} vertex ${i}: direction from the eye differs`);
      check(result.values, sameFloats(cube.screen[i], vector(record, i * 16)), `${where} vertex ${i}: screen position differs`);
      check(result.values, floatBits(cube.q[i]) === record.readUInt32LE(0x200 + i * 4), `${where} vertex ${i}: 1/w differs`);
      check(result.values, [0, 1, 2].every((c) => cube.ints[i][c] === record.readInt32LE(0x180 + i * 16 + c * 4)), `${where} vertex ${i}: integer position differs`);
    }
    cube.faces.forEach((face, i) => {
      check(result.values, sameFloats(face.object.slice(0, 3), floats(record, 0x220 + i * 16, 3)), `${where} face ${i}: normal differs: ${floats(record, 0x220 + i * 16, 3)}, computed ${face.object}`);
      check(result.values, sameFloats(face.world.slice(0, 3), floats(record, 0x280 + i * 16, 3)), `${where} face ${i}: normal in the world differs`);
      check(result.values, sameFloats(face.view.slice(0, 3), floats(record, 0x2e0 + i * 16, 3)), `${where} face ${i}: normal in view differs`);
      check(result.values, floatBits(face.facing) === record.readUInt32LE(0x470 + i * 4), `${where} face ${i}: facing ${record.readFloatLE(0x470 + i * 4)}, computed ${face.facing}`);
      check(result.values, sameFloats(face.colour, vector(record, 0x3c0 + i * 16)), `${where} face ${i}: colour differs`);
      check(result.values, sameFloats(face.edge, floats(record, 0x340 + i * 16, 4)), `${where} face ${i}: edge terms ${floats(record, 0x340 + i * 16, 4)}, computed ${face.edge}`);
      result.faces[face.facing < 0 ? 'back' : 'front'] += 1;
    });

    // The ten vertex packets: each follows a packet that only switches PABE off.
    const until = probes[n + 2] ? probes[n + 2].at : trace.packets.length;
    const sent = [], blends = [];
    let lastBlend = null;
    for (let at = ready.at; at < until && sent.length < 10; at++) {
      const writes = writesOf(trace.packets[at]);
      const alpha = writes.find((write) => write.reg === REG.ALPHA);
      if (alpha) lastBlend = alpha.value;
      if (writes.length === 1 && writes[0].reg === REG.PABE && at + 1 < until && lastBlend !== null && sent.length < 10) {
        const next = writesOf(trace.packets[at + 1]);
        if (next.length === 0 || next[0].reg === REG.PRIM) { sent.push(next); blends.push(lastBlend); at += 1; }
      }
    }
    if (sent.length !== 10) { if (probes[n + 2]) problem(`${where}: ${sent.length} vertex packets found, 10 expected`); return; }
    const env = {
      k: [...floats(constants, 0, 12), edgeLimit.readFloatLE(0)], width: screen.readInt32LE(0x14), height: screen.readInt32LE(0x18), field: screen.readInt32LE(4), centre,
      mirrors: [...Array(6).keys()].map((i) => vector(tables, 0xf0 + i * 16)), fixed: [...Array(4).keys()].map((i) => floats(tables, i * 16, 2)),
    };
    PASSES.forEach((setup, p) => {
      const writes = pass(setup, cube, env);
      result.packets[1] += 1;
      result.writes[1] += writes.length;
      let equal = sent[p].length === writes.length, bad = null;
      writes.forEach(([reg, value], i) => { if (sent[p][i] && sent[p][i].reg === reg && sent[p][i].value === value) result.writes[0] += 1; else { equal = false; bad ??= i; } });
      if (equal) result.packets[0] += 1;
      else problem(`${where} pass ${p}: ${sent[p].length} writes sent, ${writes.length} computed${bad === null ? '' : `; write ${bad}: sent ${sent[p][bad] ? `reg 0x${sent[p][bad].reg.toString(16)} = 0x${sent[p][bad].value.toString(16)}` : 'nothing'}, computed reg 0x${writes[bad][0].toString(16)} = 0x${writes[bad][1].toString(16)}`}`);
      // The blend of the pass: the mode's selectors from the table and the fixed alpha (func_00225380).
      const mode = [0, 4, 8, 12].map((o) => modes.readInt32LE(setup.mode * 16 + o));
      const blend = BigInt(mode[0] | (mode[1] << 2) | (mode[2] << 4) | (mode[3] << 6)) | (BigInt(setup.fix) << 32n);
      check(result.blends, blends[p] === blend, `${where} pass ${p}: ALPHA 0x${blends[p].toString(16)}, computed 0x${blend.toString(16)}`);
    });
  });
  return result;
}

if (process.argv[1] && process.argv[1].endsWith('verify_opening_illegal_cubes.mjs')) {
  const result = verify(process.argv[2]);
  console.log(`cubes drawn: ${result.cubes}   left out by the clip test: ${result.clipped}   faces turned away ${result.faces.back}, turned to the camera ${result.faces.front}`);
  console.log(`  turn equal: ${result.turns[0]} of ${result.turns[1]}   matrices: ${result.matrices[0]} of ${result.matrices[1]}   centre on the screen: ${result.centres[0]} of ${result.centres[1]}`);
  console.log(`  values of the work record (vertices and faces) equal: ${result.values[0]} of ${result.values[1]}`);
  console.log(`  vertex packets equal: ${result.packets[0]} of ${result.packets[1]} (writes ${result.writes[0]} of ${result.writes[1]})   ALPHA of the pass: ${result.blends[0]} of ${result.blends[1]}`);
  for (const text of result.problems) console.log(`  ! ${text}`);
  const whole = result.cubes > 0 && result.problems.length === 0;
  console.log(`verdict: ${whole ? `FOUND ${result.cubes} cubes of the illegal-disc scene, every value and every write equal` : 'PARTIAL see the lines marked !'}`);
  process.exit(whole ? 0 : 3);
}
