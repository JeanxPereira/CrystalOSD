import fs from 'node:fs';

export const OSDSND_BASE = 0x90130;
export const OSDSND_SIZE = 0xb000;
export const SOUND_IOP_BASE = 0xeb000;
const RAM_SIZE = 0x200000;

export function loadSnapshot(stem) {
  const osdsnd = fs.readFileSync(`${stem}.start.osdsnd.bin`);
  const iop = fs.existsSync(`${stem}.start.iopsound.bin`) ? fs.readFileSync(`${stem}.start.iopsound.bin`) : Buffer.alloc(0);
  const state = fs.existsSync(`${stem}.start.spustate.json`) ? JSON.parse(fs.readFileSync(`${stem}.start.spustate.json`, 'utf8')) : null;
  return { osdsnd, iop, spustate: state };
}

export function makeMemory(snapshot) {
  const ram = Buffer.alloc(RAM_SIZE);
  snapshot.osdsnd.copy(ram, OSDSND_BASE);
  snapshot.iop.copy(ram, SOUND_IOP_BASE);
  const mem = {
    ram,
    u8: (address) => ram[address],
    u16: (address) => ram.readUInt16LE(address),
    s16: (address) => ram.readInt16LE(address),
    u32: (address) => ram.readUInt32LE(address),
    s32: (address) => ram.readInt32LE(address),
    write8: (address, value) => { ram[address] = value & 0xff; },
    write16: (address, value) => { ram.writeUInt16LE(value & 0xffff, address); },
    write32: (address, value) => { ram.writeUInt32LE(value >>> 0, address); },
    bytes: (address, length) => Buffer.from(ram.subarray(address, address + length)),
  };
  return mem;
}

export const moduleAddress = (offset) => OSDSND_BASE + offset;
