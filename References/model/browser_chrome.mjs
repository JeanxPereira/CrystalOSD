// The Browser page chrome, packet by packet, from the page's state: what the module's frame body
// (HDD OSD 1.10U 0x0024EB90, ROM 2.30 0x00247FD8) sends through the master draw (HDD 0x00253860,
// ROM 0x0024D500), apart from the card row (the calls under 0x002527A8, ROM 0x0024C238).
//
// A packet is a list of GS register writes [register, BigInt]; `chromeFrame` returns the frame's
// items in the order the module sends them. Text is not recomputed here: the font library's
// context is not part of the page state, so a text item says which string, hence how many glyph
// packets, and which RGBAQ every vertex carries.
//
// Only what a capture has exercised is modelled; a state the model does not cover throws. The
// code read but never reached (PAL, aspect words 1 and 2, background variants 1 to 4, dialog kinds
// 1 to 4, the hold state of the fade, the end of the fade-in, a negative counter) is listed in the
// verifier's report as open.
//
// Functions (HDD OSD addresses; the ROM twin of each is the same code, diff_rom.mjs):
//   env 0x0024C7D8 (via 0x0024C870), texenv 0x0024C408, clear 0x0024C928, blend and test 0x0024C200
//   and 0x0024C2F0, texture 0x0024C510, sprite 0x0024F208 (pictures 0x0024F4F0), quad 0x0024F890,
//   background 0x00248A90 -> 0x002488C0 -> gradient 0x00248608 and tile layers 0x00248910, bands
//   0x0024D0C8, guide 0x002524D0 -> picture 0x00252398, dialog 0x0025BD18, fade 0x0024D0A0 -> 0x0024CEB0.

export const R = { PRIM: 0x00, RGBAQ: 0x01, UV: 0x03, XYZ2: 0x05, TEX0: 0x06, CLAMP: 0x08, TEX1: 0x14, XYOFFSET: 0x18, PRMODECONT: 0x1a,
  SCISSOR: 0x40, ALPHA: 0x42, DTHE: 0x45, COLCLAMP: 0x46, TEST: 0x47, FRAME: 0x4c, ZBUF: 0x4e, BITBLTBUF: 0x50, NOP: 0x7f };
const B = (x) => BigInt(x);
const w = (reg, value) => [reg, B(value)];

// The screen's centre in GS primitive space, 12.4: ((0x1000 - size) / 2) << 4, the half rounded toward zero.
const origin = (size) => Math.trunc((0x1000 - size) / 2) << 4;

// 0x0024C200 (mode, z) and 0x0024C2F0 (mode, z, fix): TEST_1 = 0x10000 | z << 17, ALPHA_1 = A | B << 2 |
// C << 4 | D << 6 | FIX << 32 from the mode table (0x002BCFC0, 0x30 bytes per mode, a doubleword per
// field), FIX from the table or from the third argument, CLAMP_1 = 5.
function blendTest(blend, mode, z, fix) {
  const [a, b, c, d, tableFix] = blend(mode);
  return { label: `blend ${mode}`, writes: [w(R.TEST, 0x10000 + (z << 17)), w(R.ALPHA, B(a) | (B(b) << 2n) | (B(c) << 4n) | (B(d) << 6n) | (B(fix ?? tableFix) << 32n)), w(R.CLAMP, 5)] };
}

// 0x0024C510: TEX0_1 of one TEXB entry (table 0x002BD910, 0x1C bytes: tbp, blocks, psm, tbw, tw,
// th, cbp) with TCC 1, CPSM 2 (bit 52), CSM 1 (bit 55) and CLD 1 (bit 61) added, CLAMP_1 5, TEX1_1 1 for
// the background sheet (index 7) and 0x61 for the others (`tex1`).
function textureSetup(entry, tex1) {
  if (entry.psm === 1) throw new Error('a sheet with PSM 1 is not modelled');
  const tex0 = B(entry.tbp) | (B(entry.tbw) << 14n) | (B(entry.psm) << 20n) | (B(entry.tw) << 26n) | (B(entry.th) << 30n) | (B(entry.cbp) << 37n) | (0x8000n << 37n) | (0x8000n << 19n) | (0x8200n << 46n);
  return { label: 'texture', writes: [w(R.TEX0, tex0), w(R.CLAMP, 5), w(R.TEX1, tex1)] };
}

