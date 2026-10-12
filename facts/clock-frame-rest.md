# The rest of the clock frame: background, blur, overlays

Builds: **HDD OSD 1.10U** (canon; build `hddosd-1.10U-host`) and
**ROM 2.30**. What is written here as *verified* was recomputed from a function's inputs and
compared bit for bit with what the function sent, on both builds. Addresses are HDD OSD's
unless "ROM" is written.

Scripts (`References/scripts/`, `CLOCK_BUILD=hdd|rom`):

| Script | Covers |
|---|---|
| `verify_background.mjs` | the tube: every `RGBAQ`, `ST`, `XYZF2` of every strip; the grey ramp; when it is drawn |
| `verify_blur.mjs` | the head of the frame (clear, background, blur trips, the two copies, the tint), the trips after the rods, the level that sets the number of trips; every packet of the sprite helper |
| `verify_overlays.mjs` | fade overlay and its state machine, the vignette, the bars, the right column, the frame counter; which packets the date/time, hint and menu-page functions send |

A trace must be taken with the `PROBES` of all three (`verify_blur.mjs` carries the probes of
`verify_gs_state.mjs`, so the same trace serves that script too). Captures:
`Watson/Runtime/captures/hddosd-110U-rest-*` and `rom-0230A-rest-*`.

## Result

| Capture | What it is | Background | Head, blur, sprites | Overlays |
|---|---|---|---|---|
| `hddosd-110U-rest-clock` | clock alone | 208 strips, 12 220 vertices | 13 heads, 494 sprites | 13 frames |
| `hddosd-110U-rest-config` | System Configuration | 208 strips, 12 246 vertices | 13 heads, 806 sprites | 13 frames |
| `hddosd-110U-rest-menu` | main menu | 224 strips, 13 216 vertices | 14 heads, 686 sprites | 14 frames |
| `hddosd-110U-rest-to-clock` | System Configuration to clock alone (square) | 1 280 strips, 75 278 vertices | 80 heads, 4 117 sprites | 80 frames |
| `hddosd-110U-rest-to-config` | clock alone back to System Configuration | 1 280 strips, 75 296 vertices | 80 heads, 4 765 sprites | 80 frames |
| `hddosd-110U-rest-enter` | main menu into System Configuration | 2 160 strips, 127 440 vertices | 135 heads, 7 482 sprites | 135 frames |
| `hddosd-110U-rest-boot` | power-on, frames 150 to 406: the fade-in and the menu | 2 032 strips, 119 888 vertices | 256 heads, 12 296 sprites | 256 frames |
| `hddosd-110U-rest-poke-mode1` | clock, mode 1 and level 120 written | 208 strips, 12 220 vertices | 21 heads, 798 sprites | 21 frames |
| `hddosd-110U-rest-poke-mode2` | clock, mode 2 and level 44 written | 352 strips, 20 728 vertices | 106 heads, 4 028 sprites | 106 frames |
| `hddosd-110U-rest-poke-mode3` | clock, mode 3 written | EMPTY: 20 frames, none drawn, by rule | 21 heads, 798 sprites | 21 frames |
| `hddosd-110U-rest-poke-item1`, `-item2` | clock, config item 0 written (put back to 0 by the program) | 288 strips, 16 910 vertices | 18 heads, 684 sprites | 18 frames |
| **HDD OSD 1.10U, total** | | **8 240 strips, 485 442 vertices** | **757 heads, 36 954 sprites** | **757 frames** |
| `rom-0230A-rest-clock` | clock alone | 224 strips, 13 216 vertices | 14 heads, 672 sprites | 14 frames |
| `rom-0230A-rest-config` | System Configuration | 224 strips, 13 160 vertices | 14 heads, 812 sprites | 14 frames |
| `rom-0230A-rest-menu` | main menu | 224 strips, 13 216 vertices | 14 heads, 686 sprites | 14 frames |
| `rom-0230A-rest-to-clock` | System Configuration to clock alone | 1 280 strips, 75 072 vertices | 80 heads, 4 154 sprites | 80 frames |
| `rom-0230A-rest-to-config` | clock alone back to System Configuration | 1 280 strips, 75 520 vertices | 80 heads, 4 424 sprites | 80 frames |
| `rom-0230A-rest-enter` | main menu into System Configuration | 2 176 strips, 128 368 vertices | 136 heads, 7 234 sprites | 136 frames |
| `rom-0230A-rest-boot` | power-on, frames 370 to 559: black, mode 4 | EMPTY: 188 frames, none drawn, by rule | 189 heads, 9 261 sprites | 189 frames |
| `rom-0230A-rest-poke-mode1` | clock, mode 1 and level 120 written | 224 strips, 13 216 vertices | 22 heads, 1 056 sprites | 22 frames |
| `rom-0230A-rest-poke-mode2` | clock, mode 2 and level 44 written | 352 strips, 20 768 vertices | 106 heads, 5 088 sprites | 106 frames |
| `rom-0230A-rest-poke-mode3` | clock, mode 3 written | EMPTY: 20 frames, none drawn, by rule | 21 heads, 1 008 sprites | 21 frames |
| `rom-0230A-rest-poke-item1`, `-item2` | clock, config item 0 written (put back to 0) | 288 strips, 16 974 vertices | 18 heads, 864 sprites | 18 frames |
| **ROM 2.30, total** | | **6 272 strips, 369 510 vertices** | **694 heads, 35 259 sprites** | **694 frames** |

