import { makeMemory, moduleAddress } from './sound_snapshot.mjs';
import { makeRegisters, regAddress, setParam, setAddr, setSwitch, getSwitch } from './sound_libsd.mjs';

export const EFFECT_FIELDS = { 0x6300: ['bank', 'effect'] };

const BANK_TABLE = 0x98d4;
const BUSY_MASK = 0x9184;
const PRIORITIES = 0x9188;
const VOICES = 24;

export const pitchOf = (u) => {
  const x = Number(BigInt.asIntN(32, BigInt(44100 * u)));
  const hi = (BigInt(x) * 0x057619f1n) >> 32n;
  return Number(hi >> 10n) + (x < 0 ? 1 : 0);
};

export function allocateVoice(state, core, priority, envx) {
  const mem = state.mem;
  const mask = moduleAddress(BUSY_MASK);
  const priorities = (i) => moduleAddress(PRIORITIES + 4 * i);
  let steal = -1;
  let free = -1;
  let released = 0;
  let lowest = 0x7fff;
  for (let i = 0; i < VOICES; i++) {
    const e = envx(core, i) & 0xffff;
    if (((~mem.u32(mask)) >>> i) & 1) free = i;
    if (e < lowest && priority >= mem.u32(priorities(i))) {
      lowest = e;
      steal = i;
    }
    if (e < 2) {
      released |= 1 << i;
      mem.write32(priorities(i), 0);
    }
  }
  let chosen;
  if (free === -1) {
    if (steal === -1) return -1;
    mem.write32(priorities(steal), priority);
    chosen = steal;
  } else {
    mem.write32(priorities(free), priority);
    chosen = free;
  }
  mem.write32(mask, (mem.u32(mask) & ~released) | (1 << chosen));
  return chosen;
}

export function initEffects(snapshot) {
  const mem = makeMemory(snapshot);
  const spu = snapshot.spustate;
  const regs = makeRegisters();
  const mix = (core, name, value) => { regs.values.set(regAddress(core, null, `${name}0`), value & 0xffff); regs.values.set(regAddress(core, null, `${name}1`), (value >>> 16) & 0xffff); };
  if (spu) {
    for (const core of spu.cores) {
      mix(core.index, 'VMIXEL', parseInt(core.regs.vmixel, 16));
      mix(core.index, 'VMIXER', parseInt(core.regs.vmixer, 16));
    }
  }
  return { mem, regs };
}

const bankOf = (state, bank) => {
  const at = moduleAddress(BANK_TABLE + 12 * bank);
  return { hd: state.mem.u32(at), bdBase: state.mem.u32(at + 4) };
};

export function effectWrites(state, command, envx) {
  const first = state.regs.log.length;
  const words = command.words;
  if (command.id !== 0x6300) return { voice: null, writes: [] };
  const bankIndex = (words[0] << 16) >> 16;
  const effect = (words[1] << 16) >> 16;
  const { hd, bdBase } = bankOf(state, bankIndex);
  const table = hd + state.mem.u32(hd + 0x2c);
  if (state.mem.u32(table + 4) < (effect >>> 0)) return { voice: null, writes: [] };
  const record = table + 0x20 + (effect << 6);
  const voice = allocateVoice(state, 0, 0, envx);
  if (voice === -1) return { voice: null, writes: [] };
  const master = state.mem.u32(table);
  const left = (Math.imul(state.mem.u16(record), master) >>> 0) >>> 7;
  const right = (Math.imul(state.mem.u16(record + 2), master) >>> 0) >>> 7;
  const pitch = pitchOf(state.mem.u16(record + 4));
  const address = (bdBase << 3) + state.mem.u32(record + 0x10);
  const wet = (state.mem.u16(record + 0xe) & 0x80) !== 0;
  const bit = (1 << voice) >>> 0;
  setParam(state.regs, 0, voice, 'VOLL', left);
  setParam(state.regs, 0, voice, 'VOLR', right);
  setParam(state.regs, 0, voice, 'PITCH', pitch);
  setAddr(state.regs, 0, voice, address);
  setParam(state.regs, 0, voice, 'ADSR1', state.mem.u16(record + 8));
  setParam(state.regs, 0, voice, 'ADSR2', state.mem.u16(record + 10));
  setSwitch(state.regs, 0, 'VMIXEL', (getSwitch(state.regs, 0, 'VMIXEL') | (wet ? bit : 0)) >>> 0);
  setSwitch(state.regs, 0, 'VMIXER', (getSwitch(state.regs, 0, 'VMIXER') | (wet ? bit : 0)) >>> 0);
  setSwitch(state.regs, 0, 'VMIXEL', (getSwitch(state.regs, 0, 'VMIXEL') ^ (wet ? 0 : bit)) >>> 0);
  setSwitch(state.regs, 0, 'VMIXER', (getSwitch(state.regs, 0, 'VMIXER') ^ (wet ? 0 : bit)) >>> 0);
  setSwitch(state.regs, 0, 'KON', bit);
  return { voice, writes: state.regs.log.slice(first) };
}
