# What drawing one crystal rod computes

Recorded 2026-10-02. Build: **HDD OSD 1.10U**. Everything here is *read* from the disassembly
in `../CrystalOSD-Decomp-Legacy/asm/` (spimdisasm output of `hddosd.elf`) unless marked *measured*, which
refers to the ROM 2.30 captures in `Watson/docs/findings/`. Constants were read from the ELF's
data. Names of `sceVu0*` and `sce*Pk*` functions are CrystalOSD's.

Functions read in full: `module_clock_237A28` (`0x00237A28..0x002384C0`), `func_00237010`,
`func_00236988`, `func_002365D0`, `func_00236A20`, `func_00233E70`, `func_002333E0`,
`func_00238DB0`, `module_clock_22FCA8`, `module_clock_22FC88`, `module_clock_22FD90`.
Not read: `func_00236058`, `func_002360A8`, `func_002349E0` beyond their calls (they select
the target buffer and texture), `func_00234070`, `func_002342F0`, `func_002341C8`,
`func_002348A8`, `module_clock_23A418`, `func_00239FF0`.

## Who calls it

`module_clock_22FCA8` walks a linked list whose head pointer is at `0x00405230`. For a node
whose field `+0xF0` is 1 it calls `module_clock_22F908` (orbs); otherwise
`module_clock_22FC88(node)`, which is:

```
module_clock_237A28(rod = node + 0x10, colour = node + 0x100, t = float at node + 0xF4, n = (float) int at node + 0x110)
```

## The rod record (`rod`, at node + 0x10)

| Offset | Type | Use |
|---|---|---|
| `+0x00` | int | the rod's number, 0 to 11 (`clock-scene.md`); `phase = (float) number * 0.1` offsets the textures |
| `+0x04` | int | number of faces |
| `+0x08` | pointer | positions, four per face, 16 bytes each |
| `+0x0C` | pointer | one normal per face, 16 bytes |
| `+0x10` | pointer | texture coordinates, four per face, 16 bytes each |
| `+0x20` | 4×4 floats | local matrix |
| `+0x60` | pointer | matrix applied second (to screen) |
| `+0x64` | pointer | matrix applied first (multiplied with the local matrix) |
| `+0x68`, `+0x6C`, `+0x70` | floats | scale of x, y, z; a negative `+0x6C` skips the rod |
| `+0x80`, `+0x84`, `+0x88` | ints | base colour R, G, B of the refracted passes |
| `+0x90` | float | highlight strength |
| `+0xA0` | 4 ints | colour R, G, B, A of the two textured passes |
| `+0xB0`, `+0xB4` | floats | extra texture offset of the second textured pass |
| `+0xB8` | float | refraction strength |
| `+0xD0` | 4 ints | colour of the grain in the two extra passes: 40, 40, 40, 128 in the template |

## Transform: `func_00237010(outX, outY, outZ, faces, rod)`

All of it runs on the EE through the `sceVu0` library (VU0 as a coprocessor). *Measured: no
packet of the clock takes PATH1, so VU1 sends none of this.*

1. `M = sceVu0MulMatrix(*rod[+0x64], rod + 0x20)`.
2. The rod's centre: `(0, 0, 0, 1)` through `M`, then through `*rod[+0x60]`, divided by `w`.
   `outX`, `outY` are its x and y minus `2048.0`.
3. For each face, written to a 0x160-byte record (records at `0x00409280`):
   - the face normal through `M`, at `+0x140`;
   - for each of four vertices, at `+k*0x50`: position scaled by the three scale floats, `w = 1`,
     through `M` (`+0x00`, view space), then through `*rod[+0x60]` and multiplied by `q = 1/w`
     (`+0x20`, screen position as floats; `q` at `+0x40`); `sceVu0FTOI4Vector` of that at
     `+0x30` (x, y, z as 12.4 integers); texture `s` at `+0x10` and `t * rod[+0x6C]` at `+0x14`;
   - a side flag at `+0x150`: with `e1 = v1 - v0` and `e2 = v2 - v0` on screen,
     `flag = (e2.x * e1.y - e2.y * e1.x > 0) ? 0 : 1`.