"Vertices" are vertices sent, each one `RGBAQ`, `ST` and `XYZF2` compared. A "head" is one call
of the frame head with every call it makes and every rectangle it fills; "sprites" are calls of
the sprite helper, each with its six registers compared. An overlay "frame" is the fade
rectangle, the bars, the column, the state machine's step and the frame counter of one frame.

Every row is a pass. The three marked EMPTY are captures where the background is skipped by
rule (overlay mode not 0); the rule itself is checked in those frames and holds.
`verify_gs_state.mjs` on the same traces: HDD OSD every write as read; ROM 2.30 differs in the
three registers already recorded in `facts/clock-gs-state.md`.

Frame order, both builds, every frame of every capture: overlay, pages, bars, date and time,
hint, column, frame counter (the master function's calls after the rods; same call list in both
builds, HDD `0x00225E80`, ROM `0x00221558`).

## 1. Background (verified on both builds)

`0x00233338` (ROM `0x0022F698`) each frame:

1. ticks the grey ramp `{length, counter, changed, state}` at `0x002B5CD0` (ROM `0x00296C90`);
2. if the ramp's state is not 0: grey = `counter * 40 / length` (integer), written to the three
   words at `0x00370AA8` (ROM `0x002C8F60`); in state 0 the grey is left as it is;
3. if the overlay mode (`0x00370AB4`, ROM `0x002C8F6C`) is 0: binds texture 1 (128 x 128,
   `0x2C00`) and sends 16 strips; otherwise sends nothing.

Each strip `k` is two packets: a register list `PRIM = 0x1C` **and `CLAMP_1 = 0`** (triangle
strip, shaded, textured, ST; both coordinates repeat), then `0x00233110(view, screen, k * 0x1000,
(k + 1) * 0x1000, 6000.0)`, a register list `RGBAQ, ST, XYZF2` per vertex.

For angles `a`, `b` (16-bit, 65536 a turn), `sin`/`cos` the clock's table
(`clock-scene.md`), every float operation single precision cut toward zero:

```
P0 = (R sin a, R cos a)      P1 = (R sin b, R cos b)           R = 6000
u0 = a / 65535               u1 = b / 65535                    (the integer angles, not masked)
lightA = (int)((cos a + 1) * 10)      lightB = (int)((cos b + 1) * 10)
for i = 0 .. 32:
    v      = i * 0.03125 + (counter % 5000) * 0.0002
    wobble = sin((s16)(counter * 100 + i * 0x1400)) * 0.05 + 1
    fall   = ((32 - i)^3) >> 10
    c      = (grey + ((230 * fall) >> 5), grey + ((260 * fall) >> 5), grey + ((260 * fall) >> 5))
    V0 = view * (P0 * wobble, z, 1)   V1 = view * (P1 * wobble, z, 1)      z = i * 1250 - 2500
    skip the ring if V0.z < 2050 or V1.z < 2050
    V = screen * V ; q = 1 / V.w ; V = V * q                                (each of the two)
    skip the ring if |V0.x - 2000| > 1000 or |V1.x - 2000| > 1000 or the same for y
    send  RGBAQ(c + lightA, alpha 0x40, Q = q0)   ST(u0 * 3 * q0, v * 3 * q0)   XYZF2((int)(V0 * 16))
          RGBAQ(c + lightB, alpha 0x40, Q = q1)   ST(u1 * 3 * q1, v * 3 * q1)   XYZF2((int)(V1 * 16))
closing pair, both vertices E = screen * view * (0, 0, 38750, 1), divided by w:
    v = (counter % 5000) * 0.0002 + 1
    send  RGBAQ(grey, 0x40, Q = qE)   ST(u0 * 3 * qE, v * 3 * qE)   XYZF2(E)        (twice, with u1 the second time)
```

`counter` is the frame counter at `0x003702D4` (ROM `0x002C88F8`), one more each frame
(`0x00232878`, verified). The colour components are OR-ed into the register without a mask.
The eight float constants (2050, 65535, 0.0002, 0.05, 0.0002, 65535, 38750, 6000) are at
`0x0036FC14` (ROM `0x002C81B8`); on HDD OSD they equal the file's initial data.

Counts: HDD OSD 8 240 strips and 485 442 vertices over 745 frames; ROM 2.30 6 272 strips and 369 510 vertices over 682 frames; every register equal. Rings kept per strip: 27 to 29 of 33 in every capture (the first
four or so are behind the near limit).

Grey ramp measured: 0 in the main menu (ramp idle, state 0), 1 .. 39 over the 40 frames after
System Configuration is entered (state 1), 40 from there on (state 2), on both builds. Length 40.

Build differences: none in what is sent. The ROM's strip code stores each 64-bit register as two
32-bit words; the values are the same.

## 2. Head of the frame and blur (verified on both builds)

`0x00226000` (ROM `0x002216D8`), in order, every call checked with its arguments in
757 (HDD OSD) and 694 (ROM 2.30) frame heads:

1. draw to the display, with the clear (colour record `0x002B21D0`, field flag);
2. the background (section 1);
3. `n` blur trips, `n = level < 6 ? level : 10 - level`;
4. draw to work buffer 0, bind the frame as a texture, full-screen copy;
5. draw to work buffer 1, full-screen copy;
6. draw to the display, bind work buffer 0, blend mode 0 with depth test ALWAYS, and the tint:
   a full-screen textured rectangle of colour **(55, 40, 60, 128)**, no blending.

One blur trip `k` (`0x00236490`, ROM `0x002328D8`): bind the frame, draw to work buffer 1,
rectangle `(0, 0)..(0x13F4 - 0x20 k, 0x954 - 0x10 k)` (1/16 pixel) sampling the frame
`0.5 .. (w + 0.5, h - 0.5)`; then bind work buffer 1, draw to the display, rectangle
`(0, 0)..(w, h - 1)` sampling `0.5 .. (0x13F4 - 0x20 k + 8, 0x95C - 0x10 k)`. The three numbers
are in the code, not computed from the screen size. Colour 128, textured, no blending, z 0.

After the rods (`0x00232438`, ROM `0x0022E718`, first thing the pages function does):
`level - 5` more trips when `level >= 5`.

