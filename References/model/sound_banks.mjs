const u16 = (b, at) => b.readUInt16LE(at);
const u32 = (b, at) => b.readUInt32LE(at);

function sshd(buf) {
  if (buf.length < 0x18 || buf.toString('latin1', 0xc, 0x10) !== 'SShd') throw new Error('not an SShd bank');
}

export function parseHd(buf) {
  sshd(buf);
  const programTable = u32(buf, 0x10) === 0xffffffff ? null : u32(buf, 0x10);
  const velocityTable = u32(buf, 0x14) === 0xffffffff ? null : u32(buf, 0x14);
  const effectTable = u32(buf, 0x2c) === 0xffffffff ? null : u32(buf, 0x2c);
  const programs = [];
  if (programTable !== null) {
    if (programTable + 2 > buf.length) throw new Error('program table past the end');
    const top = u16(buf, programTable);
    for (let p = 0; p <= top; p++) {
      const entry = programTable + 2 + 2 * p;
      if (entry + 2 > buf.length) throw new Error('program entry past the end');
      const rel = u16(buf, entry);
      if (rel === 0xffff) continue;
      const at = programTable + rel;
      if (at + 8 > buf.length) throw new Error(`program ${p} past the end`);
      const head = buf[at];
      const toneCount = (head & 0x7f) + 1;
      const tones = [];
      for (let t = 0; t < toneCount; t++) {
        const o = at + 8 + 16 * t;
        if (o + 16 > buf.length) throw new Error(`program ${p} tone ${t} past the end`);
        tones.push({
          keyLow: buf[o], keyHigh: buf[o + 1], rootKey: buf[o + 2], fineTune: buf.readInt8(o + 3),
          sampleStart: u16(buf, o + 4), adsr1: u16(buf, o + 6), adsr2: u16(buf, o + 8),
          pan: buf[o + 11], bendRange: buf[o + 13], flags: buf[o + 15], raw: Buffer.from(buf.subarray(o, o + 16)),
        });
      }
      programs.push({ id: p, head, volume: buf[at + 1], pan: buf[at + 2], offset: at, tones });
    }
  }
  const velocity = velocityTable === null ? null : Array.from(buf.subarray(velocityTable + 2, velocityTable + 2 + 128));
  let effects = null;
  let effectMaster = null;
  if (effectTable !== null) {
    effectMaster = buf[effectTable];
    effects = [];
    for (let n = 0; effectTable + 0x20 + 64 * n + 20 <= buf.length && n < 14; n++) {
      const o = effectTable + 0x20 + 64 * n;
      effects.push({ left: u16(buf, o), right: u16(buf, o + 2), pitch: u16(buf, o + 4), flagsA: u16(buf, o + 6), adsr1: u16(buf, o + 8), adsr2: u16(buf, o + 10), word12: u16(buf, o + 12), word14: u16(buf, o + 14), bdOffset: u32(buf, o + 16), raw: Buffer.from(buf.subarray(o, o + 20)) });
    }
  }
  return { programs, velocity, effects, effectMaster, effectTable };
}

const readVlq = (buf, at) => {
  let v = 0;
  for (let i = 0; i < 4; i++) {
    if (at >= buf.length) throw new Error('VLQ past the end');
    const c = buf[at++];
    v = (v << 7) | (c & 0x7f);
    if ((c & 0x80) === 0) return { value: v, next: at };
  }
  throw new Error('VLQ longer than four bytes');
};

export function parseSq(buf) {
  if (buf.length < 0x110 || buf.toString('latin1', 0xc, 0x10) !== 'SSsq') throw new Error('not an SSsq sequence');
  const channels = [];
  for (let c = 0; c < 16; c++) {
    const o = 0x10 + 16 * c;
    const program = buf[o + 2];
    if (program === 0xff) continue;
    channels.push({ channel: buf[o + 1], program, volume: buf[o + 3], pan: buf[o + 4] });
  }
  const events = [];
  let at = 0x110;
  let tick = 0;
  let status = 0;
  for (;;) {
    if (at >= buf.length) throw new Error('SQ has no end marker');
    let s = buf[at];
    if (s & 0x80) { status = s; at++; } else s = status;
    if (s === 0) throw new Error('SQ event without a status');
    if (s === 0xff) {
      const type = buf[at++];
      if (type === 0x2f) { events.push({ tick, status: 0xff, data: [0x2f] }); break; }
      if (type === 0x51) {
        events.push({ tick, status: 0xff, data: [0x51, buf[at], buf[at + 1], buf[at + 2]] });
        at += 3;
        continue;
      }
      throw new Error(`unknown meta event 0x${type.toString(16)}`);
    }
    const count = (s & 0xf0) === 0xc0 || (s & 0xf0) === 0xd0 ? 1 : 2;
    if (at + count > buf.length) throw new Error('SQ event past the end');
    events.push({ tick, status: s, data: Array.from(buf.subarray(at, at + count)) });
    at += count;
    const delta = readVlq(buf, at);
    tick += delta.value;
    at = delta.next;
  }
  return { volume: u16(buf, 0), resolution: u16(buf, 2), tempo: u32(buf, 4), channels, events };
}
