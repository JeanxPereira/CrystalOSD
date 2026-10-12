# Camera, scale and placement

Recorded 2026-10-02. *Read* on **HDD OSD 1.10U**: `module_clock_225F38`, `module_clock_238DC0`,
`sceVu0ViewScreenMatrix`, `sceVu0MulMatrix`, `module_clock_22F528`, `module_clock_22F760`,
`module_clock_23A170`, `module_clock_23A238`, `module_clock_23A300`, `module_clock_23A3C0`,
`module_clock_23A418`, `func_00239F48`, `func_00239FF0`, `func_0023A040`, in full.
*Verified* on **ROM 2.30** (`References/scripts/verify_camera.mjs`, `verify_placement.mjs`).
`References/scripts/diff_rom.mjs` finds no instruction that differs between the builds in
the placement functions, only data addresses.

| HDD OSD 1.10U | ROM 2.30 | What it does |
|---|---|---|
| `module_clock_225F38` | `0x00221610` | builds the view and screen matrices, every frame |
| `module_clock_22F528` | `0x0022b548` | one rod's matrix |
| `module_clock_22F760` | `0x0022b780` | the orbs' matrices |
| `module_clock_23A170` / `23A238` / `23A300` | `0x002367d8` / `0x002368a0` / `0x00236968` | rotate the top matrix about X / Y / Z |
| `module_clock_23A418` | `0x00236a80` | move the top matrix |
| `func_00239FF0` / `func_0023A040` | `0x00236658` / `0x002366a8` | sine / cosine of a 16-bit angle |
| sine table `0x0040EAA0` | `0x0037AA70` | |

## The screen matrix: scale and proportion

`sceVu0ViewScreenMatrix(screen, 512, ax, ay, 2048, 2048, 1, 16777215, 1, 65536)`, with `ax` and
`ay` two floats of the scene record (`0x002B217C`, `0x002B2180` on HDD OSD). `clock_stuff1`
(ROM 2.30 `0x00220ff8`) writes them when the clock starts:

```
ax = 1
ay = 0.5405 in PAL, 0.47 otherwise            (is_pal_vmode_p9_tgt() == 1)
```

Both constants hold the same values in the two builds. *Measured on ROM 2.30 (NTSC): 1 and
0.47, written by `0x00221048` and `0x0022104c`; the numbers below are for that mode.*

```
az = far × near × (zmax - zmin) / (far - near)        cz = (zmin × far - zmax × near) / (far - near)

512 × ax      0             0     0                    512       0          0            0
0             512 × ay      0     0          =         0         240.64     0            0
2048          2048          cz    1                    2048      2048       -255.00388   1
0             0             az    0                    0         0          16777470     0
```

So, for a point `(x, y, z)` in view space:

```
screen x = 2048 + 512    × x / z
screen y = 2048 + 240.64 × y / z
depth    = 16777470 / z - 255.00388
```

The picture is 640 × 224 around `(2048, 2048)`: one field of an interlaced frame, which is why
the vertical scale is 0.47 of the horizontal one. Depth grows as things come closer.

*Verified:* the function, recomputed in single precision with each result cut toward zero,
gives the measured matrix in all 16 elements.

## The view matrix: where the camera is

`module_clock_238DC0`: a rotation about X, then Y, then Z by `(0.031, 0.145, 0)` radians is
applied to the position `(10.436, 0, -103 + offset)`, the direction `(0, 0, 1)` and the up
vector `(0, 1, 0)`, and `sceVu0CameraMatrix` makes the view matrix from the three. `offset` is
a global that is set to -100 when the clock is set up and multiplied by 0.97 every frame: the
camera starts 100 units further back and closes in.

*Verified on ROM 2.30* (`References/scripts/verify_approach.mjs`, capture
`rom-0230A-boot-approach`, traced from power-on): the clock's first frame is frame 453 after
power-on, with the offset at -100 and the camera at z = -203; 177 frames, every decay step and
every position handed to the matrix builder equal.

*Measured on ROM 2.30, clock screen, offset run down to nothing:*

```
 0.9895058274269104    0.0044787428341805935   0.14442364871501923   0
 0                     0.9995194673538208     -0.03099624440073967   0
-0.14449308812618256   0.03067096322774887     0.9890303611755371    0
-10.435999870300293    0                     102.99998474121094      1
```

It is the same in all 539 transform calls of two captures. The reading above, computed in
double precision, agrees with it to 1.5e-5; the library's own arithmetic, which gives it bit
for bit, is the section "The view matrix, bit for bit" below.

*Reading: the scene is turned 1.8° and 8.3° and then pushed 103 units away and 10.436 units to
the left, which is why the ring sits left of the centre of the screen.*

## Angles, sines and the matrix routines

Angles are 16-bit, 65536 to a turn. The sine comes from a quarter-wave table of 0x4001 floats:

```
table[i] = (float) sin(i × 1.5707963267948966 / 16385)
sin(a)   = sign(a) × table[ |a| < 0x4000 ? |a| : 0x8000 - |a| ]
cos(a)   = sin(a + 0x4000)                                       the sum kept to 16 bits
```

**The divisor is 16385, not 16384**: every sine is a little short (`sin` of an eighth of a turn
is 0.707073, not 0.707107), and only the last entry rounds to 1. *Measured: all 16385 entries
of the ROM's table equal the nearest float of that formula.*

