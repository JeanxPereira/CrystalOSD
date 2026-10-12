import { moduleAddress } from './sound_snapshot.mjs';
import { makeRegisters, write, read, regAddress, setParam, setSwitch, getEffectAttr, setEffectAttr, LIBSD_BASE } from './sound_libsd.mjs';
import { SLOTS, CTX, VOICES, BANKS, SQ_CURRENT, CHANNEL_CURRENT, voiceVolumeOf } from './sound_osdsnd_sequencer.mjs';
import { rampWrites } from './sound_osdsnd_ramp.mjs';

const M = moduleAddress;
const BANK_FLAGS = M(0x98d0);
const EFFECT_TABLE_POINTER = M(0x921c);
const EFFECT_RECORD_POINTER = M(0x9210);
const TABLES = [[SLOTS, 0x660], [CTX, 0x10], [VOICES, 0x5a0], [BANK_FLAGS, 0x600]];
const PARAM_BASES = 0x8f690;

export const INIT_FIELDS = {
  0x6010: [], 0x6060: ['hd', 'bd'], 0x6090: ['bank', 'sq'], 0x60a0: ['tickRate'], 0x60c0: ['core', 'mode'],
  0x6130: ['slot', 'volume'], 0x6140: ['slot'], 0x6150: ['slot', 'mode', 'release'], 0x6200: [], 0x6310: ['bank', 'master'],
  0x8010: ['entry', 'value'], 0x8070: ['entry', 'value'],
};

const s16 = (v) => (v << 16) >> 16;
const u16 = (v) => v & 0xffff;

export function makeDriverState(snapshot, makeMemory, libsd) {
  for (const core of [0, 1]) for (const at of [0x24, 0x2c, 0x30]) libsd.write32(0x90000 + at + 20 * core, 0);
  return { mem: makeMemory(snapshot), regs: makeRegisters(), lib: libsd, spdif: null };
}

function paramAddress(lib, entry) {
  const core = entry & 1;
  const stride = (entry & 0x80) !== 0 ? 0x28 : 0x400;
  const base = lib.u32(PARAM_BASES + ((entry >> 6) & 0x3fc));
  return ((base + core * stride + ((entry & 0x3e) << 3)) & 0x1fffffff) >>> 0;
}

function sdInit(state) {
  const { regs, lib } = state;
  const w = (name, value, core = null, voice = null) => write(regs, regAddress(core, voice, name), value);
  w('SPDIF_MODE', 0x900);
  w('SPDIF_MEDIA', 0x200);
  w('SPDIF_7ca', 0x8);
  w('SPDIF_OUT', 0);
  w('SPDIF_OUT', 0x8000);
  for (const core of [0, 1]) for (const name of ['MVOLL', 'MVOLR']) w(name, 0, core);
  for (const core of [0, 1]) w('ADMAS', 0, core);
  for (const core of [0, 1]) w('ATTR', 0, core);
  for (const core of [0, 1]) w('ATTR', 0x8000, core);
  for (const core of [0, 1]) for (const name of ['MVOLL', 'MVOLR']) w(name, 0, core);
  for (const core of [0, 1]) { w('KOFF0', 0xffff, core); w('KOFF1', 0xff, core); }
  for (const name of ['PMON', 'NON']) for (const core of [0, 1]) { w(`${name}0`, 0, core); w(`${name}1`, 0, core); }
  w('ESAH', 0xe, 0); w('ESAL', 0xfff8, 0); w('ESAH', 0xf, 1); w('ESAL', 0xfff8, 1);
  w('TSAH', 0, 0); w('TSAL', 0x2800, 0);
  for (const value of [0x707, 0]) for (let k = 0; k < 8; k++) w('DATA', value, 0);
  w('ATTR', 0x8010, 0);
  w('ATTR', 0x8000, 0);
  for (let v = 0; v < 24; v++) {
    for (const [name, value] of [['VOLL', 0], ['VOLR', 0], ['PITCH', 0x3fff], ['ADSR1', 0], ['ADSR2', 0]]) for (const core of [1, 0]) w(name, value, core, v);
    for (const [name, value] of [['SSAH', 0], ['SSAL', 0x2800]]) for (const core of [1, 0]) w(name, value, core, v);
  }
  for (const core of [1, 0]) w('KON0', 0xffff, core);
  for (const core of [1, 0]) w('KON1', 0xff, core);
  for (const core of [1, 0]) w('KOFF0', 0xffff, core);
  for (const core of [1, 0]) w('KOFF1', 0xff, core);
  w('ENDX1', 0, 0); w('ENDX0', 0, 0);
  w('SPDIF_OUT', 0xc032);
  w('ATTR', 0xc000, 0);
  w('ATTR', 0xc001, 1);
  for (const core of [0, 1]) for (const name of ['VMIXL', 'VMIXR', 'VMIXEL', 'VMIXER']) { w(`${name}0`, 0xffff, core); w(`${name}1`, 0xff, core); }
  w('MMIX', 0xff0, 0); w('MMIX', 0xffc, 1);
  for (const core of [0, 1]) for (const name of ['MVOLL', 'MVOLR']) w(name, 0, core);
  for (const core of [0, 1]) for (const name of ['EVOLL', 'EVOLR']) w(name, 0, core);
  w('EEA', 0xe, 0); w('EEA', 0xf, 1);
  w('AVOLL', 0, 0); w('AVOLR', 0, 0); w('AVOLL', 0x7fff, 1); w('AVOLR', 0x7fff, 1);
  w('BVOLL', 0, 0); w('BVOLR', 0, 0); w('BVOLL', 0, 1); w('BVOLR', 0, 1);
}

