import { spuRegister } from './sound_trace.mjs';

const BASE = 0x1f900000;
const byName = new Map();
for (let offset = 0; offset < 0x800; offset += 2) {
  const address = BASE + offset;
  const r = spuRegister(address);
  if (r.kind === 'unknown') continue;
  const key = `${r.core ?? 'x'}.${r.voice ?? '-'}.${r.name}`;
  if (!byName.has(key)) byName.set(key, address);
}

export const regAddress = (core, voice, name) => {
  const address = byName.get(`${core ?? 'x'}.${voice ?? '-'}.${name}`);
  if (address === undefined) throw new Error(`no SPU2 register ${core}.${voice}.${name}`);
  return address;
};

export function makeRegisters(initial = null) {
  const values = new Map();
  if (initial) for (let offset = 0; offset + 2 <= initial.length && offset < 0x800; offset += 2) values.set(BASE + offset, initial.readUInt16LE(offset));
  return { values, log: [] };
}

export function write(regs, address, value) {
  const v = value & 0xffff;
  regs.values.set(address, v);
  regs.log.push({ address, value: v });
}

export const read = (regs, address) => regs.values.get(address) ?? 0;

export function setParam(regs, core, voice, name, value) {
  write(regs, regAddress(core, voice, name), value);
}

export function setAddr(regs, core, voice, byteAddress) {
  const half = byteAddress >>> 1;
  write(regs, regAddress(core, voice, 'SSAH'), half >>> 16);
  write(regs, regAddress(core, voice, 'SSAL'), half & 0xffff);
}

export function setSwitch(regs, core, name, bits) {
  write(regs, regAddress(core, null, `${name}0`), bits & 0xffff);
  write(regs, regAddress(core, null, `${name}1`), (bits >>> 16) & 0xffff);
}

export function getSwitch(regs, core, name) {
  return read(regs, regAddress(core, null, `${name}0`)) | (read(regs, regAddress(core, null, `${name}1`)) << 16);
}

export const LIBSD_BASE = 0x80000;
const STATE = 0x90000;
const SIZE_TABLE = 0x8f7e8;
const PRESET_TABLE = 0x8f810;
const PRESET_SIZE = 0x44;
const REGISTER_ATTR = 0x19a;
const EFFECT_FIELDS = [
  { at: 0x04, address: 0x172 }, { at: 0x06, address: 0x174 },
  { at: 0x08, volume: 'IIR_VOL' }, { at: 0x0a, volume: 'COMB1_VOL' }, { at: 0x0c, volume: 'COMB2_VOL' }, { at: 0x0e, volume: 'COMB3_VOL' },
  { at: 0x10, volume: 'COMB4_VOL' }, { at: 0x12, volume: 'WALL_VOL' }, { at: 0x14, volume: 'APF1_VOL' }, { at: 0x16, volume: 'APF2_VOL' },
  ...Array.from({ length: 20 }, (_, k) => ({ at: 0x18 + 2 * k, address: 0x176 + 2 * k })),
  { at: 0x40, volume: 'IN_COEF_L' }, { at: 0x42, volume: 'IN_COEF_R' },
];

export function makeLibsd(image) {
  const u32 = (address) => image.readUInt32LE(address - LIBSD_BASE);
  const u16 = (address) => image.readUInt16LE(address - LIBSD_BASE);
  const write32 = (address, value) => image.writeUInt32LE(value >>> 0, address - LIBSD_BASE);
  return { image, u32, u16, write32 };
}

const coreRegister = (core, offset) => 0x1f900000 + core * 0x400 + offset;
const attrOf = (regs, core) => read(regs, coreRegister(core, REGISTER_ATTR));

export function getEffectAttr(lib, regs, core) {
  return {
    core,
    mode: lib.u32(STATE + 0x24 + 20 * core),
    depthL: read(regs, regAddress(core, null, 'EVOLL')),
    depthR: read(regs, regAddress(core, null, 'EVOLR')),
    delay: lib.u32(STATE + 0x2c + 20 * core),
    feedback: lib.u32(STATE + 0x30 + 20 * core),
  };
}

function writePreset(lib, regs, core, preset) {
  const flags = preset.readUInt32LE(0);
  EFFECT_FIELDS.forEach((field, bit) => {
    if (flags !== 0 && !((flags >>> bit) & 1)) return;
    const value = preset.readUInt16LE(field.at);
    if (field.volume) write(regs, regAddress(core, null, field.volume), value);
    else {
      const wide = (value << 2) >>> 0;
      write(regs, coreRegister(core, 2 * field.address), wide >>> 16);
      write(regs, coreRegister(core, 2 * field.address + 2), wide & 0xffff);
    }
  });
}

export function setEffectAttr(lib, regs, core, attr) {
  const events = [];
  let mode = attr.mode;
  let clear = false;
  let saved = 0;
  if (mode & 0x100) {
    mode &= ~0x100;
    clear = true;
    saved = lib.u32(STATE + 0x24 + 20 * core);
  }
  if (mode >= 10) return { result: -1, events };
  if (mode >= 7) throw new Error(`effect mode ${mode} (echo, delay, pipe) is not modelled`);
  lib.write32(STATE + 0x24 + 20 * core, mode);
  const end = ((read(regs, coreRegister(core, 0x33c)) << 17) | 0x1ffff) >>> 0;
  const size = (mode) => lib.u32(SIZE_TABLE + 4 * mode) * 8;
  const start = (end - (size(mode) - 1)) >>> 0;
  lib.write32(STATE + 0xc0 + 4 * core, start);
  const preset = Buffer.from(lib.image.subarray(PRESET_TABLE + PRESET_SIZE * mode - LIBSD_BASE, PRESET_TABLE + PRESET_SIZE * (mode + 1) - LIBSD_BASE));
  const enabled = (attrOf(regs, core) & 0x80) !== 0;
  const fill = (m) => m !== 0 && events.push({ fill: { core, start: (end - (size(m) - 1)) >>> 0, bytes: size(m), transferred: Math.ceil(size(m) / 64) * 64 } });
  if (enabled) {
    write(regs, coreRegister(core, REGISTER_ATTR), attrOf(regs, core) & 0xff7f);
    if (clear) fill(saved);
  }
  write(regs, regAddress(core, null, 'EVOLL'), attr.depthL);
  write(regs, regAddress(core, null, 'EVOLR'), attr.depthR);
  writePreset(lib, regs, core, preset);
  write(regs, regAddress(core, null, 'ESAH'), (start >>> 17) & 0xffff);
  write(regs, regAddress(core, null, 'ESAL'), (start >>> 1) & 0xffff);
  if (clear) fill(mode);
  if (enabled) write(regs, coreRegister(core, REGISTER_ATTR), attrOf(regs, core) | 0x80);
  return { result: 0, events };
}
