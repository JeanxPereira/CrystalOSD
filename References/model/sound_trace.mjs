import fs from 'node:fs';
import zlib from 'node:zlib';

const num = (s) => Number.parseInt(s, 16);

const VOICE_PARAMS = ['VOLL', 'VOLR', 'PITCH', 'ADSR1', 'ADSR2', 'ENVX', 'VOLXL', 'VOLXR'];
const VOICE_ADDRS = ['SSAH', 'SSAL', 'LSAXH', 'LSAXL', 'NAXH', 'NAXL'];
const CORE_REGS = {
  0x180: 'PMON0', 0x182: 'PMON1', 0x184: 'NON0', 0x186: 'NON1', 0x188: 'VMIXL0', 0x18a: 'VMIXL1', 0x18c: 'VMIXEL0',
  0x18e: 'VMIXEL1', 0x190: 'VMIXR0', 0x192: 'VMIXR1', 0x194: 'VMIXER0', 0x196: 'VMIXER1', 0x198: 'MMIX', 0x19a: 'ATTR',
  0x19c: 'IRQAH', 0x19e: 'IRQAL', 0x1a0: 'KON0', 0x1a2: 'KON1', 0x1a4: 'KOFF0', 0x1a6: 'KOFF1', 0x1a8: 'TSAH', 0x1aa: 'TSAL',
  0x1ac: 'DATA', 0x1ae: 'REG_1AE', 0x1b0: 'ADMAS',
  0x2e0: 'ESAH', 0x2e2: 'ESAL', 0x33c: 'EEA', 0x33e: 'REG_33E', 0x340: 'ENDX0', 0x342: 'ENDX1', 0x344: 'STATX',
};
const REVERB_ADDRS = ['APF1_SIZE', 'APF2_SIZE', 'SAME_L_DST', 'SAME_R_DST', 'COMB1_L_SRC', 'COMB1_R_SRC', 'COMB2_L_SRC',
  'COMB2_R_SRC', 'SAME_L_SRC', 'SAME_R_SRC', 'DIFF_L_DST', 'DIFF_R_DST', 'COMB3_L_SRC', 'COMB3_R_SRC', 'COMB4_L_SRC',
  'COMB4_R_SRC', 'DIFF_L_SRC', 'DIFF_R_SRC', 'APF1_L_DST', 'APF1_R_DST', 'APF2_L_DST', 'APF2_R_DST'];
const CORE_VOLUMES = ['MVOLL', 'MVOLR', 'EVOLL', 'EVOLR', 'AVOLL', 'AVOLR', 'BVOLL', 'BVOLR', 'MVOLXL', 'MVOLXR',
  'IIR_VOL', 'COMB1_VOL', 'COMB2_VOL', 'COMB3_VOL', 'COMB4_VOL', 'WALL_VOL', 'APF1_VOL', 'APF2_VOL', 'IN_COEF_L', 'IN_COEF_R'];
const SPDIF = { 0x7c0: 'SPDIF_OUT', 0x7c2: 'SPDIF_IRQINFO', 0x7c6: 'SPDIF_MODE', 0x7c8: 'SPDIF_MEDIA', 0x7cc: 'SPDIF_PROTECT' };

export function spuRegister(address) {
  const seg = address >>> 16;
  if (seg === 0x1f80) return { core: 0, kind: 'ps1', voice: null, name: `PS1_${(address & 0xffff).toString(16)}` };
  if (seg !== 0x1f90) return { core: null, kind: 'unknown', voice: null, name: `ADDR_${address.toString(16)}` };
  const mem = address & 0xffff;
  if (mem >= 0x800) return { core: null, kind: 'unknown', voice: null, name: `ADDR_${address.toString(16)}` };
  if (mem >= 0x7c0) return { core: null, kind: 'spdif', voice: null, name: SPDIF[mem] ?? `SPDIF_${mem.toString(16)}` };
  if (mem >= 0x760) {
    const core = mem >= 0x788 ? 1 : 0;
    const index = (mem - 0x760 - core * 0x28) >> 1;
    return { core, kind: 'corevol', voice: null, name: CORE_VOLUMES[index] ?? `REG_${mem.toString(16)}` };
  }
  const core = (mem >> 10) & 1;
  const off = mem & 0x3ff;
  if (off < 0x180) return { core, kind: 'voice', voice: off >> 4, name: VOICE_PARAMS[(off & 0xf) >> 1] };
  if (off >= 0x1c0 && off < 0x2e0) {
    const at = off - 0x1c0;
    return { core, kind: 'voiceaddr', voice: Math.floor(at / 12), name: VOICE_ADDRS[(at % 12) >> 1] };
  }
  if (off >= 0x2e4 && off < 0x33c) {
    const at = off - 0x2e4;
    return { core, kind: 'reverb', voice: null, name: `${REVERB_ADDRS[at >> 2]}${at & 2 ? 'L' : 'H'}` };
  }
  return { core, kind: 'core', voice: null, name: CORE_REGS[off] ?? `REG_${off.toString(16)}` };
}

