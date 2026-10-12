import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeFixture } from './make_fixture.mjs';

const DUMP = 'D:/CodingProjects/Watson/Runtime/captures/hddosd-110U-whole3-clock.gs';

test('the clock frame becomes 188 passes lined up with the oracle', async () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-')), 'f0');
  const done = await makeFixture(DUMP, out, 0);
  const frame = JSON.parse(fs.readFileSync(path.join(out, 'frame.json'), 'utf8'));

  assert.equal(done.passes, 188);
  assert.equal(done.dropped, 284);
  assert.equal(done.left, 1);
  assert.equal(frame.passes.length, 188);
  assert.deepEqual(frame.targets.map((t) => t.id).sort(), ['fb0000', 'fb1a40', 'fb2300']);
  for (const target of frame.targets) {
    assert.equal(target.width, 640);
    assert.equal(target.height, 224);
    assert.equal(fs.statSync(path.join(out, target.start)).size, 640 * 224 * 4);
  }

  const skipped = frame.passes.filter((p) => p.skip);
  assert.equal(skipped.length, 26);
  assert.ok(!frame.passes.some((p) => p.skip === 'gouraud line'), 'no clock line is smooth');
  assert.ok(skipped.every((p) => p.skip === 'texture format 0x14'), 'only the paletted text is skipped');

  const first = frame.passes[0];
  assert.equal(first.index, 1);
  assert.equal(first.primitive, 'Sprites');
  assert.equal(first.texture, null);
  assert.equal(first.vertices.length, 2);

  const copy = frame.passes[2];
  assert.equal(copy.target, 'fb1a40');
  assert.deepEqual(copy.texture.source, { target: 'fb0000' });
  assert.deepEqual(copy.texture.alpha, { mode: 'Constant', value: 127, zeroWhenBlack: true });
  assert.equal(copy.texture.addressU.mode, 'RegionClamp');
  assert.equal(copy.texture.addressU.max, 639);
  assert.equal(copy.texture.filter, 'Bilinear');
  assert.equal(copy.depth.test, 'Always');
  assert.deepEqual(copy.vertices[1].slice(0, 2), [640, 224]);

  const lines = frame.passes.filter((p) => p.primitive === 'Lines');
  assert.equal(lines.length, 14);
  assert.ok(lines.every((p) => p.antialias && p.depth.test === 'Greater'));
  // ABE is 0 on the orb trails, but AA1 forces the blend with the ALPHA register as it stands (0x48: (Cs - 0) * As + Cd).
  assert.ok(lines.every((p) => p.blend && p.blend.a === 'Source' && p.blend.b === 'Zero' && p.blend.c === 'SourceAlpha' && p.blend.d === 'Destination'));
  const faces = frame.passes.filter((p) => p.primitive === 'Triangles' && p.antialias);
  assert.equal(faces.length, 36);
  assert.ok(faces.every((p) => p.blend && p.blend.a === 'Source' && p.blend.b === 'Destination' && p.blend.c === 'SourceAlpha' && p.blend.d === 'Destination'));

  for (const pass of frame.passes) {
    assert.ok(fs.existsSync(path.join(out, `${pass.oracle.colour}.png`)), pass.oracle.colour);
    assert.ok(pass.oracle.colour.includes(`_${pass.target.slice(2).padStart(5, '0')}_`), `pass ${pass.index} target and oracle file agree`);
    const size = { Triangles: 3, Sprites: 2, Lines: 2 }[pass.primitive];
    assert.equal(pass.vertices.length % size, 0);
    assert.ok(pass.vertices.every((v) => v.length === 10 && v.every(Number.isFinite)));
  }
  for (const texture of frame.textures) assert.equal(fs.statSync(path.join(out, texture.file)).size, texture.width * texture.height * 4);
});

test('antialiasing with alpha blending is refused on lines and triangles', async () => {
  const { describeState } = await import('./make_fixture.mjs');
  const zero = Object.fromEntries(['FRAME', 'ZBUF', 'TEST', 'ALPHA', 'SCISSOR', 'FBA', 'PABE', 'DTHE', 'XYOFFSET'].map((n) => [n, '0']));
  // PRIM: ABE is bit 6, AA1 bit 7; COLCLAMP 1 keeps the state otherwise drawable.
  const state = (prim) => ({ ...zero, COLCLAMP: '1', PRIM: String(prim) });
  const both = (1 << 6) | (1 << 7);
  for (const primitive of ['Triangles', 'Lines']) assert.match(describeState(state(both), new Map(), primitive).skip ?? '', /antialiasing with alpha blending/);
  assert.equal(describeState(state(both), new Map(), 'Sprites').skip, null);
  assert.equal(describeState(state(1 << 7), new Map(), 'Triangles').skip, null);
  assert.equal(describeState(state(1 << 6), new Map(), 'Triangles').skip, null);
});

