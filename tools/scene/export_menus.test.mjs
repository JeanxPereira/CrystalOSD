import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REFERENCES = (process.env.CRYSTALOSD_DATA ?? 'D:/CodingProjects/CrystalOSD-Data').replace(/\\/g, '/');
const CAPTURES = 'D:/CodingProjects/Watson/Runtime/captures';
const env = { ...process.env, CLOCK_BUILD: 'hdd', CRYSTALOSD_DATA: REFERENCES };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'menus-'));
const run = (script, args) => execFileSync(process.execPath, [path.join(HERE, script), ...args], { env, stdio: 'pipe', maxBuffer: 1 << 28 });
const exportOf = (capture) => {
  const out = path.join(dir, `${capture}.json`);
  run('export_fixture.mjs', [`${CAPTURES}/${capture}.trace.jsonl`, out]);
  return JSON.parse(fs.readFileSync(out, 'utf8'));
};
const MENU_KEYS = ['pad', 'disc', 'screenCode', 'configPage', 'configRamp', 'configEntries', 'mainMenu', 'versionRamp', 'dialogRamp', 'firstRunRamp',
  'pagePointers', 'entryActive', 'menuLengths', 'listConstants', 'adjustFields', 'configGate', 'cubeList', 'cubeColours', 'cubeRecord', 'spin',
  'cubeConstants', 'centreFactors', 'cubeView', 'cubeScreen', 'layerClear', 'addRecord', 'halfRecord', 'chainRecord'];
const STAGES = ['cubes', 'menuStep', 'menus', 'endOfFrame'];
let enter = exportOf('hddosd-110U-whole3-enter');

test('every frame of a menu capture holds the menus\' pieces and its stages', () => {
  for (const frame of enter.frames) {
    for (const key of MENU_KEYS) assert.ok(key in frame.input, `frame ${frame.index}: input.${key}`);
    assert.equal(frame.input.configEntries.length, 9);
    for (const stage of STAGES) {
      assert.ok(frame.expect.stages[stage].before.configPage, `frame ${frame.index} ${stage}.before`);
      assert.ok(frame.expect.stages[stage].after.configPage, `frame ${frame.index} ${stage}.after`);
    }
    assert.equal(frame.between === null, frame.index === 0);
  }
});

test('the opening of System Configuration, the cubes and the page strings are recorded', () => {
  const opened = enter.frames.find((f) => f.expect.stages.menus.before.configPage.ramp.state === 0 && f.expect.stages.menus.after.configPage.ramp.state === 1);
  assert.ok(opened, 'no frame starts the page ramp');
  assert.ok(opened.input.pad.pressed & 0x20, 'cross is pressed in the frame that opens the page');
  assert.ok(enter.frames.some((f) => f.expect.cubes.length > 0 && f.expect.cubes[0].label.startsWith('cube')));
  assert.ok(enter.frames.some((f) => f.expect.text.pages.length > 0));
  assert.ok(enter.frames.some((f) => f.expect.listFade));
  enter = null;
});

test('whole3-clock keeps every old key byte for byte', () => {
  const fresh = exportOf('hddosd-110U-whole3-clock');
  const installed = JSON.parse(fs.readFileSync(`${REFERENCES}/fixtures/hddosd-110U-whole3-clock/scene.pre-menus.json`, 'utf8'));
  const pick = (from, keys) => Object.fromEntries(Object.keys(keys).filter((key) => key in from).map((key) => [key, from[key]]));
  assert.equal(fresh.frames.length, installed.frames.length);
  fresh.frames.forEach((frame, i) => {
    const old = installed.frames[i];
    const kept = { ...pick(frame, old), input: pick(frame.input, old.input), expect: { ...pick(frame.expect, old.expect), after: pick(frame.expect.after, old.expect.after) } };
    if (old.expect.text) kept.expect.text = pick(frame.expect.text, old.expect.text);
    assert.ok(JSON.stringify(kept) === JSON.stringify(old), `frame ${i}: an old key changed`);
  });
});

const out = path.join(dir, 'synthetic');
const NAMES = ['menu-cursor', 'enter-mash', 'config-wrap', 'square', 'entries', 'back', 'back-mash', 'square-mash', 'browser', 'long'];
let generated = false;
const scenario = (name) => {
  if (!generated) { run('menus_synthetic.mjs', [out]); generated = true; }
  return JSON.parse(fs.readFileSync(path.join(out, name, 'scene.json'), 'utf8'));
};
const after = (f, stage = 'menus') => f.expect.stages[stage].after;
const UP = 0x1000;

