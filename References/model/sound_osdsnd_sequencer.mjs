import { makeMemory, moduleAddress } from './sound_snapshot.mjs';
import { makeRegisters, regAddress, setParam, setAddr, setSwitch, getSwitch } from './sound_libsd.mjs';

const M = moduleAddress;
export const SLOTS = M(0x9ed0);
export const CTX = M(0xa530);
export const VOICES = M(0x9330);
export const BANKS = M(0x98d4);
export const SQ_CURRENT = M(0x9218);
export const CHANNEL_CURRENT = M(0x9214);
const G = {
  sq: M(0x9280), progTab: M(0x9284), progTab2: M(0x9288), velTab: M(0x928c), hd: M(0x9298),
  progHdr: M(0x9220), tone: M(0x9224), sq2: M(0x9218), chan: M(0x9214),
};
const PITCH_TABLE = M(0x8a30);
const PAN_TABLE = M(0x8ef0);
const SLOT_SIZE = 0x44;
const VOICE_SIZE = 0x3c;
const VOICE_COUNT = 24;
const SEQ_CORE = 1;

export const TICK_CYCLES = { ntsc: 599776, pal: 603968 };

const i32 = (x) => Number(BigInt.asIntN(32, BigInt(x)));
const mulHi = (a, b) => Number((BigInt(i32(a)) * BigInt(i32(b))) >> 32n);
const div48000 = (x) => {
  const v = i32(x);
  return (mulHi(v, 0x057619f1) >> 10) - (v >> 31);
};
const div60 = (x) => {
  const v = i32(x);
  const hi = mulHi(v, 0x88888889);
  return ((hi + v) >> 5) - (v >> 31);
};

export function pitchOf(mem, root, key, fine, bend, range) {
  const table = (index) => mem.u16(PITCH_TABLE + 2 * (index & 0xffff));
  const bendTerm = i32(Math.imul(bend - 0x40, range)) >> 2;
  if (key >= root) {
    const d = (key - root) & 0xffff;
    const octave = Math.trunc(d / 12);
    const semitone = d - 12 * octave;
    const index = (semitone << 4) + (bendTerm + 0xd0) + (fine << 16 >> 16);
    const x = i32(Math.imul(table(index), 44100));
    return div48000(i32(x << octave)) & 0xffff;
  }
  const d = (root - key) & 0xffff;
  const octave = Math.trunc(d / 12);
  const semitone = d - 12 * octave;
  const index = ((12 - semitone) << 4) + (bendTerm + 0xd0) + (fine << 16 >> 16);
  const x = i32(Math.imul(table(index), 44100));
  return div48000(x >> (octave + 1)) & 0xffff;
}

export function voiceVolumeOf(mem, j, side) {
  const v = VOICES + VOICE_SIZE * j;
  const gain = side === 0 ? mem.u16(v + 0x24) : mem.u16(v + 0x26);
  let t = Math.imul(mem.u16(v + 0x2a), mem.u16(v + 0x28));
  t = Math.imul(t, mem.u16(v + 0x1e));
  t = Math.imul(t, mem.u16(v + 0x20));
  const scaled = t >> 14;
  const pan = Math.imul(mem.u16(v + 0x22), (gain << 16) >> 16);
  let r = (Math.imul(scaled, pan) >> 14) & 0xffff;
  if (mem.u16(v + 0x36) !== 0) r = (((r << 16) >> 16) >> 7 | (mem.u16(v + 0x36) << 8)) & 0xffff;
  return r;
}

