// What a clock frame does to its state after it has drawn: the clock logic (HDD func_0022F1A0:
// appearance ramp, time to angles, colours, progress), and the scene scale (first half of HDD
// func_00232640). Rules: facts/clock-state.md, facts/clock-camera.md.
import { f, add, sub, toInt, s16, u16, ints, tickRamp } from './clock_math.mjs';

const seconds = (time) => add(time.readInt32LE(4), f(time.readFloatLE(0) / 1000));
const minutes = (time) => add(time.readInt32LE(8), f(seconds(time) / 60));
const hours = (time) => add(time.readInt32LE(12), f(minutes(time) / 60));
/** One step of an eased 16-bit angle: the difference, wrapped to 16 bits, times a factor. */
const ease = (target, old, factor) => u16(toInt(add(f(s16(target - old) * factor), s16(old))));

/** HDD func_0022EBD0: the time becomes the current rod, the eased angles and the progress target. */
function angles(m) {
  const time = m.at('time'), state = m.at('state'), eased = m.at('eased'), k = m.at('logicConstants');
  const k1 = k.readFloatLE(0), k2 = k.readFloatLE(4);
  const current = toInt(hours(time)) % 12;
  const turn = ((current << 16) >>> 0) / 12 >>> 0;
  const oldSeconds = state.readUInt16LE(4), oldRod = state.readUInt16LE(6);
  const snap = Math.abs(s16(oldSeconds)) < 201 || s16(oldSeconds) === -32768;
  const secondsTurn = toInt(f(f(seconds(time) * 65536) / 60));
  const hourOld = eased.readInt16LE(2);
  const hourStep = s16(toInt(sub(f(f(hours(time) * 65536) / 12), hourOld)));
  const progress = sub(1, f(minutes(time) / 60));
  state.writeInt32LE(current, 0);
  state.writeUInt16LE(snap ? u16(turn) : ease(turn, oldRod, k1), 6);
  state.writeUInt16LE(ease(secondsTurn, oldSeconds, k2), 4);
  const secondHand = ease(secondsTurn, eased.readUInt16LE(0), k2);
  eased.writeUInt16LE(u16(toInt(add(f(hourStep * k2), hourOld))), 2);
  eased.writeUInt16LE(secondHand, 0);
  state.writeFloatLE(progress, 0x270);
  eased.writeFloatLE(progress, 4);
}

/** Move four ints one unit each toward a target, in place; true when nothing had to move. */
function chase(buffer, at, target) {
  let moved = false;
  for (let c = 0; c < 4; c++) {
    const value = buffer.readInt32LE(at + c * 4);
    if (value === target[c]) continue;
    buffer.writeInt32LE(value + (value < target[c] ? 1 : -1), at + c * 4);
    moved = true;
  }
  return !moved;
}

/** A colour that walks through a table, one unit every ninth call (HDD func_0022EAD0, func_0022EB50). */
function cycle(colour, at, counters, slot, table) {
  const counter = counters.readInt32LE(slot * 8 + 4);
  if (counter >>> 0 < 8) { counters.writeInt32LE(counter + 1, slot * 8 + 4); return; }
  let index = counters.readInt32LE(slot * 8);
  if (chase(colour, at, ints(table, index * 16))) {
    index += 1;
    if (table.readInt32LE(index * 16 + 12) === -1) index = 0;
  }
  counters.writeInt32LE(index, slot * 8);
  counters.writeInt32LE(0, slot * 8 + 4);
}

/** HDD func_0022EE20 and func_0022E8C0: the two cycling colours, their mix, and every chaser. */
function colours(m) {
  const state = m.at('state'), base = m.at('colours'), counters = m.at('cycleCounters'), tables = m.at('cycleTables');
  cycle(base, 0, counters, 0, tables.subarray(0));
  base.copy(state, 0x290, 0, 16);
  [0xa7, 0xd9, 0xff, 0].forEach((value, c) => state.writeInt32LE(value, 0x280 + c * 4));
  cycle(state, 0x280, counters, 1, tables.subarray(0x60));
  for (let c = 0; c < 3; c++) state.writeInt32LE((state.readInt32LE(0x280 + c * 4) + base.readInt32LE(c * 4)) >> 1, 0x290 + c * 4);
  counters.writeInt32LE(3, 16);

  const current = state.readInt32LE(0);
  const others = ints(base, 0), currentBase = ints(state, 0x290), othersReflect = ints(base, 0x10), currentReflect = ints(base, 0x30);
  for (let i = 0; i < 12; i++) {
    chase(state, 0x20 + i * 0x30, i === current ? currentBase : others);
    chase(state, 0x30 + i * 0x30, i === current ? currentReflect : othersReflect);
  }
  chase(state, 0x250, ints(state, 0x280));
  chase(state, 0x260, ints(base, 0x20));
}

/** HDD func_0022F1A0, called once per frame after everything is drawn. */
export function logic(m) {
  const ramp = m.at('appearance'), state = m.at('state');
  tickRamp(ramp);
  angles(m);
  colours(m);
  const step = m.float('logicConstants', 8);
  const current = state.readInt32LE(0);
  const appearance = f(Math.trunc((ramp.readInt32LE(4) * 128) / ramp.readInt32LE(0)) * 0.0078125);
  for (let i = 0; i < 12; i++) {
    let progress = 0;
    if (i === current) {
      const target = state.readFloatLE(0x270), old = state.readFloatLE(0x14 + i * 0x30);
      if (old < target) { progress = add(old, step); if (target < progress) progress = target; }
      else progress = target;
    }
    state.writeFloatLE(progress, 0x14 + i * 0x30);
    state.writeFloatLE(appearance, 0x10 + i * 0x30);
  }
}

/** First half of HDD func_00232640: the cubes' spin goes on, the scene scale eases toward its target. */
export function scale(m, hdd) {
  if (m.has('spin')) { const spin = m.at('spin'); spin.writeUInt16LE((spin.readUInt16LE(0) + 0x1e) & 0xffff, 0); }
  const old = m.float('scene', 0);
  const filled = hdd ? m.int('timeFilled') !== 0 : true;
  m.setFloat('scene', filled ? add(f(sub(m.float('scaleTarget'), old) * m.float('scaleFactor')), old) : 0, 0);
}