The level is written once per frame by `0x00232640` (ROM `0x0022E910`) from the counter `c` of
the menu ramp at `0x002B5780` (ROM `0x00296740`, length 50) and the tail length `T` at
`0x003702D0` (ROM `0x002C88F4`, measured 10):

| | level |
|---|---|
| HDD OSD 1.10U | `c < T ? 10 - c * 10 / T : 0` |
| ROM 2.30 | `5 + 5 * clamp(T - c, 0, T) / T` |

Measured over the whole ramp in both directions (System Configuration to clock alone and back):

| | System Configuration, menu (c = 0) | during the first 10 frames | clock alone (c = 50) |
|---|---|---|---|
| HDD OSD | level 10: 0 trips before the rods, 5 after | 10 down to 0: before 0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0; after 5, 4, 3, 2, 1, 0 | level 0: **no trip at all** |
| ROM 2.30 | level 10: 0 before, 5 after | 10 down to 5 (two frames each): before 0 .. 5, after 5 .. 0 | level 5: **5 trips before the rods**, 0 after |

This is the answer to the reading's open point 1: the builds have different code there.

Sprite helper `0x00233770` (ROM `0x0022FD00`): two register lists, one packet each: `PRIM,
RGBAQ`, then `UV, XYZF2, UV, XYZF2`. `PRIM = 6 | textured << 4 | blend << 6 | 0x100`; the
colour fields OR-ed without a mask with `Q = 1.0`; corners `+ ((0x800 - w/2) << 4, (0x800 -
h/2) << 4)`; z in the upper word. Verified for every call in every capture
(36 954 calls on HDD OSD, 35 259 on ROM 2.30, among them 2 310 and 3 470 blur trips of two calls each), whoever the caller.

Binding the frame as a texture (`0x00233F48`): `TEST 0x50000, ALPHA 0x44, PABE 0, TEXA, FBA 0,
TEXFLUSH, TEX1 0x61, TEX0 (base = index 0 ? w*h/64 : 0, width w/64, 24-bit, 2^10 x 2^8, TCC 1,
modulate), CLAMP (region clamp to the screen)`: *verified* on HDD OSD (`verify_blur.mjs`,
`verify_gs_state.mjs`). ROM 2.30's binder (`0x002305F0`) sends `TEST 0x70000` (*read* at
`0x002306AC`), register `0x7F` in place of `TEXFLUSH` and `CLAMP 0` (*read* at `0x002306B0`);
the packets equal this in every ROM capture (`verify_gs_state.mjs`, `verify_frame.mjs --carry`).

ROM 2.30 only (read in its code, then verified in every ROM frame): the blur function and the
copy function each end with one more "blend 1, depth test GREATER" call, also when there is no
trip.

The records' fields the code does not write (colour, first corner 0,0, texel 0.5, z 0, blend,
textured) are constant in every capture and, on HDD OSD, equal the file's initial data.

## 3. Fade overlay, vignette, bars, column (verified on both builds)

**Fade** (`0x00234E70` then `0x00234E08`; ROM `0x00231478`, `0x00231410`): every frame, after the
rods and before the bars and text: draw to the display, blend mode 1 (`(Cs - Cd) * As + Cd`),
depth test ALWAYS, full-screen untextured rectangle with alpha `128 - level`. `level` is the
word at `0x00370AB8` (ROM `0x002C8F70`); the rectangle's colour was (0, 0, 0) in every capture.

**State machine** (`0x00234EA8`, ROM `0x002314B0`, same code), once per frame, on the mode at
`0x00370AB4`:

- mode 1 or 2: `level += 1`; when it passes 128: `level = 128`, mode 0;
- mode 2 only: when `level == 128 - L` (`L` = length of the vignette ramp, 80; `0x003702E4`,
  ROM `0x002C8908`), the vignette ramp is started (if idle);
