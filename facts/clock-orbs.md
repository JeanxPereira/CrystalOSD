# What drawing one orb computes

Recorded 2026-10-02. *Read* on **HDD OSD 1.10U**: `module_clock_239078` from its start through
its first two sprites (`0x00239078..0x002397B0`); the rest, by its calls, repeats the same for
a second target. The trail is *verified* on **ROM 2.30** (function at `0x00235630`): capture
`Watson/Runtime/captures/rom-0230A-clock-orbs.*`, script `References/scripts/verify_orbs.mjs`.

## The record

| Offset | Type | Use |
|---|---|---|
| `+0x00` | int | index of the newest entry |
| `+0x08` | int | non-zero once the ring of 50 entries has been filled |
| `+0x10 + 0x20 × k` | entry | position x, y, z (floats, relative to the screen centre), then colour r, g, b (ints) at `+0x10` |

## The trail: a line strip

`PRIM 0x82` (line strip with `AA1`), depth test `GREATER`, blend `(Cs - 0) * As + Cd`. The
header packet that carries `PRIM` also writes one `RGBAQ` whose alpha is `0x80` through the
sprites' fade ramp (ROM `0x0023574c..0x0023575c`), so it is 0x80 only while the ramp is full. With the
ring full, 49 points, newest first: point `i` is entry `(head + 100 - i) % 50`, and

```
fade  = max(0, (int)(128 - i * 3))
red   = ((r * fade^2 / 2^7) * fade / 2^7) * fade / 2^14     each division rounding toward zero
green = g * fade^2 / 2^14
blue  = b * fade   / 2^7
alpha = fade / 2
x, y  = (int)((position + 2048) * 16)        z = (int)(position.z * 16)
```

So along the trail red dies first, then green, and blue last. The Q field written with the
colour is `0x03F80000` (the code shifts `0xFE00` left by 42), not 1.0.

While the ring is still filling, the strip has `head - 1` points, entry `head - i`, and `i` is
stretched to the same 0..49 range before the fade is taken.

*Verified on ROM 2.30:* 63 calls, two line strips each (one per target), 126 strips, 6 174
points: every position and every colour equal. All 63 had the ring full, so the filling
branch is read only.

## The two sprites at the head

Both are centred on the newest entry and sized by its depth. With `x`, `y`, `z` that entry's
position, `r`, `g`, `b`, `a` its colour, and `W`, `H` the screen size:

```
s  = z × 6.4999999e-6                           (bits 0x36DA1A93)
hw = s × 30  for the glow, s × 4.5 for the disc         hh = hw × 0.5
corner = (int)((x ∓ hw + W/2) × 16), (int)((y ∓ hh + H/2) × 16)
```

and the rectangle helper adds the screen corner's GS offset (`clock-gs-state.md`). Texture
coordinates run from 0 to 63 texels, depth is 0, blend is `(Cs - 0) × As + Cd`.

The function draws everything twice: to the frame, then to the buffer at `0x0D2` (the one the
rods refract), with different colours:

| | Glow (`TEXCBLUR`) | Disc (`TEXCNAVI`) |
|---|---|---|
| to the frame | `(r, g, b, fade(a))` | `(128, 128, 128, fade(128))` |
| to `0x0D2` | `(r, g, b, fade(128))` | `(255, 255, 255, fade(128))` |

`fade(v) = value × v / length` (integers), from a ramp of four ints (length, value, changed,
state) that steps once at the start of every orb call: state 1 counts up to the length, 3
counts down to 0, 2 is shown, 0 hidden. Its length is 256 in NTSC. *Measured: it falls when
Clock Adjustment is entered, so the sprites go out there; `a` is 60 in the clock screen.*

*Verified on ROM 2.30 (`verify_orbs.mjs`): 1 652 sprites in two captures (the clock alone;
entering Clock Adjustment, with the ramp falling through 256 steps, then hidden): every colour,
corner and texture coordinate equal.* The ramp counting up is verified on both builds below.

## How the ring is fed: `module_clock_22F908`, `module_clock_239E98`

Every frame, for each orb, the entry at the head is overwritten with the orb's current screen
position and colour (`clock-camera.md`), and a counter at `+0x04` goes up; on its third count
it returns to 0, the head moves on one entry (wrapping from 49 to 0 and setting the ring-full
flag), and the same position and colour are written there too. So the trail keeps one point
every three frames, and its newest point always sits on the orb. *Verified on ROM 2.30
(`References/scripts/verify_placement.mjs`): 126 rings equal after the push.*

## The trail while its ring fills

*Verified on both builds* by `verify_trail_fill.mjs` on the power-on captures, down to an empty
strip: 6 244 strips and 148 176 points on HDD OSD, 4 172 strips and 98 784 points on ROM 2.30
(`clock-transitions.md`).

## The sprites' fade ramp: who moves it (*read on HDD OSD; both directions verified on both builds*)

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

*Verified (`verify_orbs.mjs`):* falling, `hddosd-110U-stim-fade-down` (910 strips, 1 820
sprites) and the ROM capture above; rising, `hddosd-110U-stim-fade-up` and
`rom-0230A-stim-fade-up` (924 strips, 1 848 sprites each). The PAL length 213 is read, not
measured.
