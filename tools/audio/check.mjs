import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..').split(path.sep).join('/');
const BUILD = `${ROOT}/build/tests`;
const SCRATCH = `${BUILD}/audio-scratch/render`;
const SET = 'hddosd-110U-sound-boot-a';
const RUNS = {
  observed: { budget: 'boot-oracle', mode: 'observed' },
  paired: { budget: 'boot-paired', mode: 'paired' },
  'paired-init': { budget: 'boot-paired-init', mode: 'paired:tick,6010' },
  'paired-tick': { budget: 'boot-paired-tick', mode: 'paired:tick' },
  native: { budget: 'boot-render', mode: 'native' },
  modelled: { budget: 'boot-oracle', mode: 'modelled', wav: 'boot-modelled' },
};

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const names = args.filter((a) => !a.startsWith('--'));
if (flag('help')) {
  console.log('usage: node tools/audio/check.mjs [run...|--all] [--release] [--no-build] [--write]\nruns: ' + Object.keys(RUNS).join(' ') + ' (default modelled)');
  process.exit(0);
}
const selected = flag('all') ? Object.keys(RUNS) : names.length ? names : ['modelled'];
for (const n of selected) if (!RUNS[n]) { console.error(`unknown run ${n}`); process.exit(1); }

const cache = fs.readFileSync(`${BUILD}/CMakeCache.txt`, 'utf8');
const cached = (key) => cache.match(new RegExp(`^${key}:[A-Z]+=(.*)$`, 'm'))?.[1];
const CAPTURES = cached('CLOCK_CAPTURES');
const DUMPS = cached('CLOCK_DUMPS');
const NODE = process.execPath;
if (!CAPTURES || !DUMPS) { console.error('configure the tests preset first: tools/build.ps1 configure tests'); process.exit(1); }

const run = (cmd, argv, options = {}) => spawnSync(cmd, argv, { encoding: 'utf8', maxBuffer: 1 << 28, cwd: ROOT, ...options });

if (!flag('no-build')) {
  const preset = flag('release') ? 'tests-release' : 'tests-debug';
  const r = run('powershell', ['-NoProfile', '-File', `${ROOT}/tools/build.ps1`, 'build', preset, '--target', 'SoundLab']);
  if (r.status !== 0) {
    console.log(`FAIL build ${preset}`);
    console.log((r.stdout + r.stderr).split('\n').filter((l) => /error|FAILED/.test(l)).slice(0, 8).join('\n'));
    process.exit(1);
  }
}

const exported = run(NODE, [`${ROOT}/tests/audio/export_render.mjs`, `${ROOT}/References/model`, CAPTURES, SCRATCH, SET]);
if (exported.status !== 0) { console.log('FAIL export_render'); console.log(exported.stderr.split('\n').slice(0, 6).join('\n')); process.exit(1); }

const lab = `${BUILD}/bin/SoundLab.exe`;
const number = (text, key) => Number(text.match(new RegExp(`^${key} (-?\\d+)`, 'm'))?.[1]);
let failed = false;
for (const name of selected) {
  const { budget, mode } = RUNS[name];
  const wav = `${SCRATCH}/${RUNS[name].wav ?? budget}.wav`;
  const started = Date.now();
  const render = run(lab, ['render', CAPTURES, SCRATCH, SET, DUMPS, wav, mode, 'image']);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (render.status !== 0) { failed = true; console.log(`${name}: FAIL render\n${(render.stderr || render.stdout).split('\n').slice(0, 4).join('\n')}`); continue; }
  const watson = `${CAPTURES}/${SET}.wav`;
  const cmp = run(lab, ['compare', wav, watson]).stdout;
  const budgetFile = `${ROOT}/tests/audio/budgets/${budget}.json`;
  if (flag('write')) console.log(run(lab, ['budget', wav, watson, budgetFile, '--write']).stdout.trim());
  const verdict = run(lab, ['budget', wav, watson, budgetFile]);
  const ok = verdict.status === 0;
  failed ||= !ok;
  const differ = number(cmp, 'differ'), maxAbs = number(cmp, 'maxAbs'), first = number(cmp, 'first');
  console.log(`${name}: ${ok ? 'PASS' : 'FAIL'} (render ${seconds} s)`);
  console.log(`  differ ${differ}  maxAbs ${maxAbs}  first ${first}  last ${number(cmp, 'last')}  samples ${cmp.match(/^samples (\d+) and (\d+)/m)?.slice(1).join('/')}`);
  const residue = [...render.stdout.matchAll(/modelled write times, (.+?): (\d+) of (\d+) differ/g)].map((m) => `${m[1]} ${m[2]}/${m[3]}`);
  if (residue.length) console.log(`  write-time residue (differ/total): ${residue.join(', ')}`);
  else if (mode === 'modelled') console.log('  write-time residue: none reported');
  if (!ok) console.log(`  budget ${budget}.json: ${verdict.stderr.trim().split('\n').join('; ')}`);
  const misses = [...render.stdout.matchAll(/^ {4}(\S.*modelled -?\d+, Watson -?\d+)$/gm)].slice(0, 3).map((m) => m[1]);
  if (misses.length) console.log(`  first misses: ${misses.join(' | ')}`);
}
process.exit(failed ? 1 : 0);
