// Records, for every clock frame the JS model runs, the named state it starts from and the values
// it computes on the way (camera, rods, orbs, the rest of the frame, the state it leaves). The model
// is not edited: when its modules load, `frame`, `scene`, `camera`, `transform`, `refracted`,
// `textured` and `reflected` are renamed and an exported wrapper of the same name is put in front,
// which hands the call to the recorder. Loaded with `node --import` it records whatever runs
// (verify_frame.mjs included) and reports the count on exit; export_fixture.mjs writes the records.
// Schema: export_fixture.mjs.
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
export const REFERENCES = new URL('../../References/', import.meta.url).href;
const { floatBits, matrix, ints, apply } = await import(`${REFERENCES}model/clock_math.mjs`);

const PROBE = Symbol.for('crystalclock.sceneProbe');
const WRAPPED = {
  'clock_frame.mjs': ['frame', 'scene', 'transform', 'refracted', 'textured', 'reflected'],
  'clock_camera.mjs': ['camera'],
  'clock_menus.mjs': ['menus', 'between', 'endOfFrame'],
  'clock_rest.mjs': ['menuStep'],
  'clock_cubes.mjs': ['cubes'],
};

const wrap = (source, names, file) => names.reduce((text, name) => {
  const head = new RegExp(`^export function ${name}\\(`, 'gm');
  const found = text.match(head)?.length ?? 0;
  if (found !== 1) throw new Error(`${file}: expected one "export function ${name}(", found ${found}`);
  return text.replace(head, `export function ${name}(...args) { const probe = globalThis[Symbol.for('crystalclock.sceneProbe')]; `
    + `return probe ? probe('${name}', ${name}$model, args) : ${name}$model(...args); }\nfunction ${name}$model(`);
}, source);

registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    const file = Object.keys(WRAPPED).find((name) => url.toLowerCase() === `${REFERENCES}model/${name}`.toLowerCase());
    if (!file) return result;
    return { ...result, source: wrap(String(result.source), WRAPPED[file], file) };
  },
});

// ---- values as JSON: floats as their 32-bit pattern, integers as numbers ------------------------

export const hex = (x) => `0x${floatBits(x).toString(16).padStart(8, '0')}`;
const hexes = (list) => list.map(hex);
const rows = (m) => m.map(hexes);
const ramp = (b) => ({ length: b.readInt32LE(0), counter: b.readInt32LE(4), changed: b.readInt32LE(8), state: b.readInt32LE(12) });
const rgba = (b, at = 0) => ints(b, at);
const fl = (b, at = 0) => hex(b.readFloatLE(at));
const int = (b) => b.readInt32LE(0);
const float = (b) => fl(b);
const named = (names) => (b) => Object.fromEntries(names.map((name, i) => [name, fl(b, i * 4)]));
const rectangle = (b) => ({
  colour: rgba(b), x0: b.readInt32LE(0x10), y0: b.readInt32LE(0x14), u0: b.readInt32LE(0x18), v0: b.readInt32LE(0x1c),
  x1: b.readInt32LE(0x20), y1: b.readInt32LE(0x24), u1: b.readInt32LE(0x28), v1: b.readInt32LE(0x2c),
  z: b.readInt32LE(0x30), blend: b.readInt32LE(0x34), textured: b.readInt32LE(0x38),
});
const entry = (b, at) => ({ x: fl(b, at), y: fl(b, at + 4), z: fl(b, at + 8), colour: rgba(b, at + 0x10) });
const ring = (b) => ({ head: b.readInt32LE(0), count: b.readInt32LE(4), full: b.readInt32LE(8), entries: Array.from({ length: 50 }, (_, n) => entry(b, 0x10 + n * 0x20)) });