export function makeSequencer(source, hooks = {}) {
  const shared = source.mem !== undefined;
  const snapshot = shared ? {} : source;
  const mem = shared ? source.mem : makeMemory(snapshot);
  const regs = shared ? source.regs : makeRegisters();
  const seed = (core, name, value) => setSwitch(regs, core, name, value >>> 0);
  if (!shared && snapshot.spustate) {
    for (const core of snapshot.spustate.cores) {
      seed(core.index, 'VMIXEL', parseInt(core.regs.vmixel, 16));
      seed(core.index, 'VMIXER', parseInt(core.regs.vmixer, 16));
    }
    regs.log.length = 0;
  }
  const envx = hooks.envx ?? (() => 0);
  const state = { mem, regs, envx, notes: [], ticks: 0 };

  const slotAt = (i) => SLOTS + SLOT_SIZE * i;
  const voiceAt = (j) => VOICES + VOICE_SIZE * j;
  const eventPointer = (slot) => mem.u32(G.sq) + mem.u32(slot + 0x14);

  const voiceParam = (voice, name, value) => setParam(regs, SEQ_CORE, voice, name, value);

  function selectBank(i) {
    const slot = slotAt(i);
    mem.write32(G.sq, mem.u32(slot + 0x18));
    const hd = mem.u32(BANKS + 12 * mem.u16(slot + 0x24));
    mem.write32(CTX, hd);
    mem.write32(G.hd, hd);
    mem.write32(G.progTab, hd + mem.u32(hd + 0x10));
    mem.write32(G.progTab2, hd + mem.u32(hd + 0x10));
    mem.write32(G.velTab, hd + mem.u32(hd + 0x14));
    return hd;
  }

  function readEvent(i) {
    const slot = slotAt(i);
    const first = mem.u8(mem.u32(G.sq) + mem.u32(slot + 0x14));
    if (first & 0x80) {
      mem.write8(slot + 1, first);
      mem.write8(slot, first);
    } else {
      mem.write32(slot + 0x14, mem.u32(slot + 0x14) - 1);
      mem.write8(slot, mem.u8(slot + 1));
    }
    const base = mem.u32(G.sq) + mem.u32(slot + 0x14);
    mem.write8(slot + 2, mem.u8(base + 1));
    mem.write8(slot + 3, mem.u8(base + 2));
  }

  function prepareEvent(i) {
    const slot = slotAt(i);
    const channel = mem.u8(slot) & 0xf;
    const sq = mem.u32(G.sq);
    const program = mem.u8(sq + (channel << 4) + 0x12);
    const entry = mem.u16(mem.u32(G.progTab) + 2 * program + 2);
    if (mem.u8(slot) < 0xa0) {
      const bad = entry === 0xffff || mem.u16(mem.u32(G.progTab)) < program || mem.u32(mem.u32(G.hd) + 0x10) === 0xffffffff;
      if (bad) {
        mem.write32(slot + 0x14, mem.u32(slot + 0x14) + 3);
        return 0;
      }
    }
    const hd = mem.u32(CTX);
    const progHdr = mem.u32(mem.u32(G.hd) + 0x10) + hd + entry;
    mem.write32(G.progHdr, progHdr);
    mem.write32(G.tone, progHdr + 8);
    mem.write32(G.sq2, mem.u32(slot + 0x18));
    mem.write32(G.chan, mem.u32(slot + 0x18) + (channel << 4) + 0x10);
    return 1;
  }

  function readDelta(i) {
    const slot = slotAt(i);
    let delta = 0;
    let b;
    do {
      b = mem.u8(mem.u32(G.sq) + mem.u32(slot + 0x14));
      mem.write32(slot + 0x14, mem.u32(slot + 0x14) + 1);
      delta = ((delta << 7) | (b & 0x7f)) | 0;
    } while (b & 0x80);
    if (mem.u16(slot + 0x3e) !== 0) mem.write32(slot + 4, mem.u32(slot + 4) + (delta << 12));
  }

  function allocateVoice() {
    for (let j = 0; j < VOICE_COUNT; j++) {
      const v = voiceAt(j);
      if (mem.u16(v) === 0 && mem.u16(v + 2) === 0) return j;
    }
    let best = VOICE_COUNT;
    let age = 0x18;
    for (let j = 0; j < VOICE_COUNT; j++) {
      const v = voiceAt(j);
      if (mem.u16(v + 8) === 1 && mem.u16(v + 0xa) < age) {
        age = mem.u16(v + 0xa);
        best = j;
      }
    }
    if (best === VOICE_COUNT) return -1;
    for (let j = 0; j < VOICE_COUNT; j++) {
      const v = voiceAt(j);
      if (age < mem.u16(v + 0xa)) mem.write16(v + 0xa, mem.u16(v + 0xa) - 1);
    }
    return best;
  }

  function toneMatches(head, t, key) {
    if (head === 0xff) return 1;
    const tone = mem.u32(G.tone) + (t << 4);
    return key >= mem.u8(tone) && key <= mem.u8(tone + 1) ? 1 : 0;
  }

  const voiceVolume = (j, side) => voiceVolumeOf(mem, j, side);

  function noteOff(i) {
    const slot = slotAt(i);
    for (let j = 0; j < VOICE_COUNT; j++) {
      const v = voiceAt(j);
      if (mem.u16(v) === 1 && mem.u16(v + 6) === i && mem.u16(v + 2) === mem.u8(slot + 2) && mem.u16(v + 0x1c) === mem.u16(slot + 0x24) && mem.u16(v + 4) === (mem.u8(slot) & 0xf)) {
        mem.write16(v + 8, 1);
        mem.write32(slot + 0x10, mem.u32(slot + 0x10) | (1 << j));
        state.notes.push({ off: j, slot: i });
      }
    }
    mem.write32(slot + 0x14, mem.u32(slot + 0x14) + 3);
  }

  function noteOn(i) {
    const slot = slotAt(i);
    if (mem.u8(slot + 3) === 0) {
      noteOff(i);
      return;
    }
    const tone0 = mem.u32(G.progHdr);
    const head = mem.u8(tone0);
    let first;
    let last;
    let single;
    if (head === 0xff) {
      last = mem.u8(slot + 2) - mem.u8(tone0 + 6);
      first = last;
      single = 0;
    } else if (head & 0x80) {
      last = head - 0x80;
      single = 0;
      first = 0;
    } else {
      last = head;
      single = 1;
      first = 0;
    }
    for (let t = first; t < last + 1; t++) {
      if (toneMatches(head, t, mem.u8(slot + 2)) !== 1) continue;
      const voice = allocateVoice();
      if (voice === -1) break;
      mem.write32(G.tone, mem.u32(G.tone) + (t << 4));
      const v = voiceAt(voice);
      const tone = mem.u32(G.tone);
      const chan = mem.u32(G.chan);
      const flags = mem.u8(tone + 0xf);
      if (flags & 1) { mem.write16(v + 8, 0); mem.write16(v + 0xc, 1); } else { mem.write16(v + 8, 1); mem.write16(v + 0xc, 0); }
      mem.write16(v, 1);
      mem.write16(v + 2, mem.u8(slot + 2));
      mem.write16(v + 4, mem.u8(slot) & 0xf);
      mem.write16(v + 6, i);
      mem.write16(v + 0xa, mem.u16(CTX + 0xc));
      mem.write16(v + 0xe, t);
      mem.write16(v + 0x12, 0);
      mem.write16(v + 0x1c, mem.u16(slot + 0x24));
      mem.write16(v + 0x1e, mem.u8(mem.u32(G.progHdr) + 1));
      mem.write16(v + 0x20, mem.u8(mem.u8(slot + 3) + mem.u32(G.velTab) + 2));
      mem.write16(v + 0x22, mem.u8(tone + 0xb));
      const pan = Math.max(0, Math.min(0x7f, (mem.u8(chan + 4) + mem.u8(tone + 0xc) - 0x40) << 16 >> 16));
      mem.write16(v + 0x24, mem.u8(PAN_TABLE + 2 * (pan >> 2)));
      mem.write16(v + 0x26, mem.u8(PAN_TABLE + 2 * (pan >> 2) + 1));
      mem.write16(v + 0x28, mem.u8(chan + 3));
      mem.write16(v + 0x2a, mem.u8(mem.u32(G.sq2)));
      const fine = mem.u8(tone + 3);
      mem.write16(v + 0x2c, fine | (fine & 0x80 ? 0xff00 : 0));
      mem.write16(v + 0x2e, mem.u8(chan + 0xa));
      mem.write16(v + 0x30, mem.u8(tone + 0xd));
      mem.write16(v + 0x32, mem.u8(chan + 0xc));
      mem.write16(v + 0x34, mem.u8(tone + 2));
      mem.write16(v + 0x36, mem.u8(tone + 0xa));
      mem.write16(v + 0x38, mem.u8(chan + 4));
      mem.write16(v + 0x3a, mem.u8(tone + 0xc));
      if ((flags & 0x20) && mem.u8(chan + 9) !== 0) {
        mem.write16(v + 0x10, mem.u8(tone + 0xe));
        mem.write16(v + 0x14, 1);
        mem.write16(v + 0x16, mem.u8(chan + 9));
      } else {
        mem.write16(v + 0x14, 0);
        mem.write16(v + 0x16, 0);
      }
      const bit = (1 << voice) >>> 0;
      const finePitch = fine | (fine & 0x80 ? 0xff00 : 0);
      const pitch = pitchOf(mem, mem.u8(tone + 2), mem.u8(slot + 2), (finePitch << 16) >> 16, mem.u8(chan + 0xa), mem.u8(tone + 0xd));
      const left = voiceVolume(voice, 0);
      const right = voiceVolume(voice, 1);
      const address = (mem.u16(tone + 4) + mem.u32(BANKS + 12 * mem.u16(slot + 0x24) + 4)) << 3;
      voiceParam(voice, 'VOLL', left);
      voiceParam(voice, 'VOLR', right);
      voiceParam(voice, 'PITCH', pitch);
      setAddr(regs, SEQ_CORE, voice, address);
      voiceParam(voice, 'ADSR1', mem.u16(tone + 6));
      voiceParam(voice, 'ADSR2', mem.u16(tone + 8));
      if (flags & 0x80) {
        setSwitch(regs, SEQ_CORE, 'VMIXEL', (getSwitch(regs, SEQ_CORE, 'VMIXEL') | bit) >>> 0);
        setSwitch(regs, SEQ_CORE, 'VMIXER', (getSwitch(regs, SEQ_CORE, 'VMIXER') | bit) >>> 0);
      } else {
        setSwitch(regs, SEQ_CORE, 'VMIXEL', (getSwitch(regs, SEQ_CORE, 'VMIXEL') ^ bit) >>> 0);
        setSwitch(regs, SEQ_CORE, 'VMIXER', (getSwitch(regs, SEQ_CORE, 'VMIXER') ^ bit) >>> 0);
      }
      mem.write32(slot + 0xc, mem.u32(slot + 0xc) | bit);
      state.notes.push({ on: voice, slot: i, key: mem.u8(slot + 2), tone: t });
      mem.write16(CTX + 0xc, mem.u16(CTX + 0xc) + (mem.u16(CTX + 0xc) < 0x18 ? 1 : 0));
      mem.write32(G.tone, mem.u32(G.tone) - (t << 4));
      if (single) break;
    }
    mem.write32(slot + 0x14, mem.u32(slot + 0x14) + 3);
  }

  function endOfSequence(i) {
    const slot = slotAt(i);
    mem.write32(slot + 0x14, 0x110);
    mem.write16(slot + 0x28, 0);
    for (let j = 0; j < VOICE_COUNT; j++) {
      const v = voiceAt(j);
      if (mem.u16(v + 6) === i) {
        mem.write16(v + 0x14, 0);
        mem.write16(v + 0x2e, 0x40);
      }
    }
    mem.write8(slot + 1, mem.u8(slot));
  }

  function tempo(i) {
    const slot = slotAt(i);
    const ev = mem.u32(slot + 0x18) + mem.u32(slot + 0x14);
    mem.write16(slot + 0x3e, (mem.u8(ev + 3) << 8) | mem.u8(ev + 2));
    const product = Math.imul(mem.u16(slot + 0x40), mem.u16(slot + 0x3e)) << 12;
    const hz = mem.u16(CTX + 0xe);
    if (hz === 0) throw new Error('tick rate 0');
    const divided = Math.trunc(i32(product) / hz) | 0;
    mem.write32(slot + 8, div60(divided));
    mem.write32(slot + 0x14, mem.u32(slot + 0x14) + 4);
  }

  function programChange(i) {
    const slot = slotAt(i);
    const chan = mem.u32(G.chan);
    mem.write8(chan + 2, mem.u8(mem.u32(slot + 0x14) + mem.u32(G.sq) + 1));
    mem.write8(chan + 0xa, 0x40);
    mem.write8(chan + 0xb, 0x40);
    mem.write32(slot + 0x14, mem.u32(slot + 0x14) + 2);
  }

  function controllerVolume(i) {
    const slot = slotAt(i);
    const chan = mem.u32(G.chan);
    const value = mem.u8(mem.u32(slot + 0x14) + mem.u32(G.sq) + 2);
    mem.write8(chan + 3, value);
    for (let j = 0; j < VOICE_COUNT; j++) {
      const v = voiceAt(j);
      if (mem.u16(v) === 1 && mem.u16(v + 8) !== 1 && mem.u16(v + 6) === i && mem.u16(v + 0x1c) === mem.u16(slot + 0x24) && mem.u16(v + 4) === (mem.u8(slot) & 0xf)) {
        mem.write16(v + 0x28, mem.u8(mem.u32(slot + 0x14) + mem.u32(G.sq) + 2));
        voiceParam(j, 'VOLL', voiceVolume(j, 0));
        voiceParam(j, 'VOLR', voiceVolume(j, 1));
      }
    }
    mem.write32(slot + 0x14, mem.u32(slot + 0x14) + 3);
  }

  function controllerPan(i) {
    const slot = slotAt(i);
    const chan = mem.u32(G.chan);
    const value = mem.u8(mem.u32(slot + 0x14) + mem.u32(G.sq) + 2);
    mem.write8(chan + 4, value);
    for (let j = 0; j < VOICE_COUNT; j++) {
      const v = voiceAt(j);
      if (mem.u16(v + 4) === (mem.u8(slot) & 0xf) && mem.u16(v + 0x1c) === mem.u16(slot + 0x24) && mem.u16(v + 6) === i && mem.u16(v + 8) !== 1 && mem.u16(v) === 1) {
        mem.write16(v + 0x38, value);
        const pan = Math.max(0, Math.min(0x7f, ((mem.u16(v + 0x38) + mem.u16(v + 0x3a) + 0xffc0) << 16) >> 16));
        mem.write16(v + 0x24, mem.u8(PAN_TABLE + 2 * (pan >> 2)));
        mem.write16(v + 0x26, mem.u8(PAN_TABLE + 2 * (pan >> 2) + 1));
        voiceParam(j, 'VOLL', voiceVolume(j, 0));
        voiceParam(j, 'VOLR', voiceVolume(j, 1));
      }
    }
    mem.write32(slot + 0x14, mem.u32(slot + 0x14) + 3);
  }

  function controllerLoopCount(i) {
    const slot = slotAt(i);
    if (mem.u16(slot + 0x34) === 0) {
      mem.write16(slot + 0x30, mem.u8(slot + 3));
      mem.write16(slot + 0x34, 0);
    }
    mem.write32(slot + 0x14, mem.u32(slot + 0x14) + 3);
  }

  function controllerLoop(i) {
    const slot = slotAt(i);
    const value = mem.u8(slot + 3);
    if (value === 0x14) {
      mem.write16(slot + 0x2e, mem.u8(slot));
      mem.write32(slot + 0x38, mem.u32(slot + 0x14));
      mem.write16(slot + 0x32, 0);
      mem.write16(slot + 0x34, 0);
    } else if (value === 0x1e) {
      if (mem.u16(slot + 0x30) === 0x7f) mem.write16(slot + 0x2c, 1);
      else if (mem.u16(slot + 0x2a) >= mem.u16(slot + 0x30)) {
        mem.write16(slot + 0x2a, 0);
        mem.write32(slot + 0x38, 0);
        mem.write16(slot + 0x2c, 0);
      } else {
        mem.write16(slot + 0x2a, mem.u16(slot + 0x2a) + 1);
        mem.write16(slot + 0x2c, 1);
      }
      mem.write16(slot + 0x32, 0);
    }
    mem.write32(slot + 0x14, mem.u32(slot + 0x14) + 3);
  }

  function controller(i) {
    const slot = slotAt(i);
    const cc = mem.u8(slot + 2);
    if (cc === 7) return controllerVolume(i);
    if (cc === 10) return controllerPan(i);
    if (cc === 6) return controllerLoopCount(i);
    if (cc === 99) return controllerLoop(i);
    throw new Error(`controller ${cc} is not modelled (SNDCLOKS does not use it)`);
  }

  function releaseFinished() {
    for (let k = 0; k < VOICE_COUNT; k++) {
      const e = envx(SEQ_CORE, k, 'tick') & 0xffff;
      const v = voiceAt(k);
      if ((e & 0x7fff) < 3 && mem.u16(v + 8) === 1) {
        const age = mem.u16(v + 0xa);
        for (let j = 0; j < VOICE_COUNT; j++) {
          const w = voiceAt(j);
          if (age < mem.u16(w + 0xa) && mem.u16(w + 0xa) !== 0xffff) mem.write16(w + 0xa, mem.u16(w + 0xa) - 1);
        }
        for (let b = 0; b < VOICE_SIZE; b++) mem.write8(v + b, 0);
        mem.write16(v + 0x1c, 0xffff);
        mem.write16(v + 0xa, 0xffff);
        mem.write16(v + 6, 0xffff);
        mem.write16(CTX + 0xc, mem.u16(CTX + 0xc) - (mem.u16(CTX + 0xc) !== 0 ? 1 : 0));
      }
    }
  }

  function voiceUpdates() {
    for (let j = 0; j < VOICE_COUNT; j++) {
      const v = voiceAt(j);
      if (mem.u16(v) === 1 && mem.u16(v + 0x14) === 1 && mem.u16(v + 6) < 0x18) {
        throw new Error('voice LFO update is not modelled (SNDCLOKS does not use it)');
      }
    }
  }

  function tick() {
    const first = regs.log.length;
    state.notes.length = 0;
    state.ticks += 1;
    releaseFinished();
    let changed = 0;
    for (let i = 0; i < 0x18; i++) {
      const slot = slotAt(i);
      if (mem.u16(slot + 0x26) === 1 && mem.u16(slot + 0x28) === 1) {
        selectBank(i);
        while (mem.s32(slot + 4) <= 0) {
          readEvent(i);
          const r = prepareEvent(i);
          if (r === 1) {
            changed = 1;
            const status = mem.u8(slot) & 0xf0;
            if (status === 0xb0) controller(i);
            else if (status === 0x90) noteOn(i);
            else if (status === 0x80) noteOff(i);
            else if (status === 0xa0) { /* aftertouch: ignored */ }
            else if (status === 0xe0) throw new Error('pitch bend is not modelled (SNDCLOKS does not use it)');
            else if (status === 0xc0) programChange(i);
            else if (status === 0xf0) {
              const type = mem.u8(slot + 2);
              if (type === 0x2f) { endOfSequence(i); break; }
              if (type === 0x51) tempo(i);
            }
          } else changed = 0;
          readDelta(i);
        }
        if (changed === 1) {
          mem.write32(CTX + 4, mem.u32(CTX + 4) | mem.u32(slot + 0xc));
          mem.write32(CTX + 8, mem.u32(CTX + 8) | mem.u32(slot + 0x10));
          mem.write32(slot + 0x10, 0);
          mem.write32(slot + 0xc, 0);
          changed = 0;
        }
        if (mem.u16(slot + 0x3e) !== 0) mem.write32(slot + 4, mem.u32(slot + 4) - mem.u32(slot + 8));
        if (mem.u16(slot + 0x2c) === 1) {
          mem.write8(slot, mem.u8(slot + 0x2e));
          mem.write8(slot + 1, mem.u8(slot + 0x2e));
          mem.write32(slot + 0x14, mem.u32(slot + 0x38));
          mem.write16(slot + 0x2c, 0);
          mem.write16(slot + 0x28, 1);
          mem.write32(slot + 4, 0);
        }
      }
    }
    if (mem.u32(CTX + 8) !== 0) setSwitch(regs, SEQ_CORE, 'KOFF', mem.u32(CTX + 8));
    if (mem.u32(CTX + 4) !== 0) setSwitch(regs, SEQ_CORE, 'KON', mem.u32(CTX + 4));
    mem.write32(CTX + 4, 0);
    mem.write32(CTX + 8, 0);
    voiceUpdates();
    return regs.log.slice(first);
  }

  return { state, mem, regs, tick, voiceAt, slotAt, pitchOf: (...a) => pitchOf(mem, ...a) };
}

export { regAddress };
