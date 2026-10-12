// Why the parity rule skips passes of a GS dump, and which states they carry.
//   node tools/parity/skip_report.mjs <dump.gs> [--frames a-b]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeState } from './make_fixture.mjs';

const DIST = (process.env.WATSON_DIST ?? 'D:/CodingProjects/Watson/Server/dist').replace(/[\\]/g, '/').replace(/\/$/, '');
const { parseGsDump } = await import(`file:///${DIST}/gs/parse.js`);
const { decodeRegister } = await import(`file:///${DIST}/gs/registers.js`);

const KIND = { sprite: 'Sprites', line: 'Lines', linestrip: 'Lines', triangle: 'Triangles', tristrip: 'Triangles', trifan: 'Triangles' };
const hex = (n, width = 1) => n.toString(16).padStart(width, '0');
const reg = (state, name) => decodeRegister(name, BigInt(state[name]));

export function readDraws(dump) {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'skip-')), 'parsed.jsonl');
  parseGsDump(dump, out, {});
  const draws = fs.readFileSync(out, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((r) => r.type === 'draw');
  fs.rmSync(path.dirname(out), { recursive: true, force: true });
  return draws;
}

function bump(map, key, draw) {
  const at = map.get(key) ?? { count: 0, firstFrame: draw.frame, firstDraw: draw.index, lastFrame: draw.frame };
  at.count++;
  at.lastFrame = draw.frame;
  map.set(key, at);
}

export function reportDraws(draws) {
  const targetOfBlock = new Map();
  for (const d of draws) {
    const block = reg(d.state, 'FRAME').FBP * 32;
    targetOfBlock.set(block, `fb${hex(block, 4)}`);
  }
  const frames = new Set();
  const reasons = new Map(), blends = new Map(), textures = new Map(), features = new Map();
  let free = 0;
  for (const d of draws) {
    frames.add(d.frame);
    const primitive = KIND[d.primitive] ?? 'Triangles';
    const described = describeState(d.state, targetOfBlock, primitive);
    const key = described.skip ?? '(none)';
    if (!described.skip) free++;
    bump(reasons, key, d);

    const prim = reg(d.state, 'PRIM'), alpha = reg(d.state, 'ALPHA'), zbuf = reg(d.state, 'ZBUF');
    const frame = reg(d.state, 'FRAME'), tex0 = reg(d.state, 'TEX0'), tex1 = reg(d.state, 'TEX1');
    const target = targetOfBlock.get(frame.FBP * 32);
    const primBits = `IIP${prim.IIP} TME${prim.TME} FGE${prim.FGE} ABE${prim.ABE} AA1${prim.AA1} FST${prim.FST}`;
    const alphaText = `A${alpha.A} B${alpha.B} C${alpha.C} D${alpha.D} FIX${alpha.FIX}`;
    const textureId = prim.TME ? `t${hex(tex0.TBP0, 4)}-${tex0.TBW}-${tex0.PSM}-${tex0.TW}x${tex0.TH}` : '-';
    if (prim.ABE || (prim.AA1 && primitive !== 'Sprites')) bump(blends, `${alphaText} | ${primBits}`, d);
    if (prim.TME) bump(textures, `${textureId} TBP0=0x${hex(tex0.TBP0)} TBW=${tex0.TBW} PSM=0x${hex(tex0.PSM, 2)} TW=${tex0.TW} TH=${tex0.TH} MXL=${tex1.MXL} MMIN=${tex1.MMIN} MMAG=${tex1.MMAG} LCM=${tex1.LCM}`, d);

    const flags = [];
    if (reg(d.state, 'PABE').PABE) flags.push('PABE');
    if (reg(d.state, 'FBA').FBA) flags.push('FBA');
    if (prim.TME && (tex1.MMIN > 1 || tex1.MXL > 0)) flags.push('mip');
    if (zbuf.PSM !== 0) flags.push(`ZBUF.PSM=0x${hex(0x30 | zbuf.PSM, 2)}`);
    if (prim.TME && tex0.PSM === 2) flags.push('TEX0.PSM=0x02');
    if (!reg(d.state, 'COLCLAMP').CLAMP) flags.push('COLCLAMP=0');
    if (reg(d.state, 'DTHE').DTHE) flags.push('DTHE');
    if (prim.TME && (reg(d.state, 'TEXA').AEM || tex0.PSM !== 0)) flags.push(`TEXA(AEM${reg(d.state, 'TEXA').AEM} TA0=${reg(d.state, 'TEXA').TA0} TA1=${reg(d.state, 'TEXA').TA1 ?? '-'})`);
    for (const flag of flags) {
      bump(features, `${flag} | target ${target} | texture ${textureId} | ${alphaText} | ${primBits} | ${d.primitive}`, d);
    }
  }
  return { frames: frames.size, passes: draws.length, free, reasons, blends, textures, features };
}

export function formatReport(report, title) {
  const lines = [`## ${title}`, `${report.frames} frames, ${report.passes} passes, ${report.free} with no skip reason`, ''];
  const section = (name, map) => {
    lines.push(`### ${name}`);
    for (const [key, at] of [...map].sort((a, b) => b[1].count - a[1].count)) {
      lines.push(`- ${at.count} x ${key}  (first frame ${at.firstFrame} draw ${at.firstDraw}, last frame ${at.lastFrame})`);
    }
    lines.push('');
  };
  section('Skip reasons', report.reasons);
  section('Blends (ALPHA with FIX and PRIM bits)', report.blends);
  section('Textures', report.textures);
  section('Flagged states', report.features);
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const dump = args.find((a) => !a.startsWith('--') && !/^\d+-\d+$/.test(a));
  const at = args.indexOf('--frames');
  if (!dump) { console.error('usage: node tools/parity/skip_report.mjs <dump.gs> [--frames a-b]'); process.exit(2); }
  let draws = readDraws(dump);
  if (at >= 0) {
    const [a, b] = args[at + 1].split('-').map(Number);
    draws = draws.filter((d) => d.frame >= a && d.frame <= b);
  }
  console.log(formatReport(reportDraws(draws), path.basename(dump, '.gs') + (at >= 0 ? ` frames ${args[at + 1]}` : '')));
}