/** A rod record (readRod in clock_frame.mjs) as JSON. */
export const rodRecord = (rod) => ({
  number: rod.number, faces: rod.faces, local: rows(rod.local), sx: hex(rod.sx), sy: hex(rod.sy), sz: hex(rod.sz),
  base: rod.base, strength: hex(rod.strength), textured: rod.textured, pair: hexes(rod.pair), refraction: hex(rod.refraction),
  reflection: rod.reflection, extra: rod.extra,
});
const template = (b) => rodRecord({
  number: b.readInt32LE(0), faces: b.readInt32LE(4), local: matrix(b, 0x20), sx: b.readFloatLE(0x68), sy: b.readFloatLE(0x6c), sz: b.readFloatLE(0x70),
  base: ints(b, 0x80), strength: b.readFloatLE(0x90), textured: ints(b, 0xa0), pair: [b.readFloatLE(0xb0), b.readFloatLE(0xb4)],
  refraction: b.readFloatLE(0xb8), reflection: ints(b, 0xc0), extra: ints(b, 0xd0),
});

/** One decoder per piece of clock_memory.mjs the clock screen reads; names from its comments and the facts pages. */
export const PIECES = {
  time: (b) => ({ ms: fl(b, 0), seconds: b.readInt32LE(4), minutes: b.readInt32LE(8), hours: b.readInt32LE(12) }),
  eased: (b) => ({ secondHand: b.readInt16LE(0), hourHand: b.readInt16LE(2), progress: fl(b, 4), fraction: fl(b, 8) }),
  orbConstants: named(['minuteFactor', 'fractionEasing']),
  orbColour: rgba,
  orbColours: (b) => Array.from({ length: 7 }, (_, k) => rgba(b, k * 16)),
  mode: int,
  screen: (b) => ({ width: b.readInt32LE(0), height: b.readInt32LE(4) }),
  spriteFade: ramp,
  state: (b) => ({
    currentRod: b.readInt32LE(0), secondsAngle: b.readInt16LE(4), rodAngle: b.readInt16LE(6),
    rods: Array.from({ length: 12 }, (_, i) => ({ appearance: fl(b, 0x10 + i * 0x30), progress: fl(b, 0x14 + i * 0x30), base: rgba(b, 0x20 + i * 0x30), reflection: rgba(b, 0x30 + i * 0x30) })),
    accent: rgba(b, 0x250), fourth: rgba(b, 0x260), progressTarget: fl(b, 0x270), accentFrame: rgba(b, 0x280), currentTarget: rgba(b, 0x290),
  }),
  orbRandom: (b) => ints(b, 0, 7),
  template,
  rings: (b) => Array.from({ length: 7 }, (_, k) => ring(b.subarray(k * 0x650, (k + 1) * 0x650))),
  scene: (b) => ({ scale: fl(b, 0), leaving: b.readInt32LE(4), field: b.readInt32LE(8) }),
  proportions: named(['ax', 'ay']),
  position: (b) => hexes([0, 4, 8, 12].map((o) => b.readFloatLE(o))),
  direction: (b) => hexes([0, 4, 8, 12].map((o) => b.readFloatLE(o))),
  up: (b) => hexes([0, 4, 8, 12].map((o) => b.readFloatLE(o))),
  rotation: (b) => hexes([0, 4, 8, 12].map((o) => b.readFloatLE(o))),
  clearColour: rgba,
  tint: rectangle,
  cameraOffset: float,
  zmax: float,
  cameraFactor: float,
  greyRamp: ramp,
  greys: (b) => ints(b, 0, 3),
  counter: int,
  tubeConstants: named(['near', 'turn', 'scroll', 'ripple', 'scrollEnd', 'turnEnd', 'far', 'radius']),
  level: int,
  blurRecord: rectangle,
  copyRecord: rectangle,
  vignetteRamp: ramp,
  vignetteLength: int,
  overlayLevel: int,
  fadeRecord: rectangle,
  ringRecord: (b) => ({ alpha: b.readInt32LE(0), cx: b.readInt32LE(4), cy: b.readInt32LE(8), rx: b.readInt32LE(12), ry: b.readInt32LE(16), z: b.readInt32LE(20) }),
  appearance: ramp,
  colours: (b) => ({ base: rgba(b, 0), reflection: rgba(b, 0x10), fourth: rgba(b, 0x20), currentReflection: rgba(b, 0x30) }),
  cycleCounters: (b) => ({ base: { index: b.readInt32LE(0), wait: b.readInt32LE(4) }, accent: { index: b.readInt32LE(8), wait: b.readInt32LE(12) }, last: b.readInt32LE(16) }),
  cycleTables: (b) => ({ base: Array.from({ length: 6 }, (_, n) => rgba(b, n * 16)), accent: Array.from({ length: 3 }, (_, n) => rgba(b, 0x60 + n * 16)) }),
  logicConstants: named(['rodEasing', 'secondsEasing', 'progressStep']),
  scaleTarget: float,
  scaleFactor: float,
  timeFilled: int,
  // Read by the clock screen too: the buffer drawn to, the letterbox bars, the right column, the
  // ramp and tail the blur level is computed from, item 0 (bars), the entry from the opening.
  index: int,
  wide: int,
  item0: int,
  bars: rectangle,
  column: rectangle,
  menuRamp: ramp,
  // Display environment 0's clear colour: the R, G, B, A bytes of the RGBAQ (GS register 0x01) of its clear
  // packet at +0x100. Written once, colour 0, by sceGsSetDefClear (HDD 0x00288E28) on env + 0xE0, called by
  // sceGsSetDefDBuff (0x00289018), called by InitDraw (0x0020BD58) with env 0x1F0A70 and the clear flag. The
  // clock's display function (func_002341C8) writes its clear colour into environment 1's clear (+0x1F0) only.
  display: (b) => ({ firstClear: [0, 1, 2, 3].map((i) => b[0x100 + i]) }),
  tail: int,
  body: int,
  cubeRamp: ramp,
  videoMode: int,
  // The text (func_00226300, facts/text.md section 5): items 6 to 0xB are the date and time it formats, 0xD the
  // time format, 0xE the date format (module_clock_get_config_item); the settings word holds the language
  // (bits 4 to 8, config_get_osd_language) and summer time (bit 29, config_get_daylight_saving).
  configItems: (b) => ints(b, 0, 20),
  mechaconParam: (b) => [b.readUInt32LE(0), b.readUInt32LE(4)],
  pad: (b) => ({ held: b.readUInt32LE(0), pressed: b.readUInt32LE(4), released: b.readUInt32LE(8), repeating: b.readUInt32LE(12) }),
  disc: int,
  screenCode: int,
  configPage: (b) => ({ word0: b.readInt32LE(0), entries: b.readUInt32LE(4), count: b.readInt32LE(8), titleWidth: b.readInt32LE(0xc), selected: b.readInt32LE(0x10),
    word14: b.readInt32LE(0x14), level: b.readInt32LE(0x18), ramp: ramp(b.subarray(0x1c, 0x2c)), word2c: b.readInt32LE(0x2c), word30: b.readInt32LE(0x30), glow: b.readInt32LE(0x34) }),
  configRamp: ramp,
  configEntries: (b) => Array.from({ length: 9 }, (_, n) => { const e = b.subarray(n * 0x38, n * 0x38 + 0x38); return {
    id: e.readInt32LE(0), valueCount: e.readInt32LE(4), valueIndex: e.readInt32LE(8), item: e.readInt32LE(0xc), valueTable: e.readUInt32LE(0x10),
    enter: e.readUInt32LE(0x14), stringCallback: e.readUInt32LE(0x18), frameCallback: e.readUInt32LE(0x1c), confirm: e.readUInt32LE(0x20), cancel: e.readUInt32LE(0x24),
    focus: e.readUInt32LE(0x28), rest: ints(e, 0x2c, 3) }; }),
  mainMenu: (b) => ({ word0: b.readInt32LE(0), items: b.readUInt32LE(4), count: b.readInt32LE(8), word0c: b.readInt32LE(0xc), selected: b.readInt32LE(0x10),
    word14: b.readInt32LE(0x14), ramp: ramp(b.subarray(0x18, 0x28)) }),
  versionRamp: ramp, dialogRamp: ramp, firstRunRamp: ramp,
  pagePointers: (b) => ints(b, 0, 5),
  entryActive: int,
  menuLengths: (b) => ints(b, 0, 3),
  listConstants: named(['rate', 'divisor', 'pulse', 'standing']),
  adjustFields: (b) => Array.from({ length: 6 }, (_, n) => ({ item: b.readInt32LE(n * 12), lowest: b.readInt32LE(n * 12 + 4), highest: b.readInt32LE(n * 12 + 8) })),
  configGate: int,
  configDirty: (b) => ints(b, 0, 3),
  rtcMirror: (b) => ints(b, 0, 6),
  cubeList: (b) => ({ pulse: fl(b, 0), pulsed: b.readInt32LE(4), position: b.readInt32LE(8), left: b.readInt32LE(0xc), speed: b.readInt32LE(0x10), slowing: b.readInt32LE(0x14) }),
  cubeColours: (b) => ({ selected: rgba(b, 0), plain: rgba(b, 0x10), live: rgba(b, 0x20) }),
  cubeRecord: template,
  spin: int,
  cubeConstants: named(['standingFade', 'ringFade', 'twoPi', 'turn', 'quarter', 'minusPi']),
  centreFactors: named(['cube', 'layer']),
  cubeView: (b) => rows(matrix(b, 0)),
  cubeScreen: (b) => rows(matrix(b, 0)),
  layerClear: rgba,
  addRecord: rectangle, halfRecord: rectangle, chainRecord: rectangle,
};

