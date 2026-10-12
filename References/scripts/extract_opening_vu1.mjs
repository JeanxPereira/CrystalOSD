// The VU1 microprogram that draws the towers of the opening intro (HDD OSD 1.10U): read from the
// upload chain at 0x002A47A0 in the ELF (VIF code MPG, 229 instructions, loaded at address 0),
// written to References/model/opening-vu1-microprogram.json with a disassembly.
//
// node extract_opening_vu1.mjs [l: print the listing]
import { dataPath } from '../lib/data.mjs';
import fs from 'node:fs';

const ELF = dataPath('dumps/hddosd-host/hddosd.elf');
const CHAIN = 0x002a47a0;

export function readElf() {
  const elf = fs.readFileSync(ELF);
  const phoff = elf.readUInt32LE(28), phentsize = elf.readUInt16LE(42), phnum = elf.readUInt16LE(44);
  const segments = [];
  for (let i = 0; i < phnum; i++) {
    const at = phoff + i * phentsize;
    if (elf.readUInt32LE(at) === 1) segments.push({ offset: elf.readUInt32LE(at + 4), address: elf.readUInt32LE(at + 8), size: elf.readUInt32LE(at + 16) });
  }
  return (address, length) => {
    const segment = segments.find((s) => address >= s.address && address + length <= s.address + s.size);
    if (!segment) throw new Error(`0x${address.toString(16)} is not in the file`);
    return elf.subarray(segment.offset + address - segment.address, segment.offset + address - segment.address + length);
  };
}

const DEST = (word) => ['x', 'y', 'z', 'w'].filter((_, i) => (word >>> (24 - i)) & 1).join('');
const BC = ['x', 'y', 'z', 'w'];
const field = (word) => ({ ft: (word >>> 16) & 31, fs: (word >>> 11) & 31, fd: (word >>> 6) & 31, dest: DEST(word), bc: BC[word & 3] });

const UPPER = { 0x1c: 'MULq', 0x1d: 'MAXi', 0x1e: 'MULi', 0x1f: 'MINIi', 0x20: 'ADDq', 0x21: 'MADDq', 0x22: 'ADDi', 0x23: 'MADDi', 0x24: 'SUBq', 0x25: 'MSUBq',
  0x26: 'SUBi', 0x27: 'MSUBi', 0x28: 'ADD', 0x29: 'MADD', 0x2a: 'MUL', 0x2b: 'MAX', 0x2c: 'SUB', 0x2d: 'MSUB', 0x2e: 'OPMSUB', 0x2f: 'MINI' };
const UPPER_BC = ['ADD', 'SUB', 'MADD', 'MSUB', 'MAX', 'MINI', 'MUL'];
const UPPER_EXT = { 0x10: 'ITOF0', 0x11: 'ITOF4', 0x12: 'ITOF12', 0x13: 'ITOF15', 0x14: 'FTOI0', 0x15: 'FTOI4', 0x16: 'FTOI12', 0x17: 'FTOI15', 0x1c: 'MULAq', 0x1d: 'ABS',
  0x1e: 'MULAi', 0x1f: 'CLIP', 0x20: 'ADDAq', 0x21: 'MADDAq', 0x22: 'ADDAi', 0x23: 'MADDAi', 0x24: 'SUBAq', 0x25: 'MSUBAq', 0x26: 'SUBAi', 0x27: 'MSUBAi',
  0x28: 'ADDA', 0x29: 'MADDA', 0x2a: 'MULA', 0x2c: 'SUBA', 0x2d: 'MSUBA', 0x2e: 'OPMULA', 0x2f: 'NOP' };
const UPPER_EXT_BC = ['ADDA', 'SUBA', 'MADDA', 'MSUBA', null, null, 'MULA'];

export function upper(word) {
  const { ft, fs, fd, dest, bc } = field(word);
  const flags = ['I', 'E', 'M', 'D', 'T'].filter((_, i) => (word >>> (31 - i)) & 1).join('');
  const op = word & 63;
  let name, text;
  if (op < 0x1c) { name = UPPER_BC[op >> 2] + bc; text = `${name}.${dest} vf${fd}, vf${fs}, vf${ft}${bc}`; }
  else if (op < 0x3c) {
    name = UPPER[op] ?? `upper?${op.toString(16)}`;
    const last = /q$/.test(name) ? 'Q' : /i$/.test(name) && name !== 'MINI' ? 'I' : `vf${ft}`;
    text = `${name}.${dest} vf${fd}, vf${fs}, ${last}`;
  } else {
    const ext = (((word >>> 6) & 31) << 2) | (word & 3);
    if (ext < 0x10 || (ext >= 0x18 && ext < 0x1c)) { name = UPPER_EXT_BC[ext >> 2] + bc; text = `${name}.${dest} ACC, vf${fs}, vf${ft}${bc}`; }
    else {
      name = UPPER_EXT[ext] ?? `upper?ext${ext.toString(16)}`;
      if (name === 'NOP') text = 'NOP';
      else if (/^(ITOF|FTOI|ABS)/.test(name)) text = `${name}.${dest} vf${ft}, vf${fs}`;
      else if (name === 'CLIP') text = `CLIPw.xyz vf${fs}, vf${ft}w`;
      else text = `${name}.${dest} ACC, vf${fs}, ${/q$/.test(name) ? 'Q' : /i$/.test(name) ? 'I' : `vf${ft}`}`;
    }
  }
  return { name, ft, fs, fd, dest, bc, flags, text: flags ? `${text} [${flags}]` : text };
}

