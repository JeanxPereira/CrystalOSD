// The app's start state: the clock as one real capture holds it at a frame's entry. The model has no default
// state, so the app starts from a captured moment and real time drives it from there.
// Takes frames[0].input of a scene.json (tools/scene/export_fixture.mjs) and keeps only the pieces
// Source/Scene/SceneInputs.cpp reads (clockInputs, frameInputs), unchanged.
//
// node tools/scene/make_start.mjs <scene.json> [out.json]
//   default in:  D:/CodingProjects/CrystalOSD-Data/fixtures/hddosd-110U-whole3-clock/scene.json
//   default out: resources/clock/start.json
import fs from 'node:fs';
import path from 'node:path';

const KEYS = [
  'time', 'eased', 'state', 'appearance', 'colours', 'cycleCounters', 'cycleTables', 'logicConstants', 'scene',
  'scaleTarget', 'scaleFactor', 'timeFilled', 'mode', 'level', 'overlayLevel', 'vignetteRamp', 'vignetteLength',
  'menuRamp', 'tail', 'counter', 'proportions', 'position', 'direction', 'up', 'rotation', 'cameraOffset', 'zmax',
  'cameraFactor', 'greyRamp', 'greys', 'ringRecord', 'tint', 'blurRecord', 'copyRecord', 'fadeRecord', 'bars',
  'column', 'template', 'rings', 'spriteFade', 'clearColour', 'display', 'tubeConstants', 'orbConstants',
  'orbColour', 'screen', 'index', 'item0', 'font', 'textRamps', 'configItems', 'mechaconParam', 'videoMode',
  'wide', 'orbRandom', 'orbColours',
];
const OPTIONAL = new Set(['font', 'textRamps', 'mechaconParam', 'videoMode', 'wide', 'orbRandom', 'orbColours']);

const MENU_KEYS = [
  'pad', 'disc', 'screenCode', 'configPage', 'configRamp', 'configEntries', 'mainMenu', 'versionRamp', 'dialogRamp',
  'firstRunRamp', 'pagePointers', 'entryActive', 'menuLengths', 'listConstants', 'adjustFields', 'configGate',
  'configDirty', 'rtcMirror', 'cubeList', 'cubeColours', 'cubeRecord', 'spin', 'cubeConstants', 'centreFactors',
  'cubeView', 'cubeScreen', 'layerClear', 'addRecord', 'halfRecord', 'chainRecord', 'listFade', 'body', 'cubeRamp',
];

const args = process.argv.slice(2);
const frameAt = args.indexOf('--frame');
const frameWanted = frameAt >= 0 ? args.splice(frameAt, 2)[1] : null;
const input = args[0] ?? 'D:/CodingProjects/CrystalOSD-Data/fixtures/hddosd-110U-whole3-clock/scene.json';
const output = args[1] ?? 'tests/data/start/start.json';
const scene = JSON.parse(fs.readFileSync(input, 'utf8'));
const first = frameWanted === 'clock' ? scene.frames.find((f) => f.input.menuRamp.state === 2)
  : frameWanted !== null ? scene.frames[Number(frameWanted)] : scene.frames[0];
if (!first) throw new Error('no such frame');
const start = { capture: scene.capture, build: scene.build, frame: first.index };
for (const key of KEYS) {
  if (!(key in first.input)) {
    if (OPTIONAL.has(key)) continue;
    throw new Error(`frames[0].input has no ${key}`);
  }
  start[key] = first.input[key];
}
for (const key of MENU_KEYS) if (key in first.input) start[key] = first.input[key];
const text = `{\n${Object.entries(start).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n}\n`;
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, text);
console.log(`${output}: ${text.length} bytes from ${scene.capture} frame ${first.index}`);