The caller then takes `cx = 0.9 * outX`, `cy = 0.9 * outY`.

## The five sends of a rod

Each pass opens a VIF1 `DIRECT` packet in the scratchpad (`func_002333E0`: the base alternates
between two halves 0x2000 apart), writes a REGLIST GIF tag, emits faces, and sends
(`func_00238DB0`). Before it, `func_00233E70(mode, ztst)` writes `ALPHA_1` and `TEST_1`:

| `mode` | `ALPHA_1` | Blend |
|---|---|---|
| 0 | `0x48` | `(Cs - 0) * As + Cd` |
| 1 | `0x44` | `(Cs - Cd) * As + Cd` |
| 2 | `0x42` | `(0 - Cs) * As + Cd` |
| 3 | `FIX 0x28`, `0x64` | `(Cs - Cd) * FIX + Cd` |
| 4 | `0x68` | `(Cs - 0) * FIX + Cd`, with `FIX` left 0 by this function |

`TEST_1 = 0x10000 | ztst << 17`: depth test on, 1 `ALWAYS`, 2 `GEQUAL`.

| Pass | Target and texture set by | `mode`, `ztst` | Faces | Emitter | *Measured on ROM 2.30* |
|---|---|---|---|---|---|
| 1 | `func_00236058(1, 0, 1)` | 1, `ALWAYS` | flag 0 | refracted, add 0 | into `0x118`, samples buffer `0x0d2`, blend off |
| 2 | `func_002349E0(2, 1, 2)` | 2, `GEQUAL` | flag 0 | textured, offset `phase + i * 0.1` on both axes | texture `0x2d00`, `(0 - Cs) * As + Cd` |
| 3 | (same texture) | 0, `GEQUAL` | flag 0 | textured, offset `phase + i * 0.1 + rod[+0xB0]`, `… + rod[+0xB4]` | texture `0x2d00`, `(Cs - 0) * As + Cd` |
| 4 | `func_002360A8(1, 0, 1)` | 1, `GEQUAL` | flag 1 | refracted, add 0 | into the frame, samples buffer `0x118` |
| 5 | `func_00236058(0, 1, 1)` | 1, `GEQUAL` | flag 1 | refracted, add 255 | into `0x0d2`, samples buffer `0x118` |

`i` is the face index. Passes 1 to 3 draw the faces whose flag is 0 and passes 4 and 5 the
others. *Measured on ROM 2.30, 8 frames: in 85 of 100 rod groups the triangle counts of the two
sets add up to 32, 16 faces (18 + 14, 20 + 12, 16 + 16, 22 + 10); the split rod gives
24 + 20; the few others were not looked into.* *Reading: one side of the rod is drawn into the work
buffer — the picture behind it, refracted, then darkened and brightened by the texture — and
the other side is then drawn over the frame sampling that work buffer, so the light is bent
twice.*

### Refracted emitter: `func_00236988(face, rod, add)` and `func_002365D0`

Per face:

```
F      = 1 - | dot(normalize(view position of vertex 0), view normal) |
bright = (int)(rod[+0x90] * 10 * F^4)
if F > 0.9:  bright = (int)(bright * 0.5 * (1 - g(angle)))    angle = (int16)((1 - F) * 32768 / 0.1)
PRIM   = F > 0.99 ? 0x114 : 0x194          tristrip, textured, UV; 0x194 adds AA1
CLAMP  = REGION_CLAMP on both axes to 0..screenW-1, 0..screenH-1
RGBA   = min(255, bright + rod[+0x80] + add), same with +0x84, +0x88, A = 0x80
```

`g` is `func_00239FF0` at the angle plus a quarter turn; it was not read. *Reading: a cosine,
making the highlight fade out smoothly as the face turns edge-on.*

Per vertex, with `(sx, sy)` its screen position, `(nx, ny)` the face's view normal, `q` its
`1/w`, `R = rod[+0xB8]`:

```
U = screenW / 2 + ((sx - 2048 - cx) * 0.95 + cx) - nx * 1000 * q * R
V = screenH / 2 + ((sy - 2048 - cy) * 0.95 + cy) - ny *  500 * q * R - 0.5 * (int at 0x002B2178)
```