const LOWER = { 0x00: 'LQ', 0x01: 'SQ', 0x04: 'ILW', 0x05: 'ISW', 0x08: 'IADDIU', 0x09: 'ISUBIU', 0x10: 'FCEQ', 0x11: 'FCSET', 0x12: 'FCAND', 0x13: 'FCOR', 0x14: 'FSEQ', 0x15: 'FSSET',
  0x16: 'FSAND', 0x17: 'FSOR', 0x18: 'FMEQ', 0x1a: 'FMAND', 0x1b: 'FMOR', 0x1c: 'FCGET', 0x20: 'B', 0x21: 'BAL', 0x24: 'JR', 0x25: 'JALR', 0x28: 'IBEQ', 0x29: 'IBNE',
  0x2c: 'IBLTZ', 0x2d: 'IBGTZ', 0x2e: 'IBLEZ', 0x2f: 'IBGEZ' };
const LOWER_EXT = { 0x30: 'MOVE', 0x31: 'MR32', 0x34: 'LQI', 0x35: 'SQI', 0x36: 'LQD', 0x37: 'SQD', 0x38: 'DIV', 0x39: 'SQRT', 0x3a: 'RSQRT', 0x3b: 'WAITQ', 0x3c: 'MTIR', 0x3d: 'MFIR',
  0x3e: 'ILWR', 0x3f: 'ISWR', 0x40: 'RNEXT', 0x41: 'RGET', 0x42: 'RINIT', 0x43: 'RXOR', 0x64: 'MFP', 0x68: 'XTOP', 0x69: 'XITOP', 0x6c: 'XGKICK', 0x70: 'ESADD', 0x71: 'ERSADD',
  0x72: 'ELENG', 0x73: 'ERLENG', 0x74: 'EATANxy', 0x75: 'EATANxz', 0x76: 'ESUM', 0x78: 'ESQRT', 0x79: 'ERSQRT', 0x7a: 'ERCPR', 0x7b: 'WAITP', 0x7c: 'ESIN', 0x7d: 'EATAN', 0x7e: 'EEXP' };

