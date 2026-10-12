# The cubes of System Configuration (draft)

Recorded 2026-10-02. Canon build **HDD OSD 1.10U**; second witness **ROM 2.30**. *Read* means
read in `../CrystalOSD/asm/` (HDD OSD) or in the ROM memory dump with `disasm_rom.py`;
*measured* means recomputed bit for bit by `References/scripts/verify_cubes.mjs` from the inputs
a trace probe recorded, or seen in the packets of a capture named in the last section.

## The answer

**What they are.** Blocks of glass drawn by the clock module with the rods' own pipeline: the
same transform (`func_00237010`), the same face records, the same refracted, grain and
reflection emitters, the same two work buffers. Only the mesh (a cube of side 5.28, six faces,
in the executable), the record, the placement and two small functions that order the sends are
their own. They are a decoration of the list of System Configuration, not objects of the list:

- **HDD OSD 1.10U**: six cubes are drawn every frame, on six neighbouring places of a ring of
  sixty that turns by one place for each press of up or down. The cube on the third drawn place
  is the selected one. A cube is a place of the ring, not an entry: its sideways position and
  its spin depend on the parity and the number of the place, and the ring does not wrap with the
  list.
- **ROM 2.30**: when the list has fewer than six entries (it has five) the same code draws
  **five cubes that stand still, one per entry**, top to bottom; the ring code is there too and
  runs only with six entries or more.

**Why the selected one is blue.** *Measured, register by register:* the draws of the selected
cube carry exactly the same GS state as the others — same buffers, textures, blends, depth
tests, primitives, clamps (143 register writes per cube on HDD OSD, all equal across the six
cubes of a frame). The one thing that differs is the **vertex colour**. It comes from the cube
record's base colour (`+0x80`), which the pass sets per cube from two colours in the
executable:

```
selected   (0, 150, 200, 128)        plain   (100, 100, 100, 128)
```