function effectAttr(state, core, mutate) {
  const attr = getEffectAttr(state.lib, state.regs, core);
  mutate(attr);
  return setEffectAttr(state.lib, state.regs, core, attr);
}

function coreAttr(state, entry, value) {
  const { regs, lib } = state;
  const core = entry & 1;
  const attrAddress = regAddress(core, null, 'ATTR');
  const attr = read(regs, attrAddress);
  const kind = entry & ~1;
  if (kind === 0xa) {
    if (value !== 0) throw new Error(`SPDIF mode ${value} is not modelled`);
    write(regs, regAddress(null, null, 'SPDIF_MEDIA'), 0x200);
    write(regs, regAddress(null, null, 'SPDIF_OUT'), 0xc032);
    write(regs, regAddress(null, null, 'SPDIF_MODE'), 0x900);
  } else if (kind === 8) {
    write(regs, attrAddress, (attr & 0xc0ff) | ((value & 0x3f) << 8));
  } else {
    const bit = lib.u16(0x90000 + 0x12 + (entry & 0xe));
    write(regs, attrAddress, ((attr & ~(1 << bit)) | ((value & 1) << bit)) & 0xffff);
  }
}

export function initWrites(state, command) {
  const first = state.regs.log.length;
  const events = [];
  const { mem } = state;
  const [a, b, c] = command.words;
  switch (command.id) {
    case 0x6010: {
      for (const [at, length] of TABLES) mem.ram.fill(0, at, at + length);
      for (const pointer of [EFFECT_TABLE_POINTER, EFFECT_RECORD_POINTER]) {
        const target = mem.u32(pointer);
        if (target !== 0) mem.ram.fill(0, target, target + 4);
      }
      for (let j = 0; j < 24; j++) mem.write16(VOICES + 0x3c * j + 6, 0xffff);
      sdInit(state);
      for (const core of [0, 1]) {
        write(state.regs, regAddress(core, null, 'EEA'), ((0x1fffff - (core << 17)) >>> 17) & 0xffff);
        events.push(...effectAttr(state, core, (attr) => { attr.depthL = 0; attr.depthR = 0; attr.mode |= 0x100; }).events);
      }
      break;
    }
    case 0x6060: {
      if (mem.u32(a + 0xc) !== 0x64685353) return { writes: [], events, result: -1 };
      for (let k = 0; k < 0x7f; k++) {
        if (mem.u32(BANK_FLAGS + 12 * k) === 0) {
          mem.write32(BANK_FLAGS + 12 * k, 1);
          mem.write32(BANK_FLAGS + 12 * k + 4, a);
          mem.write32(BANK_FLAGS + 12 * k + 8, b >>> 3);
          return { writes: [], events, result: k };
        }
      }
      return { writes: [], events, result: -1 };
    }
    case 0x6090: {
      const bank = s16(a);
      if (bank >= 0x80 || mem.u32(b + 0xc) !== 0x71735353) return { writes: [], events, result: -1 };
      if (mem.u32(BANK_FLAGS + 12 * bank) !== 1) return { writes: [], events, result: -1 };
      for (let i = 0; i < 24; i++) {
        const slot = SLOTS + 0x44 * i;
        if (mem.u16(slot + 0x26) !== 0 || mem.u16(slot + 0x28) !== 0) continue;
        mem.write16(slot + 0x26, 1);
        mem.write16(slot + 0x28, 0);
        mem.write32(slot + 4, 0);
        mem.write32(slot + 0x18, b);
        mem.write32(slot + 0x14, 0x110);
        mem.write8(slot, mem.u8(b + 0x110));
        mem.write8(slot + 2, mem.u8(b + 0x111));
        mem.write8(slot + 3, mem.u8(b + 0x112));
        mem.write8(slot + 1, mem.u8(slot));
        mem.write16(slot + 0x24, bank);
        mem.write16(slot + 0x40, mem.u16(b + 2));
        mem.write16(slot + 0x3e, mem.u16(b + 4));
        const product = Math.imul(mem.u16(slot + 0x40), mem.u16(slot + 0x3e)) << 12;
        const hz = mem.u16(CTX + 0xe);
        const divided = Math.trunc(product / hz) | 0;
        const hi = Number((BigInt(divided) * BigInt(-0x77777777)) >> 32n);
        mem.write32(slot + 8, ((hi + divided) >> 5) - (divided >> 31));
        return { writes: [], events, result: i };
      }
      return { writes: [], events, result: -1 };
    }
    case 0x60a0:
      mem.write16(CTX + 0xe, u16(a));
      break;
    case 0x60c0:
      events.push(...effectAttr(state, s16(a), (attr) => { attr.mode = u16(b) | 0x100; }).events);
      break;
    case 0x60d0:
    case 0x6120:
      return { ...rampWrites(state, command), result: 0 };
    case 0x6130: {
      const slot = SLOTS + 0x44 * s16(a);
      if (s16(a) < 0x18 && s16(b) < 0x80 && mem.u16(slot + 0x26) === 1) {
        const sq = mem.u32(slot + 0x18);
        mem.write32(SQ_CURRENT, sq);
        mem.write8(sq, b);
        mem.write32(CHANNEL_CURRENT, sq + 0x10);
        for (let j = 0; j < 24; j++) {
          const v = VOICES + 0x3c * j;
          if (mem.u16(v) === 1 && mem.u16(v + 6) === s16(a) && mem.u16(v + 0x1c) === mem.u16(slot + 0x24)) {
            mem.write16(v + 0x2a, mem.u8(sq));
            setParam(state.regs, 1, j, 'VOLL', voiceVolumeOf(mem, j, 0));
            setParam(state.regs, 1, j, 'VOLR', voiceVolumeOf(mem, j, 1));
          }
        }
      }
      break;
    }
    case 0x6140: {
      const slot = SLOTS + 0x44 * s16(a);
      const bankIndex = mem.u16(slot + 0x24);
      const hd = mem.u32(BANKS + 12 * bankIndex);
      if (mem.u16(slot + 0x26) === 1 && mem.u32(BANK_FLAGS + 12 * bankIndex) === 1 && mem.u32(hd + 0x10) !== 0xffffffff) {
        mem.write16(slot + 0x28, 1);
        mem.write16(slot + 0x3c, 0);
      }
      mem.write32(slot + 0x20, 0);
      break;
    }
    case 0x6150: {
      const index = s16(a);
      const slot = SLOTS + 0x44 * index;
      const mode = s16(b);
      const bankIndex = mem.u16(slot + 0x24);
      const hd = mem.u32(BANKS + 12 * bankIndex);
      if (!(mem.u16(slot + 0x26) === 1 && mem.u32(BANK_FLAGS + 12 * bankIndex) === 1 && mem.u32(hd + 0x10) !== 0xffffffff)) break;
      let silence = 0;
      let proceed = true;
      if (mode === 0 || mode === 1) {
        mem.write32(slot + 0x14, 0x110);
        mem.write16(slot + 0x28, 0);
        mem.write32(slot + 0x20, 1);
        mem.write16(slot + 0x3c, 0);
        mem.write16(slot + 0x2a, 0);
        if (mode === 0) mem.write32(slot + 4, 0);
        else { mem.write32(slot + 4, 0); silence = 1; }
      } else if (mode === 2 || mode === 3) {
        if (mem.u16(slot + 0x28) === 1) {
          mem.write16(slot + 0x28, 0);
          mem.write16(slot + 0x3c, 1);
          if (mode === 3) proceed = false;
        } else if (mem.u32(slot + 0x20) === 0) {
          mem.write16(slot + 0x28, 1);
          mem.write16(slot + 0x3c, 0);
          proceed = false;
        } else if (mode === 3) proceed = false;
      } else proceed = false;
      if (!proceed) break;
      for (let j = 0; j < 24; j++) {
        const v = VOICES + 0x3c * j;
        if (mem.u16(v + 6) !== index) continue;
        mem.write16(v, 0);
        mem.write16(v + 8, 1);
        mem.write16(v + 0x2e, 0x40);
        mem.write16(v + 0x14, 0);
        mem.write16(v + 0x16, 0);
        mem.write32(slot + 0x10, mem.u32(slot + 0x10) | (1 << j));
        if (silence === 1) {
          setParam(state.regs, 1, j, 'ADSR1', 0);
          setParam(state.regs, 1, j, 'ADSR2', 0);
        } else if (c !== 0) {
          const adsr2 = read(state.regs, regAddress(1, j, 'ADSR2'));
          setParam(state.regs, 1, j, 'ADSR2', (adsr2 & 0xffc0) | u16(c));
        }
      }
      const channels = mem.u32(slot + 0x18) + 0x10;
      for (let k = 0; k < 16; k++) mem.write8(channels + 16 * k + 9, 0);
      setSwitch(state.regs, 1, 'KOFF', mem.u32(slot + 0x10));
      mem.write32(slot + 0x10, 0);
      break;
    }
    case 0x8010:
      write(state.regs, paramAddress(state.lib, u16(a)), u16(b));
      break;
    case 0x8070:
      coreAttr(state, u16(a), u16(b));
      break;
    case 0x61a0:
    case 0x6070:
    case 0x6200:
    case 0x6310:
      if (command.id === 0x6310) {
        const bank = s16(a);
        const hd = mem.u32(BANKS + 12 * bank);
        mem.write32(hd + mem.u32(hd + 0x2c), s16(b));
      }
      break;
    default:
      throw new Error(`command 0x${command.id.toString(16)} is not modelled`);
  }
  return { writes: state.regs.log.slice(first), events, result: 0 };
}

export { LIBSD_BASE };
