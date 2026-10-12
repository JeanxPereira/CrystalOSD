import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runOracle } from './oracle.mjs';

const DUMP = 'D:/CodingProjects/Watson/Runtime/captures/hddosd-110U-whole3-clock.gs';

test('one clock frame gives 188 draws, and the same bytes twice', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-'));
  const a = await runOracle(DUMP, path.join(root, 'a'), 0);
  const b = await runOracle(DUMP, path.join(root, 'b'), 0);
  assert.equal(a.draws, 188);
  assert.equal(b.draws, 188);
  assert.equal(a.files, b.files);
  for (const name of fs.readdirSync(path.join(root, 'a'))) {
    assert.ok(fs.readFileSync(path.join(root, 'a', name)).equals(fs.readFileSync(path.join(root, 'b', name))), name);
  }
});

test('a missing dump is refused with its path', async () => {
  await assert.rejects(runOracle('D:/nowhere/none.gs', path.join(os.tmpdir(), 'oracle-none'), 0), /no dump at D:\/nowhere\/none\.gs/);
});
