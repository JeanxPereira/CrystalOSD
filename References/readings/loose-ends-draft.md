# Loose ends: stimulated captures on HDD OSD, fade ramp, grain CLAMP, view matrix

Draft, 2026-10-02. Captures in `Watson/Runtime/captures/`. Every count below is from a verifier
run; "equal" means bit for bit. `CLOCK_BUILD=hdd` selects HDD OSD 1.10U.

## 1. Stimulated captures on HDD OSD 1.10U

No verifier needed a fix; only new captures.

| Capture | Stimulus | Verifier | Result |
|---|---|---|---|
| `hddosd-110U-stim-hour` | Clock Adjustment (System Configuration, cross, right ×3), up held while tracing | `verify_clock_state.mjs` | 53 frames, every value equal; hour 16 → 23, current rod 4 → 11, 53 frames of the unsmoothed branch, 51 with `t` rising |
| same | | `verify_placement.mjs` | every matrix, position and ring equal (371 orb positions) |
| `hddosd-110U-stim-poked-a` | rod angle and every rod's `t` zeroed, appearance ramp `{20, 0, 0, 1}` | `verify_clock_state.mjs` | 43 frames equal; 43 eased, 43 rising, ramp 1 → 20 then shown |
| `hddosd-110U-stim-poked-b` | seconds angle zeroed, appearance ramp `{20, 20, 0, 3}` | `verify_clock_state.mjs` | 39 frames equal; 1 unsmoothed frame, ramp 20 → 0 then hidden |
| `hddosd-110U-stim-hour-free` | time record written to 16:59:59 + 900 ms with the VM paused | `verify_clock_state.mjs`, `verify_placement.mjs` | 86 frames equal, all on the eased branch; every matrix equal |
| `rom-0230A-stim-hour-free` | same, 5:59:59 + 900 ms | same | 86 frames equal, all eased; every matrix equal |
| `hddosd-110U-stim-fade-down` | cross on Clock Adjustment, then 60 frames | `verify_orbs.mjs` | 910 strips, 1 820 sprites equal; ramp falling at 235 calls, hidden at 220 |

HDD addresses written: state `0x00404F70` (seconds angle `+4`, rod angle `+6`, rod `i`'s `t` at
`+0x14 + i × 0x30`), appearance ramp `0x002B5640`, time record `0x00409230` (ms float, seconds,
minutes, hours). The `clock` and `config` states hold the time 16:15; the record does not follow
the host clock.

**The hour turning while the clock runs freely** (was "not settled" on both builds): the time
keeper only measures the record's drift when the console's second changes, so a record written
to hh:59:59.9 runs on its own for the rest of that second. Measured: HDD 6 frames at 16h (rod
4), 19 frames at 17:00:00.. (rod 5, rod angle easing 21845 → 26092 toward 27306, the new rod's
`t` climbing from 0), then the keeper puts the record back to 16:15:28 and 61 frames ease back.
ROM 6 frames at 5h, 27 at 6h, 53 back at 5h. The seconds angle is far from 0 throughout, so
this is the eased branch with the current rod changing in both directions.

## 2. The sprites' fade ramp counting up

| Capture | Verifier | Result |
|---|---|---|
| `hddosd-110U-stim-fade-up` | `verify_orbs.mjs` | 924 strips, 1 848 sprites equal; ramp rising at 235 calls, shown at 227 |
| `rom-0230A-stim-fade-up` | `verify_orbs.mjs` | 924 strips, 1 848 sprites equal; ramp rising at 235 calls, shown at 227 |

Stimulus: cross on Clock Adjustment, 120 frames, circle, 60 frames traced.

The rule, read on HDD OSD (`asm/clock`), ramp `D_002B61B0` = `{length, value, changed, state}`:

```
func_00238F20  set-up      length = ((PAL ? 50 : 60) << 8) / 60        256 NTSC, 213 PAL
                           reset, start rising, step until state == 2   (starts shown)
func_00234B10  step        changed = 0
                           state 1: value += 1; if value == length: changed = 1, state = 2
                           state 3: value -= 1; if value == 0:      changed = 1, state = 0
func_00234A70  scale       value × x / length                           signed, truncating
func_00239018  hide        state 2: value = length, changed = 1, state = 3   (func_00234AE0)
                           state 1: state = 3                           (turns round where it is)
func_00238FB8  show        state 0: value = 0, state = 1, changed = 1   (func_00234AC0)
                           state 3: state = 1                           (turns round where it is)
```

The step runs once per orb call (`module_clock_239078`, at `0x002390D8`), so with seven orbs the
256 steps take about 37 frames, not 256. *Measured: 235 falling (or rising) calls in a trace that
starts three frames after the button, then hidden (or shown).*

Who calls them (read):

