// Every frame of a GS dump as the passes the parity rule draws, without the oracle: one pass per
// run of primitives sent under one GS state (the parser's draws), every primitive kept, in the
// units and form of frame.json (make_fixture.mjs).
//   node tools/parity/frame_passes.mjs <dump.gs> <out.json>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeState, mipLevels, mipOf, mipRegisters, nativeVertices } from './make_fixture.mjs';

const DIST = (process.env.WATSON_DIST ?? 'D:/CodingProjects/Watson/Server/dist').replace(/\\/g, '/').replace(/\/$/, '');
const { parseGsDump } = await import(`file:///${DIST}/gs/parse.js`);
const { decodeRegister } = await import(`file:///${DIST}/gs/registers.js`);

const KIND = { sprite: ['Sprites', 2], line: ['Lines', 2], linestrip: ['Lines', 2], triangle: ['Triangles', 3], tristrip: ['Triangles', 3], trifan: ['Triangles', 3] };
const hex = (n, width) => n.toString(16).padStart(width, '0');

export function framePasses(dump) {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'passes-')), 'parsed.jsonl');
  parseGsDump(dump, out, {});
  const draws = fs.readFileSync(out, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((r) => r.type === 'draw');
  fs.rmSync(path.dirname(out), { recursive: true, force: true });

  const targetOfBlock = new Map();
  for (const d of draws) {
    const block = Number(decodeRegister('FRAME', BigInt(d.state.FRAME)).FBP) * 32;
    targetOfBlock.set(block, `fb${hex(block, 4)}`);
  }
  let mipValues = null;
  const levelsOf = (ctxt) => mipLevels(mipValues ??= mipRegisters(fs.readFileSync(dump)), ctxt);
  const frames = [];
  for (const d of draws) {
    const kind = KIND[d.primitive];
    if (!kind) throw new Error(`draw ${d.index}: primitive ${d.primitive}`);
    const [primitive, size] = kind;
    const primitives = [];
    for (let i = 0; i < d.indices.length; i += size) primitives.push(d.indices.slice(i, i + size).map((at) => d.vertices[at]));
    const state = describeState(d.state, targetOfBlock, primitive, mipOf(d.vertices, levelsOf));
    if (state.smooth && primitive === 'Lines') state.skip ||= 'gouraud line';
    let texture = null;
    if (state.texture) {
      const { block, pages, ...rest } = state.texture;
      texture = rest;
    }
    const frame = (frames[d.frame] ??= { frame: d.frame, field: 0, passes: [] });
    frame.field ||= state.field;
    frame.passes.push({
      index: d.index, name: `draw-${d.index}`, target: targetOfBlock.get(state.block), primitive, field: state.field,
      scissor: state.scissor, blend: state.blend, antialias: state.antialias, depth: state.depth, texture, skip: state.skip,
      vertices: nativeVertices(primitive, primitives, state),
    });
  }
  return { capture: path.basename(dump, '.gs'), frames };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dump, out] = process.argv.slice(2);
  if (!dump || !out) { console.error('usage: node tools/parity/frame_passes.mjs <dump.gs> <out.json>'); process.exit(2); }
  const result = framePasses(dump);
  fs.writeFileSync(out, JSON.stringify(result));
  console.log(`${result.frames.length} frames, ${result.frames.reduce((n, f) => n + f.passes.length, 0)} passes, in ${out}`);
}