export const STAGE_PIECES = ['time', 'mode', 'overlayLevel', 'vignetteRamp', 'menuRamp', 'tail', 'body', 'appearance', 'state', 'scaleTarget',
  'timeFilled', 'scene', 'greyRamp', 'fadeRecord', 'copyRecord', 'spriteFade', 'configPage', 'configRamp', 'configEntries', 'mainMenu',
  'versionRamp', 'dialogRamp', 'firstRunRamp', 'pagePointers', 'entryActive', 'menuLengths', 'listConstants', 'screenCode', 'adjustFields',
  'configGate', 'configDirty', 'cubeRamp', 'cubeList', 'cubeColours', 'cubeRecord', 'spin', 'cubeConstants', 'centreFactors', 'cubeView',
  'cubeScreen', 'layerClear', 'addRecord', 'halfRecord', 'chainRecord', 'configItems', 'item0', 'screen', 'level', 'videoMode', 'mechaconParam',
  'rtcMirror', 'disc', 'pad'];

// ---- the text: the font library's context and the program's font state ----------------------

const fontRows = (b, at) => [0, 16, 32, 48].map((r) => [0, 4, 8, 12].map((c) => fl(b, at + r + c)));
/** The program's font state at state + 0x1000 (facts/text.md section 4), 0x160 bytes. */
export const fontState = (b) => ({
  lineHeight: b.readInt32LE(0), fixed: b.readInt32LE(4), percent: b.readInt32LE(8), pitch: b.readInt32LE(0xc), decoration: b.readInt32LE(0x1c),
  clip: b.readInt32LE(0x20), tv: fl(b, 0x24), ratio: fl(b, 0x28), locate: [fl(b, 0x30), fl(b, 0x34)], colour: [0x40, 0x44, 0x48, 0x4c].map((o) => fl(b, o)),
  blank: b.readInt32LE(0xa8), ascent: b.readInt32LE(0xb0), dirty: b.readInt32LE(0xb4), matrix: fontRows(b, 0x110),
});
/** The library's context (readContext of verify_text2.mjs): the cache list and its layout; addresses in the font data as offsets. */
export const fontContext = (ctx) => {
  const offset = (address) => (address === 0 ? 0 : address - ctx.data);
  return {
    list: ctx.list.map((e) => ({ code: e.code, loaded: e.loaded, cell: e.cell, block: offset(e.block) })),
    format: ctx.format, cellW: ctx.cellW, cellH: ctx.cellH, cells: ctx.cells, width: ctx.width, height: ctx.height, logW: ctx.logW, logH: ctx.logH,
    setUp: ctx.setUp, block: offset(ctx.block), memory: ctx.memory, texture: ctx.texture, table: ctx.table,
  };
};
const textStrings = (strings) => strings.map((s) => ({ text: [...s.text], measuring: s.measuring, own: fontState(s.own), at: s.at }));