test('lines without antialiasing are refused', async () => {
  const { describeState } = await import('./make_fixture.mjs');
  const zero = Object.fromEntries(['FRAME', 'ZBUF', 'TEST', 'ALPHA', 'SCISSOR', 'FBA', 'PABE', 'DTHE', 'XYOFFSET'].map((n) => [n, '0']));
  const state = (prim) => ({ ...zero, COLCLAMP: '1', PRIM: String(prim) });
  assert.match(describeState(state(0), new Map(), 'Lines').skip ?? '', /line without antialiasing/);
  assert.equal(describeState(state(1 << 7), new Map(), 'Lines').skip, null);
  assert.equal(describeState(state(0), new Map(), 'Triangles').skip, null);
});

const drawable = (extra) => {
  const zero = Object.fromEntries(['FRAME', 'ZBUF', 'TEST', 'ALPHA', 'SCISSOR', 'FBA', 'PABE', 'DTHE', 'XYOFFSET', 'PRIM'].map((n) => [n, '0']));
  return { ...zero, COLCLAMP: '1', ...extra };
};

test('Z24, PABE and FBA are drawn and flagged, other depth formats are refused', async () => {
  const { describeState } = await import('./make_fixture.mjs');
  const z24 = describeState(drawable({ ZBUF: String(1n << 24n) }), new Map(), 'Sprites');
  assert.equal(z24.skip, null);
  assert.equal(z24.depth.format, 'Z24');
  assert.equal(describeState(drawable({}), new Map(), 'Sprites').depth.format, 'Z32');
  assert.match(describeState(drawable({ ZBUF: String(10n << 24n) }), new Map(), 'Sprites').skip, /depth format 0x3a/);
  // The game writes the symbolic 0x31; the GS reads the low four bits.
  assert.equal(describeState(drawable({ ZBUF: String(0x31n << 24n) }), new Map(), 'Sprites').depth.format, 'Z24');
  const flags = describeState(drawable({ PABE: '1', FBA: '1' }), new Map(), 'Sprites');
  assert.equal(flags.skip, null);
  assert.equal(flags.perPixelAlpha, true);
  assert.equal(flags.alphaCorrection, true);
  const blended = describeState(drawable({ PABE: '1', PRIM: String(1 << 6) }), new Map(), 'Sprites');
  assert.match(blended.skip, /per-pixel alpha with blending/);
  const plain = describeState(drawable({}), new Map(), 'Sprites');
  assert.equal(plain.perPixelAlpha, false);
  assert.equal(plain.alphaCorrection, false);
});

test('a PSMCT16 texture carries TEXA and is refused when read from a target', async () => {
  const { describeState } = await import('./make_fixture.mjs');
  const tex0 = (2n << 20n) | (6n << 26n) | (6n << 30n) | (1n << 34n) | 0x2cc0n | (1n << 14n);
  const texa = 127n | (1n << 15n) | (129n << 32n);
  const state = drawable({ PRIM: String(1 << 4), TEX0: String(tex0), TEX1: '0', CLAMP: '0', TEXA: String(texa) });
  const drawn = describeState(state, new Map(), 'Sprites');
  assert.equal(drawn.skip, null);
  assert.deepEqual(drawn.texture.alpha, { mode: 'Texel16', value: 127, valueHigh: 129, zeroWhenBlack: true });
  assert.equal(drawn.texture.format, 2);
  assert.deepEqual(drawn.texture.source, { image: 't2cc0-1-2-6x6' });
  assert.match(describeState(state, new Map([[0x2cc0, 'fb2cc0']]), 'Sprites').skip, /texture format 0x02 read from a target/);
});

const towerState = () => {
  const tex0 = (2n << 20n) | (8n << 26n) | (8n << 30n) | (1n << 34n) | 0x2d40n | (4n << 14n);
  const tex1 = (2n << 2n) | (1n << 5n) | (5n << 6n) | (0xfbfn << 32n);
  return drawable({ PRIM: String(3 << 3), TEX0: String(tex0), TEX1: String(tex1), CLAMP: '0', TEXA: String(127n | (1n << 15n) | (129n << 32n)) });
};