The refracted emitter sends `RGB = min(255, highlight + base)` and the buffer it samples is
bound with modulate, so what is seen through the cube is multiplied by `base / 128`: for the
selected cube red is removed, green is × 1.17 and blue × 1.56; for the others everything is
× 0.78, a neutral darkening. A second place uses the same colour: the edge quads, `base × F²`
(`F` the same edge term as the rods'), which give the selected cube a blue rim where the others
have a grey one. So the cube keeps refracting exactly as before; the tint is a multiplication
of the refracted picture, nothing else. Measured vertex colours of one frame: selected faces
`0x80C89600`, edge quads `0x80997200` and `0x80594300`; plain faces `0x80646464`.

While the list moves the colour is mixed between the two (HDD OSD, linear in the position) or
chases its target a few units per frame (ROM 2.30); both are below.

## Functions

| Role | HDD OSD 1.10U | ROM 2.30 |
|---|---|---|
| ramp tick, then list step, then pass | `module_clock_230C00` | `0x0022CD80` |
| the pass: which cubes, colour, scale, layer | `module_clock_2308F0` | `0x0022C8D0` |
| one frame of the list position | `module_clock_230550` | `0x0022C518` (the step itself from `0x0022C524`) |
| ask for a move of n places | `func_00230860` | `0x0022C840` |
| one cube's matrix | `module_clock_2306B0` | `0x0022C690` |
| mix two colours | `module_clock_230600` | `0x0022C5E0` |
| standing cubes: one frame | at `0x00230410`, no caller found | `0x0022C3D8` |
| start / end the cubes' ramp | `func_00230380` / `func_002303C8` | `0x0022C330` (also chooses standing or ring) / `0x0022C390` |
| draw one cube | `module_clock_237350` | `0x00233928` |
| one cube in the highlight layer | `module_clock_237860` | `0x00233DD8` |
| edge colour quad | `func_00236D90` → `func_00236C70` | `0x00233328` → `0x00233198` |
| depth quad | `func_00236B30` | `0x00232F80` |
| alpha quad | `func_00236BC8` | `0x00233070` |
| display buffer as texture, work buffer as target | `func_00235FE0` | `0x00232470` |
| add the left half of buffer 0 to buffer 1 | `func_00236198` | `0x00232618` |
| add buffer 1 to buffer 0 | `func_00236110` | `0x002325A0` |
| buffer 0 onto the display | `func_00236230` | `0x002326A8` |
| blur chain | `func_00236350` | `0x002327B8` |

`module_clock_232458` calls `module_clock_230C00` once a frame, right after the blur round
trips that follow the rods (*measured: the cubes' packets come from the stack
`237350 < 2308F0 < 232458 < 225E80`*).

Data, HDD OSD (ROM 2.30): record `0x002B5AF0` (`0x00296AB0`); mesh tables `0x002B5790`,
`0x002B5910`, `0x002B5970`; colours selected `0x002B5750`, plain `0x002B5760`, live
`0x002B5770` (`0x00296710`, `…20`, `…30`); ramp `0x002B5740` (`0x00296700`), its length at
`0x003702CC` (`0x002C88F0`); list state from `0x003702A8` (`0x002C88C0`): pulse, pulsed place,
position, left to go, speed, slowing; spin `0x00370290` (`0x002C88A8`); ROM only: mode
`0x002C88D8`, table of the standing cubes `0x00296B90`, the list `0x0028AFF0` (count at `+8`,
selected at `+0x10`).

## Mesh and record

`References/scripts/extract_cube_mesh.mjs` writes `References/model/cube-mesh.json` from the
HDD OSD file and compares with the ROM 2.30 dump: positions, normals, texture coordinates, the
constants of the record and the two colours are **equal in both builds**.

- Six faces, each a strip of four vertices, corners at ±2.64 on every axis. Normals ±Y, ±Z, ±X.
  Texture coordinates run 0..1 on one face and are shifted by 0.25 or 0.5 on the others.
- The record is the rod record (`facts/clock-rod-draw.md`): number 0, 6 faces, scale 1, base
  colour written every frame, highlight strength 200, grain colour (8, 8, 8, 128), grain offset
  pair (0.01, 0.01), refraction strength 1, reflection colour (120, 120, 120) with the alpha
  written every frame by the layer.
- There is one record. Each cube is the same record with matrix, scale and colour rewritten
  before its draw.
- **Who writes the two colours:** nobody; they are data in the executable, and the only code
  that touches their addresses reads them.

## The pass: `module_clock_2308F0` (*measured on both builds*)

```
scale = (float) ramp.counter / (float) ramp length          nothing is drawn while the ramp is idle
whole = position / 3000        part = position % 3000        position in 0..179999, 3000 per place
for slot 0..5:
    place  = (whole + slot - 2) mod 60
    weight = part * 128 / 3000                                integer
    colour = slot 2: mix(selected, plain, 128 - weight)
             slot 3: mix(selected, plain, weight)
             else  : plain
    record.colour = colour;  place the cube (place, position, scale);  draw the cube
clear work buffer 1
for slot 0..5:
    fade = (|(-6000 + 3000 * slot) - part| - 6000) * 128 / 3000
    if fade < 128:  record.alpha = 128 - max(fade, 0);  place the cube;  draw it in the layer
add buffer 1 to buffer 0;  blur chain(5 - v when v < 5, v the word at 0x00370AA4);  buffer 0 onto the display
```

`mix(a, b, w) = (a × w + b × (128 − w)) >> 7` per channel. At rest (`part = 0`) slot 2 is the
selected colour, five cubes are in the layer with alpha 128 and the sixth (slot 5) is left out
of it. The ramp is 40 frames long (*measured, both builds; read: 40 × rate / 60*), so the cubes
grow linearly from nothing to full size in 40 frames when the list appears and shrink the same
way when it leaves (*measured both ways on both builds: 41 values, 0.025 apart*). The ramp is
started and ended by the list's own code (`func_00230380`, `func_002303C8`; their callers
belong to the transitions and were not followed).

Slots on screen at rest, centres in pixels of the 640 × 224 field (*measured, HDD OSD*):
slot 0 (212.21, 175.20), 1 (104.42, 143.77), 2 (212.21, 112.00), 3 (104.42, 80.23),
4 (212.21, 48.80), 5 (104.42, 18.07). Slot 5 lies under the top bar: five are seen.