export const decode = (m) => Object.fromEntries(Object.entries(PIECES).filter(([name]) => m.has(name)).map(([name, read]) => [name, read(m.at(name))]));
const decodeSome = (m, names) => Object.fromEntries(names.filter((n) => n in PIECES && m.has(n)).map((n) => [n, PIECES[n](m.at(n))]));

// ---- GS writes as named values ----------------------------------------------------------------

/**
 * The writes of a packet stream as draws: registers are carried from write to write; every
 * XYZF2/XYZ2 is a vertex holding the registers written since the last PRIM. RGBAQ written before
 * a draw's first vertex in a packet of no vertex is kept as the draw's `header`.
 */
export function gsDecoder() {
  const reg = { prim: 0, fbp: 0, seen: new Set(), values: {} };
  const set = (name, fields) => { reg.seen.add(name); reg.values[name] = fields; };
  return (writes) => {
    const vertices = [];
    for (const [r, value] of writes) {
      const lo = Number(value & 0xffffffffn), hi = Number(value >> 32n);
      if (r === 0x00) { reg.prim = Number(value & 0x7ffn); reg.seen = new Set(); reg.values = {}; }
      else if (r === 0x01) set('rgbaq', { r: lo & 0xff, g: (lo >>> 8) & 0xff, b: (lo >>> 16) & 0xff, a: lo >>> 24, q: `0x${hi.toString(16).padStart(8, '0')}` });
      else if (r === 0x02) set('st', { s: `0x${lo.toString(16).padStart(8, '0')}`, t: `0x${hi.toString(16).padStart(8, '0')}` });
      else if (r === 0x03) set('uv', { u: lo & 0xffff, v: lo >>> 16 });
      else if (r === 0x4c) reg.fbp = Number(value & 0x1ffn);
      else if (r === 0x04 || r === 0x05) {
        const position = r === 0x04 ? { x: lo & 0xffff, y: lo >>> 16, z: hi & 0xffffff, f: hi >>> 24 } : { x: lo & 0xffff, y: lo >>> 16, z: hi >>> 0 };
        vertices.push({ ...(reg.values.rgbaq ?? {}), ...(reg.values.st ?? {}), ...(reg.values.uv ?? {}), ...position });
      }
    }
    return { prim: reg.prim, fbp: reg.fbp, colour: reg.values.rgbaq ?? null, vertices };
  };
}