converted to 12.4 and clamped to `0..screenW*16`, `0..screenH*16`. `screenW` and `screenH` are
the ints at `0x001F0CB4` and `0x001F0CB8`. So a vertex samples the buffer at its own place on
screen, pulled 5% toward the rod's centre and pushed along the face normal.

*Measured checks:* on ROM 2.30 the refracted draws use `PRIM 0x194` with `UV` (298 in the
capture) and 22 use `PRIM 0x114`, which is this `F > 0.99` branch.

### ROM 2.30 does this part differently

*Measured:* every refracted draw of ROM 2.30 has `CLAMP_1 = 0x01000000`, not a region clamp.
The ROM counterpart of `func_002365D0` is at `0x002329f8` (found by its first instructions,
11 of 16 the same) and was *read* from the live memory dump with capstone. Same `F`, same
brightness, same thresholds and the same four constants (0.9, 0.1, 0.99, 0.95, read from the
dump), same `1000` and `500`. The differences:

```
CLAMP = 0x01000000                                   (HDD OSD: region clamp to the screen size)
U = max(1024, screenW / 2 + u + 1024)                (HDD OSD: clamp(screenW / 2 + u, 0, screenW))
V = screenH / 2 + v + 256 - 0.5 * (int at 0x0028A348)   (HDD OSD: clamp(…, 0, screenH), no + 256)
```

with `u`, `v` the same expressions as above. The buffer is bound as a 1024 × 256 texture with
repeat wrapping, so `+ 1024` and `+ 256` land on the same texel and only keep the coordinate
from going negative.

*Measured (ROM 2.30, 4 frames, 12 292 refracted vertices):* 22 have U left of the screen and
337 have V below it; none go off the right or the top. Where U is negative ROM floors it to
the first column, as HDD OSD's clamp would, so the builds can only differ below the bottom
edge: in 336 vertices (2.7%), by at most 4.13 texels. There ROM 2.30 samples rows 224 to 228 of
a buffer that is 224 rows high — VRAM past the picture — where HDD OSD, by its code as read,
repeats row 224. *Verified on HDD OSD since (`verification.md`): 3 179 faces with its clamp, every `UV` equal.*

### Textured emitter: `func_00236A20(face, colour, ds, dt)`

`PRIM 0x54` (triangle strip, textured, blended, `ST`), `CLAMP_1 = 0x01000000`, then per vertex:
`S = (s + ds) * q`, `T = (t + dt) * q`, `RGBAQ` = the four colour ints with `Q = q`, and the
integer `XYZ`. *Measured: the two textured draws of a rod use `PRIM 0x054` with `ST`.*

## The rod that is split (`t > 0`)

When `t > 0` the function makes two copies of the rod record and draws both in each of the
five sends (piece A's faces, then piece B's, in the same send; ROM 2.30 cuts the two grain
sends into one packet per face instead, with the same contents: `clock-frame.md`). With `s = rod[+0x6C]`:

| | Piece A | Piece B |
|---|---|---|
| length scale `+0x6C` | `t × s` | `(1 - t) × s` |
| matrix | the rod's | the rod's, moved along its own axis by `s × 26 × t` |
| base colour `+0x80` | the `colour` argument | the rod's |
| highlight strength `+0x90` | the `n` argument | the rod's |
| faces drawn | 8 and up | all but 8 and 9 |
| texture offsets | as a whole rod | `dt` gets `2 × t × s` more |

The mesh is 26 long (`data/rod-mesh.json`), so piece A is the first `t` of the rod, in the
lighter colour, and piece B the rest, starting where A ends. Faces 8 and 9 are the base of the
prism and 0 to 7 its cap and bevel: A keeps the base, B keeps the cap. The centre handed to
the refracted emitter is the whole rod's.

Texture offsets handed to the textured emitter, in every send that uses it:

```
ds = phase + i × 0.1 [+ rod[+0xB0]]            phase = (float) rod[+0x00] × 0.1, i the face
dt = phase + i × 0.1 [+ rod[+0xB4]] [+ 2 × t × s for piece B]
```