test('MIPTBP1 and 2 give the addresses of mip levels 1 to 6, or nothing when they change', async () => {
  const { mipLevels } = await import('./make_fixture.mjs');
  const values = new Map([['MIPTBP1_1', new Set([0x400006fc00af40n])], ['MIPTBP2_1', new Set([0n])], ['MIPTBP1_2', new Set([0n, 1n])], ['MIPTBP2_2', new Set([0n])]]);
  const levels = mipLevels(values, 0);
  assert.deepEqual(levels[1], { tbp: 0x2f40, tbw: 2 });
  assert.deepEqual(levels[2], { tbp: 0x2fc0, tbw: 1 });
  assert.equal(mipLevels(values, 1), null);
});

test('a mip-mapped texture is drawn at the one level or the one filter its draw uses, and refused otherwise', async () => {
  const { describeState, mipOf } = await import('./make_fixture.mjs');
  const levelsOf = () => [null, { tbp: 0x2f40, tbw: 2 }, { tbp: 0x2fc0, tbw: 1 }];
  const vertices = (...qs) => qs.map((q) => ({ q }));
  // The towers: Q 0.0045 to 0.0138, L 0, K -65 / 16: LOD 2.12 to 3.7, at or above MXL 2, so level 2, last level, bilinear (MMIN 5).
  const tower = describeState(towerState(), new Map(), 'Triangles', mipOf(vertices(0.0045, 0.0138), levelsOf));
  assert.equal(tower.skip, null);
  assert.equal(tower.texture.level, 2);
  assert.equal(tower.texture.width, 64);
  assert.equal(tower.texture.height, 64);
  assert.equal(tower.texture.filter, 'Bilinear');
  assert.equal(tower.texture.block, 0x2fc0);
  assert.equal(tower.texture.pages, 1);
  assert.deepEqual(tower.texture.source, { image: 't2fc0-1-2-6x6' });
  // Q 1 to 2: LOD -4.06 to -5.06, everything at or below 0: level 0 with the magnification filter.
  const near = describeState(towerState(), new Map(), 'Triangles', mipOf(vertices(1, 2), levelsOf));
  assert.equal(near.skip, null);
  assert.equal(near.texture.level, 0);
  assert.equal(near.texture.width, 256);
  assert.equal(near.texture.block, 0x2d40);
  // Q 0.05 to 0.5: LOD from -3.06 to 0.26: the level changes inside the draw.
  assert.match(describeState(towerState(), new Map(), 'Triangles', mipOf(vertices(0.05, 0.5), levelsOf)).skip, /mip level varies within the draw/);
  // Q 0.0135 to 0.0138 puts the lowest LOD at 2.0 within half a hundredth of MXL.
  assert.match(describeState(towerState(), new Map(), 'Triangles', mipOf(vertices(Math.pow(2, -(2 + 65 / 16)) * 1.001, 0.0138), levelsOf)).skip, /mip level on a boundary/);
  assert.match(describeState(towerState(), new Map(), 'Triangles', null).skip, /mip-mapped texture/);
  assert.match(describeState(towerState(), new Map(), 'Sprites', mipOf(vertices(0.0045, 0.0138), levelsOf)).skip, /mip-mapped sprite/);
  assert.match(describeState(towerState(), new Map([[0x2fc0, 'fb2fc0']]), 'Triangles', mipOf(vertices(0.0045, 0.0138), levelsOf)).skip, /mip level read from a target|texture format 0x02 read from a target/);
  assert.match(describeState(towerState(), new Map(), 'Triangles', mipOf(vertices(0.0045, 0.0138), () => null)).skip, /mip addresses change during the dump/);
  const mtba = towerState();
  mtba.TEX1 = String(BigInt(mtba.TEX1) | (1n << 9n));
  assert.match(describeState(mtba, new Map(), 'Triangles', mipOf(vertices(0.0045, 0.0138), levelsOf)).skip, /mip addresses derived by MTBA/);
});

test('a refused mip-mapped texture still names its filter', async () => {
  const { describeState } = await import('./make_fixture.mjs');
  const refused = describeState(towerState(), new Map(), 'Triangles', null);
  assert.match(refused.skip, /mip-mapped texture/);
  assert.equal(refused.texture.filter, 'Bilinear');
});