- hide: `D_00226FD0` (`0x00227004`), the handler that opens Clock Adjustment. The same handler
  writes the scene scale target `D_00370294 = 0` in the delay slot.
- show: `clock_config_change_cb_clock` (`0x00227BA8`, after `config_item_change_cb_clock_write_mechacon`:
  the adjustment confirmed) and `D_00227BE8` (`0x00227C00`: cancelled). Both write the scale
  target `D_00370294 = 1.0` in the delay slot.

## 3. Who writes `CLAMP_1 = 0x01000000`

The emitters themselves, once per face, through a register slot that the GIF tag declares.
It is not padding and not a state helper.

GIF tag templates (REGLIST, EOP), read from the images:

| | HDD OSD 1.10U `D_003659E0` | ROM 2.30 `0x002973A0` |
|---|---|---|
| refracted | `+0x00`: NREG 11: `PRIM, CLAMP_1, RGBAQ, (UV, XYZF2) × 4` | `+0x00`: NREG 12: `PRIM, CLAMP_1, CLAMP_1, RGBAQ, (UV, XYZF2) × 4` |
| reflected | `+0x10`: NREG 10: `PRIM, RGBAQ, (UV, XYZF2) × 4` | `+0x10`: same |
| textured | `+0x20`: NREG 14: `PRIM, CLAMP_1, (ST, RGBAQ, XYZF2) × 4` | `+0x20`: same |

(`D_003659E0 + 0x30` on HDD, `0x00297390` on ROM: NREG 6, `PRIM, RGBAQ, XYZF2 × 4`.)

Data written into the `CLAMP_1` slots:

- Textured emitter, both builds (HDD `func_00236A20` at `0x00236A34`/`0x00236A58`: `lui 0x100`,
  `sd`; ROM `0x00232E38` at `0x00232E4C`/`0x00232E70`: `lui 0x100`; 32-bit stores: `0x54` at `+0`,
  0 at `+4`, `0x1000000` at `+8`, nothing at `+12`): `PRIM = 0x54`, then `CLAMP_1 = 0x01000000`. That value is `WMS = 0`,
  `WMT = 0` (repeat on both axes) with `MINV = 1`, which repeat mode does not use. So every face
  drawn by the textured emitter sets repeat, whatever the binder left: that is why the grain
  repeats on both builds although HDD OSD's binder writes clamp.
  ROM detail: the emitter never writes the high word of that slot (offset 12 of the face);
  it holds what the scratchpad packet held before. *Measured value: 0x01000000, so it was 0.*
- Refracted emitter, ROM 2.30 (`0x002329F8`, at `0x00232B8C..0x00232BA4`): `CLAMP_1 = 0x01000000`
  twice (repeat).
- Refracted emitter, HDD OSD (`func_002365D0`, `0x00236760..0x0023679C`): one slot,
  `CLAMP_1 = ((H - 1) << 34) | ((W - 1) << 14) | 0xA`, region clamp to the screen (`W`, `H` from
  `0x001F0CB4`, `0x001F0CB8`). *Measured: `0x37C009FC00A` = 640 × 224.*

*Measured* (count of `CLAMP_1` writes in the packets the emitters fed, against the emitter
calls probed in the same packets):

| Capture | Emitter | Calls | `CLAMP_1` writes |
|---|---|---|---|
| `rom-0230A-clock-rod` | textured | 4 356 | 4 356 × `0x1000000`, each right after `PRIM` |
| `rom-0230A-clock-rod` | refracted | 3 067 | 2 × 3 067 × `0x1000000` |
| `hddosd-110U-clock-a` | textured | 7 524 | 7 524 × `0x1000000` |
| `hddosd-110U-clock-c` | textured | 4 356 | 4 356 × `0x1000000` |
| `hddosd-110U-clock-c` | refracted | 3 179 | 3 179 × `0x37C009FC00A` |
| `hddosd-110U-clock-d` | refracted | 3 200 | 3 200 × `0x37C009FC00A` |

Tags seen in those packets: NREG 14 `0,8,2,1,4,2,1,4,2,1,4,2,1,4`; NREG 12 `0,8,8,1,3,4,3,4,3,4,3,4`
(ROM); NREG 11 `0,8,1,3,4,3,4,3,4,3,4` (HDD), as read.

## 4. The view matrix, bit for bit

`References/scripts/verify_view_matrix.mjs`. Probes: the builder's entry (position, direction,
up, rotation) and the instruction after its last call (the matrix, and the builder's stack: the
rotation matrix and the three rotated vectors).

