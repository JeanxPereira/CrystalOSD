// Mutation test for a verifier that computes through model files: each mutant changes one number or one operator
// in the verifier or in a model file it imports; the verifier is run on the given captures in a copy of the tree and
// must not say FOUND. Same mutant kinds as mutate.mjs (which only reaches the verifier's own lines).
//
//   node mutate_model.mjs <verify_x.mjs> --model a.mjs,b.mjs --set <file>... [--set <file>...] [--limit n] [--jobs n] [--env K=V,...]
//
// Each --set is one run of the verifier (its arguments, absolute paths); a mutant is killed when any run stops saying FOUND. --model lists the files under ../model to mutate; the verifier itself is
// always mutated. Prints the survivors with their line. Exit 0 when none survives.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REF = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
const verifier = argv[0];
const option = (name) => { const at = argv.indexOf(name); return at >= 0 ? argv[at + 1] : undefined; };
const sets = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] !== '--files' && argv[i] !== '--set') continue;
  const set = [];
  for (let j = i + 1; j < argv.length && !argv[j].startsWith('--'); j++) set.push(argv[j]);
  sets.push(set);
}
if (!verifier || sets.length === 0) { console.error('usage: node mutate_model.mjs <verify_x.mjs> --model a.mjs,b.mjs --set <file>... [--set <file>...] [--limit n] [--jobs n]'); process.exit(2); }
const LIMIT = Number(option('--limit')) || 80;
const JOBS = Number(option('--jobs')) || Math.max(1, Math.min(6, os.cpus().length - 2));
const models = (option('--model') ?? '').split(',').filter(Boolean);
const env = {};
if (option('--env')) for (const pair of option('--env').split(',')) { const [k, v] = pair.split('='); env[k] = v; }

const targets = [{ rel: `scripts/${path.basename(verifier)}` }, ...models.map((m) => ({ rel: `model/${m}` }))];
const skipLine = (line) => /^\s*(import|export const PROBES|\/\/|\*|console\.|if \(process\.argv)/.test(line)
  || /console\.log|throw new Error|readFileSync|probe\.pc|pc\(|range\(|pick\(/.test(line);

const mutants = [];
for (const target of targets) {
  const lines = fs.readFileSync(path.join(REF, target.rel), 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (skipLine(line)) return;
    const code = line.replace(/\/\/.*$/, '').replace(/(['"`])(?:\\.|(?!\1).)*\1/g, (m) => ' '.repeat(m.length));
    for (const m of code.matchAll(/(?<![\w.$])(0x[0-9a-fA-F]+|\d+)(?![\w.])/g)) {
      const text = m[1];
      const value = text.startsWith('0x') ? parseInt(text, 16) : Number(text);
      if (value > 0xffffff) continue;
      const next = text.startsWith('0x') ? `0x${(value + 1).toString(16)}` : String(value + 1);
      mutants.push({ rel: target.rel, line: i, at: m.index, from: text, to: next });
    }
    for (const m of code.matchAll(/(?<=[\w)\]] )(\+|-|\*|<=|>=|<|>|===|!==|&&|\|\|)(?= [\w(\[!~-])/g)) {
      const to = { '+': '-', '-': '+', '*': '/', '<': '<=', '<=': '<', '>': '>=', '>=': '>', '===': '!==', '!==': '===', '&&': '||', '||': '&&' }[m[1]];
      mutants.push({ rel: target.rel, line: i, at: m.index, from: m[1], to });
    }
  });
}
const step = Math.max(1, mutants.length / LIMIT);
const chosen = [];
for (let k = 0; k < mutants.length && chosen.length < LIMIT; k += step) chosen.push(mutants[Math.floor(k)]);

const copyTree = (to) => {
  fs.mkdirSync(path.join(to, 'scripts'), { recursive: true });
  fs.cpSync(path.join(REF, 'model'), path.join(to, 'model'), { recursive: true });
  fs.cpSync(path.join(REF, 'lib'), path.join(to, 'lib'), { recursive: true });
  for (const f of fs.readdirSync(path.join(REF, 'scripts'))) if (f === path.basename(verifier) || f === 'builds.mjs') fs.copyFileSync(path.join(REF, 'scripts', f), path.join(to, 'scripts', f));
};

function runOne(root, inputs) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts', path.basename(verifier)), ...inputs], { cwd: path.join(root, 'scripts'), env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (c) => { out = (out + c).slice(-6000); });
    child.stderr.on('data', (c) => { out = (out + c).slice(-6000); });
    const timer = setTimeout(() => child.kill(), 10 * 60 * 1000);
    child.on('exit', () => {
      clearTimeout(timer);
      const verdicts = out.split(/\r?\n/).filter((l) => /^verdict:/.test(l.trim()));
      resolve({ found: verdicts.length > 0 && verdicts.every((l) => /^verdict: FOUND/.test(l.trim())) });
    });
  });
}
async function run(root) {
  for (const inputs of sets) if (!(await runOne(root, inputs)).found) return { found: false };
  return { found: true };
}

const base = path.join(os.tmpdir(), `mutate-model-${process.pid}`);
fs.rmSync(base, { recursive: true, force: true });
const baseRoot = path.join(base, 'base', 'References');
copyTree(baseRoot);
const clean = await run(baseRoot);
if (!clean.found) { console.error('the unmutated verifier does not say FOUND on these files'); process.exit(2); }

const results = [];
let next = 0;
const worker = async () => {
  while (next < chosen.length) {
    const index = next++;
    const m = chosen[index];
    const root = path.join(base, `m${index}`, 'References');
    copyTree(root);
    const file = path.join(root, m.rel);
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines[m.line] = lines[m.line].slice(0, m.at) + m.to + lines[m.line].slice(m.at + m.from.length);
    fs.writeFileSync(file, lines.join('\n'));
    results[index] = { ...m, ...(await run(root)) };
    fs.rmSync(path.join(base, `m${index}`), { recursive: true, force: true });
  }
};
await Promise.all(Array.from({ length: JOBS }, worker));
fs.rmSync(base, { recursive: true, force: true });

const survivors = results.filter((r) => r.found);
console.log(`verifier: ${path.basename(verifier)}   mutants: ${results.length} of ${mutants.length} candidates over ${targets.map((t) => path.basename(t.rel)).join(', ')}`);
for (const s of survivors) {
  const text = fs.readFileSync(path.join(REF, s.rel), 'utf8').split('\n')[s.line].trim().slice(0, 110);
  console.log(`  survived  ${path.basename(s.rel)} line ${s.line + 1}: ${s.from} -> ${s.to}    ${text}`);
}
console.log(`killed ${results.length - survivors.length} of ${results.length}`);
console.log(`verdict: ${survivors.length ? `PARTIAL ${survivors.length} mutants survive` : 'FOUND every mutant changed the verdict'}`);
process.exit(survivors.length ? 1 : 0);
