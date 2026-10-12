import test from 'node:test';
import assert from 'node:assert/strict';

const REFERENCES = new URL('../../References', import.meta.url).href;
const TRACE = 'D:/CodingProjects/Watson/Runtime/captures/hddosd-110U-opening-full.trace.jsonl';
const { exportOpening } = await import('./export_opening.mjs');
const { readTraceFor } = await import(`${REFERENCES}/lib/trace.mjs`);
const lights = await import(`${REFERENCES}/scripts/verify_opening_lights.mjs`);
const camera = await import(`${REFERENCES}/scripts/verify_opening_camera.mjs`);
const cubes = await import(`${REFERENCES}/scripts/verify_opening_cubes.mjs`);
const fog = await import(`${REFERENCES}/scripts/verify_opening_fog.mjs`);

const HEX = /^0x[0-9a-f]{8}$/;
const first = await exportOpening(TRACE);

test('the phase is the one the lights verifier reads', () => {
  const entry = readTraceFor(TRACE, lights.PROBES).probes.find((p) => p.pc === 0x0021f5f8);
  assert.equal(first.externals.phase, entry.mem[1].bytes.readInt32LE(0));
});

test('one frame per module call of the camera verifier', () => {
  const verdict = camera.verify(TRACE);
  assert.equal(verdict.problems.length, 0);
  assert.equal(verdict.frames, 247);
  assert.equal(first.frames.length, verdict.frames);
  assert.equal(first.externals.firstCounter, 1);
  assert.deepEqual(first.externals.discAtCounter, [[1, 0x65], [2, 0x64]]);
});

test('every float is a 10-character hex string', () => {
  let floats = 0;
  const check = (value) => { floats += 1; assert.match(value, HEX); };
  for (const frame of first.frames) {
    const t = frame.timeline;
    Object.values(t.block).forEach(check);
    Object.values(t.after.block).forEach(check);
    [...t.camera, ...t.up, t.roll, ...t.after.camera, ...t.after.up, t.after.roll].forEach(check);
    if (frame.fog) frame.fog.offsets.forEach(check);
    if (frame.lights) [...frame.lights.cosines, ...frame.lights.sines].forEach(check);
  }
  assert.ok(floats > 10000);
});

test('the cubes blocks sum to 994 and the other verifiers still find their frames', () => {
  const total = first.frames.reduce((n, f) => n + (f.cubes ?? []).filter((r) => r.k === 1).length, 0);
  assert.equal(total, 994);
  assert.equal(first.frames.filter((f) => f.timeline.fade !== undefined).length, 30);
  assert.equal(first.frames.filter((f) => f.timeline.blur !== undefined).length, 33);
  assert.equal(first.frames.filter((f) => f.timeline.logo).length, 120);
  assert.equal(first.frames.filter((f) => f.fog).length, 246);
  assert.equal(first.frames.filter((f) => f.lights?.records.length).length, 218);
  assert.equal(cubes.verify(TRACE).problems.length, 0);
  assert.equal(fog.verify(TRACE).problems.length, 0);
  assert.equal(lights.verify(TRACE).problems.length, 0);
});

test('running again gives the same bytes', async () => {
  const again = await exportOpening(TRACE);
  assert.equal(JSON.stringify(again), JSON.stringify(first));
});
