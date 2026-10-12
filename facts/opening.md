# The opening intro

Builds: **HDD OSD 1.10U** (canon; every address is its unless "ROM" is written) and **ROM 2.30**.
*Verified* means a script recomputes it bit for bit from probed inputs (the script and a capture
are named); *measured* means seen in a capture and not recomputed; *read* means taken from the
disassembly (address range given). The static reading of the module is
`References/readings/opening-map.md`; every statement here that it contradicts comes from a
measurement. Video mode is NTSC unless "PAL" is written; PAL is collected in section 7 and in
[pal.md](pal.md).

The module (`opening`, one thread) runs two scenes: scene 0, the intro (module 1, boot argument
`BootOpening`), and scene 1, the illegal-disc scene (module 4, `BootWarning` / `BootIllegal`;
section 9). The scene id is `D_00370004`, the next scene id `D_00370008` (2 ends the loop). No pad
input is read anywhere in the module (*read*: all 70 files of the module's disassembly).

## 1. How it is run and captured

- HDD OSD: `watson_launch { build: "hddosd-1.10U-host", args: "SkipSearchLater BootOpening" }`
  plays the intro; `BootIllegal` (same prefix) plays the illegal-disc scene. Under the
  interpreter (needed for a trace) the module's first frame is emulator frame 128; under the
  recompilers it is a few frames earlier.
- ROM 2.30: the intro plays on a plain power-on, no argument; the module's first frame is
  emulator frame 61.
- PAL: BIOS `ps2-0230e-20080220.bin` (BIOS 2.30 E) and `CLOCK_VIDEO=pal` for the verifiers.
- With an empty play history there are **no towers**: nothing takes PATH1 after the module's
  set-up. Towers need a saved state taken while paused at the entry of `OpeningInitTowersFog`
  (`0x00221D30`; ROM `0x0021D428`) with the history table written (`0x001F0198`; ROM
  `0x001F0138`); writing the table earlier does not work, it is cleared again before the intro
  starts. States (`Watson/Runtime/states/`, none in `watson.json`; launch with `state: <path>`):
  `hddosd-1.10U-host-opening-towers.p2s` (five entries, play counts 1, 5, 13, 30, 127, cell masks
  0x01, 0x03, 0x3F, 0x07, 0x01, 13 towers), `hddosd-1.10U-host-opening-towers-full.p2s` and
  `rom-0230A-opening-towers-full.p2s` (21 entries, every mask 0x3F, counts 1 .. 255, 126 towers).
- The disc state (HDD OSD `0x001F000C`, ROM `0x001F0010`) does not hold when written: the
  program rewrites it (HDD OSD writer `0x00211FD4`, ROM writer `0x0020F740`, `sw s1, 0x10(v0)`).
  It holds when that store is replaced by a nop. A code patch or a write made at emulator frame 1
  is lost (the OSD's code loads afterwards, and the module's start rewrites the disc state, for
  `BootIllegal` too): the stimulated captures patch and write at emulator frame 135 (HDD OSD;
  module counter = frame - 127) or 60 (ROM; module counter = frame - 61), after the advance.
  What does hold without a patch is the hand-off's snapshot `D_003700A0`, written during the dive
  (section 8). A held disc state is occasionally not taken: each capture's branch listing in the
  verifier's output shows whether it was.
- The clock is forced when the word `0x002AD22C` is 0 (`enter_clock_module_208378` returns
  `word == 0`; ROM `0x0027B394`, read by `0x002058E0`); `main` writes 0 there through
  `enable_enter_clock_module_208398` when there is no configuration or a first run is forced.
  HDD OSD with `BootOpening` or `BootIllegal`: not forced (the word holds 1 in all 717 samples of
  `hddosd-110U-opening3-illdraw`; `enter_clock_module` returns 0 at `0x0021AEFC` in both hand-off
  captures; `verify_opening3_handoff.mjs` on `hddosd-110U-opening3-illegal` takes the table branch,
  "first-boot result 0"). Forced: written 0 at emulator frame 135 (`hddosd-110U-opening3-forced`).
  ROM 2.30: a plain power-on is forced (`rom-0230A-opening3-forced`, no stimulus).
- The hard-disk words (HDD OSD): ready `0x002AD230`, exec `0x002AD234`. While ready is non-zero
  `pad_handler_hddboot_check_20CC50` (`0x0020CC50`) rewrites exec every frame from the mailbox
  word `0x0038AD00`: mailbox 1 sets exec 1, mailbox -1 clears ready and sets exec -1, mailbox 0
  sets exec 0, and past `20 x fps` vblanks (1 200) it clears ready and sets exec -1 (*measured*,
  `verify_opening3_stages.mjs`, captures `-ready-a`, `-ready-b`, `-readyneg`). A write to exec is
  lost: the stimulus is the mailbox. ROM: ready `0x0027B398` (`0x00205910`), exec `0x0027B39C`
  (`0x00205920`).
- The CDDA count (HDD OSD `0x001F0D58`) is rewritten every frame by `sound_handler_2150D0` (store
  at `0x002151E4`, `sw v1, 0xC(s0)`); holding it needs that store nopped. ROM `0x001F0CF8` is
  stored by two copies of the sound-status snapshot, `0x002129D8` (function `0x002128E8`) and
  `0x0020FDB0` (function `0x0020FC90`, found with a write watchpoint on the recompiler build);
  both are nopped to hold it, one alone did not (*measured*; the second store is not resolved from
  the disassembly: its base is `s1`).
- A probe takes at most 8 ranges and a capture at most 32 probes. A probe armed before the trace
  carries state and no packets. Probes cannot be armed at a given frame inside a trace. Two
  verifiers that probe the same address (`0x0021D990`: camera and overlays) cannot share a
  capture.
- Captures (`Watson/Runtime/captures/`): `hddosd-110U-opening-full` (270 frames from emulator
  frame 120, the whole intro: camera, lights, fog, cubes), `-full2` (the same span: ghost, logo),
  `-timeline` (camera only), `-towers2` .. `-towers4` (from the 13-tower state),
  `hddosd-110U-opening2-*` and `hddosd-110U-opening3-*` (the later sets, named where used),
  `rom-0230A-opening2-*` and `rom-0230A-opening3-intro` (ROM).

## 2. What a frame is made of (*measured*: `extract_opening_frame_map.mjs`)

Everything but the towers goes PATH2 from the scratchpad, sent at once by the function that
builds it. Order within a frame (`OpeningDrawOpeningScene` `0x00221CB0`, then `OpeningDrawEnd`
`0x0021AD58`):

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

Textures (*read*: table `D_002AF870`, 21 entries of 0xF0 bytes, resource id at `+0x04`, size at
`+0x18/+0x1C`; loaded by `OpeningInitTextures` `0x0021B208`: tag 0 always, tag 1 only in scene 0,
tag 2 only in scene 1, tag 3 only in scene 1 for the entry `language + 13`):

| Index | Resource | Size | Used by |
|---|---|---|---|
| 0 | 35 | 256 x 64 | logo |
| 1 | 37 | 128 x 128 | illegal-scene tiles (section 9) |
| 2, 3, 5 | 29, 34, 30 | 64 x 64 | fog layers (`D_003653E8` = 5, 3, 2, 5, 3, 2) |
| 6 | 26 | 256 x 256 | towers |
| 8 | 36 | 64 x 64 | light sprites |
| 10, 11, 12 | 31, 27, 32 | 128 x 128, 64 x 64, 64 x 64 | the cubes' mirror map and the two fixed patterns (section 4.1) |
| 13..20 | 23, 19, 20, 25, 21, 22, 18, 24 | 512 x 128 | the illegal scene's banner, one per language |

## 3. The timeline (*verified*: `verify_opening_camera.mjs`, `verify_opening_stages.mjs`)

The module's update is `OpeningProcessInner` (`0x0021EF00`), once a frame; the frame counter is
`D_00370000` (+1 a frame in `OpeningDrawEnd`; it starts at the field parity `evenOddFrame`,
`0x001F0CA0`). State: block `B` at `0x003DB800` (accelerations `+0x00..+0x08`, velocities
`+0x10..+0x18`, steps `+0x20..+0x28`, roll acceleration `+0x38`, roll velocity `+0x48`, stage
`+0x50`), camera position `0x002B0C60`, roll angle `D_00370098`, up vector `0x002B0C80`. Fps for
the waits is 60 (NTSC) or 50 (PAL).

**Stage selection** (*read* `0x0021EF4C..0x0021EFA4`):

```
if ((float)threshold[stage] < camera.z) stage++     D_002B0E08: 16, 56, 104, 320, 672, 800, 1160, 1160
jump jtbl_00365400[stage]
```

| Stage | What it does |
|---|---|
| 0 | nothing |
| 1 | the wait (below) |
| 2 | the decision and the dive (below) |
| 3 | the function returns scene + 1: **the intro ends** |
| 4, 5 | nothing (the illegal scene's range) |
| 6 | the illegal scene's end sequence (section 9) |
| 7 | `OpeningInitAnimation` and the result 2 |

**Stage 1**, not booting from the hard disk (*verified*, capture `hddosd-110U-opening3-intro`):

```
B+0x08 = 4e-7                                      (z acceleration)
if discState is one of {0x64, 0x6A..0x70, 0x72..0x74} and counter > 2 x fps (120): go = 1, stage++
```

States 0x65..0x69 and 0x71 hold the stage until the camera crosses threshold 1 by itself (*verified*,
`verify_opening3_stages.mjs`: `hddosd-110U-opening3-disc65-b` holds stage 1 until z > 56 at module
counter 617 and then dives, 135 frames; `-disc69` 173 frames; `-disc71` 166 frames; hand-off module
2 in each).
Booting from the hard disk (`is_hdd_boot_ready` non-zero; *read* `0x0021EFAC..0x0021F078`):
`B+0x48 = 0.0004`; `B+0x18 = -0.00014` while the counter is below `20 x fps / 6` (200), else
2.5e-5; when `get_hddboot_exec` is non-zero `B+0x18 = 0.003`, go = 1, stage++; else past
`20 x fps` frames the ready flag is cleared. *Verified* (`verify_opening3_stages.mjs`, ready word
written 1 at frame 135): `-ready-a` (exec 0, waiting, 86 frames), `-readymid` (counter 171..209,
across the `20 x fps / 6` switch of `B+0x18`, 106 frames), `-ready-b` (mailbox 1: exec set, go,
`B+0x18` = 0.003; 101 frames), `-readyneg` (mailbox -1: ready cleared, exec -1; 210 frames),
`-readyclear` (pad handler `0x0020CC50` replaced by `jr ra`, because its own clear comes first at
vblank 1 200: stage 1's own clear of the ready flag at counter 1 201; 134 frames).

**Stage 2** (*verified*, `hddosd-110U-opening3-intro` and the stimulated captures below; code
`0x0021F0F8..0x0021F258`):

```
if counter > 10 x fps (600): go = 1
if go:
  first time (pending = 1):
     clock forced:                      sound 0x6140,1; the snapshot D_003700A0 is left alone
     hard-disk ready and exec == 1:     sound 0x6150 (..., 0xF)
     else: D_003700A0 = discState; by disc - 0x6A (jtbl_00365470):
           0x6A, 0x6B, 0x72, 0x73 -> 0x6150,F;  0x6C..0x6E -> 0x6140,7 then 0x6150,0x11;  the rest -> 0x6140,1
     pending = -1
  every frame: B+0x10 = B+0x14 = B+0x30 = B+0x34 = 0, then
     not hard-disk: B+0x18 = 0.0099 (z velocity), B+0x38 = 0.000195 (roll acceleration)
     hard-disk:     B+0x08 = 4e-4, B+0x38 = 8e-5
```

Every branch of stage 2 is *verified* by `verify_opening3_stages.mjs`, which compares each sound
command the handler sends (`sound_handler_queue_cmd` `0x00200C00` and `sceSdRemote` `0x00294738`,
told apart by the return address) with the computed command, argument registers and call site, in
captures that write the state after the advance (section 1):

| Capture | Stimulus | Branch reached | Frames |
|---|---|---|---|
| `-enter` | disc state 0x64 held | the table's default: `0x6140,1` from `0x0021F200`; hand-off module 2 | 229 |
| `-disc6c`, `-disc6d`, `-disc6e` | that disc state | `0x6140,7` then `0x6150,0x11`, both sends equal; hand-off execute 1, 1, 0 | 229 .. 239 |
| `-disc6a`, `-disc6b`, `-disc73` | that disc state | `0x6150,0xF`; hand-off execute 2, 2, 3 | 229 .. 239 |
| `-disc6f`, `-disc70` | that disc state | `0x6140,1`; hand-off execute 5, 4 | 229 .. 239 |
| `-ready-b` | ready 1, mailbox 1 | `0x6150,0xF`, snapshot untouched; hard-disk velocities; hand-off module 0, execute 6 | 101 |
| `-forced` | `0x002AD22C` = 0 | `0x6140,1` from `0x0021F158`, snapshot left 0; plain velocities; hand-off forced-clock exit | 238 |

In every row the stage handlers, integrator and result are equal in every probed frame.

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

The matrices follow (`0x0021F528..0x0021F5C0`, *verified* by `verify_opening_inputs.mjs`):
`sceVu0NormalLightMatrix`, `sceVu0CameraMatrix(camera, view direction (0,0,1), up)`,
`sceVu0ViewScreenMatrix` (screen distance 1024, `ax` = `D_00370030` = 1, `ay` = `D_00370034`,
centre 2048, z range 1 .. `D_0036FA08`, near 1, far 65536), and their product, world-to-screen.
`ay` is `D_0036F984` in NTSC and `D_0036F980` in PAL (`InitDoubleBuffer`, *read*).

The scene set-up runs between the first and the second call (`OpeningInitOpeningScene`
`0x00221BB8`): camera (0, 0, 16), view direction (0, 0, 1), up (0, 1, 0), roll -0.12. `B` starts
with step z 0.04 and roll velocity 0.001 (`OpeningInitAnimation` `0x0021EE48`).

**Measured, the whole intro** (`hddosd-110U-opening-full` and `-timeline` for
`verify_opening_camera.mjs`; `hddosd-110U-opening3-intro` for `verify_opening_stages.mjs`): 247
calls; stage handlers, integrator and return value equal bit for bit in all 247; the state is
untouched between calls in 245 and the 246th gap is the scene set-up. The up vector's sine and
cosine are modelled from the library's instructions (section 4.6).

| Module counter | What happens |
|---|---|
| 1 | first call; fade rectangle alpha 0x80 (drawn while counter < 2); disc state 0x65 |
| 2 | camera at z 16.04, roll -0.119; disc state 0x64 from here on |
| 3 | stage 1 (z > 16) |
| 51..170 | logo: its value walks +4 a frame to 0xF0, then -4 to 0; alpha = min(0x70, value); 120 draws. It starts on the first frame with z > 18 (`func_0021DB50` `0x0021DB50`) |
| 121 | stage 2 and `go` (counter > 120 with disc state 0x64): the dive starts, z 20.9 |
| 214 | blur level 1 (z 68.6); level = (int)((z - 56) / 12), at most 3, level 0 draws nothing (`func_00221A50`) |
| 218 | fade starts: alpha = (uint)((z - 72) x 128 x 0.03125) (`func_00221B00`); last frame of lights and cubes (z < 73) |
| 226, 236 | blur level 2, 3 |
| 246 | last drawn frame: z 104.85, fade argument 131, which the rectangle caps at 0x80: black |
| 247 | stage 3: the scene ends; `opening_transition_to_clock` follows (section 8) |

So the intro is **246 drawn frames** in this run. The length depends on the disc state: 0x64 is
what the emulator reports with no disc, and it is one of the states that release stage 1 at
counter 121. With a state that holds stage 1 (0x65..0x69, 0x71) the camera reaches z 56 by itself
much later; that path is not exercised.

Fade, blur level and logo alpha are checked against the arguments their functions received: 30
fade rectangles, 33 blur calls, 120 logo draws, all equal. The scene's later stages (4 to 7) are
verified in the illegal-disc scene (section 9).

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
- `sceVu0RotMatrix` of the angles (library, section 4.6), moved to the cube's place;
  `toScreen = worldToScreen x that`.
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
  edges; their fixed value is used by the colour formula. This is the clock rod's scheme: the far
  side refracts the picture into a work buffer, the near side refracts that buffer into the
  frame, and each side gets patterned and mirrored layers on top.
  - **Refraction** (`func_002246C8`): `u = (x - 2048) + W/2 + ((nx x 320) x q) x 4`,
    `v = (y - 2048) + H/2 + ((ny x 112) x q) x 4` with the face's view-space normal; then
    `+ (x - centre.x) x pull` and `+ (y - centre.y) x pull`, `centre` being the cube's origin on
    the screen; each kept in 1..W-1, 1..H-1. Sent as `S = u / 1024` (0..0.625) and
    `T = (v - half) / 256` (0..0.875), `Q` 1, `half` = 0.5 on the odd field for the near faces.
    The per-vertex callback at `0x0021FEB8` only scales and clamps (`/1024` and `/256` turn
    buffer pixels into coordinates of the 1024 x 256 buffer; 0.625 = 640/1024, 0.875 = 224/256):
    the coordinates come from the three generators of this list, not from the vertex normal.
  - **Mirror** (`func_00224938`): `m = -|objectNormal . D_002B1DC0[face]| x value`;
    `S = (viewNormal.y x m + eye.y) + 0.5`, `T = (viewNormal.x x m + eye.x) + 0.5` (y and x
    change places), times `q`; `eye` = the corner's unit direction, normalised once more.
  - **Fixed** (`func_00224B10`): (0,0), (1,0), (0,1), (1,1) + shift in S, - shift in T, times `q`.
  - **Graded colour**: `c x ((L x D_0036FA1C) x slope + base) x fix / 128` with slope and base
    per channel from `D_0036FA20..34`; all colours end clamped to 0..0x80, alpha 0x80.
  - A refracting face is antialiased (`PRIM` bit 7) when it is turned away, or when its facing
    exceeds `D_0036FB80`.

**Measured, the whole intro** (`hddosd-110U-opening-full`): 994 cubes drawn (95 left out by the
clip test): angles 994 of 994; the two matrices 1 988 of 1 988; the centre 994 of 994; 75 544
values of the work record (corners and faces) all equal; **9 940 vertex packets, 387 660 writes,
all equal**; the pass's `ALPHA` 9 940 of 9 940.

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

**Measured, the whole intro** (`hddosd-110U-opening-full`): 218 frames (all in which the lights
are drawn): 3 488 sprite packets (101 712 writes) and 872 trail packets (20 968 writes), all
equal; 244 quads left out by the clip test and 137 trail vertices sent without drawing, both
branches exercised.

### 4.3 Fog (*verified*: `verify_opening_fog.mjs`)

`OpeningDrawFog` (`0x0021E168`). A 17 x 17 mesh at `0x003D80C0` (built at set-up by
`func_0021DEA8`, section 4.6) with a radial brightness per point (`0x003D92D0`, word `+8`). Six
layers, layer `n`:

- texture `D_003653E8[n]` (5, 3, 2, 5, 3, 2), bilinear, repeat; blend `(Cs - 0) x 20/128 + Cd`
  (added); depth write off. The function's leading code computes `105 - z` and overwrites it: the
  layer alpha is always 20;
- z lowered by `5 n`;
- scroll: `offset[n] += (14 - n) x 0.0001 x (n + 1) x 0.5`, minus 1 when above 1;
- each quad `PRIM 0x5C` unless all four corners fail the clip test; per corner
  `S = ((corner's column bit) x 0.5 + (column & 1) x 0.5 - offset) x q`,
  `T = ((corner's row bit) x 0.5 + (row & 1) x 0.5) x q`,
  colour (level / 4, 2 level / 5, level), alpha 0x80.

**Measured, the whole intro** (`hddosd-110U-opening-full`): 246 frames, 25 092 packets,
1 657 196 writes, all equal; 127 136 quads drawn and 250 720 left out by the clip test; the
offsets carried from frame to frame in 1 470 of 1 470.

### 4.4 The ghost and the logo (*verified*: `verify_opening_overlays.mjs`, `verify_opening_ghost.mjs`)

- **Ghost** (`func_0021D140(1, 2, 0x50, 0xFFFFFF, 0x80)`): one sprite over the whole picture
  from the store (`TEX0` = the buffer at `0x002B0C48`, here `0x2300`; bilinear), blend
  `(Cs - Cd) x 0x50/128 + Cd`, grey 0x80, depth write off and depth test always around it. The
  store is the frame at **half its width**: `func_0021CF38` copies the frame into it (640 x 224
  into 320 x 224) right after the ghost is laid and before the fog, the lights and the cubes
  are drawn. So what trails is only what is drawn before it, the towers (and the trail itself),
  at 62.5% a frame, softened sideways; with no towers the ghost is black over black.
- **Logo** (`func_0021D990`): texture 0 (256 x 64). The rectangle table `D_00365158` holds four
  rectangles (x, y, w, h): (120, 105, 256, 16), (326, 105, 256, 16), (120, 120, 256, 18),
  (326, 120, 256, 18); NTSC draws the first two, PAL the last two (the call takes the table 0x20
  bytes further, `0x0021DA10..0x0021DA20`). NTSC: texture rows 1..30 and 33..62, blend
  `(Cs - Cd) x As + Cd` with the alpha of section 3 as fixed value and vertex alpha, z
  `0xFFFFFE`.

**Measured, the whole intro** (`hddosd-110U-opening-full2`): 246 ghost packets and 120 logo
packets, 5 370 writes, all equal (`verify_opening_ghost.mjs` on `hddosd-110U-opening2-flat`: 246
ghosts). The logo in PAL: `verify_opening_overlays_v2.mjs` in NTSC and PAL, both equal.

### 4.5 The flat draws (*verified*: `verify_opening_flat.mjs`)

Each helper call is one packet (`vif1Set*`): `XYOffset`, `ZWrite` (`ZBUF_1` with or without the
mask), `ZTest` (`TEST_1 0x30000` or `0x50000`), `AlphaBlend`, `Framebuffer` (`FRAME_1`,
`SCISSOR_1` and, with clear 1, a sprite in primitive coordinates 0..W, 0..H between two `TEST_1`
writes), `CLAMP_1`, `AD`, `TexRect`, `FlatRect`.

- **Frame copy `func_0021CF38`**: offset without the field, depth writes off, the store
  (`D_002B0C48`) as target, `CLAMP_1 0` (HDD OSD only, section 6), `TEX0` = the page just drawn
  (`W x H / 64` when the counter is even, 0 when odd), `TEX1 0x60`, the whole picture drawn into
  the left half (`W/2 x H`), then the frame as target again. 10 packets.
- **Blur `func_0021D3D0(n, which, field)`**: n round trips; trip `i` draws the frame into the
  extra buffer (`gsExtraBuffers[0]`) shrunk to `(7W/8 - 1 - i(n - 1)) x (7H/8 - 1 - i(n - 1))`
  and that rectangle back over the whole frame. 9 + 6n packets (15, 21, 27).
- **Fade `func_0021D848(mode, alpha)`**: blend mode 4, a full-screen rectangle, black for 'B',
  white (`D_00365148`) for 'W', alpha at most 0x80. 6 packets. Only 'B' occurred.
- **Bars `func_0021D6C0`**: picture height `(int)(W x 9 x ay / (ax x 16))` (164 here), bars of
  `(H - that + 1) / 2` rows (30) above and below, blend mode 1 with fixed alpha 0x80. 8 packets.
- **Clear sprites** of `Framebuffer`: with `XYOFFSET_1` in effect they land at window
  (-1728, -1936)..(-1088, -1712) (PAL -1920..-1664), outside `SCISSOR_1` 0..639 x 0..223
  (*measured*, `extract_opening_clear.mjs`: 3 032 clear sprites in `hddosd-110U-opening3-pal-intro`,
  `hddosd-110U-opening-full` and `hddosd-110U-opening3-ill-map`, in every frame target): no
  pixel is drawn.

`hddosd-110U-opening2-flat` (the whole intro): 247 + 33 + 30 + 247 calls (557: frame copy 247,
bars 247, fade 30, blur 33), 5 313 packets, all equal.

### 4.6 Library results and set-up tables (*verified*: `verify_opening_inputs.mjs`)

Taken as probed input by the object verifiers and recomputed here (`hddosd-110U-opening2-inputs`,
85 792 values):

- **`sinf`, `cosf`**: modelled from the library's instructions (`References/model/
  opening-libm.mjs`: `__kernel_sinf`, `__kernel_cosf`, `__ieee754_rem_pio2f` up to
  2^7 x pi/2). The lights' 1 744 results, the roll's 988 + 486 + 30, the towers' 50, all equal.
- **`sceVu0RotMatrix`, `TransMatrix`, `MulMatrix`** (`References/model/opening-lib.mjs`): the
  cubes' turn, world, normals and screen matrices, 994 cubes (63 616 values); the towers' three.
- **`sceVu0CameraMatrix`, `sceVu0ViewScreenMatrix`, their product, `sceVu0NormalLightMatrix`**
  (section 3): 258 frames.
- **Fog mesh and brightness, `func_0021DEA8`**: 17 x 17 points
  `(j x 6 - 48 + 2 cos a, i x 6 - 48 + 2 sin a, 134, 1)` with `a = (counter x 0x33) & 0x3FFF`
  as a 16-bit angle through `func_0021B090` (a double product with pi/2, then `sinf`); the
  counter is **0** at set-up (*measured*). Brightness
  `clamp((R - 4 x dist((-5.1, 0), ((2j - 16) x 3 + 3, (2i - 16) x 3 + 3))) x 96 / R, 0, 127)`,
  stored as `(0, 0, level, 0x80)`. 1 156 + 1 156 values equal.
- **Cube corners and colours, `func_002245C0`**: corners `(+-s, +-s, +-s, 1)` with `s` =
  `D_0036FA4C` (1.8), colours `(128 - 16, 128 - 16, 128 + 24, 128)`, as `InitLightsCubes` passes
  them. In the module's first frames the tables still hold 1.2 and (128, 128, 128): the other
  caller, `func_00222BE8`, is the illegal-disc scene's set-up (section 9).

**The arithmetic helpers.**

1. A single-precision `+`, `-`, `/` or `sqrt` is **not always the double result cut toward
   zero**: when one addend is below the double's precision (`x + 1e-22`), the double sum is `x`
   and the cut is lost; the real result is one step nearer zero when the small addend has the
   other sign. `opening-lib.mjs` has exact `add`, `sub`, `quotient` and `root`.
   `extract_opening_exact.mjs` writes `verify_opening_{camera,camera_rom,cubes,fog,lights,
   towers,vu1}_v2.mjs`, which route every such operation through them; on every HDD OSD and ROM
   capture of this page they give the same counts as the plain versions. The plain helper's
   difference showed in three cubes of a ROM capture (the cosine of an angle within 0.006 of
   pi/2); the HDD OSD captures do not hit it.
2. A division by zero gives the largest single, not infinity (the first frame, before the
   camera is placed, normalises a zero vector and must give 0).

## 5. The towers and VU1

The microprogram is in `References/model/opening-vu1-microprogram.json` with a disassembly
(`extract_opening_vu1.mjs`, from the upload chain at `0x002A47A0`: 229 instructions at 0 on HDD
OSD, 464 words on both builds, the same bytes).

### 5.1 The microprogram (*verified*: `verify_opening_vu1.mjs`, `verify_opening_vu1_v2.mjs`)

Three parts:

- 0..25, called once per tower (`MSCAL 0`): multiplies entries 0..3 by 4..7 into 22..25
  (world-to-screen x the tower's matrix), loads the light colour matrix (8..11), the light
  direction matrix (12..15), the bounds (16, 17) and a parameter (21), and kicks the packet at
  18 (`ALPHA`, `PABE`);
- 33..96, one face (continued with `MSCNT`): per vertex `p = M x position`, `q = 1/p.w`,
  `p.xyz x q`; `ST x q`; `n = max(N x normal, 0)`; colour = vertex colour x (`L x n`),
  truncated; position to 12.4 integers. There is no `CLIP`: a vertex outside the bounds (x, y,
  w) is rejected by the sign flags of two subtractions and is written without the drawing kick,
  **and so are the three vertices after it** (`ISUBIU vi13`, instructions 77 and 142, is
  followed at once by `IBLEZ vi13`, so the branch reads the count as it was before the
  subtraction); it keeps the colour of the vertex before it;
- 99..198, the same with the coordinates moved by the normal (`S += n.x x k.x x q`,
  `T -= n.y x k.y x q`, `k` = entry 21); taken when entry 21's first word is not zero.

The EE fills a VIF1 chain at `0x002A4EE0` per tower (22 entries of matrices and parameters, then
six faces of 4 vertices: tag, positions, normals, colours, coordinates) and starts it at
`0x002219C0`. The tower's box is 4 x 4 x 60 in the template (+-2, +-2, +-30); faces alternate
between VU1 addresses 0 and 0x200 (double buffer). The verifier walks the chain as it stood when
started, runs a model of the three parts written from the disassembly, and compares the kicked
packets with the trace's PATH1 packets.

**Measured**, HDD OSD (state `hddosd-1.10U-host-opening-towers-full.p2s`): 10 428 towers in all.

- *A vertex outside the bounds happens in a real run.* With a full history, a trace of the
  whole intro (`hddosd-110U-opening2-whole`, no probes) has 209 034 PATH1 packets, 716 221
  vertices drawn and **467 sent without drawing**, from the 217th frame on (the end of the dive).
  `hddosd-110U-opening2-ee-late` covers those frames with probes: 3 780 towers, 26 460 packets,
  the 467 included, all equal. With the bounds written smaller (`0x002A5000` = 2300, 2150;
  `hddosd-110U-opening2-bounds`): 1 008 towers, 1 346 hidden vertices, all equal; 2 606 in all.
- *The routine that moves the coordinates with the normal cannot run in this program without a
  code patch*: it is taken when entry 21 is not zero, entry 21 is `0x002A5040`,
  `func_00221140` clears it for every tower, and nothing else in the disassembly refers to it.
  With the four stores (`0x0022117C`, `0x00221198`, `0x002211A8`, `0x002211B4`) replaced by nops
  and (0.05, 0.08) written there: `hddosd-110U-opening2-moved` 1 008 towers, 6 048 faces, all
  equal; with the smaller bounds as well (`hddosd-110U-opening2-moved-bounds`), 1 260 hidden
  vertices, all equal; 12 096 faces in all. The model of that routine is right, and the
  routine is dead code in the unpatched program.
- From the 13-tower state: `-towers2` 104 towers (728 packets, 8 320 writes), `-towers3` 91
  towers (637 packets), `-towers4` 104 towers (728 packets), all equal
  (`verify_opening_towers.mjs`: plain routine, every vertex inside the bounds).

**Measured**, ROM 2.30 (state `rom-0230A-opening-towers-full.p2s`): 1 512 towers in 12 frames,
the plain routine, every vertex inside, all equal.

### 5.2 The EE side (*verified*: `verify_opening_towers_ee.mjs`)

**Set-up, `OpeningInitTowersFog` (`0x00221D30`).** The play history at `0x001F0198` is 21
entries of 22 bytes: a name (an entry whose name equals the empty string at `0x003700D0` is
skipped), `+0x10` play count (+1 per launch, capped at 0x7F), `+0x11` mask, `+0x12` main cell.
`D_002B0F90` gives each entry six `(column, row)` cells of the 14 x 9 grid
(`References/model/opening-towers.json`; the 21 entries cover the 126 cells once). For cell `k`
of an entry:

- `k` = main: the tower exists; `sway = D_002B1C10[i]`, `tall = D_002B1C48[i]` with
  `i = count` below 14, else `((count - 14) % 10) + 4`. The curves: sway 0.2, 0.4, 0.6, 0.8,
  then 1; tall 0.1 five times, then 0.2 .. 1.0.
- else, when bit `k` of the mask is set: the tower exists with sway 1 and tall 1.

Then for every cell: place = `((x + 4.8) x 4, (y - 6.5) x 4, (z + 4) x 12 + 150)` from
`D_002B13A0`; height `h = max(tall x 30, 3)` (`D_003DF2F8`); `place.z += sway x 30 - h`; when
`sway >= 1` the fade count (`D_003DF100`) is 0, else `(int)((1 - sway) x 128)`. The flags are
at `D_003DDCA0` (stride 0x50), sway at `D_003DF4F0` and tall at `D_003DF800` (stride 0x38).

**Brightness, `func_00220D60`.** A 20 x 20 table `D_003DE2E0[j][i]`: with `R = sqrt(5202)`,
`p(n) = (2n - 20) x 5.1 x 0.5 + 2.55`:
`first = clamp((R - 2 x dist((-5.1, 0), (p(j), p(i)))) x 255 / R, 32, 255)`,
`second = clamp((R - 4 x dist((10.2, 5.1), (p(j), p(i)))) x 255 / R x 0.5, 32, 255)`,
`value = clamp((first + second) x 0.85 - ((((j + i) x j / (i + 1)) % 11) - 5) x 10, 32, 220)`.
A tower at `(column, row)` uses `[column + 3][row + 6]`.

**Per frame, `func_002214F8`.** One pass over the grid, column by column, row by row: a cell is
drawn when its flag is set and its distance key `|dx| + |dy|` from the camera is above 0. (The
function computes the largest key and loops "from far to near", but the loop starts at 0 and
runs once: **there is no sorting**, read at `0x00221694` and measured: 47 whole frames in that
order.) With `s0 = column + 3`, `s2 = row + 6`, `s1 = s0 + s2`:

- turn about z = `((s1 x s0 / (row + 7)) % 4) x pi/2`, plus, when the cell's sway factor is not
  1, `sinf(((counter % 360) - 180) x pi/180) x 10 x pi/180` (a swing of +-10 degrees);
- `sceVu0RotMatrix` of that on the scratch block's base matrix, `sceVu0TransMatrix` to the
  place, `sceVu0MulMatrix` of the light matrix with the turn; `func_002210B0` copies
  world-to-screen (`+0xC0`), the tower's matrix (`+0x80`) and the light matrix (`+0x180`) into
  the chain's entries 0..3, 4..7, 12..15;
- `func_00221140`: the packet at entry 18 (`ALPHA_1 0x80_00000044`, `PABE 0`) and **entry 21
  cleared**; `func_002211B8`: each face's tag (4 vertices, `PRIM 0x9C`, `ST RGBAQ XYZF2`);
- `func_00221248`: brightness `b = table x (fade count ? count / 128 : h / 30)`; each vertex's
  z is `+h` or `-h` by `D_002B1B80`; colour 0 where z is `+h`, else `b` on face 0 and
  `b x 0.8` on the others; alpha 128;
- `func_00221400`: one texture cell per tower, `v = (s1 x (s0 + 5) / (row + 7) + s1 x (s0 + 4) /
  (row + 9)) / 256`, corners `(v, v) .. (v + 1, v + 1)`.

The verifier builds the whole 0x840-byte chain from the file's bytes and these rules and
compares it with the chain as started. HDD OSD (state `-towers-full`: 126 towers):
`hddosd-110U-opening2-ee-a` 1 260 chains, `-ee-b` 1 260, `-ee-late` 3 780 (6 300 chains in 50
frames, every word); set-up tables 126 of 126 each and 504 place values, brightness 400 of 400,
50 `sinf` results. ROM 2.30: 1 512 chains in 12 frames, set-up and brightness tables equal.

## 6. ROM 2.30

The intro plays on a plain power-on (no argument): logo at emulator frame 150, the clock at 453
(`rom-0230A-opening2-{150,250,350,450}.png`).

**How it is run through the HDD OSD verifiers.** `extract_opening_rom_map.mjs` finds each
function of the opening and graph modules in a ROM memory dump and pairs every address the two
builds' code forms (`References/model/opening-rom-map.json`: 497 functions the same code, 1 099
addresses; ROM gp `0x002CFEF0`, HDD OSD gp `0x00377970`). `extract_opening_rom_trace.mjs` moves a
verifier's probes to the ROM (`plan`) and rewrites the captured trace back into HDD OSD's
addresses and layout (`back`), so the unmodified verifiers run on it. Where the layout differs a
range is rebuilt in pieces: the module's variables have 8 more bytes after `+0x94` in the ROM,
the screen size is 4 bytes nearer the buffer index, the disc state is at `0x001F0010`.
`OPENING_BUILD=rom` selects the ROM for the towers, the flat draws and the ghost.

**Same code** (words differ only in addresses): towers `0x0021CBF0`, set-up `0x0021D428`,
brightness `0x0021C458`, lights `0x0021ACF0`, fog `0x00219778`, cube transform `0x002205B0`,
cube draw `0x0021BB48`, face emitter `0x00220B88`, per-vertex callback `0x0021B5B0`, fade
`0x00218E58`, bars `0x00218CD0`, logo `0x00218FA0`, fog mesh `0x002194B8`, corners
`0x0021FCB8`, `sinf` `0x0025FFD8`, libvu0 (`diff_rom.mjs`). The microprogram (464 words), the
`npio2` table and the tower chain's template (but its one pointer) are the same bytes.

**Different** (*read* and *verified*):

- **`CLAMP_1 = 0` is sent by HDD OSD only**, in three places: the frame copy (ROM
  `0x00218590`), the blur (ROM `0x00218A00`) and the ghost (ROM `0x00218780`) are the same
  instructions without that one call. *Measured on both* (`verify_opening_flat.mjs`,
  `verify_opening_ghost.mjs`).
- **The update function** (ROM `0x0021A510`, 504 words against 445; 412 in common). Same
  integrator, constants, thresholds and matrix build. The stage counter starts at 0 and takes a
  frame to become 1 (stage 0 starts the scene, it sets pending = 1), so stages are one higher
  than HDD OSD's and stage n's threshold is entry n - 1 of the same table. Disc-state tables
  have 18 entries including 0x75. Stage 3 (HDD OSD's 2) has a countdown HDD OSD lacks (two
  variables at `0x002C8694`) and stage 2 a hard-disk hold HDD OSD lacks (below). Where HDD OSD
  reads `0x002AD22C` to know the clock is forced, the ROM calls `0x002058E0`; a power-on in the
  emulator is a first boot (forced clock), and the disc state is then not kept.
  `verify_opening_camera_rom.mjs` on `rom-0230A-opening2-camera-as-hdd` and
  `verify_opening_stages_rom.mjs` (handlers read at `0x0021A510..0x0021AA70`) on
  `rom-0230A-opening3-intro`: **359 frames** (the whole intro), stage handlers, integrator and
  result all equal; 31 fades, 35 blurs, 120 logo alphas.
- **The ROM's intro is 359 frames here against HDD OSD's 246, by the same rules**: the drive
  reports state 0x65 until module counter 237 and only then 0x64, the state that releases the
  wait; the dive starts at counter 239 (HDD OSD: 121).
- **The hand-off function** is other code (ROM `0x002164A8`, section 8).

**Per verifier on ROM 2.30** (captures `rom-0230A-opening2-*`, rewritten as `*-as-hdd`, and
`rom-0230A-opening3-intro-as-hdd`):

| Verifier | `opening2` | `opening3-intro` |
|---|---|---|
| `verify_opening_towers_ee.mjs`, `verify_opening_vu1.mjs` (state `rom-0230A-opening-towers-full.p2s`) | 1 512 chains / towers in 12 frames, set-up and brightness tables equal | not run |
| `verify_opening_lights.mjs` | 318 frames, 5 088 sprite and 1 272 trail packets | 329 frames |
| `verify_opening_fog.mjs` | 347 frames, 35 394 packets | 358 frames |
| `verify_opening_cubes.mjs` | 1 490 cubes, 14 900 packets | 1 540 cubes |
| `verify_opening_overlays.mjs` | logo 120 (the ghost half models HDD OSD's call sequence, with the extra `CLAMP_1`, and does not apply) | logo 120 |
| `verify_opening_ghost.mjs` | 358 | 358 |
| `verify_opening_flat.mjs` | 784 calls: copy 359, bars 359, fade 31, blur 35 | 784 |
| `verify_opening_camera_rom.mjs` | 359 frames | 359 frames |
| `verify_opening_inputs.mjs` | fog mesh and brightness, cube tables, 359 frames of matrices, 1 436 roll and 2 544 light sines and cosines, 1 490 cubes' matrices (124 680 values) | 127 250 values |
| `verify_opening_handoff_rom.mjs` | not run | 1 hand-off (section 8) |

Every verdict above is `FOUND`.

**Fade and bars counts.** `verify_opening_flat.mjs` (`OPENING_BUILD=rom`) counts fade 31 and
bars 359 on `rom-0230A-opening3-intro-as-hdd` and on `rom-0230A-opening2-flat-as-hdd` (the whole
intro; the fade records are at frames 63 and 391..420, the bars records at 63..420), and fade 30
and bars 348 on `rom-0230A-opening2-scene-as-hdd`, whose trace starts at frame 72: it misses the
frame-63 fade, the bars of frames 63..72 and the bars record at frame 73, which is a pre-armed
record (state only, no packets, skipped by the verifier). The code is the same and the verdict is
`FOUND` in all three; `verify_opening_stages_rom.mjs` on `rom-0230A-opening3-intro` counts 31 fade
alphas equal. The ROM intro has 31 fades and 359 bars.

**The stage machine and hand-off, stimulated** (`verify_opening3_stages_rom.mjs`,
`verify_opening3_handoff_rom.mjs`; captures `rom-0230A-opening3-<name>`, `rom-0230E-opening3-pal-<name>`;
the writes are made at emulator frame 60, section 1). Sound commands go through `queue_cmd`
`0x00200BE8`, told apart by the return address (eight call sites from `0x0021A7E0` to `0x0021AA24`),
including the illegal scene's end wait (`0x5015,6,0,0xF` from `0x0021AA24`, where HDD OSD calls
`sceSdRemote`). Every row below is `FOUND` (stages and hand-off); sounds are compared in command,
argument registers and call site:

| Capture | Stimulus | Branch reached | Result |
|---|---|---|---|
| `-forced` | none | stage 3 forced clock: `0x5014,1` from `0x0021A7E0`; hand-off forced-clock exit (execute -1, module 2, previous 1) | 359 frames |
| `-forcedsnap` | snapshot 0x6C | the forced exit wins over the table (execute -1, module 2) | hand-off equal |
| `-forcedexecsnap` | exec 1, snapshot 0x6C | exec 1 turns the exit off: table, execute 1, module 1 | hand-off equal |
| `-d6a`, `-d6b`, `-d6d`, `-d6e`, `-d6f`, `-d70`, `-d72`, `-d73`, `-d75` | that disc state | the table; hand-off execute 2, 2, 1, 0, 5, 4, -1 (module 2), 3, 3 | equal |
| `-count`, `-d6d` | disc 0x6C, 0x6D | stage 3: `0x5014,7`, `0x5015,10`, a countdown of 58 frames, `0x5015,7,11` (3 sends equal) | 236, 238 frames |
| `-d71` | disc 0x71 held | the table; hand-off module 2 | equal |
| `-d71z` | 0x71 held, z written 60 | stage 3 first time by the table, `0x5014,1`, plain velocities | 67 frames |
| `-readyexec` | ready 1, exec 1 | hand-off: hard-disk ready, exec 1: execute 6, module 2 | equal |
| `-readyexecsnap` | ready, exec 1, snapshot 0x6C | execute 1, module 0 | equal |
| `-readyneg`, `-readynegsnap` | ready, exec -1 (snapshot 0x6C) | the table: module 2 (execute 1) | equal |
| `-readyexec2` | ready, exec 2 | exec 2 is not exec 1: module 2, execute -1 | equal |
| `-ready-b` | ready, exec 1 | stage 2 leaves when the drive count `0x0027C5D4` reaches 0x7C; `0x5015,f`; hard-disk velocities | 196 frames |
| `-ill72-c` | disc 0x72, CDDA count 1 | stage 7: `0x5015,6`, end after 0x80 frames; hand-off module 5 | 130 frames |
| `-ill74-c` | disc 0x74, end flag 2 written | stage 7 ends only once the flag is set (flag 2) | 60 frames |
| `-ill-a` | disc 0x74 held through the intro | hand-off table: module 4 | equal |
| PAL `-count` | disc 0x6C | countdown 69 frames | 190 frames |
| PAL `-readyexec` | ready, exec 1 | stage 2 leaves at the drive-count limit; `0x5015,f` | 184 frames |
| PAL `-intro` | none | the whole intro | 291 frames |
| PAL `-d71z` | 0x71 held, z written | stage 3 by the table | 68 frames |

The hard-disk hold's limit is the drive-count word `0x0027C5D4` at 0x7C (0x67 in PAL); the
stage-3 countdown is 58 frames (69 in PAL, `(int)(1.2 x 58)`). The hand-off's table, every entry
(section 8), is reached.

**The illegal-disc scene and the towers on ROM 2.30** (HDD OSD verifiers on the capture rewritten
to `*-as-hdd` by `extract_opening_rom_trace.mjs back`, `CLOCK_BUILD=rom OPENING_BUILD=rom`;
`CLOCK_VIDEO=pal` for PAL):

| Capture | Verifier | Result |
|---|---|---|
| `rom-0230A-opening3-ill-a-as-hdd` | `verify_opening3_illegal_v2.mjs` | `FOUND` 2 604 fans, 930 glows, 23 668 boxes, 76 banners |
| `rom-0230E-opening3-pal-ill-a-as-hdd` | `verify_opening3_illegal_v2.mjs` | `FOUND` 3 234 fans, 1 155 glows, 29 368 boxes, 139 banners |
| `rom-0230A-opening3-towers-late-as-hdd` (state `rom-0230A-opening-towers-full.p2s`, frames 59..426) | `verify_opening_towers_ee.mjs`, `verify_opening_vu1_v2.mjs` | `FOUND` 19 278 chains; 19 278 towers, 134 946 packets, 1 542 240 writes, 507 vertices sent without drawing |

The illegal-disc scene, its cubes, the flat draws, the ghost and the towers are the same code
and tables on ROM 2.30. On a ROM trace `verify_opening_overlays_v2.mjs` says `PARTIAL`: its ghost
half models HDD OSD's `CLAMP_1`.

## 7. PAL

HDD OSD (BIOS 2.30 E, `hddosd-110U-opening3-pal-intro`, every opening verifier with
`CLOCK_VIDEO=pal`; see [pal.md](pal.md)); the ROM's PAL intro, stage machine and illegal scene are
in section 6:

| Rule | NTSC | PAL | How known |
|---|---|---|---|
| Integrator factor `k` (`D_0036F9D0` when PAL) | 1 | 1.2 | verified (`verify_opening_camera.mjs`, `verify_opening_stages.mjs`) |
| Stage-1 wait, stage-2 wait, hard-disk hold | 120, 600, 200 frames | 100, 500, 166 frames | read; the first verified |
| `ay` (`InitDoubleBuffer`) | `D_0036F984` | `D_0036F980` | read |
| Logo rectangles | table entries 0 and 1 | entries 2 and 3 (0x20 bytes further) | verified (`verify_opening_overlays_v2.mjs`) |

Measured: the intro is 206 frames; stage machine 206 frames, flat draws 465, ghost 205, cubes
822, fog 205, lights 182, library inputs 70 436 values, hand-off 1, logo 120 and ghosts 205
(`verify_opening_overlays_v2.mjs`), all `FOUND`.

**The illegal-disc scene in PAL, HDD OSD** (*verified*, capture `hddosd-110U-opening3-pal-illegal`,
`BootIllegal`, 224 scene frames, `CLOCK_BUILD=hdd CLOCK_VIDEO=pal`): `verify_opening3_stages.mjs`
224 frames (handlers stage 0 x1, 4 x1, 5 x92, 6 x130; sound `0x6150,6` sent and equal once),
`verify_opening3_handoff.mjs` 1 hand-off, `verify_opening_flat.mjs` 800 draws,
`verify_opening_ghost.mjs` 222 ghosts, `verify_opening_illegal_cubes.mjs` 1 110 cubes and 432 900
writes, `verify_opening3_illegal_v2.mjs` 3 108 fans, 1 110 glows, 28 212 boxes (204 not drawn) and
131 banners, 1 648 372 writes: all `FOUND`. `verify_opening3_illegal.mjs` says `PARTIAL` on this
capture (frame 130: 68 box packets sent, 128 computed) because the sound thread's periodic call of
`sound_handler_queue_cmd` (`0x00200C00`, from `0x00200A48`, command `0x60D0`) falls inside the box
loop and ends the packet window; the call sends no GS packet, and `_v2` leaves that call out of the
window ends (the diff of the two files is that filter). In NTSC the call never fell inside a box
loop. `mutate.mjs` on `_v2` over the PAL capture: 146 of 177 killed; the survivors are the
UV-origin terms (zero), the `<` to `<=` wrap edges, a 1e-6 constant shift, the glow `on` 1 to 2,
the unreached tile fade `z < 672`, the clamp edges 192, 64 and 0 and a printed diagnostic.

**The towers in PAL, both builds** (*verified*, `verify_opening_towers_ee.mjs` and
`verify_opening_vu1_v2.mjs`, unchanged and mentioning no video mode, `CLOCK_VIDEO=pal`; the states
`hddosd-1.10U-host-opening-pal-towers-full.p2s` (breakpoint `0x00221D30`, table `0x001F0198`) and
`rom-0230E-opening-pal-towers-full.p2s` (breakpoint `0x0021D428`, table `0x001F0138`) hold 21
entries, every mask 0x3F, play counts 1 + 12 e, main cell e mod 6, 126 towers; ROM captures taken
with the ROM-mapped probes, rewritten to `*-as-hdd`, `OPENING_BUILD=rom`):

| Capture | Chains | VU1 |
|---|---|---|
| `hddosd-110U-opening3-pal-towers-a` (state, 45 frames) | 5 796 chains, 278 208 matrix values | 5 796 towers, 34 776 faces through the plain routine, none through the other |
| `hddosd-110U-opening3-pal-towers-late` (advance 150, 52 frames) | 6 552 | 6 552 towers, 39 312 faces through the plain routine |
| `rom-0230E-opening3-pal-towers-a-as-hdd` (46 frames) | 5 796 | 5 796 towers |
| `rom-0230E-opening3-pal-towers-late-as-hdd` (advance 200, 99 frames) | 12 474 | 12 474 towers |

Chain words and VU1 packets are equal in all four (`FOUND`): packets 40 572 (`-a`, both builds,
463 680 writes, no vertex sent without drawing), 45 864 (HDD OSD `-late`, 524 160 writes, 413
vertices sent without drawing) and 87 318 (ROM `-late`, 997 920 writes, 453 vertices sent without
drawing). The towers' arithmetic and tables are the same in PAL on both builds.

## 8. The hand-off to the clock

`opening_transition_to_clock` (`0x0021AEE0`) is called in emulator frame 375 (module counter
248, camera z 106.147), after the scene loop (*verified*, `verify_opening_handoff.mjs` and
`verify_opening3_handoff.mjs`; the branches are in the table below):

1. `execute_app_type` (`0x001F0010`) = -1.
2. When the clock is forced (`enter_clock_module` non-zero, `0x0021AEFC`), the hard disk is not
   ready (`is_hdd_boot_ready` 0, `0x0021AF0C`) and the hard-disk exec is not 1 (`0x0021AF20`):
   module 2, `0x001F064C` = 1, return (a first boot that is not a hard-disk boot). In every other
   case the table of step 3 decides; no check of the disc state comes before this one. The exit
   gives execute -1, module 2, previous-was-opening 1.
3. Otherwise by the snapshot `D_003700A0` through `jtbl_00364F60`: 0x6A, 0x6B execute 2;
   0x6C, 0x6D execute 1; 0x6E execute 0; 0x6F execute 5; 0x70 execute 4; 0x71 module 2; 0x72
   module 5 when `0x001F0D58 > 0` else 2; 0x73 execute 3; **0x74 module 4**; anything else
   (including the initial 0) module 2.
4. Hard disk ready with exec 1: module 0, `0x001F064C` = 1, execute 6.
5. When nothing is to be executed (`execute_app_type` still -1): `0x001F064C` = 1.

The clock reads `0x001F064C == 1` (`0x00225A00`): it stores 0x64 in `D_00370A7C` as if the disc
state were unknown and skips `func_0022FEF8` (*read*).

Left as computed: module 2, previous-was-opening 1 (`hddosd-110U-opening2-handoff-probes`; 2
calls). With the snapshot written to 0x74 during the dive: module 4
(`hddosd-110U-opening2-handoff-illegal`).

**Every branch, verified** (`verify_opening3_handoff.mjs`; the stimulated captures of section 3
write the disc state after the advance; the verifier names the branch and the values it leaves):

| Capture | Branch | Left |
|---|---|---|
| `hddosd-110U-opening3-illegal` (disc 0x64; frame 370, counter 243, z 800.12) | table, snapshot 0x64 | execute -1, module 2, previous 1 |
| `-disc6a`, `-6b`, `-6c`, `-6d`, `-6e`, `-6f`, `-70`, `-73` | table, snapshot as held | execute 2, 2, 1, 1, 0, 5, 4, 3; module 1, previous 0 |
| `-disc65-b`, `-disc69`, `-disc71` (snapshot 0x65, 0x69, 0x71), `-enter`, `-readyneg` (snapshot 0x64) | table | execute -1, module 2, previous 1 |
| `-ill72-b` | table, snapshot 0x72, CDDA count positive | module 5 |
| `-ill74-c` | table, snapshot 0x74 | module 4, previous 1 |
| `-ready-b` | hard-disk ready, exec 1 (the table said module 2) | execute 6, module 0 |
| `-forced` | forced-clock exit (frame 375, counter 248, z 106.147) | execute -1, module 2, previous 1 |
| `-forcedsnap` (snapshot 0x6C) | forced-clock exit: the exit wins over the table, which would send 0x6C to execute 1 | execute -1, module 2, previous 1 |

The hand-off verifier prints `PARTIAL` on `-disc65-a`, `-ready-a`, `-readymid`, `-mecha`, `-ill72-a`
and `-ill74-a`: these captures end before a hand-off (a 36- to 106-frame window, or a scene that does
not end under that stimulus); their stage-machine verdicts are `FOUND`.

What is sent around it (`hddosd-110U-opening2-handoff`, no disc, interpreter):

| Emulator frames | Packets |
|---|---|
| up to 371 | the scene (167 a frame at the end: towers 6, ghost 1, copy 10, fog 106, blur 27, fade 6, bars 8, swap) |
| 372 | swap and the bars only (the stage that ends the scene) |
| 373 | swap only |
| 374 .. 402 | nothing: 29 frames with the last picture (black) standing |
| 403, 404 | 4 + 6 packets from `func_002347D8` under `module_clock_init_resources` |
| 405 .. 407 | nothing |
| 408 | the clock's first frame (217 packets) |

ROM 2.30 (`verify_opening_handoff_rom.mjs`, `rom-0230A-opening3-intro`): the function is at
`0x002164A8`, read in full: an early exit when the clock is forced, a wait for the disk to be
ready, and a 12-entry table at `0x002C41A0` that includes 0x72's CDDA test and 0x75. The one
hand-off in the capture (forced clock: module 2, previous-was-opening 1) is equal. The gap
around it was not captured on the ROM.

## 9. The illegal-disc scene

Module 4 runs the same thread as module 1 (`core/main` `0x0020E1F8..0x0020E1FC`, *read*);
`opening_thread_set_vars` sets `D_0037000C` = 1, which makes scene 1 the first scene. `BootIllegal`
calls `override_illegal_disc_type` (`0x00211920`), which writes 0x74 to `0x001F000C` and
`D_00392924`, then selects module 4; `BootWarning` selects module 4 directly. Reached from the
intro by the hand-off's 0x74 entry (section 8).

**Set-up** (*verified*: `verify_opening_stages.mjs`, `hddosd-110U-opening3-illdraw`):
`OpeningInitIllegalScene` (`0x002244A0`) and `func_0021EE98`: camera z = 672, stage 4, `B+0x18` =
-0.0178 (`D_0036F9C4`), `B+0x28` = 2.16 (`D_0036F9C8`), `B+0x48` = 0.00462 (`D_0036F9CC`), roll
0. The scene runs stages 4 and 5 (nothing), then stage 6 past z 1160, and stage 7 restarts the
animation and returns 2. Stage 6 (*verified* on `hddosd-110U-opening3-illdraw` for the end wait
and its stamp, on `-late-a` with z written 1130 for the fade branch above z 1128, on
`-late-b` with z written 1161 for stage 7): zeroes `B+0x38`, `+0x20..+0x28`, `+0x10..+0x18`,
`+0x00..+0x08`, `+0x30`, `+0x34`; when `0x001F0008` is non-zero (set by `main` `0x0020DA2C` when
the MECHACON version `& 0xFFFFFF <= 0x203FF`) it leaves; else the snapshot = disc state and by
the table `jtbl_003654A0` (*read*, `OpeningProcessInner.s` `0x0021F290..0x0021F34C`; the table
index is `disc - 0x64 < 0x11`): states 0x64, 0x6A..0x70, 0x73 set `D_003700F4` = 1 and the first
time send `sceSdRemote(1, 0x6150, 6, 0, 0xF)` (call at `0x0021F320`) and stamp
`D_00370100 = counter`, then end (result 2) when the counter exceeds the stamp + 0x80
(`sltu`/`movn`, `0x0021F338..0x0021F348`); 0x72 does the same only when `0x001F0D58 > 0`
(`blez` at `0x0021F2F4`); 0x65..0x69, 0x71, 0x74 end the same way when `D_003700F4` is non-zero
(`0x0021F34C`).

*Verified* by `verify_opening3_stages.mjs` (sound sends compared in command, argument registers
and call site):

| Capture | Stimulus | Branch | Frames |
|---|---|---|---|
| `hddosd-110U-opening3-illegal` (`BootIllegal`, emulator frames 128..370) | none, disc 0x64 | stage 6, disc 0x64: ends after the wait (x130); `sceSdRemote(1, 0x6150, 6, 0, 0xF)` computed once; the stages' scene end (result 2) is followed by the hand-off (section 8); 239 fade alphas equal | 242 |
| `-mecha` | `0x001F0008` = 1 | stage 6 leaves at the MECHACON flag, no end (x162) | 256 |
| `-ill74-a` | disc 0x74 held | the flag branch, flag 0: never ends (x164) | 257 |
| `-ill74-b` | then `D_003700F4` = 1 | ends at once (result 2); hand-off module 4; the module restarts | 156 |
| `-ill74-c` | `D_003700F4` = 1 written at counter 107 | counter 128 no end, 129 result 2 (`0x80 < frame`; with no stamp the stamp is 0) | 65 |
| `-ill72-a` | disc 0x72, CDDA count 0 | stage 6 does not end (x92) | 186 |
| `-ill72-b` | disc 0x72, CDDA count 1 | `sceSdRemote(1, 0x6150, 6, 0, 0xF)` from `0x0021F328`, stamp, end after 0x80 frames; hand-off module 5 | 130 |

The end of the scene is reached by the disc state 0x64 in the default `BootIllegal` run; states
0x65..0x69, 0x71 share the table target of 0x74 (`0x0021AA48` on ROM) and are exercised only
through 0x74's flag (section 10).

**Draw** (*read*: order, `OpeningDrawIllegalScene` `0x00224578`; *verified*: values, below):
`func_002243F8` (colour scale from z; ghost `func_0021D140(1, 2, 0x70, 0xFFFFFF)`; frame copy
`func_0021CF38`; particle update `func_00223608` with `sinf`/`cosf`; the two 7-fan functions
`func_00223980` and `func_00223E48`, which draw the five glows through `func_00223230` and
`func_00222EE0`), `func_0021E950` (drifting tiles, texture 1), `func_00222DD8` (five cubes through
`func_00222678`, per-vertex callback `D_002221F0` set by `func_00222BE8`, half-size
`D_0036FAD0` = 1.2, colours (128, 128, 128)), `func_002242C8` (fade: in and out below z 800, to
black between 1128 and 1160), then in `OpeningDrawEnd` the banner (`func_0021DD90`, from z > 800:
`D_00370A70` ramps +1 a frame to 0x70, or down by 1 once `D_003700F4` is set; `func_0021DBE0`
draws texture 13 + language, 512 x 128, blend mode 5 with that alpha).

**Measured, `BootIllegal` run** (`verify_opening3_illegal.mjs`, capture
`hddosd-110U-opening3-illegal`, 240 scene frames): 240 colour scales, 240 particle turns, 3 360 fan
packets, 1 200 glows, 30 535 box packets (185 not drawn), 239 box carries, 131 banner alphas and
draws; 1 783 858 writes, all equal. `verify_opening_illegal_cubes.mjs`: 1 200 cubes, 91 200 record
values, 12 000 packets, 468 000 writes, all equal; `verify_opening_flat.mjs` 854 draws,
`verify_opening_ghost.mjs` 240 ghosts. The same verifier on `-illdraw`: 1 768 948 writes.
`verify_opening3_illegal_v2.mjs` (no change to the arithmetic) is `FOUND` on both NTSC
captures (3 360 fans, 1 200 glows, 30 535 boxes, 131 banners on `-illegal`; 3 332, 1 190, 30 280,
128 on `-illdraw`) and on `hddosd-110U-opening3-pal-illegal` (below). `mutate.mjs` on
`verify_opening3_illegal.mjs` (60 mutants): 49 killed; the 11 that survive compute nothing a
frame reaches: the source-origin terms of the UV are multiplied by 0 in every glow and banner
draw, the glow's `on` 1 to 2 is equivalent, `wrapDown <` to `<=` differs only when a float equals
its limit, the tile fade branch `z < 672` is not reached (z starts at 672 and only grows), the
threshold 192 differs only for values in [192, 193) that no frame has, and `near < 0` is dead
(`near` is never negative there and never above 64).

**Measured, the `-illdraw` capture** (`verify_opening_illegal.mjs`, `hddosd-110U-opening3-illdraw`, 239 frames): 238
colour scales, 238 particle turns, 3 332 fan packets, 1 190 glows, 30 280 tile packets (184 not
drawn), 237 tile-state carries, 128 banner alphas and draws; 1 768 948 writes, all equal.
`verify_opening_illegal_cubes.mjs` (the cubes differ from the intro's in the callback and the
set-up; its header lists the differences): 1 190 cubes, 90 440 record values, 11 900 packets,
464 100 writes, all equal. The flat draws and the ghost (`verify_opening_flat.mjs`,
`verify_opening_ghost.mjs`): 844 and 808 flat calls on `-illdraw` and `hddosd-110U-opening3-ill74`,
238 ghosts. Pictures: `hddosd-110U-opening3-ill-{150,250,350,500,700}.png`.

`verify_opening_illegal.mjs` says `PARTIAL` on `hddosd-110U-opening3-illegal`: it ends a glow's or a
banner's packet window at the next probe record of its own list, which on this capture runs into the
ghost rectangle (14 writes sent, 8 computed). `verify_opening3_illegal.mjs` ends a window at the
next probe record of any verifier and reads the ELF words inline.

With the snapshot written to 0x74 during an intro's dive, the hand-off chooses module 4 and the
red scene plays: module 4 at emulator frame 451, module 2 again by 653
(`hddosd-110U-opening2-illegal-a.png`).

**PAL** (HDD OSD, BIOS 2.30 E, `CLOCK_VIDEO=pal`, `hddosd-110U-opening3-pal-illegal`, 224 scene
frames, section 7): the same scene with the PAL banner rectangle (`y` and `h` scaled by the two
doubles at `0x003653D8` and `0x003653E0`).

## 10. Open

- **The hand-off's wait on exec 0** (ROM: module 0, execute -1, previous 1; `rom-0230A-opening3-readywait`)
  is entered and not left inside a capture. Only another thread writes exec and a write cannot be
  made inside a trace; the values the loop leaves (read after the trace: module 0, execute -1,
  previous 1; then module 2, execute 6 once exec was written) are not recomputed by a script. HDD
  OSD: a hand-off with ready set and exec 0 is not captured. Settles it: a verifier on a capture
  that spans the write of exec by the other thread, or a read of the loop's code.
- **Hard-disk words not exercised.** HDD OSD: exec values other than 1 and -1; a hard-disk
  hand-off with the clock forced. ROM: exec values other than 1, -1, 0 and 2; the ready word
  cleared during a run; the drive state machine at `0x002083B0` (it rewrites `0x00300440` while
  ready is set) is not read.
- **The meaning of the sound command ids**: HDD OSD `0x6140`, `0x6150` (and `0x60D0` of the sound
  thread), ROM `0x5014`, `0x5015` and their arguments. Only their sending is verified.
- **Illegal-scene end wait by state.** Only the disc states 0x64 (default run), 0x72 and 0x74 are
  exercised on HDD OSD, and on ROM 0x72 and 0x74; the other entries of `jtbl_003654A0` (HDD OSD
  0x6A..0x70, 0x73; 0x65..0x69, 0x71 through the flag) share their targets and are read, not
  captured. Settles it: stage-6 captures with those states held.
- **The tile fade branch `z < 672` of the illegal scene** is not reached: z starts at 672 and
  only grows (the mutants on it survive in `verify_opening3_illegal.mjs`).
- **ROM CDDA count**: the second store (`0x0020FDB0`, base `s1`) is known from a watchpoint, not
  from the disassembly.
- **Mutation coverage of the stage verifiers.** `mutate.mjs verify_opening3_stages_rom.mjs` on
  its default capture set kills 15 of 41 mutants (the survivors are lines only a stimulated
  capture reaches); the run over every registered capture has not finished. The scores of
  `verify_opening3_stages.mjs` over all its captures are not recomputed. Settles it:
  `mutate.mjs <verifier> --captures 50` run to the end.
- **PAL towers**: the captures cover the state's start (HDD OSD 45 frames, ROM 46) and the dive's
  end, not every frame between.
- The fade's 'W' mode (only 'B' occurred).
- Verifiers without a `_v2` copy keep the plain arithmetic helper of section 4.6
  (`verify_opening_towers.mjs` also models an outside vertex as two hidden vertices, not three: use
  `verify_opening_vu1.mjs`).

## 11. Files

- Scripts (`References/scripts/`): `extract_opening_frame_map.mjs`, `extract_opening_vu1.mjs`,
  `extract_opening_tables.mjs`, `extract_opening_towers.mjs`, `extract_opening_exact.mjs`,
  `extract_opening_clear.mjs`, `extract_opening_rom_map.mjs`, `extract_opening_rom_trace.mjs`,
  `elf_words.mjs`, `diff_rom.mjs`; verifiers `verify_opening_camera.mjs`,
  `verify_opening_camera_rom.mjs`, `verify_opening_stages.mjs`, `verify_opening_stages_rom.mjs`,
  `verify_opening_lights.mjs`, `verify_opening_fog.mjs`, `verify_opening_cubes.mjs`,
  `verify_opening_overlays.mjs`, `verify_opening_overlays_v2.mjs`, `verify_opening_ghost.mjs`,
  `verify_opening_flat.mjs`, `verify_opening_inputs.mjs`, `verify_opening_towers.mjs`,
  `verify_opening_towers_ee.mjs`, `verify_opening_vu1.mjs`, `verify_opening_handoff.mjs`,
  `verify_opening_handoff_rom.mjs`, `verify_opening_illegal.mjs`,
  `verify_opening_illegal_cubes.mjs`, `verify_opening3_stages.mjs`,
  `verify_opening3_stages_rom.mjs`, `verify_opening3_handoff.mjs`,
  `verify_opening3_handoff_rom.mjs`, `verify_opening3_illegal.mjs`,
  `verify_opening3_illegal_v2.mjs`, and the seven `_v2` copies of section 4.6. Each verifier
  exports `PROBES`.
- Model data (`References/model/`): `opening-vu1-microprogram.json`, `opening-tables.json`
  (static tables and constants from the ELF), `opening-lib.mjs` (libvu0, exact sums),
  `opening-libm.mjs` (`sinf`, `cosf`), `opening-towers.json`, `opening-rom-map.json`.
