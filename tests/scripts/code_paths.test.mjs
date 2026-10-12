import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const env = { ...process.env, CRYSTALOSD_DATA: 'D:/CodingProjects/CrystalOSD-Data' };
const loads = (module) => module.endsWith('opening_vectors.mjs')
  ? spawnSync(process.execPath, [module, path.join(os.tmpdir(), 'crystalosd-vu0-vectors.json')], { cwd: ROOT, env, encoding: 'utf8', timeout: 120000 })
  : spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(new URL(module, new URL('../../', import.meta.url)).href)})`],
    { cwd: ROOT, env, encoding: 'utf8', timeout: 120000 });

for (const module of ['tools/scene/instrument.mjs', 'tools/scene/export_opening.mjs', 'tools/scene/opening_vectors.mjs', 'References/scripts/start_origins.mjs']) {
  test(`${module} loads its code from the repository, not the data home`, () => {
    const run = loads(module);
    assert.doesNotMatch(run.stderr, /Cannot find module '[^']*CrystalOSD-Data/);
  });
}
