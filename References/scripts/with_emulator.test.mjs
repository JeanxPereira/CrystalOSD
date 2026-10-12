// node --test References/scripts/with_emulator.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const WRAPPER = new URL('./with_emulator.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

test('many waiters started at once never exceed the slots, and all run', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'with-emulator-'));
  const log = path.join(dir, 'log.txt');
  // Each session appends "start" and "end" lines; the overlap is counted afterwards.
  const session = path.join(dir, 'session.cjs');
  fs.writeFileSync(session, [
    "const fs = require('fs');",
    `fs.appendFileSync(${JSON.stringify(log)}, 'start ' + process.pid + String.fromCharCode(10));`,
    'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);',
    `fs.appendFileSync(${JSON.stringify(log)}, 'end ' + process.pid + String.fromCharCode(10));`,
  ].join(String.fromCharCode(10)));
  const env = { ...process.env, WITH_EMULATOR_DIR: dir, WITH_EMULATOR_SLOTS: '3' };
  const runs = Array.from({ length: 16 }, () => new Promise((resolve) => {
    const child = spawn(process.execPath, [WRAPPER, process.execPath, session], { env, stdio: ['ignore', 'ignore', 'pipe'] });
    let errors = '';
    child.stderr.on('data', (chunk) => { errors += chunk; });
    child.on('exit', (code) => resolve({ code, errors }));
  }));
  const results = await Promise.all(runs);
  for (const result of results) assert.equal(result.code, 0, result.errors);
  let running = 0, most = 0, starts = 0;
  for (const line of fs.readFileSync(log, 'utf8').trim().split('\n')) {
    if (line.startsWith('start')) { running += 1; starts += 1; } else running -= 1;
    most = Math.max(most, running);
  }
  assert.equal(starts, 16);
  assert.ok(most <= 3, `at most 3 at once, saw ${most}`);
  assert.ok(most >= 2, `the slots are used in parallel, saw ${most}`);
  const left = fs.readdirSync(dir).filter((name) => name.endsWith('.lock'));
  assert.deepEqual(left, []);
});

test('a lock left by a dead process is taken over', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'with-emulator-'));
  fs.writeFileSync(path.join(dir, 'emulator.slot-0.lock'), '999999');
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [WRAPPER, process.execPath, '-e', '0'], { env: { ...process.env, WITH_EMULATOR_DIR: dir, WITH_EMULATOR_SLOTS: '1' } });
    child.on('exit', resolve);
  });
  assert.equal(code, 0);
});
