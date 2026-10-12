import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const TRACE = 'D:/CodingProjects/Watson/Runtime/captures/hddosd-110U-whole3-clock.trace.jsonl';
const REFERENCES = path.join(ROOT, 'References');
const VERIFY = path.join(REFERENCES, 'scripts/verify_frame.mjs');
const EXPORT = path.join(HERE, 'export_fixture.mjs');
const INSTRUMENT = path.join(HERE, 'instrument.mjs');
const env = { ...process.env, CLOCK_BUILD: 'hdd' };
const MESH_FACES = JSON.parse(fs.readFileSync(path.join(ROOT, 'facts/data/rod-mesh.json'), 'utf8')).faces;

const runVerify = (preload) => spawnSync(process.execPath, [...(preload ? ['--import', pathUrl(INSTRUMENT)] : []), VERIFY, TRACE, '--carry'], { env, encoding: 'utf8', maxBuffer: 1 << 26 });
const pathUrl = (file) => new URL(`file:///${file.replace(/\\/g, '/')}`).href;
const framesOf = (output) => Number(/frames compared: (\d+)/.exec(output)[1]);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scene-'));
const first = path.join(dir, 'a.json'), second = path.join(dir, 'b.json');
execFileSync(process.execPath, [EXPORT, TRACE, first], { env, stdio: 'pipe' });
execFileSync(process.execPath, [EXPORT, TRACE, second], { env, stdio: 'pipe' });
const bytes = fs.readFileSync(first);
const scene = JSON.parse(bytes.toString('utf8'));

test('the fixture has every frame verify_frame --carry compares', () => {
  const plain = runVerify(false);
  assert.equal(plain.status, 0, plain.stdout);
  assert.equal(scene.build, 'hdd');
  assert.equal(scene.capture, 'hddosd-110U-whole3-clock');
  assert.equal(scene.frames.length, framesOf(plain.stdout));
  scene.frames.forEach((frame, i) => assert.equal(frame.index, i));
});

test('every frame has twelve rods, each with every face of the mesh', () => {
  for (const frame of scene.frames) {
    assert.equal(frame.expect.rods.length, 12, `frame ${frame.index}`);
    assert.deepEqual(frame.expect.rods.map((rod) => rod.number).sort((a, b) => a - b), [...Array(12).keys()]);
    for (const rod of frame.expect.rods) {
      assert.equal(rod.record.faces, MESH_FACES);
      assert.equal(rod.faces.length, MESH_FACES, `frame ${frame.index} rod ${rod.number}`);
      rod.faces.forEach((face, i) => assert.equal(face.index, i));
      assert.ok(rod.faces.some((face) => face.refracted.length > 0));
    }
    assert.equal(frame.expect.orbs.length, 7);
    assert.equal(frame.expect.drawOrder.length, 19);
  }
});

test('floats are 32-bit patterns and every number is an integer', () => {
  const HEX = /^0x[0-9a-f]{8}$/;
  let floats = 0;
  const walk = (value, where) => {
    if (typeof value === 'number') assert.ok(Number.isInteger(value), `${where} = ${value}`);
    else if (typeof value === 'string') { if (value.startsWith('0x')) { assert.match(value, HEX, where); floats += 1; } }
    else if (Array.isArray(value)) value.forEach((item, i) => walk(item, `${where}[${i}]`));
    else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) walk(item, `${where}.${key}`);
  };
  walk(scene.frames, 'frames');
  assert.ok(floats > 1000);
  const camera = scene.frames[0].expect.camera;
  assert.equal(camera.screen.length, 4);
  camera.screen.forEach((row) => { assert.equal(row.length, 4); row.forEach((x) => assert.match(x, HEX)); });
  assert.match(scene.frames[0].input.time.ms, HEX);
});

test('re-running gives identical bytes', () => {
  assert.ok(bytes.equals(fs.readFileSync(second)));
});

test('verify_frame --carry still says FOUND with the instrumentation loaded', () => {
  const run = runVerify(true);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /verdict: FOUND \d+ frames/);
  assert.equal(framesOf(run.stdout), scene.frames.length);
  assert.match(run.stderr + run.stdout, /scene probe: \d+ frames recorded/);
});
