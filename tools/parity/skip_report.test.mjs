import test from 'node:test';
import assert from 'node:assert/strict';
import { reportDraws } from './skip_report.mjs';

const BASE = {
  PRIM: '0x6', FRAME: '0x0', ZBUF: '0x0', TEX0: '0x0', TEX1: '0x0', CLAMP: '0x0', ALPHA: '0x0', TEST: '0x30000',
  SCISSOR: '0x00df0000027f0000', XYOFFSET: '0x0', FBA: '0x0', TEXA: '0x0', FOGCOL: '0x0', COLCLAMP: '0x1', DTHE: '0x0', PABE: '0x0',
};
const draw = (index, state) => ({ index, frame: 0, primitive: 'sprite', state: { ...BASE, ...state } });

test('one pass with a 16-bit depth buffer and one free pass', () => {
  const report = reportDraws([draw(0, {}), draw(1, { ZBUF: '0x0000000002000000' })]);
  assert.equal(report.passes, 2);
  assert.equal(report.free, 1);
  assert.equal(report.reasons.get('(none)').count, 1);
  assert.equal(report.reasons.get('depth format 0x32').count, 1);
  assert.equal(report.features.size, 1);
  assert.match([...report.features.keys()][0], /^ZBUF\.PSM=0x32 /);
});