export function registerLabel(address) {
  const r = spuRegister(address);
  const core = r.core === null ? '' : `c${r.core}.`;
  return `${core}${r.voice !== null ? `v${r.voice}.` : ''}${r.name}`;
}

function readText(file) {
  if (file.endsWith('.gz')) return zlib.gunzipSync(fs.readFileSync(file)).toString('utf8');
  if (!fs.existsSync(file) && fs.existsSync(`${file}.gz`)) return zlib.gunzipSync(fs.readFileSync(`${file}.gz`)).toString('utf8');
  return fs.readFileSync(file, 'utf8');
}

const gprOf = (hex) => {
  const out = [];
  for (let i = 0; i + 8 <= hex.length; i += 8) out.push(Number.parseInt(hex.slice(i, i + 8), 16) >>> 0);
  return out;
};

export function readSpuTrace(file) {
  const trace = { header: null, end: null, frames: [], writes: [], probes: [], pads: [], dmas: [], rams: [] };
  for (const line of readText(file).split('\n')) {
    if (line === '') continue;
    const r = JSON.parse(line);
    if (r.type === 'header') trace.header = r;
    else if (r.type === 'end') trace.end = r;
    else if (r.type === 'frame') trace.frames.push(r);
    else if (r.type === 'write') trace.writes.push({ captureFrame: r.captureFrame, frame: r.frame, sample: r.sample, cycle: r.cycle, pc: num(r.pc), address: num(r.address), value: num(r.value), tsa: r.tsa === undefined ? undefined : num(r.tsa) });
    else if (r.type === 'probe') trace.probes.push({ ...r, pcValue: num(r.pc), gpr: gprOf(r.gpr) });
    else if (r.type === 'pad') trace.pads.push(r);
    else if (r.type === 'dma') trace.dmas.push({ ...r, tsaValue: num(r.tsa) });
    else if (r.type === 'ram') trace.rams.push(r);
  }
  if (trace.header === null) throw new Error(`${file}: no header record`);
  if (trace.end === null) throw new Error(`${file}: no end record`);
  for (const [key, list] of [['writes', trace.writes], ['dmas', trace.dmas], ['probes', trace.probes]]) {
    if (Number.isInteger(trace.end[key]) && trace.end[key] !== list.length) throw new Error(`${file}: end record counts ${trace.end[key]} ${key}, the file holds ${list.length}`);
  }
  return trace;
}

export function rpcCommands(trace, handlerPc = 0x90868) {
  return trace.probes
    .filter((p) => p.cpu === 'iop' && p.pcValue === handlerPc)
    .map((p) => {
      const buffer = Buffer.from(p.mem[0].hex, 'hex');
      const words = [];
      for (let k = 1; k <= 5; k++) words.push(buffer.readUInt32LE(4 * k));
      return { captureFrame: p.captureFrame, sample: p.sample, cycle: p.cycle, id: p.gpr[4] >>> 0, words };
    });
}

export function diffWrites(expected, actual) {
  const n = Math.max(expected.length, actual.length);
  for (let i = 0; i < n; i++) {
    const e = expected[i], a = actual[i];
    if (!e || !a || e.captureFrame !== a.captureFrame || e.address !== a.address || e.value !== a.value) return { index: i, expected: e, actual: a };
  }
  return null;
}
