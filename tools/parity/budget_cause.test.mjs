import test from 'node:test';
import assert from 'node:assert/strict';
import { causes, parseTrace, rectangleOf } from './budget_cause.mjs';

const frame = { passes: [{ name: 'draw-1', texture: { width: 1024, height: 256, filter: 'Bilinear' }, vertices: [[0, 0, 0, 0, 0, 0, 0, 0.25, 0.5, 1], [0, 0, 0, 0, 0, 0, 0, 0.5, 0.75, 1]] }] };

test('the rectangle is the vertices texel range widened by half a texel', () => {
  assert.deepEqual(rectangleOf(frame.passes[0]), { u: [255, 512], v: [127, 192] });
});

test('an entry is explained by an edge tap one texel outside the rectangle, and only the first run of a pass counts', () => {
  const trace = ['draw-1 5 6 16711680 8388608', 'draw-1 5 6 16711680 8388608', 'other 1 1 0 0', 'draw-1 5 7 0 0'].join('\n');
  const events = parseTrace(trace.replace('draw-1 5 7 0 0', 'draw-1 5 7 0 0'));
  assert.equal(events.get('draw-1 5 6').length, 2);
  const result = causes(frame, [{ scope: 'draw-1', target: 't', x: 5, y: 6, delta: 2 }, { scope: 'draw-1', target: 't', x: 9, y: 9, delta: 1 }, { scope: 'chained', target: 't', x: 1, y: 1, delta: 1 }], events);
  assert.equal(result.length, 2);
  const inside = result.find((r) => r.x === 5);
  assert.equal(inside.explained, false);
  assert.equal(result.find((r) => r.x === 9).explained, false);
  const edge = parseTrace(`draw-1 5 6 ${254.4 * 65536} ${150 * 65536}`);
  const outside = causes(frame, [{ scope: 'draw-1', target: 't', x: 5, y: 6, delta: 2 }], edge)[0];
  assert.equal(outside.explained, true);
  assert.equal(outside.events[0].outsideBy, 1);
});