## The list position (*measured on HDD OSD; on ROM 2.30 with the mode word forced to 6*)

Up calls `func_00230860(+1)`, down `func_00230860(−1)` (*read: `func_002316B8`, pad bits
`0x1000` and `0x4000` of the word at `0x00370334`*). The selected entry wraps with the number
of entries; the position does not, it turns on its own ring of sixty.

```
ask(n):   left += n * 3000;  half = (int) rate / 2;  speed = |left| * 2 / half;  slowing = speed / half
step:     if speed >= |left|:  move = left;  speed = 0
          else:  move = speed with the sign of left;  speed = max(speed - slowing, 1)
          left -= move;  position = (position + move) mod 180000;  pulse *= 0.95
```

`rate` is 59.94, or 50 when the video mode is PAL (*read; PAL not measured*). With 59.94:
`half` 29, speed 206, slowing 7, and **a move of one place takes 24 frames**, fast first:
206, 199, 192, … (*measured: 25 positions, each equal*). In PAL by the same rule: 19 frames.

Pressing down turns the ring so that every cube goes up one place on screen and a new one
comes from below; the blue goes with the weight above, from the cube that leaves the middle
place to the cube that arrives there.

**The pulse.** Confirming a value inside an entry (*read: `func_00231B38`, pad bit `0x20`*)
writes `pulse = −0.1` and `pulsed place = (position + left) / 3000`. The cube on that place gets
`scale + pulse`, and the pulse is multiplied by 0.95 every frame: the selected cube shrinks by a
tenth and comes back (*measured on both builds: one pulse each, and every frame of its decay*).
Entering an entry from the list does not pulse and changes nothing in the cubes (*measured:
77 passes with cross held, both builds*).

## One cube's matrix: `module_clock_2306B0(place, position, scale)` (*measured*)

```
scale'   = scale + pulse when place is the pulsed place;  record scale x, y, z = scale'
distance = (place * 3000 - position) mod 180000
angle    = distance * 2π / 180000 + π/2, brought into [-π, π)
x = (place odd ? 60 : 70) - 80          -20 or -10
y = cosf(angle) * 60                    6 degrees of a circle of radius 60 per place
z = 47.5
matrix = unit;  moved to (x, y, z, w);  turned about X, then Y, then Z, each by
         a = (spin + place * 7000) as a 16-bit angle
```

- `spin` is the 16-bit counter at `0x00370290`, 30 more each frame (*measured*): one turn in
  2185 frames, and every place 7000 units ahead of the one before.
- The rotations are the clock's matrix-stack routines over its sine table (`clock-camera.md`);
  recomputed with the table read from memory.
- `cosf` is the C library's. Its result is taken as measured (probe after the call); it is
  within 2.9e-8 of the true cosine. The angle handed to it is recomputed and equal.
- **`w` of the position is not set by the code**: the function fills x, y, z of a vector on its
  stack and hands the address to `module_clock_23A3C0`, which runs all four through the top
  matrix. *Measured: the fourth word is the integer `0x80` every time; as a float that is a
  denormal, which VU0 treats as zero, so the matrix gets `w = 0`.* With `w = 0` the translation
  of the view matrix does not reach the cube: **the cubes do not follow the camera's position**
  (its approach from behind at start), only its rotation. The verifier reproduces the records
  with `w = 0` and with nothing else.

## Drawing one cube: `module_clock_237350` (*measured: emitter, faces and arguments of every send*)

The transform fills six face records; the side flag splits them, three and three in every
frame met at rest. `cx`, `cy` = **0.35 ×** the projected centre (the rods use 0.9). Nothing is
drawn when the record's y scale is negative.