The bracketed pair is added in the second textured send of the main function and in extra
pass 1; not in the first textured send nor in extra pass 0.

*Verified on ROM 2.30* (`References/scripts/verify_rod_pieces.mjs`, capture
`rom-0230A-clock-pieces`): 36 split rods (both pieces' scale and matrix), 4 752 textured faces
of whole and split rods, main function and extra passes: every offset, face range, side and
colour pointer as stated.

## The two extra passes: `module_clock_22FD90`

Twice, with `pass` 0 then 1: `func_002342F0(1, 0x002B5730, …)`, then for every list node whose
`+0xF0` is not 1, `module_clock_2384C8(node + 0x10, pass, node + 0x120)` with `t` from
`node + 0xF4`; then `func_002360A8(1, 0, 0)` and `module_clock_22FD10(0x1E)`. *Measured: each
extra pass starts with an untextured full-buffer sprite into `0x118` and ends with one
full-buffer sprite into the frame sampling `0x118`, additive, with alpha 30 (`0x1E`).*

`module_clock_2384C8` is on its own page, `clock-extra-passes.md`.

## What has been verified by measurement

On ROM 2.30, with Watson's trace probes: the real inputs of each function were recorded at its
entry, the outputs were recomputed with the arithmetic on this page, and compared bit for bit
with what the function produced. Captures: `Watson/Runtime/captures/rom-0230A-clock-rod.*`
(4 frames; trace equal to the GS dump in 5 416 of 5 416 packets) and
`rom-0230A-clock-refraction.*`.

| What | Script | Compared | Equal |
|---|---|---|---|
| Transform (`0x002335e8`): view position, s and t, screen position, integer x y z, `q` of every vertex; normal and side flag of every face | `verify_rod.mjs` | 3 956 face records, 15 824 vertices | all |
| Rod centre handed to the emitters (`0.9 ×` the projected centre) | `verify_rod.mjs` | 132 | all |
| Refracted emitter (`0x002329f8`): `PRIM`, colour, four `UV` | `verify_refraction.mjs` | 3 073 faces, 12 292 `UV` | all |
| Textured emitter (`0x00232e38`): `PRIM`, four `ST`, `RGBAQ`, `XYZ` | `verify_rod.mjs` | 4 356 faces, 17 424 vertices | all |
| Texture offsets of an unsplit rod: `phase + i × 0.1`, and with the rod's pair added | `verify_rod.mjs` | 2 380 faces | all |
| Edge term `F = 1 - |dot(normalize(view position of vertex 0), normal)|` | `verify_reflection.mjs` | 2 793 faces | all |
| The two pieces of the split rod, and the texture offsets of every textured face (main function and extra passes) | `verify_rod_pieces.mjs` | 36 split rods, 4 752 faces | all |

What that does and does not cover:

- Every single-precision operation is cut toward zero. With round-to-nearest 7 of 15 824 view
  positions come out equal; of the four IEEE modes only toward zero reproduces the refracted
  `UV`. This is how PCSX2 runs the EE and VU0 by default; it was not measured on a console.
- The face record handed to the emitters is covered by the transform check, and `F` by its
  own.
- Not covered here: the functions that select buffers and textures before each send.
- The refracted emitter is one of two that send `UV` faces: 3 073 of the 4 863 such faces in
  the capture are its own. The rest come from the reflection emitter of the extra passes,
  verified separately (`clock-extra-passes.md`).

## Not settled

- The arithmetic was read on HDD OSD 1.10U. The ROM 2.30 function is 80% the same
  instructions (`clock-function-map.md`); the structure, `PRIM` values, blend values, depth
  tests and face-set sizes measured on ROM 2.30 agree with what is read here, and the
  transform and both emitters reproduce the ROM's output bit for bit. One difference is known
  (the refracted texture coordinates, above).
- Which side of the rod flag 0 is (toward or away from the viewer).
- What fills the rod record is in `clock-scene.md` and `clock-state.md`; the matrices in
  `clock-camera.md`.
