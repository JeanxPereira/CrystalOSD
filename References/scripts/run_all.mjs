// The regression suite: every verifier on every capture it is known to pass on, in parallel.
//
//   node run_all.mjs                     run the manifest; exit 1 on any entry that no longer passes
//   node run_all.mjs --filter <regex>    only entries whose "verifier capture" matches
//   node run_all.mjs --changed           only entries whose verifier, or a file it imports, changed
//                                        since the last run that passed
//   node run_all.mjs --jobs <n>          how many verifiers at once (default: cores - 2, at most 10)
//   node run_all.mjs --discover          try every verifier on every capture that carries its
//                                        probes, and write the passing pairs as the manifest
//
// The manifest is run_all.manifest.json beside this file: one entry per verifier, capture, build
// and video mode ({ verifier, capture, env, args }). A capture is named without .trace.jsonl;
// entries whose verifier reads other files carry them in `files`.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const traceExists = (file) => fs.existsSync(file) || fs.existsSync(`${file}.gz`);
const CAPTURES = process.env.CRYSTALOSD_CAPTURES ?? 'D:/CodingProjects/Watson/Runtime/captures';
const MANIFEST = path.join(HERE, 'run_all.manifest.json');
const CACHE = path.join(CAPTURES, '.run_all-probes.json');
const STATE = path.join(CAPTURES, '.run_all-state.json');
const TIMEOUT_MS = 30 * 60 * 1000;

const argv = process.argv.slice(2);
const option = (name) => { const at = argv.indexOf(name); return at >= 0 ? argv[at + 1] : undefined; };
const JOBS = Number(option('--jobs')) || Math.max(1, Math.min(10, os.cpus().length - 2));

// ---- running one verifier ----

function run(entry) {
  const started = Date.now();
  const files = entry.files ?? [path.join(CAPTURES, `${entry.capture}.trace.jsonl`)];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(HERE, entry.verifier), ...files, ...(entry.args ?? [])], {
      cwd: HERE, env: { ...process.env, ...entry.env }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (chunk) => { out = (out + chunk).slice(-20000); });
    child.stderr.on('data', (chunk) => { out = (out + chunk).slice(-20000); });
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.on('exit', (code) => {
      clearTimeout(timer);
      const verdicts = out.split(/\r?\n/).filter((line) => /^verdict:/.test(line.trim()));
      const verdict = verdicts.at(-1)?.trim() ?? (out.trim().split(/\r?\n/).at(-1) ?? '').slice(0, 160);
      const pass = verdicts.length > 0 && verdicts.every((line) => /^verdict: FOUND/.test(line.trim()));
      resolve({ entry, pass, code, verdict, seconds: (Date.now() - started) / 1000 });
    });
  });
}

async function pool(entries, jobs, onDone) {
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < entries.length) {
      const entry = entries[next++];
      const result = await run(entry);
      results.push(result);
      onDone?.(result, results.length, entries.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, entries.length) }, worker));
  return results;
}

const label = (entry) => `${entry.verifier} ${entry.capture ?? (entry.files ?? []).map((f) => path.basename(f)).join(' ')}`
  + `${Object.keys(entry.env ?? {}).length ? ` [${Object.entries(entry.env).map(([k, v]) => `${k}=${v}`).join(' ')}]` : ''}${entry.args?.length ? ` ${entry.args.join(' ')}` : ''}`;

// ---- what each file imports, for --changed ----

function closure(file, seen = new Set()) {
  if (seen.has(file) || !fs.existsSync(file)) return seen;
  seen.add(file);
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/(?:import|from)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) closure(path.resolve(path.dirname(file), match[1]), seen);
  for (const match of text.matchAll(/['"]file:\/\/\/([^'"]+\.m?js)['"]/g)) closure(match[1], seen);
  return seen;
}
const newest = (verifier) => Math.max(...[...closure(path.join(HERE, verifier))].map((file) => fs.statSync(file).mtimeMs));

// ---- discovery ----

