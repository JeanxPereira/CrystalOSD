import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findFunction, callers, writers } from './asm.mjs';

test('finds a function by name with stripped lines', () => {
  const f = findFunction('clock_config_change_cb_aspect_ratio');
  assert.equal(f.module, 'clock');
  assert.equal(f.start, 0x227D30);
  assert.deepEqual(f.lines[0], { addr: 0x227D30, text: 'addiu $sp, $sp, -0x20' });
  assert.ok(f.lines.some((l) => l.text === 'jal config_get_aspect_ratio'));
});

test('finds the same function by an address inside it', () => {
  assert.equal(findFunction('0x227D44').name, 'clock_config_change_cb_aspect_ratio');
});

test('positive control: func_002344F8 has a known caller', () => {
  assert.ok(callers('func_002344F8').some((c) => c.name === 'func_002347D8'));
});

test('unknown name reports not found with a positive control', () => {
  assert.throws(() => findFunction('no_such_function_xyz'), /not found.*clock_config_change_cb_aspect_ratio found=true/);
});

test('writers lists the stores that name a symbol', () => {
  const w = writers('D_002B2E1C');
  assert.ok(w.some((s) => s.addr === 0x228464));
  assert.ok(w.every((s) => /^(sb|sh|sw|sd|sq|swc1|sqc2) /.test(s.text) && s.text.includes('D_002B2E1C')));
});

test('writers match a whole symbol, not a prefix of another', () => {
  assert.deepEqual(writers('D_002B2E1'), []);
});
