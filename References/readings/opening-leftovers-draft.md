# The opening intro: what section 8 of `facts/opening.md` left open (draft for `facts/`)

Recorded 2026-10-02. Builds: **HDD OSD 1.10U** (canon; addresses are its unless "ROM" is
written) and **ROM 2.30**. *Verified* = recomputed bit for bit from probed inputs by the script
named. Nothing in `facts/`, in the earlier verifiers, in `watson.json` or in Watson was edited;
no commit.

## Result

| Item | HDD OSD 1.10U | ROM 2.30 |
|---|---|---|
| Towers, EE side (`verify_opening_towers_ee.mjs`) | 6 300 chains in 50 frames, every word; set-up tables and brightness table equal | 1 512 chains in 12 frames |
| Towers, microprogram, both paths that had never run (`verify_opening_vu1.mjs`) | 10 428 towers; 467 vertices outside the bounds in a real run, 2 606 with the bounds written smaller; 12 096 faces through the moved-coordinates routine (stimulated) | 1 512 towers (plain routine, all inside) |
| Flat draws (`verify_opening_flat.mjs`) | 557 calls: frame copy 247, bars 247, fade 30, blur 33 | 784 calls: 359, 359, 31, 35 |
| Ghost on both builds (`verify_opening_ghost.mjs`) | 246 | 358 |
| Library results and set-up tables (`verify_opening_inputs.mjs`) | 85 792 values | 124 680 values |
| Hand-off (`verify_opening_handoff.mjs`) | 2 calls (as it runs; and with the snapshot written to 0x74) | its function is other code in the ROM: not done |
| Timeline (`verify_opening_camera_rom.mjs`) | (already verified) | 359 frames, stage machine and integrator |
| Earlier verifiers, unmodified, on a ROM trace | — | lights 318 frames, fog 347 frames, cubes 1 490, logo 120, fade 30, bars 348 |

Every verdict above is `FOUND`.

## 1. The towers' EE side (*verified*: `verify_opening_towers_ee.mjs`)

**Set-up, `OpeningInitTowersFog` (`0x00221D30`).** The play history at `0x001F0198` is 21
entries of 22 bytes: a name (an entry whose name equals the empty string at `0x003700D0` is
skipped), `+0x10` play count, `+0x11` mask, `+0x12` main cell. `D_002B0F90` gives each entry six
`(column, row)` cells of the 14 x 9 grid (`References/model/opening-towers.json`). For cell `k`
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
compares it with the chain as started. Captures (state
`hddosd-1.10U-host-opening-towers-full.p2s`: 21 entries, every mask 0x3F, counts 1 .. 255, 126
towers): `hddosd-110U-opening2-ee-a` 1 260 chains, `-ee-b` 1 260, `-ee-late` 3 780; set-up
tables 126 of 126 each and 504 place values, brightness 400 of 400, 50 `sinf` results.

**The microprogram's two paths** (`verify_opening_vu1.mjs`, a corrected copy of
`verify_opening_towers.mjs`):

- *A vertex outside the bounds happens in a real run.* With a full history, a trace of the
  whole intro (`-opening2-whole`, no probes) has 209 034 PATH1 packets, 716 221 vertices drawn
  and **467 sent without drawing**, from the 217th frame on (the end of the dive). `-ee-late`
  covers those frames with probes: 3 780 towers, 26 460 packets, the 467 included, all equal.
- **`verify_opening_towers.mjs` has the rule wrong** (its captures never had such a vertex):
  after a vertex outside, **three** vertices are sent without drawing, not two. `ISUBIU vi13`
  (instruction 77, and 142) is followed at once by `IBLEZ vi13`, and the branch reads the count
  as it was before the subtraction. With the bounds written smaller (`0x002A5000` = 2300, 2150;
  capture `-opening2-bounds`): 1 008 towers, 1 346 hidden vertices, all equal.
- *The routine that moves the coordinates with the normal cannot run in this program*: it is
  taken when entry 21 is not zero, entry 21 is `0x002A5040`, `func_00221140` clears it for
  every tower, and nothing else in the disassembly refers to it. Made to run by replacing the
  four stores (`0x0022117C`, `0x00221198`, `0x002211A8`, `0x002211B4`) by nops and writing
  (0.05, 0.08) there: `-opening2-moved` 1 008 towers, 6 048 faces, all equal; with the smaller
  bounds as well (`-opening2-moved-bounds`), 1 260 hidden vertices, all equal. So the model of
  that routine is right, and the routine is dead code here.

