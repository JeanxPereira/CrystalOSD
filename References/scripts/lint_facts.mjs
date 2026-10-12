// Lint for facts/: a page states what the system is, cites how it was verified, and keeps no
// account of the work that produced it.
//
//   node lint_facts.mjs [facts/page.md ...]      default: every page of facts/
//
// Errors (exit 1):
//   - work narration: draft, fork, worker, main session, subagent, "written by", first person
//   - a script named in a page that does not exist in References/scripts or References/model
//   - a page other than README.md / verification.md that names no verifier at all
// Warnings: a capture named in a page that has no trace in the captures directory.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FACTS = path.join(ROOT, 'facts');
const CAPTURES = process.env.CRYSTALOSD_CAPTURES ?? 'D:/CodingProjects/Watson/Runtime/captures';
const NARRATION = /\b(draft|forks?|workers?|main session|subagents?|by the fork|hand-?back|checkpoint)\b/i;
const FIRST_PERSON = /(^|[\s(])(I|We|we|our|Our|us)\b(?![-.])/;
const INDEX_PAGES = new Set(['README.md', 'verification.md']);

const files = process.argv.slice(2).length
  ? process.argv.slice(2).map((p) => path.resolve(p))
  : fs.readdirSync(FACTS).filter((n) => n.endsWith('.md')).map((n) => path.join(FACTS, n));
const captures = fs.existsSync(CAPTURES) ? new Set(fs.readdirSync(CAPTURES).map((n) => n.replace(/\.(trace\.jsonl(\.gz)?|gs|png|log)$/, ''))) : null;
const exists = (name) => ['References/scripts', 'References/model', 'References/lib'].some((d) => fs.existsSync(path.join(ROOT, d, name)));

let errors = 0, warnings = 0;
for (const file of files) {
  const name = path.basename(file);
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  let inCode = false;
  const report = (kind, n, message) => {
    console.log(`${path.relative(ROOT, file)}:${n + 1}: ${kind}: ${message}`);
    if (kind === 'error') errors += 1; else warnings += 1;
  };
  lines.forEach((line, n) => {
    if (line.startsWith('```')) { inCode = !inCode; return; }
    if (inCode) return;
    const prose = line.replace(/`[^`]*`/g, '');
    const narration = NARRATION.exec(prose) ?? FIRST_PERSON.exec(prose);
    if (narration) report('error', n, `work narration ("${narration[0].trim()}"): state what the system is, not how it was found`);
    for (const m of line.matchAll(/`([\w.-]+\.mjs)`/g)) if (!exists(m[1])) report('error', n, `${m[1]} does not exist`);
    if (captures) for (const m of line.matchAll(/`((?:hddosd-110U|rom-0230[AE])-[\w-]+?)(?:\.\w+)?`/g)) {
      if (m[1].includes('*') || /-(\{|$)/.test(m[1])) continue;
      if (!captures.has(m[1])) report('warning', n, `capture ${m[1]} has no file in ${CAPTURES}`);
    }
  });
  if (!INDEX_PAGES.has(name) && !/[\w-]+\.(mjs|py)\b/.test(text)) report('error', 0, 'names no script: every measured statement must say which script reproduces it');
}
console.log(`verdict: ${errors ? `PARTIAL ${errors} errors, ${warnings} warnings in ${files.length} pages` : `FOUND ${files.length} pages clean (${warnings} warnings)`}`);
process.exit(errors ? 1 : 0);
