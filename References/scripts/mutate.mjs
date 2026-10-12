// Mutation test for a verifier: a verifier that still says FOUND after its arithmetic was changed
// compares less than it claims. Each mutant changes one thing in the verifier's own code (a
// numeric constant, an arithmetic operator, a comparison), is run on a capture the verifier passes
// on, and must not say FOUND.
//
//   node mutate.mjs <verify_x.mjs> [--capture <name>] [--env K=V,...] [--limit <n>] [--jobs <n>]
//
// Without --capture the first manifest entry of that verifier is used (with its env). Prints every
// surviving mutant with its line, and the score. Exit 0 when no mutant survives, 1 otherwise.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CAPTURES = process.env.CRYSTALOSD_CAPTURES ?? 'D:/CodingProjects/Watson/Runtime/captures';
const argv = process.argv.slice(2);
const option = (name) => { const at = argv.indexOf(name); return at >= 0 ? argv[at + 1] : undefined; };
const verifier = argv[0];
if (!verifier || verifier.startsWith('--')) { console.error('usage: node mutate.mjs <verify_x.mjs> [--capture name] [--env K=V,...] [--limit n] [--jobs n]'); process.exit(2); }
const LIMIT = Number(option('--limit')) || 60;
const JOBS = Number(option('--jobs')) || Math.max(1, Math.min(8, os.cpus().length - 2));

// The captures to run on: every manifest entry of this verifier (at most --captures, default 6),
// or the one named. A mutant is killed when ANY capture's verdict changes.
let extraEnv = {};
if (option('--env')) for (const pair of option('--env').split(',')) { const [k, v] = pair.split('='); extraEnv[k] = v; }
let entries;
if (option('--capture')) entries = [{ capture: option('--capture'), env: {} }];
else {
  const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'run_all.manifest.json'), 'utf8'));
  entries = manifest.filter((e) => e.verifier === path.basename(verifier)).slice(0, Number(option('--captures')) || 6);
  if (!entries.length) { console.error(`no manifest entry for ${verifier}; pass --capture`); process.exit(2); }
}
const capture = entries.map((e) => e.capture).join(', ');
const source = fs.readFileSync(path.join(HERE, path.basename(verifier)), 'utf8');

// ---- mutants ----

