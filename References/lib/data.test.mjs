import { test } from 'node:test';
import assert from 'node:assert/strict';

test('defaults name the new homes', async () => {
  delete process.env.CRYSTALOSD_DATA; delete process.env.CRYSTALOSD_ASM; delete process.env.CRYSTALOSD_CAPTURES;
  const m = await import('./data.mjs?defaults');
  assert.equal(m.DATA_HOME, 'D:/CodingProjects/CrystalOSD-Data');
  assert.equal(m.ASM_HOME, 'D:/CodingProjects/CrystalOSD-Decomp-Legacy/asm');
  assert.equal(m.CAPTURES, 'D:/CodingProjects/Watson/Runtime/captures');
});

test('environment overrides, backslashes and trailing slash normalized', async () => {
  process.env.CRYSTALOSD_DATA = 'C:\\x\\data\\'; process.env.CRYSTALOSD_ASM = 'C:/y/asm/';
  const m = await import('./data.mjs?env');
  assert.equal(m.DATA_HOME, 'C:/x/data');
  assert.equal(m.dataPath('dumps/a.bin'), 'C:/x/data/dumps/a.bin');
  assert.equal(m.asmPath('clock/f.s'), 'C:/y/asm/clock/f.s');
});