// A sprite packet of 0x0024F208: PRIM (6 | abe << 6 | tme << 4 | FST 0x100), RGBAQ (the code packs
// R | G << 8 | B << 16 | A << 24; every sprite in the captures is grey, so `rgba` is given packed), then
// UV and XYZ2 for each corner, z in bits 32 and up.
function sprite({ x0, y0, x1, y1, u0, v0, u1, v1, rgba, z, abe, tme }) {
  return [w(R.PRIM, 6 | (abe << 6) | (tme << 4) | 0x100), w(R.RGBAQ, rgba),
    w(R.UV, B(u0) | (B(v0) << 16n)), w(R.XYZ2, B(x0) | (B(y0) << 16n) | (B(z) << 32n)),
    w(R.UV, B(u1) | (B(v1) << 16n)), w(R.XYZ2, B(x1) | (B(y1) << 16n) | (B(z) << 32n))];
}

// The draw environment packet (0x0024C7D8 from the display block): FRAME_1 = fbp | width / 64 << 16, ZBUF_1,
// XYOFFSET_1 = (origin x, origin y + the field's half line), SCISSOR_1 = the screen, PRMODECONT 1, COLCLAMP 1,
// DTHE 0, TEST_1 0x50000.
function drawEnv({ w: width, h: height, env }) {
  return { label: 'env', writes: [w(R.FRAME, B(env.fbp) | (B(width >> 6) << 16n)), w(R.ZBUF, 0x8c), w(R.XYOFFSET, B(origin(width)) | (B(origin(height) + env.field) << 32n)),
    w(R.SCISSOR, (B(width - 1) << 16n) | (B(height - 1) << 48n)), w(R.PRMODECONT, 1), w(R.COLCLAMP, 1), w(R.DTHE, 0), w(R.TEST, 0x50000)] };
}

// The frame's first packets: the core's flip and 0x0024C870 send the environment three times. In the first
// frames after the module starts, the core clears each display buffer once, black, in the environment's
// packet (sceGsSetDefClear: TEST_1 0x30000, a sprite over the screen, TEST_1 back to 0x50000).
function head(s) {
  const plain = drawEnv(s);
  const ox = origin(s.w), oy = origin(s.h);
  const cleared = [...plain.writes, w(R.TEST, 0x30000), w(R.PRIM, 6), w(R.RGBAQ, 0), w(R.XYZ2, B(ox) | (B(oy) << 16n)),
    w(R.XYZ2, B(s.w * 16 + ox) | (B(s.h * 16 + oy) << 16n)), w(R.TEST, 0x50000)];
  return { kind: 'head', label: 'env', plain: plain.writes, cleared };
}

// 0x0024C408 (3): sceGsSetDefTexEnv for the page's sheet at tbp 3 * 2240 (NTSC), tbw = width / 64, 1024 x 256, TCC 1;
// TEX1_1 0x61, CLAMP_1 5.
function texEnv({ w: width }) {
  return { label: 'texenv', writes: [w(R.NOP, 0), w(R.TEX1, 0x61), w(R.TEX0, B(3 * 2240) | (B(width >> 6) << 14n) | (10n << 26n) | (8n << 30n) | (1n << 34n)), w(R.CLAMP, 5)] };
}

// 0x0024C928: sceGsSetDefClear at (0x7FE - width / 2, 0x800 - height / 2), width x height, black, alpha 0x80, z 0.
function clear({ w: width, h: height }) {
  const x0 = 0x7fe - Math.trunc(width / 2), y0 = 0x800 - Math.trunc(height / 2);
  return { label: 'clear', writes: [w(R.TEST, 0x30000), w(R.PRIM, 6), w(R.RGBAQ, 0x3f80000080000000n),
    w(R.XYZ2, B(x0 << 4) | (B(y0 << 4) << 16n)), w(R.XYZ2, B((x0 + width) << 4) | (B((y0 + height) << 4) << 16n)), w(R.TEST, 0x30000)] };
}

// 0x0024F890 as 0x00248608 calls it: PRIM 0x10C (tristrip, gouraud, FST), then RGBAQ and XYZ2 (z 4) for the corners
// (0,0) (w,0) (0,h) (w,h); the colours are the immediates of 0x00248608 (R G B, alpha 0x80).
function gradient({ w: width, h: height }) {
  const colours = [[0xac, 0xac, 0xac], [0x52, 0x52, 0x48], [0x7a, 0x7a, 0x7a], [0x2a, 0x2a, 0x20]];
  const ox = origin(width), oy = origin(height);
  const corner = [[0, 0], [width, 0], [0, height], [width, height]];
  const writes = [w(R.PRIM, 0x10c)];
  corner.forEach(([x, y], i) => {
    const [r, g, b] = colours[i];
    writes.push(w(R.RGBAQ, B(r) | (B(g) << 8n) | (B(b) << 16n) | (0x80n << 24n)), w(R.XYZ2, B(ox + (x << 4)) | (B(oy + (y << 4)) << 16n) | (4n << 32n)));
  });
  return { label: 'gradient', writes };
}

