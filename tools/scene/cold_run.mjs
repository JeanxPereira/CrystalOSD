// Take one of the cold-run captures of tools/scene/cold_route.json from power-on: Watson, exact mode, the frame function's
// snapshot probes (References/scripts/cold_run_probes.mjs), the route's pad presses on exact capture frames.
//   node tools/scene/cold_run.mjs <menu|square|clock> [--offset <n>] [--name <capture>]
// The capture is hddosd-110U-cold-run-<kind>. --offset moves the presses by n frames (the clock's first frame lands on capture frame 149 or 150).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const route = JSON.parse(fs.readFileSync(path.join(HERE, 'cold_route.json'), 'utf8'));
const argv = process.argv.slice(2);
const kind = argv[0];
const option = (name, fallback) => { const at = argv.indexOf(`--${name}`); return at >= 0 ? argv[at + 1] : fallback; };
const spec = route.captures[kind];
if (!spec) { console.error(`usage: node cold_run.mjs <${Object.keys(route.captures).join('|')}> [--offset n] [--name capture]`); process.exit(2); }
const offset = route.counterToCaptureFrame + Number(option('offset', 0));
const pad = route.steps.slice(0, spec.steps).map((s) => ({ frame: s.counter + offset, press: s.press, frames: s.frames }));
const frames = spec.until + offset;
const name = option('name', `hddosd-110U-cold-run-${kind}`);
const scripts = path.join(HERE, '../../References/scripts');
const args = [path.join(scripts, 'with_emulator.mjs'), process.execPath, path.join(scripts, 'capture.mjs'), '--mode', 'exact', '--verifiers', 'cold_run_probes.mjs',
  '--build', route.build, '--args', route.args, '--frames', String(frames), '--name', name];
if (pad.length) args.push('--pad', JSON.stringify(pad));
console.log(`${name}: ${frames} frames, pad ${JSON.stringify(pad)}`);
const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