| # | Target | Texture | Blend, depth test | Faces | Emitter |
|---|---|---|---|---|---|
| 1 | work buffer 1 (`0x118`) | the display buffer being drawn (`func_00235FE0(1, 0, 1)`) | `(Cs − Cd) × As + Cd`, always | flag 0 | refracted, nothing added |
| 2 | 1 | grain `TEXCBUMP` (`func_002349E0(2, 1, 2)`) | `Cs × As + Cd`, greater or equal | flag 0 | textured, offsets the record's pair (0.01, 0.01), colour `+0xA0` |
| 3 | 1 | grain | `(0 − Cs) × As + Cd`, greater or equal | flag 0 | textured, offsets 0, 0 |
| 4 | work buffer 0 (`0xD2`) | buffer 1 (`func_00236058(0, 1, 1)`) | `(Cs − Cd) × As + Cd`, always | flag 0 | edge colour quad |
| 5 | 0 | | `Cs × As + Cd`, greater or equal | flag not 0 | depth quad |
| – | 1 | buffer 0 (`func_00236058(1, 0, 0)`) | `Cs × As + Cd`, always | | `func_00236198`: one sprite, the left half of the buffer (0..320 × 0..224) |
| 6 | 0 | buffer 1 (`func_00236058(0, 1, 1)`) | `(Cs − Cd) × As + Cd`, always | flag not 0 | refracted, nothing added |
| 7 | 0 | grain | `Cs × As + Cd`, greater or equal | flag not 0 | textured, the record's pair |
| 8 | 0 | grain | `(0 − Cs) × As + Cd`, greater or equal | flag not 0 | textured, 0, 0 |

The grain offsets do not depend on the face or on the cube's number (the rods add
`phase + i × 0.1`).

The three emitters the rods do not have (*read, then measured on every face*):

```
edge colour quad   PRIM 0xC4 (strip, blended, AA1, no texture)
                   RGB = min(255, (int)(F² × base)) per channel, A = 0x80, Q = 0;  XYZ of the face record
depth quad         PRIM 0xC4, RGBA = (0, 0, 0, 0x20);  XYZ with z + 1
alpha quad         PRIM 0x44, or 0xC4 when alpha <= 64;  RGBA = (0, 0, 0, alpha);  XYZ
```

`F = 1 − |dot(normalize(view position of vertex 0), view normal)|`, as in the refracted emitter.

*Reading of what the sends are for (not checked against pixels):* the far side of the cube
(flag 0) is drawn into buffer 1 as the picture behind it, refracted, tinted by the base colour
and grained; its edge colour goes into buffer 0 and is added to buffer 1; then the near side is
drawn into buffer 0 sampling buffer 1, so the light is bent twice, as in the rods. The depth
quad adds no colour: it writes depth, and alpha `0x20`, on the near faces before they are
drawn. Buffer 0 ends up on the display through one whole-buffer sprite whose blend takes the
texture's alpha.

## The highlight layer: `module_clock_237860` (*measured*)

After the six cubes the pass clears buffer 1 (one black sprite) and draws each cube whose fade
is under 128 again, in two sends over the faces whose flag is not 0:

| # | Target | Texture | Blend, depth test | Emitter |
|---|---|---|---|---|
| 1 | buffer 1 | `TEXCREFA` (`func_002349E0(5, 0, 1)`), after `func_00236058(1, 0, 1)` | `(Cs − Cd) × As + Cd`, always | the reflection emitter, antialiased (`aa = 1`), colour (120, 120, 120, alpha) |
| 2 | buffer 1 | | `Cs × As + Cd`, greater or equal | alpha quad with the record's `+0xCC` |

Then `func_00236058(0, 1, 0)` and `func_00236110` (buffer 1 added to buffer 0, one whole
sprite), the blur chain, `func_002360A8(0, 0, 0)` and `func_00236230` (buffer 0 onto the
display, one whole sprite, `(Cs − Cd) × As + Cd`). `TEXCREFA` is drawn by nothing else
(`facts/clock-textures.md`: 5 draws a frame in Configuration, 0 elsewhere). The layer's
function also multiplies the projected centre by 0.2; no emitter of the layer takes it.

*Reading:* the alpha quad stamps the layer's strength on the cube's pixels in buffer 1, and the
addition into buffer 0 is weighted by it; so the cubes at the two ends of the row lose their
reflection as they come and go (alpha 2..128 measured while the list moves), while the cube
itself is always drawn in full.

## ROM 2.30: five standing cubes (*measured*)