## 2. The flat draws (*verified*: `verify_opening_flat.mjs`)

Each helper call is one packet (`vif1Set*`): `XYOffset`, `ZWrite` (`ZBUF_1` with or without the
mask), `ZTest` (`TEST_1 0x30000` or `0x50000`), `AlphaBlend`, `Framebuffer` (`FRAME_1`,
`SCISSOR_1` and, with clear 1, a sprite in primitive coordinates 0..W, 0..H between two `TEST_1`
writes), `CLAMP_1`, `AD`, `TexRect`, `FlatRect`.

- **Frame copy `func_0021CF38`**: offset without the field, depth writes off, the store
  (`D_002B0C48`) as target, `CLAMP_1 0`, `TEX0` = the page just drawn (`W x H / 64` when the
  counter is even, 0 when odd), `TEX1 0x60`, the whole picture drawn into the left half
  (`W/2 x H`), then the frame as target again. 10 packets.
- **Blur `func_0021D3D0(n, which, field)`**: n round trips; trip `i` draws the frame into the
  extra buffer (`gsExtraBuffers[0]`) shrunk to `(7W/8 - 1 - i(n - 1)) x (7H/8 - 1 - i(n - 1))`
  and that rectangle back over the whole frame. 9 + 6n packets (15, 21, 27).
- **Fade `func_0021D848(mode, alpha)`**: blend mode 4, a full-screen rectangle, black for 'B',
  white (`D_00365148`) for 'W', alpha at most 0x80. 6 packets. Only 'B' occurred.
- **Bars `func_0021D6C0`**: picture height `(int)(W x 9 x ay / (ax x 16))` (164 here), bars of
  `(H - that + 1) / 2` rows (30) above and below, blend mode 1 with fixed alpha 0x80. 8 packets.

`hddosd-110U-opening2-flat` (the whole intro): 247 + 33 + 30 + 247 calls, 5 313 packets, all
equal.

## 3. What was taken as probed input (*verified*: `verify_opening_inputs.mjs`)