/** The probe program counters each capture holds, read from its probe records (cached by size and time). */
function captureProbes() {
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
  const out = {};
  const marker = Buffer.from('{"type":"probe","pc":"0x');
  const compressed = fs.existsSync(path.join(CAPTURES, 'compressed.manifest.json')) ? JSON.parse(fs.readFileSync(path.join(CAPTURES, 'compressed.manifest.json'), 'utf8')) : [];
  const originalSize = new Map(compressed.map((entry) => [entry.name, entry.originalSize]));
  const names = fs.readdirSync(CAPTURES).filter((n) => /\.trace\.jsonl(\.gz)?$/.test(n));
  for (const name of names) {
    const gzipped = name.endsWith('.gz');
    const plainName = gzipped ? name.slice(0, -3) : name;
    if (gzipped && names.includes(plainName)) continue;
    const file = path.join(CAPTURES, name);
    const stat = fs.statSync(file);
    const key = `${gzipped ? originalSize.get(plainName) ?? stat.size : stat.size}:${stat.mtimeMs}`;
    const capture = plainName.replace(/\.trace\.jsonl$/, '');
    if (cache[capture]?.key === key) { out[capture] = cache[capture]; continue; }
    const pcs = new Set();
    if (gzipped) {
      const data = zlib.gunzipSync(fs.readFileSync(file));
      for (let at = 0; (at = data.indexOf(marker, at)) >= 0 && at + marker.length + 8 <= data.length; at += marker.length)
        pcs.add(parseInt(data.toString('latin1', at + marker.length, at + marker.length + 8), 16));
    } else {
    const fd = fs.openSync(file, 'r');
    const chunk = Buffer.alloc(64 << 20);
    let carry = Buffer.alloc(0);
    let position = 0;
    for (;;) {
      const read = fs.readSync(fd, chunk, 0, chunk.length, position);
      if (read === 0) break;
      position += read;
      const data = Buffer.concat([carry, chunk.subarray(0, read)]);
      let at = 0;
      while ((at = data.indexOf(marker, at)) >= 0 && at + marker.length + 8 <= data.length) {
        pcs.add(parseInt(data.toString('latin1', at + marker.length, at + marker.length + 8), 16));
        at += marker.length;
      }
      carry = data.subarray(Math.max(0, data.length - marker.length - 8));
    }
    fs.closeSync(fd);
    }
    out[capture] = { key, pcs: [...pcs] };
    console.error(`scanned ${capture}: ${pcs.size} probe addresses`);
  }
  fs.writeFileSync(CACHE, JSON.stringify(out));
  return out;
}

/** A verifier's PROBES under an environment, read in a child process (they depend on CLOCK_BUILD). */
function probesOf(verifier, env) {
  return new Promise((resolve) => {
    const code = `import(${JSON.stringify(`file:///${path.join(HERE, verifier).replace(/\\/g, '/')}`)}).then((m) => { console.log(JSON.stringify(m.PROBES ?? null)); process.exit(0); }, () => { console.log('null'); process.exit(0); })`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], { cwd: HERE, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.on('exit', () => { try { resolve(JSON.parse(out.trim().split('\n').at(-1))); } catch { resolve(null); } });
  });
}

function environmentsOf(capture, verifier) {
  const build = capture.startsWith('hddosd') ? 'hdd' : 'rom';
  const env = { CLOCK_BUILD: build, ...(/-pal-|0230E/.test(capture) ? { CLOCK_VIDEO: 'pal' } : {}) };
  const out = [env];
  if (build === 'rom' && /^verify_opening_/.test(verifier)) out.push({ ...env, OPENING_BUILD: 'rom' });
  return out;
}
// Verifiers that export no PROBES of their own read the captures of another.
const BORROWS = { 'verify_camera.mjs': 'verify_rod.mjs' };
const argsOf = (verifier) => (verifier === 'verify_frame.mjs' || verifier === 'verify_text_frame.mjs' ? [['--carry'], []] : [[]]);

