import fs from 'node:fs';

const args = process.argv.slice(2);
const allowResidue = args.includes('--allow-residue');
const [file, ...fields] = args.filter((a) => a !== '--allow-residue');
const measured = JSON.parse(fs.readFileSync(0, 'utf8'));
if (measured.history !== true) throw new Error('refusing to write a budget: the measurement did not use the capture start history');
const budget = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { capture: measured.capture, stages: {} };
for (const field of fields.filter((f) => f !== 'wavDiffer' && f !== 'ramDiffer')) {
  const m = measured.stages[field];
  if (!m) throw new Error(`no stage ${field}`);
  if (!allowResidue && (m.differ !== 0 || m.maxAbs !== 0)) throw new Error(`refusing to declare a difference in ${field} (${m.differ} samples): an unexplained difference is a failure; pass --allow-residue only for a diagnosed one`);
  budget.stages[field] = { differ: m.differ, maxAbs: m.maxAbs, first: m.first, last: m.last };
}
if (fields.includes('wavDiffer')) {
  if (!allowResidue && measured.wavDiffer !== 0) throw new Error('refusing to declare a WAV difference');
  budget.wavDiffer = measured.wavDiffer;
}
if (false) budget.wavDiffer = measured.wavDiffer;
if (fields.includes('ramDiffer')) {
  if (!allowResidue && measured.ramDiffer !== 0) throw new Error('refusing to declare a RAM difference');
  budget.ramDiffer = measured.ramDiffer;
}
for (const key of Object.keys(budget.stages)) if (!/^(c[01]\.(dry|wet|pre|post|mix)|c0\.out|out)\.[lr]$/.test(key)) delete budget.stages[key];
const sorted = Object.fromEntries(Object.entries(budget.stages).sort(([a], [b]) => a.localeCompare(b)));
fs.mkdirSync(file.replace(/[\\/][^\\/]*$/, ''), { recursive: true });
fs.writeFileSync(file, JSON.stringify({ ...budget, stages: sorted }, null, 1) + '\n');
