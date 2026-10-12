# The opening intro, measured (draft for `facts/`)

Written 2026-10-02 by the fork that measured it. Build: **HDD OSD 1.10U** (every address below).
To be integrated into `facts/` by the main session; nothing here was written into `facts/`.
The static reading it started from is `opening-map.md`; where the two disagree, this page is the
measured one (section 7 lists the disagreements).

## 1. How it is run and captured

- `watson_launch { build: "hddosd-1.10U-host", args: "SkipSearchLater BootOpening" }` plays the
  intro. Under the interpreter (needed for a trace) the module's first frame is emulator frame
  128; under the recompilers it is a few frames earlier.
- With an empty play history there are **no towers**: nothing takes PATH1 after the module's
  set-up. To see them, five history entries were written to `0x001F0198` while paused at the
  entry of `OpeningInitTowersFog` (`0x00221D30`, breakpoint under the recompilers) and a state
  was saved there: `Watson/Runtime/states/hddosd-1.10U-host-opening-towers.p2s` (not in
  `watson.json`; launch with `state: <that path>`). Writing the table earlier does not work:
  it is cleared again before the intro starts. Entries used: play counts 1, 5, 13, 30, 127;
  cell masks 0x01, 0x03, 0x3F, 0x07, 0x01; 13 towers.
- Captures (`Watson/Runtime/captures/`): `hddosd-110U-opening-full` (270 frames from emulator
  frame 120, the whole intro, probes of camera, lights, fog, cubes), `-full2` (the same span,
  probes of the ghost and the logo), `-timeline` (camera probes only), `-towers2`, `-towers3`,
  `-towers4` (from the saved state), and short ones used while writing the verifiers.

## 2. What a frame is made of (*measured*: `extract_opening_frame_map.mjs`)

Everything but the towers goes PATH2 from the scratchpad, sent at once by the function that
builds it. Order within a frame (`OpeningDrawOpeningScene` `0x00221CB0`, then `OpeningDrawEnd`):

| Packets a frame | Sent by | What |
|---|---|---|
| 1 | `OpeningProcess` | scissor |
| 6 (+ 7 per tower, PATH1) | `func_002214F8` | towers: depth on, texture 6 (256 x 256, mip-mapped); per tower a blend packet (`ALPHA 0x80_00000044`, `PABE`) and six strips `PRIM 0x9C` from VU1 |
| 1 | `func_0021D140` | the previous frame's ghost over the new one |
| 10 | `func_0021CF38` | the frame copied at half width into the store (`FRAME` FBP `0x118`) |
| 106 | `OpeningDrawFog` | 6 layers x (1 state + 16 rows of up to 16 quads `PRIM 0x5C`) |
| 27 | `OpeningDrawLights` | 16 sprite packets (4 lights x 4), 4 trails `PRIM 0x18A`; only while camera z < 73 |
| 86 per cube | `func_00220450` | frame copy, then 10 passes; only while camera z < 73; 5 cubes, fewer as the camera passes them |
| 15, 21 or 27 | `func_0021D3D0` | the dive blur, level 1, 2, 3 |
| 6 | `func_0021D848` | the fade rectangle |
| 5 | `func_0021D990` | the logo: two textured rectangles |
| 8 | `func_0021D6C0` | letterbox bars (two flat sprites, `ALPHA 0x80_00000062`); present in every frame of these captures |
| 2 | buffer swap thread | PATH3 |

596 packets a frame while all five cubes are in view and the logo is up, without towers.
**PATH1 is used only by the towers** (and once at set-up, when the microprogram is uploaded).

Over the whole intro (packet counts per frame, frame index 0 = emulator frame 120, module
counter = index - 6): towers' state 7..252; fog 7..252; lights 7..224; cubes 5 until 186, then
4 until 196, 3 until 199, 2 until 224; logo 57..176; blur level 1 at 220..231, 2 at 232..241,
3 at 242..252; fade 7 and 224..252.

## 3. The timeline (*verified*: `verify_opening_camera.mjs`)

The module's update is `OpeningProcessInner` (`0x0021EF00`), once a frame; the frame counter is
`D_00370000` (+1 a frame in `OpeningDrawEnd`). State: block `B` at `0x003DB800` (accelerations
`+0x00..+0x08`, velocities `+0x10..+0x18`, steps `+0x20..+0x28`, roll acceleration `+0x38`, roll
velocity `+0x48`, stage `+0x50`), camera position `0x002B0C60`, roll angle `D_00370098`, up
vector `0x002B0C80`.