| Capture | Build | Result |
|---|---|---|
| `hddosd-110U-stim-view` | HDD OSD 1.10U | 124 calls, 124 distinct matrices (the camera's approach from power-on): rotation, rotated vectors and view matrix all equal |
| `rom-0230A-stim-view` | ROM 2.30 | 125 calls, 125 distinct: all equal |

The library functions are the same instructions in both builds (compared word by word over
their whole length; the ROM's `sceVu0Normalize` lacks two `vnop`, and two `vsqrt` words differ
in a field the instruction ignores). `S5432` holds the same four words in both.

| | HDD OSD | ROM 2.30 |
|---|---|---|
| builder | `module_clock_238DC0` | `0x00235360` |
| `sceVu0RotMatrixX` / `Y` / `Z` | `0x0027B288` / `0x0027B330` / `0x0027B1E0` | `0x002734A8` / `0x00273400` / `0x00273550` |
| `_sceVu0ecossin` | `0x0027B168` | `0x002735F8` |
| `S5432` | `0x0032C9C0` | `0x002AE2D0` |
| `sceVu0ApplyMatrix` | `0x0027AE18` | `0x002738E8` |
| `sceVu0CameraMatrix` | `0x0027B450` | `0x002732D8` |
| `sceVu0OuterProduct` | `0x0027AE90` | `0x00273880` |
| `sceVu0Normalize` | `0x0027AED8` | `0x0027381C` |
| `sceVu0TransMatrix` | `0x0027B098` | `0x002736F0` |
| `sceVu0InversMatrix` | `0x0027AF60` | `0x00273768` |
| `sceVu0UnitMatrix` | `0x0027B140` | `0x00273670` |

Every operation is single precision and cut toward zero on its own: a `vmadd` is a multiply,
cut, then an add, cut.

```
builder(out, position, direction, up, rotation):
  M = unit; M = RotX(M, rotation.x); M = RotY(M, rotation.y); M = RotZ(M, rotation.z)
  zd = M · direction;  yd = M · up;  p = M · position            (sceVu0ApplyMatrix)
  sceVu0CameraMatrix(out, p, zd, yd)

sine and cosine (sceVu0RotMatrix* + _sceVu0ecossin), angle a:
  t = a < 0 ? pi/2 + a : pi/2 - a            pi/2 = 0x3FC90FDB, FPU
  t2 = t·t
  v  = S · t · t2                             S = (S5, S4, S3, S2) = (0x362E9C14, 0xB94FB21F, 0x3C08873E, 0xBE2AAAA4)
  v.xyz *= t2;  sum = t + v.w;  v.xy *= t2;  sum += v.z;  v.x *= t2;  sum += v.y;  sum += v.x
        (so sum = t + S2·t^3 + S3·t^5 + S4·t^7 + S5·t^9, each power built by repeated multiplies)
  cosine = sum                                (it is the sine of pi/2 -+ a)
  sine   = sqrt(1 - cosine·cosine), negated when a < 0

rotation rows (r0, r1, r2, r3), applied to every row v of the matrix as
  out = r0·v.x + r1·v.y + r2·v.z + r3·v.w     (vmulax, vmadday, vmaddaz, vmaddw)
  X: (1,0,0,0) (0,c,s,0) (0,-s,c,0) (0,0,0,1)
  Y: (c,0,-s,0) (0,1,0,0) (s,0,c,0) (0,0,0,1)
  Z: (c,s,0,0) (-s,c,0,0) (0,0,1,0) (0,0,0,1)

sceVu0CameraMatrix(out, p, zd, yd):
  x = normalize(yd × zd);  z = normalize(zd);  y = z × x
  a × b  = (a.y·b.z - b.y·a.z, a.z·b.x - b.z·a.x, a.x·b.y - b.x·a.y, 0)     (vopmula, vopmsub)
  normalize(v) = v.xyz · (1 / sqrt((v.x·v.x + v.y·v.y) + v.z·v.z)), w = 0     (vsqrt, vdiv)
  out rows 0..2 = (x.i, y.i, z.i, 0)                                          (the transpose)
  out row 3     = (0 - ((row0·p.x + row1·p.y) + row2·p.z), 1)
```

*Measured:* for the angles the clock uses, `(0.031, 0.145, 0)`: sine, cosine =
`(0.03099624440073967, 0.9995195269584656)`, `(0.14449308812618256, 0.9895058274269104)`,
`(0, 1)`. The first sine is 1.2e-6 away from the true sine: the library takes it from the
square root of `1 - cos²`, which is where the 1.5e-5 of `verify_camera.mjs`'s double-precision
model came from. The vectors handed in: position `(10.436, 0, -103 + offset, 0)`, direction
`(0, 0, 1, 1)`, up `(0, 1, 0, 1)`.

## Not closed

- PAL: the fade ramp's length 213 and the PAL branch of every constant are read, not measured.
- The ROM's unwritten high word of the textured emitter's `CLAMP_1` slot was only observed
  to be 0; what guarantees it was not read.
- The appearance-ramp start functions (`func_0022F078`, `func_0022F110`) were exercised by
  writing the ramp, not by the event that calls them.