The function that starts the cubes' ramp sets a mode word: 5 when the list has fewer than six
entries, else 6. With 5 neither the list position nor `module_clock_2306B0` is used:

```
for entry i = 0..4 (table at 0x00296B90, 0x30 bytes each: position, colour, pulse, glow):
    scale  = ramp scale + entry.pulse
    colour = entry.colour
    matrix = unit; moved to entry.position; turned about X, Y, Z by (spin + i * 7000)
    draw the cube                                   and, after the clear, all five again in the layer
```

Positions, in the file: (−11.5, −11.5), (−22.5, −5.5), (−10.75, −0.25), (−21.75, 6),
(−11.25, 11.5), all at z 47.5 and `w = 0`; entry 0 is the top cube. Each frame
(`0x0022C3D8`):

```
selected entry:   live colour steps 1 toward the selected colour;  entry.colour steps 7 toward the live colour
                  entry.glow = min(glow + 8, 128)
other entries:    entry.colour steps 7 toward the plain colour;    entry.glow = max(glow - 8, 0)
every entry:      entry.pulse *= 0.95
```

A step never passes its target. The live colour starts at (128, 128, 128, 128), so the first
time the list opens the selected cube turns blue slowly, one unit a frame (*measured: 44
frames of it*); after that a change of selection takes 15 frames at 7 a frame (*measured*).
The pulse of the confirm goes to the selected entry's own `pulse`. `glow` is written here and
is not read by the cube drawing; the list code refers to the table in two more places
(`0x0022DA74`, `0x0022DEFC`), not read.

The ring code of ROM 2.30 was run by writing 6 to the mode word: it is the HDD OSD code and
gives the same numbers (*measured: 282 cubes, one move of 24 frames, every value equal*).

HDD OSD has the standing function too, at `0x00230410`, with its table at `0x002B5BD0`, but
the disassembly holds no call to it and the pass has no mode test: it always uses the ring.

## What was verified, bit for bit

`verify_cubes.mjs` (`CLOCK_BUILD=hdd` or default ROM), captures in `Watson/Runtime/captures/`.
Nothing differed in any capture.

| Capture | What happens | Passes | Cubes | Layer cubes | Values compared |
|---|---|---|---|---|---|
| `hddosd-110U-cubes-b` | list at rest | 10 | 60 | 50 | 22 549 |
| `hddosd-110U-cubes-down` | down held: one move of 24 frames, 25 positions, 45 layer alphas | 51 | 306 | 278 | 116 535 |
| `hddosd-110U-cubes-appear` | list opening from the main menu: 41 scales | 86 | 258 | 215 | 96 632 |
| `hddosd-110U-cubes-enter` | cross held on the list: an entry is entered, cubes unchanged | 77 | 462 | 385 | 172 589 |
| `hddosd-110U-cubes-pulse` | a value confirmed: one pulse | 57 | 342 | 285 | 127 243 |
| `hddosd-110U-cubes-leave` | circle held: the list leaving, 41 scales going down | 67 | 312 | 260 | 116 852 |
| `rom-0230A-cubes-a` | at rest, standing | 11 | 55 | 55 | 21 052 |
| `rom-0230A-cubes-down` | selection 0 → 1: colours chasing | 47 | 235 | 235 | 90 280 |
| `rom-0230A-cubes-appear` | list opening: 41 scales, the live colour going blue | 87 | 220 | 220 | 84 417 |
| `rom-0230A-cubes-enter` | cross held: cubes unchanged | 77 | 385 | 385 | 147 730 |
| `rom-0230A-cubes-pulse` | a value confirmed: one pulse | 57 | 285 | 285 | 108 471 |
| `rom-0230A-cubes-leave` | circle held: the list leaving, 41 scales going down | 67 | 260 | 260 | 100 040 |
| `rom-0230A-cubes-conveyor` | mode word forced to 6, down held: the ring on ROM 2.30 | 47 | 282 | 258 | 107 536 |