test('every scripted scenario runs through the model, its state carried from frame to frame', () => {
  for (const name of NAMES) {
    const scene = scenario(name);
    assert.equal(scene.stagesOnly, true);
    assert.ok(scene.frames.length > 30, name);
    scene.frames.forEach((f, i) => {
      assert.equal(f.index, i, name);
      assert.ok(STAGES.every((s) => f.expect.stages[s]), `${name} frame ${i}`);
      if (i === 0) return;
      const { pad, scene: written, ...left } = scene.frames[i - 1].expect.stages.endOfFrame.after;
      const { pad: _, scene: __, ...entered } = f.between.before;
      assert.deepEqual(entered, left, `${name} frame ${i}: the state between frames moved outside the model`);
    });
  }
});

test('menu-cursor stops at both ends of the main menu', () => {
  const { frames } = scenario('menu-cursor');
  assert.deepEqual([2, 8, 14, 20, 26].map((k) => after(frames[k]).mainMenu.selected), [1, 1, 0, 0, 0]);
});

test('config-wrap wraps the list both ways', () => {
  const selected = scenario('config-wrap').frames.map((f) => after(f).configPage.selected);
  const steps = selected.flatMap((v, i) => (i > 0 && v !== selected[i - 1] ? [[selected[i - 1], v]] : []));
  assert.deepEqual(steps, [[0, 6], [6, 5], [5, 6], [6, 0], [0, 1]]);
});

test('entries: confirm pulses the cube, cancel does not, and up raises the year', () => {
  const { frames } = scenario('entries');
  const level = frames.map((f) => after(f).configPage.level);
  const rising = level.flatMap((v, i) => (i > 0 && v === 1 && level[i - 1] === 0 ? [i] : []));
  const falling = level.flatMap((v, i) => (i > 0 && v === 0 && level[i - 1] === 1 ? [i] : []));
  assert.equal(rising.length, 3);
  assert.equal(falling.length, 3);
  const pulse = (k) => after(frames[k], 'cubes').cubeList.pulse;
  const start = pulse(falling[0] + 1);
  assert.equal(pulse(falling[0]), '0x00000000', 'no pulse before the first confirm');
  assert.notEqual(start, '0x00000000', 'the first confirm pulses');
  assert.notEqual(pulse(falling[1] + 1), start, 'the cancel does not restart the pulse');
  assert.equal(pulse(falling[2] + 1), start, 'the second confirm restarts the pulse');
  const raised = frames.find((f) => f.input.pad.pressed & UP && f.expect.stages.menus.before.configPage.level === 1);
  assert.ok(raised, 'up inside an entry');
  assert.equal(after(raised).configItems[6], raised.expect.stages.menus.before.configItems[6] + 1, 'up raises the year');
});

test('back closes System Configuration', () => {
  const ramp = scenario('back').frames.map((f) => after(f).configRamp.state);
  assert.ok(ramp.includes(3) && ramp.lastIndexOf(0) > ramp.indexOf(3), 'the page ramp reaches 3 then 0');
});

test('buttons mashed while System Configuration closes change nothing', () => {
  const { frames } = scenario('back-mash');
  const page = frames.map((f) => after(f).configPage.ramp.state);
  assert.ok(page.includes(3) && page.at(-1) === 0, 'the page closes and the ramp finishes');
  assert.ok(frames.every((f) => after(f, 'menuStep').menuRamp.state === 0 && after(f, 'endOfFrame').scene.leaving === 0 && after(f).mainMenu.ramp.state === 2));
});

test('square hides the menu and shows it, also with buttons mashed during its transitions', () => {
  for (const name of ['square', 'square-mash']) {
    const { frames } = scenario(name);
    const states = frames.map((f) => after(f, 'menuStep').menuRamp.state);
    assert.ok(states.includes(2) && states.lastIndexOf(3) > states.indexOf(2), `${name}: square hides the menu, then shows it`);
    assert.equal(states.at(-1), 0, `${name}: the menu ramp finishes`);
    assert.equal(after(frames.at(-1)).configPage.ramp.state, 2, `${name}: System Configuration stays open`);
    assert.ok(frames.every((f) => after(f).configPage.level === 0), `${name}: no entry is entered`);
  }
});

test('cross on Browser leaves the clock (the model, option on)', () => {
  const { frames } = scenario('browser');
  assert.ok(frames.some((f) => f.between?.after.mainMenu.selected === 0 && f.input.pad.pressed & 0x20), 'cross is pressed on Browser');
  assert.ok(frames.every((f) => after(f).configPage.ramp.state === 0), 'Browser never opens System Configuration');
  const last = after(frames.at(-1), 'endOfFrame');
  assert.equal(last.scene.leaving, 1);
  assert.equal(last.screenCode, 9999);
});

test('long wraps the list position and the spin', () => {
  const { frames } = scenario('long');
  const positions = frames.map((f) => after(f, 'cubes').cubeList.position);
  assert.ok(positions.some((p, i) => i > 0 && p > positions[i - 1] + 90000), 'the list position wraps');
  assert.ok(frames.some((f, i) => i > 0 && f.input.spin < frames[i - 1].input.spin), 'the spin wraps');
});