export function lower(word, pc) {
  const op = word >>> 25;
  const { ft, fs, fd, dest } = field(word);
  const imm11 = ((word & 0x7ff) << 21) >> 21;
  const imm15 = ((word >>> 10) & 0x7800) | (word & 0x7ff);
  const target = pc + 1 + imm11;
  let name = LOWER[op], text;
  if (op === 0x40) {
    const low = word & 63;
    if (low === 0x30) { name = 'IADD'; text = `IADD vi${fd}, vi${fs}, vi${ft}`; }
    else if (low === 0x31) { name = 'ISUB'; text = `ISUB vi${fd}, vi${fs}, vi${ft}`; }
    else if (low === 0x32) { name = 'IADDI'; text = `IADDI vi${ft}, vi${fs}, ${((fd << 27) >> 27)}`; }
    else if (low === 0x34) { name = 'IAND'; text = `IAND vi${fd}, vi${fs}, vi${ft}`; }
    else if (low === 0x35) { name = 'IOR'; text = `IOR vi${fd}, vi${fs}, vi${ft}`; }
    else if (low >= 0x3c) {
      const ext = (((word >>> 6) & 31) << 2) | (word & 3);
      name = LOWER_EXT[ext] ?? `lower?ext${ext.toString(16)}`;
      const fsf = BC[(word >>> 21) & 3], ftf = BC[(word >>> 23) & 3];
      if (name === 'MOVE' || name === 'MR32') text = `${name}.${dest} vf${ft}, vf${fs}`;
      else if (name === 'LQI') text = `LQI.${dest} vf${ft}, (vi${fs}++)`;
      else if (name === 'SQI') text = `SQI.${dest} vf${fs}, (vi${ft}++)`;
      else if (name === 'LQD') text = `LQD.${dest} vf${ft}, (--vi${fs})`;
      else if (name === 'SQD') text = `SQD.${dest} vf${fs}, (--vi${ft})`;
      else if (name === 'DIV') text = `DIV Q, vf${fs}${fsf}, vf${ft}${ftf}`;
      else if (name === 'SQRT') text = `SQRT Q, vf${ft}${ftf}`;
      else if (name === 'RSQRT') text = `RSQRT Q, vf${fs}${fsf}, vf${ft}${ftf}`;
      else if (name === 'MTIR') text = `MTIR vi${ft}, vf${fs}${fsf}`;
      else if (name === 'MFIR') text = `MFIR.${dest} vf${ft}, vi${fs}`;
      else if (name === 'ILWR') text = `ILWR.${dest} vi${ft}, (vi${fs})`;
      else if (name === 'ISWR') text = `ISWR.${dest} vi${ft}, (vi${fs})`;
      else if (name === 'XTOP' || name === 'XITOP') text = `${name} vi${ft}`;
      else if (name === 'XGKICK') text = `XGKICK vi${fs}`;
      else if (name === 'MFP') text = `MFP.${dest} vf${ft}, P`;
      else if (name === 'WAITQ' || name === 'WAITP') text = name;
      else text = `${name} vf${fs}${fsf}, vf${ft} (${dest})`;
    } else { name = `lower?${low.toString(16)}`; text = name; }
  } else if (name === 'LQ') text = `LQ.${dest} vf${ft}, ${imm11}(vi${fs})`;
  else if (name === 'SQ') text = `SQ.${dest} vf${fs}, ${imm11}(vi${ft})`;
  else if (name === 'ILW' || name === 'ISW') text = `${name}.${dest} vi${ft}, ${imm11}(vi${fs})`;
  else if (name === 'IADDIU' || name === 'ISUBIU') text = `${name} vi${ft}, vi${fs}, ${imm15}`;
  else if (name === 'B' || name === 'BAL') text = `${name}${name === 'BAL' ? ` vi${ft},` : ''} ${target}`;
  else if (name === 'JR') text = `JR vi${fs}`;
  else if (name === 'JALR') text = `JALR vi${ft}, vi${fs}`;
  else if (name === 'IBEQ' || name === 'IBNE') text = `${name} vi${ft}, vi${fs}, ${target}`;
  else if (/^IB/.test(name ?? '')) text = `${name} vi${fs}, ${target}`;
  else if (/^F[CSM]/.test(name ?? '')) text = `${name} vi${name[1] === 'C' ? 1 : ft}, 0x${(name[1] === 'C' ? word & 0xffffff : ((word >>> 10) & 0x800) | (word & 0x7ff)).toString(16)}${name[1] === 'M' ? `, vi${fs}` : ''}`;
  else { name = `lower?${op.toString(16)}`; text = name; }
  return { name, ft, fs, fd, dest, imm11, imm15, target, text };
}

export function microprogram() {
  const read = readElf();
  const head = read(CHAIN, 16);
  const code = head.readUInt32LE(12);
  if ((code >>> 24) !== 0x4a) throw new Error(`no MPG code at the head of the chain: 0x${code.toString(16)}`);
  const count = (code >>> 16) & 0xff, address = code & 0xffff;
  const body = read(CHAIN + 16, count * 8);
  const instructions = [];
  for (let i = 0; i < count; i++) {
    const low = body.readUInt32LE(i * 8), high = body.readUInt32LE(i * 8 + 4);
    const up = upper(high);
    // With the I bit the lower word is a float loaded into the I register.
    const immediate = (high >>> 31) === 1;
    instructions.push({ pc: address + i, lower: low, upper: high, upperText: up.text, lowerText: immediate ? `LOI ${body.readFloatLE(i * 8)}` : lower(low, address + i).text });
  }
  return { address, count, instructions };
}

if (process.argv[1] && process.argv[1].endsWith('extract_opening_vu1.mjs')) {
  const program = microprogram();
  const out = new URL('../model/opening-vu1-microprogram.json', import.meta.url);
  fs.writeFileSync(out, `${JSON.stringify({
    build: 'HDD OSD 1.10U', source: 'upload chain at 0x002A47A0 (VIF code MPG)', loadedAt: program.address, count: program.count,
    instructions: program.instructions.map((i) => ({ pc: i.pc, lower: `0x${i.lower.toString(16).padStart(8, '0')}`, upper: `0x${i.upper.toString(16).padStart(8, '0')}`, text: `${i.upperText} | ${i.lowerText}` })),
  }, null, 1)}\n`);
  console.log(`${program.count} instructions at ${program.address}, written to References/model/opening-vu1-microprogram.json`);
  if (process.argv[2] === 'l') for (const i of program.instructions) console.log(`${String(i.pc).padStart(3)}  ${i.upperText.padEnd(34)} | ${i.lowerText}`);
}