const lines = source.split('\n');
const skipLine = (line) => /^\s*(import|export const PROBES|\/\/|\*|console\.|if \(process\.argv)/.test(line)
  || /console\.log|throw new Error|problem\(|readFileSync|probe\.pc|pc\(|range\(|pick\(/.test(line)
  // Only lines that compute a value the verifier compares: bookkeeping (loops, counters, slices,
  // exit codes) gives equivalent mutants, which say nothing about what the verifier checks.
  || !/\b(f|add|sub|mul|div|sqrt|toInt|toUnsigned|fround|chop|Math\.(trunc|floor|min|max|sqrt|sin|cos))\(|\d\.\d|<<|>>|\bBigInt\(/.test(line)
  || /\bfor \(|\.push\(|\+= 1\b|process\.exit|\.slice\(|\.length\b|ArrayBuffer|\.padStart|toFixed/.test(line);
const mutants = [];
let inProbes = false;
lines.forEach((line, i) => {
  if (/^(export )?const (PROBES|A) = /.test(line)) inProbes = true;
  if (inProbes) { if (/^\S.*[\]\)];\s*$/.test(line) || /^\}\);?\s*$/.test(line) || /^\];?\s*$/.test(line)) inProbes = false; return; }
  if (skipLine(line)) return;
  const code = line.replace(/\/\/.*$/, '').replace(/(['"`])(?:\\.|(?!\1).)*\1/g, (m) => ' '.repeat(m.length));
  // Numeric literals: decimal floats nudged, small ints +1, small hex +1. Large hex are addresses.
  for (const m of code.matchAll(/(?<![\w.$])(\d+\.\d+(?:e[-+]?\d+)?|0x[0-9a-fA-F]+|\d+)(?![\w.])/g)) {
    const text = m[1];
    let next;
    if (text.startsWith('0x')) { const v = parseInt(text, 16); if (v > 0xffff) continue; next = `0x${(v + 1).toString(16)}`; }
    else if (text.includes('.') || text.includes('e')) next = String(Number(text) * (1 + 1e-6) + (Number(text) === 0 ? 1e-6 : 0));
    else { const v = Number(text); if (v > 0xffff) continue; next = String(v + 1); }
    if (/asUintN\($/.test(code.slice(0, m.index).trimEnd() + '(') || /asU?intN\(\s*$/.test(code.slice(0, m.index))) continue;
    mutants.push({ line: i, at: m.index, from: text, to: next });
  }
  // Operators in arithmetic: + <-> -, * -> /, < <-> <=, > <-> >=.
  for (const m of code.matchAll(/(?<=[\w)\]] )(\+|-|\*|<=|>=|<|>)(?= [\w(\[])/g)) {
    const to = { '+': '-', '-': '+', '*': '/', '<': '<=', '<=': '<', '>': '>=', '>=': '>' }[m[1]];
    mutants.push({ line: i, at: m.index, from: m[1], to });
  }
});

// Spread the sample over the file rather than taking the first N.
const step = Math.max(1, mutants.length / LIMIT);
const chosen = [];
for (let k = 0; k < mutants.length && chosen.length < LIMIT; k += step) chosen.push(mutants[Math.floor(k)]);

function runOne(file, entry) {
  const files = entry.files ?? [path.join(CAPTURES, `${entry.capture}.trace.jsonl`)];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file, ...files, ...(entry.args ?? [])], { cwd: HERE, env: { ...process.env, ...entry.env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (c) => { out = (out + c).slice(-8000); });
    child.stderr.on('data', (c) => { out = (out + c).slice(-8000); });
    const timer = setTimeout(() => child.kill(), 15 * 60 * 1000);
    child.on('exit', () => {
      clearTimeout(timer);
      const verdicts = out.split(/\r?\n/).filter((l) => /^verdict:/.test(l.trim()));
      resolve({ found: verdicts.length > 0 && verdicts.every((l) => /^verdict: FOUND/.test(l.trim())), crashed: verdicts.length === 0 });
    });
  });
}
async function run(file) {
  for (const entry of entries) {
    const result = await runOne(file, entry);
    if (!result.found) return result;
  }
  return { found: true, crashed: false };
}

if (!chosen.length) { console.log(`verdict: NOT VERIFIED no computing line to mutate in ${path.basename(verifier)} (it may compute through imports: mutate those files instead)`); process.exit(2); }
const base = await run(path.join(HERE, path.basename(verifier)));
if (!base.found) { console.error(`the unmutated verifier does not say FOUND on ${capture}; nothing to measure`); process.exit(2); }

const results = [];
let next = 0;
const worker = async () => {
  while (next < chosen.length) {
    const index = next++;
    const m = chosen[index];
    const mutated = [...lines];
    mutated[m.line] = mutated[m.line].slice(0, m.at) + m.to + mutated[m.line].slice(m.at + m.from.length);
    const file = path.join(HERE, `.mutant-${process.pid}-${index}-${path.basename(verifier)}`);
    fs.writeFileSync(file, mutated.join('\n'));
    try { results[index] = { ...m, ...(await run(file)) }; } finally { fs.rmSync(file, { force: true }); }
  }
};
await Promise.all(Array.from({ length: JOBS }, worker));

const survivors = results.filter((r) => r.found);
const crashed = results.filter((r) => !r.found && r.crashed).length;
console.log(`verifier: ${path.basename(verifier)}   capture: ${capture}   mutants: ${results.length} of ${mutants.length} candidates`);
for (const s of survivors) console.log(`  survived  line ${s.line + 1}: ${s.from} -> ${s.to}    ${lines[s.line].trim().slice(0, 110)}`);
const killed = results.length - survivors.length;
console.log(`killed ${killed} of ${results.length} (${crashed} by a crash, ${killed - crashed} by a wrong verdict)`);
console.log(`verdict: ${survivors.length ? `PARTIAL ${survivors.length} mutants survive: the verifier does not check what those lines compute` : 'FOUND every mutant changed the verdict'}`);
process.exit(survivors.length ? 1 : 0);