// 0x00248A90 after the gradient, while the fade counter c is not 0: texture 7, then layers k = 0..7. Layer k is
// additive (blend mode 6) when k < n, n = (c >> 2) + 4, subtractive (mode 7) otherwise; four rows of ten sprites
// of 64 pixels, UV (0,0)-(63,63), shifted by tile[k] + 8 sixteenths (table 0x00366148), z 5, white at alpha 0x80.
// (A cap of n at 8, in the code, changes nothing: only k < 8 exists.)
function tileLayers({ w: width, h: height, counter, tile, blend, texture }) {
  if (counter < 0) throw new Error('a negative fade counter is not modelled');
  if (counter === 0) return [];
  const items = [textureSetup(texture, 1)];
  const n = (counter >> 2) + 4;
  const ox = origin(width), oy = origin(height);
  for (let k = 0; k < 8; k++) {
    items.push(blendTest(blend, k < n ? 6 : 7, 1));
    const off = tile[k] + 8;
    for (let row = 0; row < 4; row++) for (let col = 0; col < 10; col++) {
      items.push({ label: `tile ${k}`, writes: sprite({ x0: (col << 10) + ox + off, y0: (row << 10) + oy + off, x1: ((col + 1) << 10) + ox + off, y1: ((row + 1) << 10) + oy + off,
        u0: 0, v0: 0, u1: 0x3f0, v1: 0x3f0, rgba: 0x80808080, z: 5, abe: 1, tme: 1 }) });
    }
  }
  return items;
}

// 0x0024D0C8: blend mode 1, then two sprites (PRIM 0x106, black, z 0xFFFFE) over the top and bottom 28 lines.
function bands({ w: width, h: height, blend }) {
  const band = 0x1c, ox = origin(width), oy = origin(height), z = 0xffffe;
  const vertex = (x, y) => w(R.XYZ2, B(x) | (B(y) << 16n) | (B(z) << 32n));
  return [blendTest(blend, 1, 1), { label: 'bands', writes: [w(R.PRIM, 0x106), w(R.RGBAQ, 0x80000000), vertex(ox, oy), vertex(width * 16 + ox, band * 16 + oy),
    w(R.PRIM, 0x106), w(R.RGBAQ, 0x80000000), vertex(ox, (height - band) * 16 + oy), vertex(width * 16 + ox, height * 16 + oy)] }];
}

// 0x0024CEB0: the fade rectangle, mode 1, PRIM 0x146, colour k at alpha a, (0,0)-(w,h), z 0xFFFFF and 0xFFFFD.
// State 2 (fade in) a = c * 128 / L, state 3 (fade out) a = 0x80 - c * 128 / L, the quotient rounded toward zero.
// The hold state (1) and the end of the fade-in (state 2, c = 0, nothing drawn) are not modelled.
function fade({ w: width, h: height, fade: f, blend }) {
  if (f.state !== 2 && f.state !== 3) throw new Error(`fade state ${f.state} is not modelled`);
  if (f.state === 2 && f.counter === 0) throw new Error('the end of the fade-in is not modelled');
  const alpha = f.state === 2 ? Math.trunc((f.counter * 128) / f.length) : 0x80 - Math.trunc((f.counter * 128) / f.length);
  const ox = origin(width), oy = origin(height);
  const colour = B(f.colour) | (B(f.colour) << 8n) | (B(f.colour) << 16n);
  return [blendTest(blend, 1, 1), { label: 'fade', writes: [w(R.PRIM, 0x146), w(R.RGBAQ, colour | (B(alpha) << 24n)),
    w(R.XYZ2, B(ox) | (B(oy) << 16n) | (0xfffffn << 32n)), w(R.XYZ2, B(width * 16 + ox) | (B(height * 16 + oy) << 16n) | (0xffffdn << 32n))] }];
}