- mode 3: `level -= 1`, not below 0, mode stays 3;
- any mode other than 0: the background is not drawn.

Verified against the next frame's values in every capture: mode 2 in a real power-on of HDD OSD
(129 frames, level 0 to 128, ramp started at level 48, mode 0 at the end); modes 1, 2 and 3 with
the mode written into memory on both builds. Not seen: mode 4 other than held (ROM 2.30 from
power-on sits in mode 4 with level 0, a black screen, for the 188 frames captured); the white
colour that mode 1 is read to use (the colour is set by the function that sets the mode, which a
memory write does not run).

**Vignette** (`0x00234D60` and `0x00233D00`; ROM `0x00231368`, `0x00230488`): drawn only when the
mode is 0 and the vignette ramp at `0x002B5F20` (ROM `0x00297120`) is not idle. Blend mode 1,
depth test GEQUAL; `PRIM = 0x4C` (strip, shaded, blended), then 16 packets, one per sector of
`0x1000`, six vertices each, `RGBAQ, XYZF2`, all black:

```
alpha = ramp counter * 128 / ramp length
centre (cx, cy) = (0x10A0, (h / 2) << 4)     radii (rx, ry) = (1184, 592)      (1/16 pixel: 266, 112; 74, 37)
X(angle, r) = (int)(cx + sin(angle) * rx * r + ((0x800 - w/2) << 4))
Y(angle, r) = (int)(cy + cos(angle) * ry * r + ((0x800 - h/2) << 4))
vertices: (angle, 1) alpha 0;  (next, 1) alpha 0;  (angle, 1.5) alpha;  (next, 1.5) alpha;
          (angle, 10) clamped to the screen, alpha;  (next, 10) clamped to the screen, alpha
```

So: untouched inside the ellipse, a soft edge from radius 1 to 1.5, black (at `alpha`) from
there to the screen edge. The radii and z are the file's initial data.

**ROM 2.30 only**: the last sector carries two more vertices, the inner edge at angles 0 and
`0x1000` with alpha 0 (*measured*, *read* in ROM `0x00230000`; HDD OSD's `0x00233A40` has no
such branch and sends six).

**PAL** (*read* and *verified* by `verify_frame.mjs --carry` on `hddosd-110U-pal-clock-frame`,
`-pal-config-frame`, `-pal-whole-to-clock`, `rom-0230E-pal-clock-b`, `-pal-whole-config`,
`-pal-whole-menu`, all equal): ROM 2.30 multiplies the vignette's vertical term by 1.15 (constant
`0x002C81D8`) when the video mode is PAL (`0x0022FEE4..0x0022FF00`; the cached video mode is the
word at `0x0027B380`, read at `0x002052D0`, 2 is PAL); HDD OSD's `func_002338E0` has no such
step and keeps the radii.

When: the ramp runs up during a fade-in (mode 2) and stays full, so the vignette is on in the
main menu at alpha 128; entering System Configuration runs it down over 80 frames (alpha
126 .. 1, measured), and it is off in System Configuration and on the clock screen. Verified:
244 frames and 23 424 vertices on HDD OSD (power-on, menu, entering System Configuration, mode 2 written), 117 frames and 11 466 vertices on ROM 2.30.

**Bars** (`0x002262C8`, `0x00226158`; ROM `0x002219A0`, `0x00221830`): drawn when config item 0
(`0x00409130`, ROM `0x00375100`) is 0 or 2. Opaque black, untextured, full width:

```
picture = (w / ax) * 0.0625 * 9 * ay            ax, ay: the camera's proportions (1, 0.47)
margin  = (h - picture) * 0.5
top:    y 0 .. (int)(margin * 16)               = 27.375
bottom: y (int)((h - margin) * 16) .. h         = 196.5625 .. 224
```

