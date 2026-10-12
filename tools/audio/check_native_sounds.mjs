// The native menu, opening and boot sounds against the console: the commands (SoundCommandsTest), the WAV of each scenario rendered by the app's own
// audio path (LiveAudio, no device, never played), the plots, and the boot against Watson's WAV with the sound front's budgets.
// node tools/audio/check_native_sounds.mjs [--no-build] [--write]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..').split(path.sep).join('/');
const BUILD = `${ROOT}/build/tests`;
const OUT = `${ROOT}/out/sound`;
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const cache = fs.readFileSync(`${BUILD}/CMakeCache.txt`, 'utf8');
const cached = (key) => cache.match(new RegExp(`^${key}:[A-Z]+=(.*)$`, 'm'))?.[1];
const CAPTURES = cached('CLOCK_CAPTURES'), DUMPS = cached('CLOCK_DUMPS'), REFERENCES = cached('CLOCK_REFERENCES');
const NODE = process.execPath;
const run = (cmd, argv, options = {}) => spawnSync(cmd, argv, { encoding: 'utf8', maxBuffer: 1 << 28, cwd: ROOT, ...options });
const lab = `${BUILD}/bin/SoundLab.exe`;
const CAPTURE_NAMES = [
  ...['cursor', 'cursor-ends', 'cross-browser', 'dedup', 'cross-config', 'config-list', 'config-dedup', 'config-circle', 'config-entry0', 'config-entry0-confirm', 'config-entry1', 'square-config', 'square-menu', 'version', 'version-edges', 'version-rising'].map((n) => `menu-${n}`),
  ...['intro', 'illegal', 'forced', 'ready-b', 'go-wait', 'disc-6a', 'disc-6c', 'disc-6e', 'disc-6f', 'disc-72', 'disc-73', 'disc-74'].map((n) => `opening-${n}`),
  'clock-boot', 'clock-boot-forced',
].map((n) => `hddosd-110U-sound-${n}`);

if (!flag('no-build')) {
  const r = run('powershell', ['-NoProfile', '-File', `${ROOT}/tools/build.ps1`, 'build', 'tests-debug', '--target', 'AudioSoundCommandsTest', '--target', 'SoundLab']);
  if (r.status !== 0) { console.log('FAIL build'); console.log((r.stdout + r.stderr).split('\n').filter((l) => /error|FAILED/.test(l)).slice(0, 8).join('\n')); process.exit(1); }
}
fs.mkdirSync(OUT, { recursive: true });
const must = (r, what) => { if (r.status !== 0) { console.log(`FAIL ${what}\n${(r.stdout + r.stderr).split('\n').slice(-12).join('\n')}`); process.exit(1); } return r.stdout; };

must(run(NODE, [`${ROOT}/tests/audio/export_command_probes.mjs`, `${ROOT}/References`, CAPTURES, `${OUT}/cmds`, ...CAPTURE_NAMES]), 'export_command_probes');
const test = run(`${BUILD}/bin/AudioSoundCommandsTest.exe`, [`${DUMPS}/hddosd.elf`, `${DUMPS}/FNTOSD`, `${ROOT}/facts/data/rod-mesh.json`, `${ROOT}/References/model/cube-mesh.json`,
  `${REFERENCES}/fixtures/hddosd-110U-cold-run-menu/input-log.json`, `${OUT}/cmds`, ...CAPTURE_NAMES], { env: { ...process.env, SOUND_RENDER_DIR: `${OUT}/native`, SOUND_RESOURCES: DUMPS } });
fs.writeFileSync(`${OUT}/commands-report.txt`, test.stdout + test.stderr);
console.log(`commands: ${/EQUAL/.test(test.stdout) && !/DIFFERENT/.test(test.stdout) ? 'every scenario EQUAL' : 'DIFFERENT (listed in tests/audio/sound_command_differences.txt), see out/sound/commands-report.txt'}`);

fs.mkdirSync(`${OUT}/plots`, { recursive: true });
for (const name of CAPTURE_NAMES) {
  const short = name.replace('hddosd-110U-sound-', '');
  const wav = `${OUT}/native/${name}.native.wav`;
  const samples = new Int16Array(fs.readFileSync(wav).buffer.slice(44));
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  must(run(lab, ['plot', wav, `${OUT}/plots/${short}`]), `plot ${short}`);
  console.log(`  ${short}: ${samples.length / 2} samples, peak ${peak}${peak === 0 ? ' (silent)' : ''}`);
}

const BOOT = 'hddosd-110U-sound-boot-a';
must(run(NODE, [`${ROOT}/tests/audio/export_render.mjs`, `${ROOT}/References/model`, CAPTURES, `${OUT}/render`, BOOT]), 'export_render');
must(run(NODE, [`${ROOT}/tests/audio/native_boot_events.mjs`, `${OUT}/render`, BOOT, `${OUT}/native/hddosd-110U-sound-clock-boot.native.commands.txt`, `${OUT}/boot/events`]), 'native_boot_events');
const watson = `${CAPTURES}/${BOOT}.wav`;
let failed = false;
for (const variant of ['v1', 'v2', 'v2-start', 'v2-ramp', 'v2-pair', 'v2-offset']) {
  const wav = `${OUT}/boot/native-${variant}.wav`;
  must(run(lab, ['render', CAPTURES, `${OUT}/boot/events`, `native-${variant}`, DUMPS, wav, 'modelled', 'image']), `render ${variant}`);
  const budget = `${ROOT}/tests/audio/budgets/native-boot-${variant}.json`;
  if (flag('write')) console.log(run(lab, ['budget', wav, watson, budget, '--write']).stdout.trim());
  const verdict = run(lab, ['budget', wav, watson, budget]);
  failed ||= verdict.status !== 0;
  const cmp = run(lab, ['compare', wav, watson]).stdout;
  console.log(`boot ${variant}: ${verdict.status === 0 ? 'PASS' : 'FAIL'} differ ${cmp.match(/^differ (\d+)/m)?.[1]} maxAbs ${cmp.match(/^maxAbs (\d+)/m)?.[1]} first ${cmp.match(/^first (-?\d+)/m)?.[1]}${verdict.status === 0 ? '' : ` (${verdict.stderr.trim().split('\n').join('; ')})`}`);
}
must(run(lab, ['plot', watson, `${OUT}/plots/boot-a-console`]), 'plot boot-a console');
must(run(lab, ['plot', `${OUT}/boot/native-v2.wav`, `${OUT}/plots/boot-a-native`]), 'plot boot-a native');
must(run(lab, ['plot-diff', `${OUT}/boot/native-v2.wav`, watson, `${OUT}/plots/boot-a-native-minus-console`]), 'plot-diff boot-a');
process.exit(failed ? 1 : 0);
