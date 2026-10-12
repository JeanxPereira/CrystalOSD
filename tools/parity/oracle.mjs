// Per-draw oracle of one frame of a GS dump: PCSX2's software renderer, through pcsx2-gsrunner,
// writes the frame and depth buffers before and after every draw, with the draw's state.
//   node tools/parity/oracle.mjs <dump.gs> <out dir> [frame]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WATSON = (process.env.WATSON_ROOT ?? 'D:/CodingProjects/Watson').replace(/[\\]/g, '/');
const TREE = `${WATSON}/References/pcsx2`;
const RUNNER = `${TREE}/build/pcsx2-gsrunner/Release/pcsx2-gsrunner.exe`;
const POLL_MS = 500;
const QUIET_POLLS = 4;
const TIMEOUT_MS = 120000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runOracle(dump, outDir, frame = 0) {
  if (!fs.existsSync(RUNNER)) throw new Error(`no gsrunner at ${RUNNER}: run Watson/Emulator/Build.ps1`);
  if (!fs.existsSync(dump)) throw new Error(`no dump at ${dump}`);
  const frames = `${outDir}.frames`;
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.rmSync(frames, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(frames, { recursive: true });

  // gsrunner needs native (backslash) paths on Windows, writes draws
  // only when -dumpdir is given too, and does not exit by itself.
  const args = ['-renderer', 'sw', '-swthreads', '0', '-surfaceless', '-noshadercache',
    '-dumpdir', path.resolve(frames), '-dump', 'rt,z,a,i', '-dumprangef', `${frame},1`, '-dumpdirsw', path.resolve(outDir),
    '-logfile', path.resolve(`${outDir}.log`), path.resolve(dump)];
  const env = { ...process.env, PATH: `${TREE}/deps/bin;${TREE}/bin;${process.env.PATH}`.replace(/\//g, '\\') };
  const child = spawn(RUNNER, args, { cwd: path.dirname(RUNNER), env, stdio: 'ignore' });
  let exited = false;
  child.on('exit', () => { exited = true; });

  let last = -1, quiet = 0;
  const started = Date.now();
  try {
    for (;;) {
      await sleep(POLL_MS);
      const count = fs.readdirSync(outDir).length;
      quiet = count > 0 && count === last ? quiet + 1 : 0;
      last = count;
      if (quiet >= QUIET_POLLS) break;
      if (exited && count === 0) throw new Error(`gsrunner exited without writing a draw; see ${outDir}.log`);
      if (Date.now() - started > TIMEOUT_MS) throw new Error(`gsrunner wrote ${count} files in ${TIMEOUT_MS / 1000} s and did not settle; see ${outDir}.log`);
    }
  } finally {
    if (!exited) child.kill();
    fs.rmSync(frames, { recursive: true, force: true });
  }

  const names = fs.readdirSync(outDir);
  const draws = names.filter((name) => name.endsWith('_context.txt')).map((name) => name.slice(0, 5)).sort();
  for (const draw of draws) {
    for (const part of ['_vertex.txt', '_rt1_', '_rz1_']) {
      if (!names.some((name) => name.startsWith(draw) && name.includes(part))) throw new Error(`draw ${draw} has no ${part} file in ${outDir}`);
    }
  }
  return { draws: draws.length, files: names.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dump, outDir, frame] = process.argv.slice(2);
  if (!dump || !outDir) { console.error('usage: node tools/parity/oracle.mjs <dump.gs> <out dir> [frame]'); process.exit(2); }
  const done = await runOracle(dump, outDir, Number(frame ?? 0));
  console.log(`oracle: ${done.draws} draws, ${done.files} files in ${outDir}`);
}