The bars follow item 0 as 0 or 2; item 1 draws none (`References/scripts/model_aspect.mjs`,
`hddosd-110U-whole2-aspect1`: 0 bar packets; `hddosd-110U-whole2-aspect2`: 196). A value written
into memory is put back to what the settings word holds before the frame is drawn; what reloads
the item, how a setting reaches it and the text rows it moves are in `clock-frame.md`
("Configuration item 0").

**Column** (`0x00226A88`, ROM `0x00222210`): opaque black, `x (w << 4) - 0x28 .. (w << 4) - 8`
(637.5 .. 639.5), full height. Verified every frame.

## 4. Date and time, hint, pages: which function sends what (measured, not recomputed)

Packets between each function's entry and the next one's, clock screen:

| Function | HDD OSD 1.10U | ROM 2.30 |
|---|---|---|
| date and time `0x00226300` (ROM `0x002219D8`) | 19 glyphs, each a **12-vertex triangle fan** (`PRIM 0x5D`), 4-bit texture at `0x2F04`, `ALPHA 0x44`, colour (96, 96, 96, a); inside x 20.31 .. 620.19, y 12.75 .. 24.81 | 19 glyphs, each a **sprite** (`PRIM 0x156`), 4-bit texture at `0x2F05`, `ALPHA 0x44` with FIX 0x80, colour (96, 96, 96, a); inside x 22 .. 620, y 11.125 .. 27.375 |
| hint `0x002269E0` (ROM `0x00222160`) | one icon sprite (texture `0x2EC0`, colour 128) and 7 glyph fans; x 24 .. 130.4, y 199.8 .. 213 | one icon sprite and 7 glyph sprites; x 24 .. 137, y 197.25 .. 212.25 |
| pages `0x00232458` (ROM `0x0022E738`) | clock alone: nothing. Menu: 83 packets. System Configuration: 365 packets | clock alone: one packet, the blur function's closing blend. Menu: 84. System Configuration: 368 |

`a` is 128 in System Configuration and on the clock screen and **0 in the main menu** (the text
is sent there too, invisible). The glyph primitive is a real difference between the builds'
font code; the font system was not entered (out of scope).

## Registers the code writes that a reader would not expect

- The vertex register of the strips and of the sprite helper is `XYZF2`, not `XYZ2`.
- The packet before each strip writes `CLAMP_1 = 0` as well as `PRIM`: it makes the tube texture
  repeat although the texture binder sets clamp on HDD OSD.
- Binding the frame: `TCC` is 1.
- The vignette is the main menu's mask, on from the end of the fade-in until System
  Configuration is entered.
- Closing pair of a strip: both vertices carry the first one's `Q` (the two are equal anyway).
- The blur level's rule differs between the builds (section 2): on the clock screen HDD OSD
  makes no trip and ROM 2.30 makes five before the rods.

## Still only read, or not done

- Overlay mode 1's white colour, and what sets modes 1, 3 and 4 (the callers of the mode setter).
- PAL values of the ramp lengths (33, 66, 8), `ay` 0.5405 and the text's PAL scaling: read only; the whole-frame PAL captures (above) are equal to the model, which carries them.
- The date/time and hint text beyond "which packets" is in `text.md` (pen position, alpha rule, strings, font; HDD OSD verified, ROM 2.30 to the place and alpha level); on HDD OSD the whole-frame model carries it (`clock-frame.md`, `whole3` captures), on ROM 2.30 it does not.
- The pages function beyond its blur trips: menu items, the menu transition's own blur chain
  (`0x00236350`, `0x00236058`, `0x00236110`; its packets are reproduced by `verify_frame.mjs --carry`, `clock-frame.md`), the first-run pages.
- ROM 2.30's vignette sector function `0x00230000` beyond the extra branch, and its binder
  `0x002305F0` beyond the two registers cited: measured, not read in full.
- A probe range cannot name the uncached mirror (`0x2xxxxxxx`); the range `a0+0xe0000000:len`
  reads the same record through the cached address.