// 0x002524D0: per slot s4 = 0..3 whose counter is not 0 (`slots`, in order), the label, then the picture. The picture index s2 is
// s4, except that slots 1 and 2 swap when the video mode is not 0. The text and picture alpha is the counter * 8,
// held at 0x80 from 16 on. The picture (0x00252398, ROM 0x0024BE78) is 24 x 12 pixels at
// x = xs[s2] and y = 0xC9 - dy (dy 2 on HDD OSD, 1 on ROM 2.30; + 0.5 on top, 12 high), UV from the quadrant
// of the sheet: index 0 (0.5, 0.5), 1 (0.5, 32.5), 2 (32.5, 32.5), 3 (32.5, 0.5), +31 texels at the far corner.
// Slot 3's x is written when its label is measured: xs[3] null leaves it out of the comparison.
function guide({ w: width, h: height, blend, texture, guide: g }) {
  const items = [];
  const ox = origin(width), oy = origin(height);
  for (const { s4, counter, label } of g.slots) {
    const s2 = g.swap && s4 === 1 ? 2 : g.swap && s4 === 2 ? 1 : s4;
    const alpha = Math.min(counter * 8, 0x80);
    items.push({ kind: 'text', label: `guide label ${s4}`, text: label, rgba: (0x3f800000n << 32n) | 0x606060n | (B(alpha) << 24n) });
    items.push(textureSetup(texture, 0x61), blendTest(blend, 1, 1));
    const u = s2 >= 2 ? 0x208 : 8, v = s2 === 1 || s2 === 2 ? 0x208 : 8;
    const x = ox + ((g.xs[s2] ?? 0) << 4), y = oy + ((0xc9 - g.dy) << 4);
    items.push({ label: `guide picture ${s2}`, wild: g.xs[s2] === null ? [[3, 0xffffn], [5, 0xffffn]] : undefined,
      writes: sprite({ x0: x, y0: y + 8, x1: x + 0x180, y1: y + 0xc8, u0: u, v0: v, u1: u | 0x1f0, v1: v | 0x1f0, rgba: B(0x808080) | (B(alpha) << 24n), z: 8, abe: 1, tme: 1 }) });
  }
  return items;
}

// 0x0025BD18, kind 0 (D_00370BE8 = 0): the error dialog. The counter n steps by `step` and is held in 0 .. 0x1E
// by 0x0024DFA8; a panel (0x0024C2F0, blend mode 3, FIX = n * 0x54 / 0x1E), a full-screen box (0x0024F6E8: black,
// alpha 0x80, z 4, abe) and the lines 0x15C to 0x15F up to the first empty one, colour slot 0 at alpha
// n * 128 / 0x1E. Nothing is drawn when the leave counter or a disc error is set.
function dialog({ w: width, h: height, dialog: d, blend, osd }) {
  if (d.kind !== 0) throw new Error(`dialog kind ${d.kind} is not modelled`);
  if (d.abort) return [];
  const n = Math.min(d.n + d.step, 0x1e);
  if (n < 0) throw new Error('a closing dialog is not modelled');
  const ox = origin(width), oy = origin(height);
  const items = [blendTest(blend, 3, 1, Math.trunc((n * 0x54) / 0x1e)),
    { label: 'dialog box', writes: [w(R.PRIM, 0x146), w(R.RGBAQ, 0x80000000), w(R.XYZ2, B(ox) | (B(oy) << 16n) | (4n << 32n)), w(R.XYZ2, B(width * 16 + ox) | (B(height * 16 + oy) << 16n) | (4n << 32n))] }];
  const alpha = Math.trunc((n << 7) / 0x1e);
  for (const id of [0x15c, 0x15d, 0x15e, 0x15f]) {
    const text = osd(id);
    if (text.length === 0) break;
    items.push({ kind: 'text', label: 'dialog line', text, rgba: (0x3f800000n << 32n) | 0x606060n | (B(alpha) << 24n) });
  }
  return items;
}

// 0x00250DA0: the alpha of the top left title from the page fade counter c (0 to 0x1A on NTSC):
// ((c - 0xA) * 0x80 - (c - 0xA)) / (0x1A - 0xA), 0 while c < 0xB.
export function titleAlpha(c) {
  return c < 0xb ? 0 : Math.trunc(((c - 0xa) * 0x80 - (c - 0xa)) / (0x1a - 0xa));
}

// The frame, in the order of the master draw (0x00253860): head, texenv, clear, background, [card row],
// titles, dialog, bands, guide, the environment again (0x0024C7D8), fade. `s`:
//   w, h         the screen record (0x001F0CB4, 0x001F0CB8)
//   env          { fbp, field } from the display block
//   fade         { state, counter, length, colour } as 0x0024CEB0 reads it; bgCounter the counter as 0x00248A90 reads it
//   tile, blend  the static tables; textures { 3, 7 } the TEXB entries
//   titles       the title text items; dialog (or undefined); guide { slots [{ s4, counter, label }], swap, xs, dy }
export function chromeFrame(s) {
  const env = drawEnv(s);
  return [head(s), texEnv(s), clear(s), gradient(s), ...tileLayers({ ...s, counter: s.bgCounter ?? s.fade.counter, texture: s.textures[7] }),
    ...s.titles, ...(s.dialog ? dialog(s) : []), ...bands(s), ...guide({ ...s, texture: s.textures[3] }), env, ...fade(s)];
}