What is recomputed for every cube: the pass's choice of place, scale, colour and layer alpha;
the list step, the ask and the pulse; the angle, position and matrix; the six face records of
the transform (view position, s and t, screen position, 12.4 integers, q, normal, side flag);
which emitter gets which face in which order; the centre handed to the refracted emitter; and
every face sent — refracted (`PRIM`, colour, four `UV` and `XYZ`), textured (`PRIM`, four `ST`,
`RGBAQ`, `XYZ`), edge, depth and alpha quads (`PRIM`, `RGBAQ`, four `XYZ`), reflection (`PRIM`,
colour, four `UV` and `XYZ`). Totals over the six HDD OSD captures: 1 740 cubes and 1 473
layer cubes; 10 440 refracted, 20 880 textured, 5 406 edge, 5 034 depth, 4 248 reflection and
4 248 alpha faces; 652 400 values, all equal. Over the seven ROM 2.30 captures (six standing,
one with the ring forced): 1 722 cubes, 1 698 layer cubes, 659 526 values, all equal. The refracted and
reflection formulas are the ones of `verify_refraction.mjs` and `verify_reflection.mjs`,
imported.

Rounding is toward zero in every single-precision step, as in the other verifiers.

## Where the builds differ (*measured on both*)

| | HDD OSD 1.10U | ROM 2.30 |
|---|---|---|
| Which cubes | always the ring: six cubes, the selected on the third place | five standing cubes, one per entry, when the list has under six entries; the ring otherwise |
| Change of selection | positions slide for 24 frames; colour mixed linearly with the position | nothing moves; colour 7 units a frame toward its target |
| First opening | selected cube blue at once | selected cube goes from grey to blue one unit a frame |
| Depth quad | `PRIM 0xC4` blended, alpha `0x20`: adds nothing to the colour | `PRIM 0x84` not blended, alpha `0x80`: writes black |
| Edge, depth and alpha quads | one packet per send | one packet per face |
| Depth test after binding a texture | greater or equal | greater (`TEST_1 0x70000`), as in the rods (`clock-gs-state.md`) |
| Buffers and textures bound | region clamp / clamp | repeat / clamp, as in the rods |

Equal in both: mesh, record constants, the two colours, 0.35, the ramp of 40, the pulse −0.1
and 0.95, spin 30 a frame and 7000 a place, the order of the sends, the emitters' arithmetic.

## Not known, not verified

- PAL: the rate of 50, hence 19 frames a move, and the ramp length there are read only.
- What each send does to the pixels (the role of the alphas, what buffer 0 holds before the
  cubes) is a reading; no picture was compared.
- The blur chain `func_00236350(n)` between the layer and the display runs only while the
  clock-to-menu ramp is under way (`n = 5 − v`); it was not followed here.
- The state helpers are not in `verify_cubes.mjs`. `verify_gs_state.mjs` was run on this
  screen instead: on HDD OSD (`hddosd-110U-cubes-gs-state`) 4 960 calls of the five helpers,
  every write as read; on ROM 2.30 (`rom-0230A-cubes-gs-state`, one frame: the trace stopped
  early) 480 calls, differing from the HDD OSD reading only in the three registers already
  known (`TEST_1 0x70000`, `CLAMP_1 5`, register `0x7F` for `TEXFLUSH`). `func_00235FE0` /
  `func_00233F48` (the display buffer as texture) are not among the five; their writes in the
  table of sends are the ones measured in the packets (`TEX0_1` with the address of the buffer
  being drawn, region clamp on HDD OSD, repeat on ROM 2.30).
- `w` of the cube's position depends on what the stack holds; it was `0x80` in every call
  measured, never anything else, but no code sets it.
- `cosf` is taken as measured, not recomputed.
- `module_clock_237300` (the transform for a centre only) is called seven times a frame on this
  screen by the orb code (`module_clock_22F908`), not by the cubes; it belongs to the
  transitions.
- Text: on this screen the draws from `0x00214490 < 0x00213BA8` (`PRIM 0x5D`, texture
  `0x2F04`) are the font; not looked into.

## Notes for Watson

Nothing was needed. Two limits met: a probe takes at most eight ranges (the sine table has a
probe of its own on the pass's second instruction), and `hold` gives the handler one press, so
a second action needs `watson_pad` presses before the trace.