// ---- the recorder -----------------------------------------------------------------------------

const PHASES = ['rod', 'extra pass 0', 'extra pass 1'];

function faceGeometry(face, edgeTerm) {
  return {
    index: face.index, flag: face.flag, normal: hexes(face.normal), edge: hex(edgeTerm(face)),
    vertices: face.vertices.map((v) => {
      const lo = Number(v.xyz & 0xffffffffn), hi = Number(v.xyz >> 32n);
      return { eye: hexes(v.eye), screen: hexes(v.on), q: hex(v.q), s: hex(v.s), t: hex(v.t), x: lo & 0xffff, y: lo >>> 16, z: hi & 0xffffff, f: hi >>> 24 };
    }),
  };
}

/** The draws of the frame outside the rods: by the part of the frame function and their label. */
function rest(packets) {
  const decodeWrites = gsDecoder();
  const head = { background: [], blur: [], copies: [], tint: null, vignette: [], fade: null, blurAfter: [], bars: [], column: null };
  const orbPackets = [];
  let part = null;
  for (const packet of packets) {
    if (packet.mark) { part = packet.mark; continue; }
    if (!packet.writes) continue;
    const draw = decodeWrites(packet.writes);
    if (packet.label?.startsWith('orb:')) { orbPackets.push({ label: packet.label, ...draw }); continue; }
    if (packet.kind !== 'vertex' || draw.vertices.length === 0) continue;
    const shown = { label: packet.label, prim: draw.prim, vertices: draw.vertices };
    const label = packet.label;
    if (label === 'background: strip') head.background.push(shown);
    else if (label.startsWith('blur:')) (part === 'head' ? head.blur : head.blurAfter).push(shown);
    else if (label === 'copy') head.copies.push(shown);
    else if (label === 'tint') head.tint = shown;
    else if (label === 'vignette') head.vignette.push(shown);
    else if (label === 'fade') head.fade = shown;
    else if (label === 'bars') head.bars.push(shown);
    else if (label === 'column') head.column = shown;
  }
  return { head, orbPackets };
}

