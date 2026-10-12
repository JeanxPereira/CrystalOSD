import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const database = process.env.COMPILE_COMMANDS;

test('every Source/ file compiles without floating-point contraction', () => {
  const entries = JSON.parse(fs.readFileSync(database, 'utf8'));
  const own = entries.filter((e) => path.normalize(e.file).split(path.sep).join('/').includes('/Source/'));
  assert.ok(own.length > 50, `only ${own.length} Source/ entries in ${database}`);
  const contracting = own.filter((e) => !/-ffp-contract=off\b/.test(e.command ?? e.arguments?.join(' ') ?? ''));
  assert.deepEqual(contracting.map((e) => e.file).slice(0, 5), []);
});
