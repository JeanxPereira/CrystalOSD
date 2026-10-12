// Mutation test of the card tools: each mutant changes one number or operator in ecc.mjs, read_card.mjs,
// make_card.mjs or the verifier, in a copy of the tree, and the verifier must stop saying FOUND.
//   node tools/mc/mutate_card.mjs <osd-formatted-raw.ps2> [<blank.ps2>] [--limit n] [--jobs n]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const option = (name) => { const at = argv.indexOf(name); return at >= 0 ? argv[at + 1] : undefined; };
const inputs = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const LIMIT = Number(option('--limit')) || 200;
const JOBS = Number(option('--jobs')) || 3;
const VERIFIER = 'References/scripts/verify_mc_image.mjs';
const targets = ['tools/mc/ecc.mjs', 'tools/mc/read_card.mjs', 'tools/mc/make_card.mjs', VERIFIER];
const skipLine = (line) => /^\s*(import|\/\/|\*|\/\*\*)|console\.|throw new Error|readFileSync|writeFileSync|process\.|\+= 1|let (compared|wrong|pages) = 0/.test(line);

const mutants = [];
for (const rel of targets) {
  fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n').forEach((line, i) => {
    if (skipLine(line)) return;
    const code = line.replace(/\/\/.*$/, '').replace(/(['"`])(?:\.|(?!\1).)*\1/g, (m) => ' '.repeat(m.length));
    for (const m of code.matchAll(/(?<![\w.$])(0x[0-9a-fA-F]+|\d+)(?![\w.])/g)) {
      const value = m[1].startsWith('0x') ? parseInt(m[1], 16) : Number(m[1]);
      if (value > 0xffffff) continue;
      mutants.push({ rel, line: i, at: m.index, from: m[1], to: m[1].startsWith('0x') ? `0x${(value + 1).toString(16)}` : String(value + 1) });
    }
    for (const m of code.matchAll(/(?<=[\w)\]] )(\+|-|\*|<=|>=|<|>|===|!==|&&|\|\||\^|&|\|)(?= [\w(\[!~-])/g)) {
      const to = { '+': '-', '-': '+', '*': '/', '<': '<=', '<=': '<', '>': '>=', '>=': '>', '===': '!==', '!==': '===', '&&': '||', '||': '&&', '^': '&', '&': '|', '|': '&' }[m[1]];
      mutants.push({ rel, line: i, at: m.index, from: m[1], to });
    }
  });
}
const step = Math.max(1, mutants.length / LIMIT);
const chosen = [];
for (let k = 0; k < mutants.length && chosen.length < LIMIT; k += step) chosen.push(mutants[Math.floor(k)]);

const copyTree = (to) => {
  fs.mkdirSync(path.join(to, 'tools'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'tools/mc'), path.join(to, 'tools/mc'), { recursive: true });
  fs.mkdirSync(path.join(to, 'References/scripts'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'References/lib'), path.join(to, 'References/lib'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, VERIFIER), path.join(to, VERIFIER));
};
const run = (root) => new Promise((resolve) => {
  const child = spawn(process.execPath, [path.join(root, VERIFIER), ...inputs], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (c) => { out = (out + c).slice(-4000); });
  child.stderr.on('data', (c) => { out = (out + c).slice(-4000); });
  const timer = setTimeout(() => child.kill(), 5 * 60 * 1000);
  child.on('exit', () => {
    clearTimeout(timer);
    const verdicts = out.split(/\r?\n/).filter((l) => /^verdict:/.test(l.trim()));
    resolve(verdicts.length > 0 && verdicts.every((l) => /^verdict: FOUND/.test(l.trim())));
  });
});

const base = path.join(os.tmpdir(), `mutate-card-${process.pid}`);
fs.rmSync(base, { recursive: true, force: true });
copyTree(path.join(base, 'base'));
if (!(await run(path.join(base, 'base')))) { console.error('the unmutated verifier does not say FOUND'); process.exit(2); }

const results = [];
let next = 0;
const worker = async () => {
  while (next < chosen.length) {
    const index = next++;
    const m = chosen[index];
    const root = path.join(base, `m${index}`);
    copyTree(root);
    const file = path.join(root, m.rel);
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines[m.line] = lines[m.line].slice(0, m.at) + m.to + lines[m.line].slice(m.at + m.from.length);
    fs.writeFileSync(file, lines.join('\n'));
    results[index] = { ...m, found: await run(root) };
    fs.rmSync(root, { recursive: true, force: true });
  }
};
await Promise.all(Array.from({ length: JOBS }, worker));
fs.rmSync(base, { recursive: true, force: true });

const survivors = results.filter((r) => r.found);
console.log(`mutants: ${results.length} of ${mutants.length} candidates over ${targets.map((t) => path.basename(t)).join(', ')}`);
for (const s of survivors) console.log(`  survived  ${path.basename(s.rel)} line ${s.line + 1}: ${s.from} -> ${s.to}    ${fs.readFileSync(path.join(ROOT, s.rel), 'utf8').split('\n')[s.line].trim().slice(0, 110)}`);
console.log(`killed ${results.length - survivors.length} of ${results.length}`);
console.log(`verdict: ${survivors.length ? `PARTIAL ${survivors.length} mutants survive` : 'FOUND every mutant changed the verdict'}`);
process.exit(survivors.length ? 1 : 0);