/** One orb's twelve packets: two sends of trail header, trail, glow (2), disc (2). */
function orbSends(packets) {
  const labels = ['orb: trail header', 'orb: trail', 'orb: glow', 'orb: glow', 'orb: disc', 'orb: disc'];
  if (packets.length !== 12 || packets.some((p, i) => p.label !== labels[i % 6])) throw new Error(`an orb's packets are not the twelve expected: ${packets.map((p) => p.label).join(', ')}`);
  const send = (p) => ({
    trail: { header: p[0].colour, prim: p[1].prim, vertices: p[1].vertices },
    glow: { prim: p[3].prim, vertices: p[3].vertices },
    disc: { prim: p[5].prim, vertices: p[5].vertices },
  });
  return [send(packets.slice(0, 6)), send(packets.slice(6))];
}

const STAGES = ['cubes', 'menuStep', 'menus', 'endOfFrame'];

export function recorder(model, { stagesOnly = false } = {}) {
  const frames = [];
  let current = null;
  let pendingBetween = null;
  const tags = new WeakMap();

  const onTransform = (args, out) => {
    const [rod, view] = args;
    if (rod.faces === 0) { current.orbCentres.push({ cx: hex(out.cx), cy: hex(out.cy), cz: hex(out.cz) }); return; }
    let entry = current.rods.get(rod.number);
    if (!entry) {
      entry = { number: rod.number, record: rodRecord(rod), local: rows(rod.local), matrix: rows(rod.local.map((row) => apply(view, row))),
        centre: { cx: hex(out.cx), cy: hex(out.cy), cz: hex(out.cz) }, pieces: [], whole: rod, passes: 0,
        faces: out.faces.map((face) => ({ ...faceGeometry(face, model.edgeTerm), refracted: [], textured: [], reflected: [] })) };
      current.rods.set(rod.number, entry);
    }
    let piece = 'whole';
    if (rod === entry.whole) entry.passes += 1;
    else {
      piece = rod.local === entry.whole.local ? 'A' : 'B';
      if (entry.passes === 1) entry.pieces.push({ piece, record: rodRecord(rod), faces: out.faces.map((face) => faceGeometry(face, model.edgeTerm)) });
    }
    for (const face of out.faces) tags.set(face, { entry, piece, phase: PHASES[entry.passes - 1] });
  };

  const onEmit = (name, args, out) => {
    const tag = tags.get(args[0]);
    if (!tag) return;
    const draw = gsDecoder()(out);
    const call = { phase: tag.phase, piece: tag.piece };
    if (name === 'refracted') Object.assign(call, { extra: args[4], centre: [hex(args[2]), hex(args[3])] });
    else if (name === 'textured') Object.assign(call, { colour: args[1], ds: hex(args[2]), dt: hex(args[3]) });
    else Object.assign(call, { colour: args[1] });
    tag.entry.faces[args[0].index][name].push({ ...call, prim: draw.prim, vertices: draw.vertices });
  };

  const finish = (record, out, m) => {
    if (stagesOnly) return { index: frames.length, between: record.between, input: record.stageInput, expect: { stages: record.stages, cubes: record.cubeDraws } };
    const { head, orbPackets } = rest(out.packets);
    const orbOrder = out.order.filter((name) => name.startsWith('orb ')).map((name) => Number(name.slice(4)));
    if (orbOrder.length !== record.orbCentres.length || orbPackets.length !== 12 * orbOrder.length) throw new Error('the orbs drawn do not match the orbs placed');
    const orbs = orbOrder.map((k, n) => ({ k, drawn: n, centre: record.orbCentres[n], sends: orbSends(orbPackets.slice(12 * n, 12 * n + 12)) }))
      .sort((a, b) => a.k - b.k)
      .map(({ k, drawn, centre, sends }) => {
        const r = record.ringsAfterScene[k];
        const at = r.entries[r.head];
        return { k, drawn, centre, position: [at.x, at.y, at.z], colour: at.colour, ring: r, trail: sends.map((s) => s.trail), sprites: sends.map(({ glow, disc }) => ({ glow, disc })) };
      });
    const rods = [...record.rods.values()].map(({ whole, passes, ...rod }) => rod);
    return {
      index: frames.length,
      between: record.between,
      input: record.text ? { ...record.input, font: record.text.font } : record.input,
      expect: { drawOrder: out.order, camera: record.camera, rods, orbs, head, after: decode(m), ...(record.text ? { text: record.text.strings } : {}), stages: record.stages, cubes: record.cubeDraws },
    };
  };

  const probe = (name, fn, args) => {
    if (name === 'frame') {
      const snapshot = args[0];
      if (!snapshot.memory || snapshot.view) return fn(...args);
      const m = snapshot.memory;
      // The font context the frame starts from, and the strings of the date and time and of the button hint.
      const held = snapshot.text;
      // The program's font state is the one at the frame's first string: what it carries in (the matrix, the escapes'
      // widths) under what the frame's Font_SetRatio, Font_SetColor and Font_SetLocate have just written.
      const first = [...held?.strings.text ?? [], ...held?.strings.hint ?? []][0];
      const text = held ? { font: { ...fontContext(held.state.ctx), state: first ? fontState(first.own) : null },
        strings: { text: textStrings(held.strings.text), hint: textStrings(held.strings.hint), pages: textStrings(held.strings.pages ?? []) } } : null;
      const record = { input: stagesOnly ? null : decode(m), stageInput: stagesOnly ? decodeSome(m, STAGE_PIECES) : null, text, camera: null, rods: new Map(), orbCentres: [],
        ringsAfterScene: null, inScene: false, stages: Object.fromEntries(STAGES.map((stage) => [stage, null])), cubeDraws: [], between: pendingBetween };
      pendingBetween = null;
      current = record;
      let out;
      try { out = fn(...args); } finally { current = null; }
      frames.push(finish(record, out, m));
      return out;
    }
    if (name === 'between') {
      const m = args[0];
      const before = decodeSome(m, STAGE_PIECES);
      const out = fn(...args);
      pendingBetween = { before, after: decodeSome(m, STAGE_PIECES), notes: [...args[1]] };
      return out;
    }
    if (!current) return fn(...args);
    if (STAGES.includes(name)) {
      const m = name === 'cubes' ? args[0].m : args[0];
      const from = name === 'cubes' ? args[0].packets.length : 0;
      const before = decodeSome(m, STAGE_PIECES);
      const out = fn(...args);
      current.stages[name] = { before, after: decodeSome(m, STAGE_PIECES), ...(name === 'menus' ? { notes: [...args[1]] } : {}) };
      if (name === 'cubes') {
        const decodeWrites = gsDecoder();
        for (const packet of args[0].packets.slice(from)) {
          if (!packet.writes) continue;
          const draw = decodeWrites(packet.writes);
          if (draw.vertices.length) current.cubeDraws.push({ label: packet.label, prim: draw.prim, fbp: draw.fbp, vertices: draw.vertices });
        }
      }
      return out;
    }
    if (name === 'camera') {
      const out = fn(...args);
      if (!current.camera) current.camera = { screen: rows(out.screen), view: rows(out.view), cameraOffset: hex(args[0].float('cameraOffset')) };
      return out;
    }
    if (name === 'scene') {
      current.inScene = true;
      let out;
      try { out = fn(...args); } finally { current.inScene = false; }
      current.ringsAfterScene = PIECES.rings(args[0].m.at('rings'));
      return out;
    }
    const out = fn(...args);
    if (!current.inScene) return out;
    if (name === 'transform') onTransform(args, out);
    else onEmit(name, args, out);
    return out;
  };
  return { probe, frames };
}

/** Installs a recorder; the model is loaded through the hooks above. */
export async function install(options) {
  const model = await import(`${REFERENCES}model/clock_frame.mjs`);
  const made = recorder(model, options);
  globalThis[PROBE] = made.probe;
  return made;
}

// Preloaded with --import: record whatever runs, say how much on exit.
if (process.execArgv.some((arg) => arg.includes('instrument.mjs'))) {
  const { frames } = await install();
  process.on('exit', () => process.stderr.write(`scene probe: ${frames.length} frames recorded\n`));
}