There is a current matrix (a stack at `0x0041EAB0`). Each routine multiplies it by a rotation
with `sceVu0MulMatrix`, whose result rows are the rows of the second matrix passed through the
first:

```
about Z:  ( c  s  0  0)      about Y:  ( c  0 -s  0)      about X:  ( 1  0  0  0)
          (-s  c  0  0)                ( 0  1  0  0)                ( 0  c  s  0)
          ( 0  0  1  0)                ( s  0  c  0)                ( 0 -s  c  0)
          ( 0  0  0  1)                ( 0  0  0  1)                ( 0  0  0  1)
```

Moving by `(x, y, z)` replaces the fourth row by the current matrix applied to `(x, y, z, 1)`.

## A rod's matrix

For rod `i` of 0..11, with the state's rod angle and seconds angle (`clock-state.md`):

```
identity
about Z by the rod angle                       the ring turns to the hour
about Y by the seconds angle                   the ring turns once a minute
about Z by i × 65536 / 12 - 0x8000             the rod's place on the ring
move (0, 20, 0)                                 ring radius 20
about Y by 4 × seconds angle                   the rod spins on its own axis, four times a minute
```

The rod's number is `(i + current) % 12`, and its Y scale is the state's appearance value for
that number (`clock-state.md`): the appearance ramp stretches the rods from nothing.

*Verified on ROM 2.30* (captures `rom-0230A-clock-placement`, 18 frames, and
`rom-0230A-clock-hour`, 47 frames across a change of hour): 780 matrices, every
element equal; the angles passed are the state's; rod number and Y scale as stated.

## An orb's matrix

Per frame, from the time record (`clock-state.md`):

```
seconds turn = seconds × 65536 / 60            minute turn = minutes × 65536 / 60
e            = e + ((1 - target) - e) × 0.005                 a global; target is 1 - minutes / 60
radius       = (e × 7.25 + 10) × scale                        with e before its update
```

`scale` is the first float of the scene record (`0x002B2170`), eased every frame toward a
target (see below). For orb `k` of 0..6:

```
identity
about Z by the hour hand                       the eased hours × 65536 / 12
about Y by the second hand                     the eased seconds turn
about Z by -0x8000
about Y by (int)(minute turn × 1100)
about X by (int)((k + 21) × seconds turn)      orb k goes round k + 21 times a minute
move (0, radius, 0)
about Y by 0x2000
```

So the orbs circle between radius 10 at the top of the hour and 17.25 at its end, each at its
own speed. *Verified:* 455 matrices, every element equal. *Measured: radius 15.296 at 5:44.*

The orb's position on screen is the origin of that matrix through the view and screen matrices,
relative to `(2048, 2048)`, with its depth. Its colour, outside the two special modes of the
orb drawing function, is the constant `(48, 98, 128, 60)`. Both go to the orb's trail ring
(`clock-orbs.md`). *Verified:* 455 positions, 455 colours, 455 rings.

## The scene scale: `func_00232640` (ROM 2.30 `0x0022e910`)

```
scale = scale + (target - scale) × factor          every frame
```

`target` is a global (`D_00370294` on HDD OSD, 1 in the file). *Read on HDD OSD:* five places
write it.

| Writer | Value | When |
|---|---|---|
| `func_0022D760` | 0.8 | the clock is set up on a first run (the introduction that leads to the language screen) |
| `func_0022D828`, its last step | 1 | that introduction ends; the scale itself is set to 1 too |
| `D_00226FD0` | 0 | a configuration callback: Clock Adjustment is entered |
| `clock_config_change_cb_clock` | 1 | a configuration callback: the adjustment is confirmed |
| `D_00227BE8` | 1 | a configuration callback: the adjustment is cancelled |

*Measured on ROM 2.30, target and scale read in each screen:* 1 and 1 in the main menu, in
System Configuration and in the clock alone; 0 and 1e-7 while a field of Clock Adjustment is
edited; back to 1 after circle; 0.8 at 900 frames from power-on with an empty configuration
(the language screen). Only the orbs' radius uses the scale, so the orbs gather at the centre
while the clock is being adjusted.

**The builds differ here.** `factor` is 0.1 on ROM 2.30 (*measured*) and 0.03 in the HDD OSD
file (*measured too: 47 steps on HDD OSD*); and HDD OSD sets the scale to 0 while the time record has not been filled yet,
which ROM 2.30 does not do.

*Verified on ROM 2.30* (`References/scripts/verify_scale.mjs`, capture
`rom-0230A-clock-scale`, the scale written to 0.5 with the VM paused): 19 steps, every one
equal.

## Not settled

- Which menu event calls each of the three configuration callbacks (their roles are inferred from
  what they do and from the measured values).
- The orb drawing function's modes 2 and 3 (`func_00234B80`): the position and colour rules are
  *verified* by `verify_transitions.mjs` (`clock-transitions.md` section 3); the function's code is
  read only as far as the targets and the colours. They move the orbs toward
  per-orb targets and blend per-orb colours `(0, 0, 128)`, `(0, 128, 0)`, `(0, 128, 128)`,
  `(128, 0, 0)`, `(128, 0, 68)`, `(128, 68, 0)`, `(128, 128, 128)`; read only as far as that.

## The view matrix, bit for bit (*verified on both builds*)

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