**Stage handlers** (NTSC, not booting from the hard disk; read `0x0021EF4C..0x0021F264`):

```
if ((float)threshold[stage] < camera.z) stage++            thresholds 16, 56, 104, ...
stage 1:  B+0x08 = 4e-7                                    (z acceleration)
          if discState is one of {0x64, 0x6A..0x70, 0x72..0x74} and counter > 120: go = 1, stage++
stage 2:  if counter > 600: go = 1
          if go:  (first time: discState is kept in D_003700A0 for the hand-off, pending = -1)
                  B+0x18 = 0.0099 (z velocity, set again every frame), B+0x38 = 0.000195 (roll acceleration),
                  B+0x10 = B+0x14 = B+0x30 = B+0x34 = 0
stage 3:  the function returns scene + 1: the scene ends
```

**Integrator** (`0x0021F37C..0x0021F508`), every operation single precision cut toward zero,
`k` = 1 (NTSC; 1.2 in PAL), in this order (the order matters for the bits):

```
step(u, a) = (((u + u) + a) * 0.5) * k
rollVel += step(rollAcc, 0)
p.x += step(v.x, a.x)   p.y += step(v.y, a.y)   p.z += step(v.z, a.z)       (B+0x20..0x28)
v.z += a.z * k
roll += step(rollVel, rollAcc)                     (the new rollVel)
camera.x += step(p.x, v.x)   camera.y += step(p.y, v.y)   camera.z += step(p.z, v.z)   (the new p and v.z)
if (pi < roll) roll -= 2 pi ;  if (roll < -pi) roll += 2 pi
up = (sinf(roll), cosf(roll), 0, 1)
```

The scene set-up runs between the first and the second call (`OpeningInitOpeningScene`
`0x00221BB8`): camera (0, 0, 16), roll -0.12. `B` starts with step z 0.04 and roll velocity 0.001
(`OpeningInitAnimation`).