- **`sinf`, `cosf`**: modelled from the library's instructions (`References/model/
  opening-libm.mjs`: `__kernel_sinf`, `__kernel_cosf`, `__ieee754_rem_pio2f` up to
  2^7 x pi/2). HDD OSD: the lights' 1 744 results, the roll's 988 + 486 + 30, the towers' 50,
  all equal.
- **`sceVu0RotMatrix`, `TransMatrix`, `MulMatrix`** (`References/model/opening-lib.mjs`): the
  cubes' turn, world, normals and screen matrices, 994 cubes (63 616 values); the towers' three.
- **`sceVu0CameraMatrix`, `sceVu0ViewScreenMatrix`, their product, `sceVu0NormalLightMatrix`**
  (`OpeningProcessInner`, `0x0021F528..0x0021F5C0`: screen distance 1024, `ax`, `ay` from
  `0x00370030`, centre 2048, z range 1 .. `D_0036FA08`, near 1, far 65536): 258 frames.
- **Fog mesh and brightness, `func_0021DEA8`**: 17 x 17 points
  `(j x 6 - 48 + 2 cos a, i x 6 - 48 + 2 sin a, 134, 1)` with `a = (counter x 0x33) & 0x3FFF`
  as a 16-bit angle through `func_0021B090` (a double product with pi/2, then `sinf`); the
  counter is **0** at set-up (*measured*). Brightness
  `clamp((R - 4 x dist((-5.1, 0), ((2j - 16) x 3 + 3, (2i - 16) x 3 + 3))) x 96 / R, 0, 127)`,
  stored as `(0, 0, level, 0x80)`. 1 156 + 1 156 values equal.
- **Cube corners and colours, `func_002245C0`**: corners `(+-s, +-s, +-s, 1)` with `s` =
  `D_0036FA4C` (1.8), colours `(128 - 16, 128 - 16, 128 + 24, 128)`, as `InitLightsCubes` passes
  them. In the module's first frames the tables still hold 1.2 and (128, 128, 128): the other
  caller, `func_00222BE8` (the illegal-disc scene's set-up).

**Two things about the arithmetic helpers, found here:**

1. `f(a + b)` (the helper of `clock_frame.mjs`, used by every opening verifier and by
   `verify_view_matrix.mjs`'s `sineCosine`) is **not always the sum cut toward zero**: when one
   addend is below the double's precision (`x + 1e-22`), the double sum is `x` and the cut is
   lost. The real result is one step nearer zero when the small addend has the other sign. It
   showed in three cubes of the ROM capture (the cosine of an angle within 0.006 of pi/2).
   `opening-lib.mjs` has `add(a, b)`, exact; with it all captures of both builds are equal.
   The HDD OSD captures do not hit the case.
2. A division by zero gives the largest single, not infinity (the first frame, before the
   camera is placed, normalises a zero vector and must give 0).

## 4. The hand-off (*verified*: `verify_opening_handoff.mjs`; the gap *measured*)

`opening_transition_to_clock` (`0x0021AEE0`) is called in emulator frame 375 (module counter
248, camera z 106.147): execute = -1, then by the snapshot of the disc state (`D_003700A0`)
through the table at `0x00364F60` (0x6A .. 0x74), default module 2; a first boot that is not a
hard-disk boot goes to module 2 at once; and when nothing is to be executed, `0x001F064C` = 1.
Left as computed: module 2, previous-was-opening 1 (`-opening2-handoff-probes`); with the
snapshot written to 0x74 during the dive, module 4 (`-opening2-handoff-illegal`).

What is sent around it (`-opening2-handoff`, no disc, interpreter):

| Emulator frames | Packets |
|---|---|
| up to 371 | the scene (167 a frame at the end: towers 6, ghost 1, copy 10, fog 106, blur 27, fade 6, bars 8, swap) |
| 372 | swap and the bars only (the stage that ends the scene) |
| 373 | swap only |
| 374 .. 402 | nothing: 29 frames with the last picture (black) standing |
| 403, 404 | 4 + 6 packets from `func_002347D8` under `module_clock_init_resources` |
| 405 .. 407 | nothing |
| 408 | the clock's first frame (217 packets) |

## 5. ROM 2.30

**The intro plays on a plain power-on** of the ROM (no argument): logo at frame 150, the clock
at 453 (`rom-0230A-opening2-{150,250,350,450}.png`).

**How it was run through the HDD OSD verifiers.** `extract_opening_rom_map.mjs` finds each
function of the opening and graph modules in a ROM memory dump and pairs every address the two
builds' code forms (`References/model/opening-rom-map.json`: 497 functions the same code, 1 099
addresses; ROM gp `0x002CFEF0`, HDD OSD gp `0x00377970`). `extract_opening_rom_trace.mjs` moves a
verifier's probes to the ROM and rewrites the captured trace back into HDD OSD's addresses and
layout, so the unmodified verifiers run on it. Where the layout differs a range is rebuilt in
pieces: the module's variables have 8 more bytes after `+0x94` in the ROM, the screen size is 4
bytes nearer the buffer index, the disc state is at `0x001F0010`.

**Same code** (words differ only in addresses): towers `0x0021CBF0`, set-up `0x0021D428`,
brightness `0x0021C458`, lights `0x0021ACF0`, fog `0x00219778`, cube transform `0x002205B0`,
cube draw `0x0021BB48`, fade `0x00218E58`, bars `0x00218CD0`, logo `0x00218FA0`, fog mesh
`0x002194B8`, corners `0x0021FCB8`, `sinf` `0x0025FFD8`, libvu0. The microprogram (464 words),
the `npio2` table and the tower chain's template (but its one pointer) are the same bytes.

**Different, read and verified:**

- **`CLAMP_1 = 0` is sent by HDD OSD only**, in three places: the frame copy (ROM
  `0x00218590`), the blur (ROM `0x00218A00`) and the ghost (ROM `0x00218780`) are the same
  instructions without that one call. *Measured on both.*
- **The update function** (ROM `0x0021A510`, 504 words against 445; 412 in common). Same
  integrator, constants, thresholds and matrix build. The stage counter starts at 0 and takes a
  frame to become 1 (it sets pending = 1 there), so stages are one higher than HDD OSD's and
  stage n's threshold is entry n - 1 of the same table. Stage 3 (HDD OSD's 2) has a countdown
  HDD OSD lacks (two variables at `0x002C8694`; set only for one disc state, not met). Where
  HDD OSD reads `0x002AD22C` to know the clock is forced, the ROM calls `0x002058E0`; a power-on
  in the emulator is a first boot, and the disc state is then not kept.
  `verify_opening_camera_rom.mjs`: **359 frames** (the whole intro), stage handlers, integrator
  and result all equal; 31 fades, 35 blurs, 120 logo alphas.
- **The ROM's intro is 359 frames here against HDD OSD's 246, by the same rules**: the drive
  reports state 0x65 until module counter 237 and only then 0x64, the state that releases the
  wait; the dive starts at counter 239 (HDD OSD: 121). Module's first frame: emulator frame 61.

**Per verifier on ROM 2.30** (captures `rom-0230A-opening2-*`, rewritten as `*-as-hdd`):

| Verifier | Result |
|---|---|
| `verify_opening_towers_ee.mjs`, `verify_opening_vu1.mjs` (state `rom-0230A-opening-towers-full.p2s`) | 1 512 chains / towers in 12 frames, set-up and brightness tables equal |
| `verify_opening_lights.mjs` | 318 frames, 5 088 sprite and 1 272 trail packets |
| `verify_opening_fog.mjs` | 347 frames, 35 394 packets |
| `verify_opening_cubes.mjs` | 1 490 cubes, 14 900 packets |
| `verify_opening_overlays.mjs` | logo 120 (its ghost half does not apply: other code) |
| `verify_opening_ghost.mjs` | 358 |
| `verify_opening_flat.mjs` | copy 359, bars 359, fade 31, blur 35 |
| `verify_opening_camera_rom.mjs` | 359 frames |
| `verify_opening_inputs.mjs` | fog mesh and brightness, cube tables, 359 frames of matrices, 1 436 roll and 2 544 light sines and cosines, 1 490 cubes' matrices |
| `verify_opening_handoff.mjs` | not run: `opening_transition_to_clock` is not found as the same code in the ROM |

## 6. The illegal-disc scene and other disc states

Writing the disc state `0x001F000C` does not hold: written to 0x74 at frame 32, it read 0x64
again 150 frames later (the program writes it). What does work is writing the *snapshot*
`D_003700A0` during the dive: the hand-off then chooses module 4 and the red scene plays
(`hddosd-110U-opening2-illegal-a.png`; module 4 at frame 451, module 2 again by 653). Its
drawing was not measured.

## Where the earlier pages are wrong or short

1. `verify_opening_towers.mjs` and `facts/opening.md` section 5: after a vertex outside the
   bounds **three** vertices are not drawn ("and so are the two after it" is wrong).
2. `facts/opening.md` section 5, "not exercised": both paths are now exercised; one of them (a
   vertex outside) happens in a real run with a full history, the other cannot happen.
3. The towers are not depth-sorted; the height is `max(tall x 30, 3)` from the play count
   through `D_002B1C48`, the sway and the fade from `D_002B1C10`; a tower's texture cell and
   quarter turn come from its cell numbers alone.
4. `facts/opening.md` section 6: the ghost on ROM differs by one `CLAMP_1` call, not "77
   words" of other logic; the frame copy and the blur differ the same way; the update function
   is as described above.
5. The `f(a + b)` helper (above).

## Still open

- ROM 2.30: the hand-off function; towers late in the dive (only 12 early frames with towers
  were captured there).
- The illegal-disc scene's drawing; PAL; the hard-disk boot branches; disc states other than
  0x64 and 0x65 in the stage handlers; the ROM's countdown branch; the fade's 'W' mode.
- The earlier verifiers still use the `f(a + b)` helper; they pass on every capture taken.
- What the "clear" sprites of `Framebuffer` do to the pixels (their coordinates are 0..W,
  0..H in primitive space, which the offset puts outside the scissor): a reading.

## Files

- Scripts (`References/scripts/`): `verify_opening_towers_ee.mjs`, `verify_opening_vu1.mjs`,
  `verify_opening_flat.mjs`, `verify_opening_ghost.mjs`, `verify_opening_inputs.mjs`,
  `verify_opening_handoff.mjs`, `verify_opening_camera_rom.mjs`, `extract_opening_towers.mjs`,
  `extract_opening_rom_map.mjs`, `extract_opening_rom_trace.mjs`. ROM: capture with the probes
  of `extract_opening_rom_trace.mjs plan <verifiers>`, rewrite with `back`, run the verifier
  (`OPENING_BUILD=rom` for the towers, the flat draws and the ghost).
- Model (`References/model/`): `opening-lib.mjs` (libvu0, exact sums), `opening-libm.mjs`
  (`sinf`, `cosf`), `opening-towers.json`, `opening-rom-map.json`.
- States (`Watson/Runtime/states/`): `hddosd-1.10U-host-opening-towers-full.p2s`,
  `rom-0230A-opening-towers-full.p2s` (neither in `watson.json`).
- Captures (`Watson/Runtime/captures/`): `hddosd-110U-opening2-*`, `rom-0230A-opening2-*`.
