// One-time migration of the verifiers onto References/lib: every verifier that exports PROBES
// reads its captures through readTraceFor, so it can share a capture with other verifiers.
// node migrate_to_lib.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMPORT = "import { readTrace } from 'file:///D:/CodingProjects/Watson/Server/dist/gs/trace.js';";
const REPLACEMENT = "import { readTraceFor } from '../lib/trace.mjs';\n// On a capture shared with other verifiers, only this verifier's probe records.\nconst readTrace = (file) => readTraceFor(file, PROBES);";
const changed = [];
for (const name of fs.readdirSync(HERE).filter((n) => n.endsWith('.mjs'))) {
  const file = path.join(HERE, name);
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes(IMPORT) || !/export (const|let) PROBES\b/.test(text)) continue;
  changed.push(name);
  if (!process.argv.includes('--dry')) fs.writeFileSync(file, text.replace(IMPORT, REPLACEMENT));
}
console.log(`${process.argv.includes('--dry') ? 'would change' : 'changed'} ${changed.length} files:\n${changed.join('\n')}`);