async function discover() {
  const captures = captureProbes();
  const only = option('--only');
  const verifiers = fs.readdirSync(HERE).filter((n) => /^verify_.*\.mjs$/.test(n) && !n.endsWith('.test.mjs') && (!only || only.split(',').includes(n)));
  const probes = {};
  for (const verifier of verifiers) {
    for (const build of ['hdd', 'rom']) {
      probes[`${verifier}:${build}`] = await probesOf(BORROWS[verifier] ?? verifier, { CLOCK_BUILD: build });
    }
  }
  const candidates = [];
  for (const [capture, { pcs }] of Object.entries(captures)) {
    const held = new Set(pcs);
    if (held.size === 0) continue;
    for (const verifier of verifiers) {
      for (const env of environmentsOf(capture, verifier)) {
        const list = probes[`${verifier}:${env.CLOCK_BUILD}`] ?? [];
        if (!list || list.length === 0) continue;
        const wanted = [...new Set(list.map((p) => parseInt(p.pc, 16)))];
        const found = wanted.filter((pc) => held.has(pc)).length;
        if (found * 2 < wanted.length || found === 0) continue;
        for (const args of argsOf(verifier)) candidates.push({ verifier, capture, env, args });
      }
    }
  }
  // Verifiers of logs rather than traces.
  const logs = fs.readdirSync(CAPTURES).filter((n) => n.endsWith('.log'));
  const exits = ['hddosd-110U-flow-exits.log', 'rom-0230A-flow-exits.log'];
  if (!only && exits.every((n) => logs.includes(n))) candidates.push({ verifier: 'verify_exits.mjs', files: exits.map((n) => path.join(CAPTURES, n)), env: {} });
  if (!only) for (const name of logs.filter((n) => /-flow-rand-.*\.log$/.test(n))) candidates.push({ verifier: 'verify_rand.mjs', files: [path.join(CAPTURES, name)], env: {} });

  console.error(`discovery: ${candidates.length} candidate runs over ${Object.keys(captures).length} captures, ${JOBS} at once`);
  const started = Date.now();
  const results = await pool(candidates, JOBS, (result, done, total) => {
    if (result.pass || done % 25 === 0) console.error(`${done}/${total} ${result.pass ? 'PASS' : 'fail'} ${label(result.entry)} (${result.seconds.toFixed(0)} s)`);
  });
  // A verifier that passes with --carry is kept only with it; without, only plain.
  const passing = results.filter((r) => r.pass).map((r) => r.entry);
  const kept = passing.filter((entry) => !(entry.args?.length === 0 && argsOf(entry.verifier).length > 1
    && passing.some((other) => other.verifier === entry.verifier && other.capture === entry.capture && other.args?.[0] === '--carry' && JSON.stringify(other.env) === JSON.stringify(entry.env))));
  // Of two environments that both pass, keep the plain one.
  const final = kept.filter((entry) => !(entry.env.OPENING_BUILD && kept.some((other) => other !== entry && other.verifier === entry.verifier
    && other.capture === entry.capture && !other.env.OPENING_BUILD && JSON.stringify(other.args) === JSON.stringify(entry.args))));
  final.sort((a, b) => label(a).localeCompare(label(b)));
  const toEntry = (entry) => {
    const out = { verifier: entry.verifier };
    if (entry.capture) out.capture = entry.capture;
    if (entry.files) out.files = entry.files.map((file) => path.basename(file));
    out.env = entry.env;
    if (entry.args?.length) out.args = entry.args;
    return out;
  };
  // --only adds to the manifest: the other verifiers' entries stay.
  const others = only && fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).filter((entry) => !only.split(',').includes(entry.verifier)) : [];
  const written = [...others, ...final.map(toEntry)].sort((a, b) => label(a).localeCompare(label(b)));
  fs.writeFileSync(MANIFEST, `${JSON.stringify(written, null, 1)}\n`);
  console.log(`discovery: ${written.length} entries in the manifest, ${final.length} passing of ${candidates.length} runs, in ${((Date.now() - started) / 60000).toFixed(1)} min; written to ${MANIFEST}`);
}

// ---- the suite ----

async function suite() {
  let entries = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).map((entry) => ({ ...entry, files: entry.files?.map((name) => path.join(CAPTURES, name)) }));
  const filter = option('--filter');
  if (filter) entries = entries.filter((entry) => new RegExp(filter).test(label(entry)));
  const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
  if (argv.includes('--changed')) entries = entries.filter((entry) => !(state[label(entry)] >= newest(entry.verifier)));
  const missing = entries.filter((entry) => !(entry.files ?? [path.join(CAPTURES, `${entry.capture}.trace.jsonl`)]).every(traceExists));
  entries = entries.filter((entry) => !missing.includes(entry));

  const started = Date.now();
  const results = await pool(entries, JOBS, (result, done, total) => {
    if (!result.pass) console.error(`${done}/${total} FAIL ${label(result.entry)}: ${result.verdict}`);
  });
  results.sort((a, b) => label(a.entry).localeCompare(label(b.entry)));
  const width = Math.min(110, Math.max(20, ...results.map((r) => label(r.entry).length)));
  for (const result of results) {
    console.log(`${result.pass ? 'pass' : 'FAIL'}  ${label(result.entry).padEnd(width)}  ${result.seconds.toFixed(1).padStart(6)} s  ${result.pass ? '' : result.verdict}`);
    if (result.pass) state[label(result.entry)] = started;
  }
  for (const entry of missing) console.log(`miss  ${label(entry)}  (capture not on disk)`);
  fs.writeFileSync(STATE, JSON.stringify(state));
  const failed = results.filter((r) => !r.pass).length;
  console.log(`run_all: ${results.length - failed} of ${results.length} pass${missing.length ? `, ${missing.length} captures missing` : ''}, ${JOBS} at once, ${((Date.now() - started) / 1000).toFixed(0)} s`);
  process.exit(failed || missing.length ? 1 : 0);
}

if (argv.includes('--discover')) await discover();
else await suite();