**Measured, the whole intro** (`hddosd-110U-opening-full` and `-timeline`): 247 calls; stage
handlers, integrator and return value equal bit for bit in all 247; the state is untouched
between calls in 245 and the 246th gap is the scene set-up. The up vector is within 2 steps of
the nearest singles of the true sine and cosine (the C library's `sinf`/`cosf`, not modelled).

| Module counter | What happens |
|---|---|
| 1 | first call; fade rectangle alpha 0x80 (drawn while counter < 2); disc state 0x65 |
| 2 | camera at z 16.04, roll -0.119; disc state 0x64 from here on |
| 3 | stage 1 (z > 16) |
| 51..170 | logo: its value walks +4 a frame to 0xF0, then -4 to 0; alpha = min(0x70, value); 120 draws. It starts on the first frame with z > 18 (`func_0021DB50` `0x0021DB50`) |
| 121 | stage 2 and `go` (counter > 120 with disc state 0x64): the dive starts, z 20.9 |
| 214 | blur level 1 (z 68.6); level = (int)((z - 56) / 12), at most 3 (`func_00221A50`) |
| 218 | fade starts: alpha = (uint)((z - 72) x 128 x 0.03125) (`func_00221B00`); last frame of lights and cubes (z < 73) |
| 226, 236 | blur level 2, 3 |
| 246 | last drawn frame: z 104.85, fade argument 131, which the rectangle caps at 0x80: black |
| 247 | stage 3: the scene ends; `opening_transition_to_clock` follows |

So the intro is **246 drawn frames** in this run. The length depends on the disc state: 0x64 is
what the emulator reports with no disc, and it is one of the states that release stage 1 at
counter 121. With a state outside that list the camera reaches z 56 by itself much later; that
path was not run.

Fade, blur level and logo alpha are checked against the arguments their functions received: 30
fade rectangles, 33 blur calls, 120 logo draws, all equal.

## 4. The objects

### 4.1 Glass cubes (*verified*: `verify_opening_cubes.mjs`)

Five cubes, each `func_00220450(work record, n)`: transform (`func_00224EB8`), frame copy
(`module_opening_225728`), ten passes. Mesh: 8 corners at +-1.8 (`func_002245C0`), 6 faces of 4
corners (`D_002B1D10`); colour of every cube (112, 112, 152, 128) (`D_002B2120`).

Set-up (`InitLightsCubes` `0x002209E0`, *read*): place = (3.5 x, 3.5 y, 150 - 15 z) of
`D_002B0F40[n]`; with `u = (n - 2) x D_0036FA50` (or `D_0036FA68` when that is 0): all three
angles start at `u x (n % 3) x D_0036FA54 + D_0036FA58`, rates = (`D_0036FA5C / u`,
`u x D_0036FA60`, `u / 1000 + D_0036FA64`). No random number: the cubes are the same every run.

Per frame (*verified*):

- Angles += rates, each wrapped to -pi..pi (`0x00224F08..0x00224FEC`).
- `sceVu0RotMatrix` of the angles (library; its result is a probed input), moved to the cube's
  place; `toScreen = worldToScreen x that`.
- Per corner: world position; unit direction from the eye (camera matrix, normalised); screen
  position divided by w; `q = 1/w`; 12.4 integers, z without its fraction.
- The cube is left out when no corner is inside the clip box (`sceVu0ClipAll` with
  `D_002B0C20`/`D_002B0C30`: x in 1728..2368, y in 1936..2160 times w, w in 5..16777215).
- Per face (`func_00224BC0`): normal = cross of two edges, in object, world and view space, each
  normalised; **facing** = cross of the two normalised screen-space edges (negative: turned
  away); colour clamped to 0..127; per corner the **edge term** `F = |normal . unit(corner -
  camera)|` in world space.
- Ten passes, in this order (descriptors built at `0x00220450..0x0022076C`; calls at
  `0x00220800..0x002209B4`). The first five draw the faces turned away into the extra buffer;
  the last five draw the faces turned to the camera into the frame:

| Pass | Faces | Texture | `ALPHA` | `PRIM` | Coordinates | Colour |
|---|---|---|---|---|---|---|
| 0 | away | the frame so far | `(Cs - Cd) x As + Cd`, `0x7A` | `0x94` | refraction, pull 0 | `(colour + 32 L) x 0x7A / 128` |
| 1 | away | 12 | `(Cs - 0) x As + Cd`, `0x80` | `0x54` | fixed, shift `D_0036FA38` | 0x80 |
| 2 | away | 10 | `(Cs - 0) x Ad + Cd`, `0x2A` | `0x54` | mirror, -0.25 | graded, x `0x2A / 128` |
| 3 | away | 11 | as pass 1 | `0x54` | fixed, shift `D_0036FA3C` | 0x80 |
| 4 | away | 10 | as pass 2 | `0x54` | mirror, -0.25 | as pass 2 |
| 5 | toward | the extra buffer | `(Cs - Cd) x As + Cd`, `0xF0` | `0x14` or `0x94` | refraction, pull `D_0036FA40` | `(colour + 32 L) x 0xF0 / 128` |
| 6 | toward | 12 | as pass 1 | `0x54` | fixed, shift `D_0036FA44` | 0x80 |
| 7 | toward | 10 | `(Cs - 0) x Ad + Cd`, `0x40` | `0x54` | mirror, 0.5 | graded, x `0x40 / 128` |
| 8 | toward | 11 | as pass 1 | `0x54` | fixed, shift `D_0036FA48` | 0x80 |
| 9 | toward | 10 | as pass 7 | `0x54` | mirror, 0.5 | as pass 7 |

  with `L = (1 - F)^2 / 2` per corner. In passes 0 and 5 `PRIM` has blending off (bit 6 clear):
  the refracted faces replace what is under them, and `ALPHA` only matters on antialiased
  edges; their fixed value is used by the colour formula. This is the clock rod's scheme: the far side refracts
  the picture into a work buffer, the near side refracts that buffer into the frame, and each
  side gets patterned and mirrored layers on top.
  - **Refraction** (`func_002246C8`): `u = (x - 2048) + W/2 + ((nx x 320) x q) x 4`,
    `v = (y - 2048) + H/2 + ((ny x 112) x q) x 4` with the face's view-space normal; then
    `+ (x - centre.x) x pull` and `+ (y - centre.y) x pull`, `centre` being the cube's origin on
    the screen; each kept in 1..W-1, 1..H-1. Sent as `S = u / 1024` (0..0.625) and
    `T = (v - half) / 256` (0..0.875), `Q` 1, `half` = 0.5 on the odd field for the near faces.
  - **Mirror** (`func_00224938`): `m = -|objectNormal . D_002B1DC0[face]| x value`;
    `S = (viewNormal.y x m + eye.y) + 0.5`, `T = (viewNormal.x x m + eye.x) + 0.5` (y and x
    change places), times `q`; `eye` = the corner's unit direction, normalised once more.
  - **Fixed** (`func_00224B10`): (0,0), (1,0), (0,1), (1,1) + shift in S, - shift in T, times `q`.
  - **Graded colour**: `c x ((L x D_0036FA1C) x slope + base) x fix / 128` with slope and base
    per channel from `D_0036FA20..34`; all colours end clamped to 0..0x80, alpha 0x80.
  - A refracting face is antialiased (`PRIM` bit 7) when it is turned away, or when its facing
    exceeds `D_0036FB80`.

**Measured, the whole intro**: 994 cubes drawn (95 left out by the clip test): angles 994 of
994; the two matrices 1 988 of 1 988; the centre 994 of 994; 75 544 values of the work record
(corners and faces) all equal; **9 940 vertex packets, 387 660 writes, all equal**; the pass's
`ALPHA` 9 940 of 9 940.

### 4.2 Light orbs and their trails (*verified*: `verify_opening_lights.mjs`)

`OpeningDrawLights` (`0x0021F5F8`). Four lights. With `t = counter + phase` (`phase` =
`D_00370A74` = `rand() % 0x929 + 0xD80`, set once in `InitLightsCubes`: **the lights differ
from run to run**), for light `i`:

```
A = ((float)(t + 17 i) x 0.01)  x (i + 10) x 0.1        B = ((float)(t + 15 i) x 0.005) x (i + 10) x 0.1
centre = ((10 - i) x cosf(A),  (i + 3) x sinf(B),  cosf(A) x 12 + 88)
```

- Each light keeps its last four matrices (`0x003DB8A0`, 4 x 0x40 per light) and draws **four
  pairs of sprites**, the oldest first: a coloured glow quad and a grey core quad
  (`D_002B0E70`), triangle strips `PRIM 0x5C`, texture 8, blend `(Cs - 0) x As + Cd`. Glow colour
  = the light's colour (`D_002B0E30[i % 4]`) / 2, core 0x808080; alpha = 24 (glow) or 12 (core)
  x (age + 1) / 5 with age 0 for the oldest. A pair's quad is left out when all its corners fail
  the clip test.
- Each light writes its screen position into a ring of 128 (`0x003DBCA0`, head `D_003700B0`,
  tail `D_003700AC`), one entry a frame. The **trail** is a line strip `PRIM 0x18A` from the
  newest entry back, a vertex at every eighth entry: colour = the light's colour x level / 128,
  alpha = 2 x level, `level = ((length - step) x 64) / length`. A vertex off the picture
  (x outside 0..640, y outside 0..224, depth below 5), or whose predecessor's y was, is sent
  with `XYZF3` so nothing is drawn to it.

**Measured, the whole intro**: 218 frames (all in which the lights are drawn): 3 488 sprite
packets (101 712 writes) and 872 trail packets (20 968 writes), all equal; 244 quads left out by
the clip test and 137 trail vertices sent without drawing, both branches exercised. `cosf` and
`sinf` results are probed (within 2 steps of the nearest singles of the true values).

### 4.3 Fog (*verified*: `verify_opening_fog.mjs`)

`OpeningDrawFog` (`0x0021E168`). A 17 x 17 mesh at `0x003D80C0` (x = column x 6 - 48, y = row x
6 - 48, z 134, plus a small shift that depends on the counter at set-up; built by
`func_0021DEA8`, *read*) with a radial brightness per point (`0x003D92D0`, word `+8`). Six
layers, layer `n`:

- texture `D_003653E8[n]` (5, 3, 2, 5, 3, 2), bilinear, repeat; blend `(Cs - 0) x 20/128 + Cd`
  (added); depth write off;
- z lowered by `5 n`;
- scroll: `offset[n] += (14 - n) x 0.0001 x (n + 1) x 0.5`, minus 1 when above 1;
- each quad `PRIM 0x5C` unless all four corners fail the clip test; per corner
  `S = ((corner's column bit) x 0.5 + (column & 1) x 0.5 - offset) x q`,
  `T = ((corner's row bit) x 0.5 + (row & 1) x 0.5) x q`,
  colour (level / 4, 2 level / 5, level), alpha 0x80.

**Measured, the whole intro**: 246 frames, 25 092 packets, 1 657 196 writes, all equal; 127 136
quads drawn and 250 720 left out by the clip test; the offsets carried from frame to frame in
1 470 of 1 470.

### 4.4 The ghost and the logo (*verified*: `verify_opening_overlays.mjs`)

- **Ghost** (`func_0021D140(1, 2, 0x50, 0xFFFFFF, 0x80)`): one sprite over the whole picture
  from the store (`TEX0` = the buffer at `0x002B0C48`, here `0x2300`; bilinear), blend
  `(Cs - Cd) x 0x50/128 + Cd`, grey 0x80, depth write off and depth test always around it. The
  store is the frame at **half its width**: `func_0021CF38` copies the frame into it (640 x 224
  into 320 x 224) right after the ghost is laid and before the fog, the lights and the cubes
  are drawn. So what trails is only what is drawn before it, the towers (and the trail itself),
  at 62.5% a frame, softened sideways; with no towers the ghost is black over black.
- **Logo** (`func_0021D990`): texture 0 (256 x 64), two rectangles 256 x 16 at (120, 105) and
  (326, 105) (NTSC) from texture rows 1..30 and 33..62, blend `(Cs - Cd) x As + Cd` with the
  alpha of section 3 as fixed value and vertex alpha, z `0xFFFFFE`.

**Measured, the whole intro** (`hddosd-110U-opening-full2`): 246 ghost packets and 120 logo packets, 5 370 writes, all equal.

The blur (`func_0021D3D0`), the frame copy, the fade rectangle's packets, the letterbox bars and
the towers' state packets are **only read and measured as register lists** (section 2): their
packets are not recomputed. The fade's and the blur's arguments are verified (section 3).

## 5. The towers and VU1 (*verified for what the microprogram does*: `verify_opening_towers.mjs`)

- The microprogram is in `References/model/opening-vu1-microprogram.json` with a disassembly
  (`extract_opening_vu1.mjs`, from the upload chain at `0x002A47A0`: 229 instructions at 0). It
  has three parts:
  - 0..25, called once per tower (`MSCAL 0`): multiplies entries 0..3 by 4..7 into 22..25
    (world-to-screen x the tower's matrix), loads the light colour matrix (8..11), the light
    direction matrix (12..15), the bounds (16, 17) and a parameter (21), and kicks the packet at
    18 (`ALPHA`, `PABE`);
  - 33..96, one face (continued with `MSCNT`): per vertex `p = M x position`, `q = 1/p.w`,
    `p.xyz x q`; `ST x q`; `n = max(N x normal, 0)`; colour = vertex colour x (`L x n`),
    truncated; position to 12.4 integers. A vertex outside the bounds (x, y, w) is written
    without the drawing kick, and so are the two after it; it keeps the colour of the vertex
    before it;
  - 99..198, the same with the coordinates moved by the normal (`S += n.x x k.x x q`,
    `T -= n.y x k.y x q`, `k` = entry 21); taken when entry 21's first word is not zero.
- The EE fills a VIF1 chain at `0x002A4EE0` per tower (22 entries of matrices and parameters,
  then six faces of 4 vertices: tag, positions, normals, colours, coordinates) and starts it at
  `0x002219C0`. The tower's box is 4 x 4 x 60 in the template (+-2, +-2, +-30); faces alternate
  between VU1 addresses 0 and 0x200 (double buffer).
- The verifier walks the chain as it stood when started, runs a model of the three parts written
  from the disassembly, and compares the kicked packets with the trace's PATH1 packets.

**Measured** (from the saved state with 13 towers): `-towers2` 104 towers, 728 packets, 8 320
writes; `-towers3` 91 towers, 637 packets; `-towers4` 104 towers, 728 packets: **all equal**.
Every face went through the plain routine and every vertex was inside the bounds, so the
out-of-bounds path and the moved-coordinates routine are **modelled from the disassembly but
not exercised**.

**Not verified**: how the EE fills the chain (`func_002214F8` `0x002214F8`, `func_002210B0`,
`func_00221140`, `func_00221248`, `func_00221400`): the tower's matrix and sway, its height from
the play count, the brightness table, the texture rows. That part stands as read in
`opening-map.md`, section 3.2.

## 6. ROM 2.30

The intro is there too, the drawing code the same up to data addresses: light orbs `0x0021ACF0`
(14 words differ of 0x8C0 bytes), fog `0x00219778` (9), cube draw `0x0021BB48` (13), cube
transform `0x002205B0` (15), face emitter `0x00220B88` (1), per-vertex callback `0x0021B5B0`
(1), towers `0x0021CBF0` (15) (`diff_rom.mjs`, which ignores call targets and upper
immediates). **The update function differs** (`0x0021A510`: 421 of 445 words; the stage
handlers are other code) and so does the ghost (`0x00218780`, 77 words). Nothing of the intro
was run on ROM 2.30.

## 7. Where `opening-map.md` was wrong or short

1. **The texture coordinates of the cubes are not built from the vertex normal.** The callback
   at `0x0021FEB8` only scales and clamps: `/1024` and `/256` turn buffer pixels into
   coordinates of the 1024 x 256 buffer (0.625 = 640/1024, 0.875 = 224/256), and the `0.5` is
   half a line on the odd field. The coordinates themselves come from the three generators of
   section 4.1.
2. **`D_002B2120` is the cubes' colour**, (112, 112, 152, 128) five times, not sixteen vertices.
3. **The ten passes** are fully identified (section 4.1), and textures 10, 11, 12 are the cubes'
   (mirror map and the two fixed patterns); the reading had them as not determined.
4. **The trail is a line strip** with a vertex every eighth ring entry, not points; and each
   light draws four sprite pairs from its last four matrices (the "four sub-layers").
5. **The intro's length**: the reading's simulation gave about 250 frames with a disc and 700
   without. Measured with no disc in the emulator: 246 drawn frames, because the disc state is
   0x64 and that state is in the list that releases stage 1 after 2 seconds.
6. **The blur starts at z 68**, not 56: level = (int)((z - 56) / 12) and level 0 draws nothing.
7. **The logo's four rectangles** are two for NTSC and two for PAL, not four drawn together.
8. The fog's leading code computes `105 - z` and then overwrites it: the layer alpha is always
   20.
9. The integrator's formulas in the reading are right in value; the operation order that gives
   the exact bits is the one in section 3.
10. The ghost's store is half as wide as the frame (the reading inferred the ghost, not this).
11. The microprogram has no `CLIP`: it rejects by the sign flags of two subtractions.

## 8. Not verified, plainly

- The EE side of the towers (section 5) and everything about towers beyond 13 cells of one
  history; the microprogram's two unexercised paths.
- The blur, the frame copy, the fade rectangle's and the bars' packets (registers measured, not
  recomputed).
- Library arithmetic taken as probed input: `sinf`/`cosf`, `sceVu0RotMatrix` (the cubes' turn
  matrix), `sceVu0CameraMatrix`, `sceVu0ViewScreenMatrix` and their product.
- Tables built at set-up and taken as probed input: the fog mesh and its brightness, the cube
  corners; their rules are read, not recomputed.
- The "illegal disc" scene (module 4), PAL, the hard-disk boot branches of stage 1 and 2, any
  disc state other than 0x64, stages past 3.
- The hand-off itself (`opening_transition_to_clock`) and the black frames between the last
  intro frame and the clock's first.

## 9. Files

- Scripts (`References/scripts/`): `extract_opening_frame_map.mjs`, `verify_opening_camera.mjs`,
  `verify_opening_lights.mjs`, `verify_opening_fog.mjs`, `verify_opening_cubes.mjs`,
  `verify_opening_overlays.mjs`, `verify_opening_towers.mjs`, `extract_opening_vu1.mjs`,
  `extract_opening_tables.mjs`. Each verifier exports `PROBES`; a probe takes at most 8 ranges
  and a capture at most 32 probes, and two verifiers that probe the same address
  (`0x0021D990`: camera and overlays) cannot share a capture.
- Model data (`References/model/`): `opening-vu1-microprogram.json`, `opening-tables.json`
  (static tables and constants from the ELF).
- No change to `facts/`, to the existing verifiers, to `watson.json` or to Watson; no commit.
