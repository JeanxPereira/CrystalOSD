# PAL, measured (draft for `facts/`)

Recorded 2026-10-02. Builds: **HDD OSD 1.10U** (canon) and **ROM 2.30**, both run in PAL for
real, not stimulated. Addresses are HDD OSD's unless "ROM" is written. Nothing in `facts/`, the
existing verifiers, `watson.json` or Watson was edited; no commit.

## 1. How each build decides PAL, and how the PAL runs were obtained

**HDD OSD 1.10U** (*read*): `handle_get_vidmode` (`0x00208238`) reads `rom0:ROMVER` once and
caches the answer in `var_curvidmode` (`0x002AD228`): byte 4 of the string, the region letter,
gives `J` → 0, `A` or `H` → 1, `E` → 2; byte 5 goes to `var_curlang` (`0x002AD22C`).
`is_pal_vmode_p9_tgt` (`0x00208350`) is `handle_get_vidmode() == 2`, and has 70 callers. So the
video mode is the console's region and nothing else: no configuration item enters it.
`InitDraw` (`0x0020BD6C`) sets the screen to 640 × 256 in PAL (640 × 224 otherwise) and calls
`sceGsResetGraph(2, 1, PAL ? 3 : 2, 1)`.

**ROM 2.30** (*measured*): the same two functions are at ROM `0x002052C0` and `0x002058B8`
(`find_in_rom.mjs`). The OSDSYS of the 2.30 **E** image is the same code as the 2.30 **A**
image the ROM verifiers were written for: comparing 2 MB of EE memory of the two
(`References/dumps/rom-0230A-clock-ee-00100000.bin`, `rom-0230E-pal-clock-ee-00100000.bin`),
`0x00200000..0x0027A26C` is equal word for word and the 41 words that differ up to
`0x00289000` are all data (version numbers, the region letter, the cached mode 1 → 2, buffer
and texture addresses). So every ROM 2.30 address holds on the E image.

**The PAL runs** (*measured*): the BIOS `References/bios/megadump/ps2-0230e-20080220.bin`
(`0230EC20080220`).

- HDD OSD: `watson_launch { bios: <0230e>, elf: References/dumps/hddosd-host/hddosd.elf, args:
  "SkipSearchLater" }`. `var_curvidmode` reads 2, the screen record 640 × 256, the snapshot is
  640 × 512. Menu at frame 800; down, cross: System Configuration; square: the clock alone.
- ROM 2.30 E: `watson_launch { bios: <0230e> }` starts in the first-run screens (language at
  frame 900); six presses of cross (one about every 150 frames, held 6 frames: 3 frames were
  not always taken) reach the main menu; then down, cross, square as above.
- Saved states (`Watson/Runtime/states/`, not in `watson.json`; a state only loads on the BIOS
  it was made on): `hddosd-1.10U-host-pal-{menu,config,clock}.p2s`,
  `rom-0230E-pal-{menu,config,clock}.p2s`.
- Captures: `Watson/Runtime/captures/hddosd-110U-pal-*` and `rom-0230E-pal-*`.

## 2. What differs between NTSC and PAL

`fps` below is the integer the code picks with `is_pal ? 50 : 60`. *Measured* = read from the
running PAL build's memory or sent in its packets, and reproduced by a verifier; *read* = from
the instructions only.

### Screen and buffers

| What | Rule | NTSC | PAL | |
|---|---|---|---|---|
| Screen size `W × H` (`0x001F0CB4`, ROM `0x001F0C50`) | `InitDraw`: 640 × (PAL ? 256 : 224) | 640 × 224 | 640 × 256 | measured, both builds |
| `XYOFFSET_1` | `(2048 - W/2, 2048 - H/2)`, + 0.5 on the odd field | 1728, 1936 | 1728, 1920 | measured |
| `SCISSOR_1` | `0..W-1`, `0..H-1` | y 0..223 | y 0..255 | measured |
| Display buffers `FBP` | `0` and `W × H / 2048` | 0, `0x46` | 0, `0x50` | measured |
| Display buffers as texture `TBP` | `0` and `W × H / 64` | 0, `0x8C0` | 0, `0xA00` | measured |
| Work buffers `FBP` | `W × H / 512` and `3 × W × H / 2048` | `0x118`, `0xD2` | `0x140`, `0xF0` | measured |
| Work buffers `TBP` | `W × H / 16` and `3 × W × H / 64` | `0x2300`, `0x1A40` | `0x2800`, `0x1E00` | measured |
| **`ZBUF_1` `ZBP`** | `sceGszbufaddr`: `ceil(W/64) × ceil(H/32) × 2` | `0x8C` | **`0xA0`** | measured; the verifiers had `0x8C` as a constant |
| First loaded texture `TBP` | `W × H × 5 / 64`, the others follow as before | `0x2BC0` | `0x3200` | measured |
| Font texture `TBP` | follows the same block | `0x2F04` (ROM `0x2F05`) | `0x3544` (ROM `0x3545`) | measured |
| Region clamp of the work buffers (HDD OSD) | `0..W-1`, `0..H-1` | `0x37C009FC00A` | `0x3FC009FC00A` | measured |

### Proportion and positions

| What | Rule | NTSC | PAL | |
|---|---|---|---|---|
| Vertical proportion `ay` (scene record `0x002B2180`) | `clock_stuff1` `0x00225968`: PAL ? `D_0036FB84` : `D_0036FB88` | 0.47 | 0.5405 | measured |
| Screen matrix | `sceVu0ViewScreenMatrix(512, 1, ay, 2048, 2048, 1, 16777215, 1, 65536)` | `[1][1]` 240.64 | `[1][1]` 276.736 | measured, 16 of 16 elements |
| View matrix | no dependence on the mode | | | measured equal |
| Letterbox bars | `picture = (W / ax) × 0.0625 × 9 × ay`, `margin = (H - picture) / 2` | top to 27.375, bottom from 196.5625 | picture 194.58, top to 30.6875, bottom from 225.25 | measured |
| Vignette centre | `(0x10A0, (H / 2) << 4)`; radii `1184, 592` unchanged | y 1792 | y 2048 | measured |
| Orb sprites' centre | `+ W/2`, `+ H/2` | 320, 112 | 320, 128 | measured |
| Refracted lookup (HDD OSD) | clamp to `0..W×16`, `0..H×16` | 3584 | 4096 | measured |
| Date and time `y` | `func_00226300` `0x00226350`: `y × 0.5405 / 0.47` (doubles `D_00365570`, `D_00365578`) when PAL | | × 1.15 | read; the text draws were seen, not recomputed |
| Button hint `y` | `func_00226958`: `y × 0.5405 / 0.47` (`D_00365590`, `D_00365598`) | 200 | 230 (sent at 229.6) | measured as sent |
| Menu and configuration text metrics | double constants, PAL = NTSC × 1.15: 6 → 6.9, 10 → 11.5, 17 → 19.55, 24 → 27.6, 27 → 31.05, 42 → 48.3 (`D_003655A0`, `D_003656A8..E8`; callers `func_00226CA0`, `func_00229080`, `func_0022A410`, `func_0022AF60`, `func_0022C450`) | | | read |
| Line counts in the configuration pages | `func_00229080` `0x002290F8`, `func_0022A410` `0x0022A488`: PAL ? 13 : 11 | 11 | 13 | read |
| First-run images | `oobe_handler` `0x0022DCE8`, `0x0022DD68`: other rectangles | | | read |

### Lengths and speeds

Everything that is counted in frames per second is scaled; everything that is "per frame" is
not, so those run slower in PAL.

| What | Rule | NTSC | PAL | |
|---|---|---|---|---|
| Sprites' fade ramp length (`D_002B61B0`) | `func_00238F20`: `(fps << 8) / 60` | 256 | 213 | measured: memory, and 199 falling calls + the 14 before the trace |
| Background grey ramp / configuration ramp length (`D_003702CC`, `D_003702E0`, `D_002B5740`) | `func_002324C8`, `func_00234B88`: `fps × 40 / 60` | 40 | 33 | measured: grey 1..38 over 32 frames, then 40 |
| Cubes' scale ramp | the same length; scale = counter / length | 1/40 a frame | 1/33 a frame | measured (`verify_cubes`) |
| Blur tail (`D_003702D0`) | `func_002324C8`: `fps / 6` | 10 | 8 | measured |
| Menu blur ramp (`D_002B5780`) | `D_003702CC + D_003702D0` | 50 | 41 | measured |
| Vignette ramp (`D_003702E4`, `D_002B5F20`) | `func_00234B88`: `fps × 80 / 60` | 80 | 66 | measured: falls over 65 frames |
| Configuration list ramp (`D_002B2E04`) | writer not read | 90 | 74 | measured in memory only |
| Cubes' move for one place | `func_00230860`: speed `= 2 × distance / (rate / 2)`, slowing `= speed / (rate / 2)`, `rate` 59.94 or 50 | 24 frames (206, 7) | 19 frames (240, 9) | measured (`verify_cubes`) |
| Wrap of the counter at `D_002B2DE8 + 0x34` (adds 310 a frame) | `func_00230FD8`, `func_00228978`, `func_0022AB08`, `func_0022B3A8`: `fps × 31400 / 60` | 31 400 | 26 166 | read |
| Scroll steps | `D_0022E428` `0x0022E480`: ± 6 instead of ± 5; `D_00228748`; `func_0022C210`: ± 30 | | | read |
| Frame time for the time keeper (`D_00370328`) | `func_00235848`: `1000 / (PAL ? 50 : 59.94)` | 16.683 ms | 20 ms | measured in memory |
| Opening: integrator factor `k` | `D_0036F9D0` when PAL | 1 | 1.2 | measured (`verify_opening_camera_pal`) |
| Opening: waits | `2 × fps`, `10 × fps`, `20 × fps / 6` | 120, 600, 200 | 100, 500, 166 | measured for the first; the intro runs 206 frames instead of 247 |
| Opening: proportion | `InitDoubleBuffer`: `D_0036F980` / `D_0036F984` | 0.457627 | 0.526271 | read |
| **Not scaled**: camera approach `× 0.97` a frame, scene scale factor 0.03 (ROM 0.1), clock easing 0.1, progress 0.004 a frame, colour walk every 9th frame, orb trail one point per 3 frames, cube spin 30 a frame, pulse `× 0.95` | per frame in both modes | | | measured: the same verifiers pass unchanged |

## 3. Verifiers in PAL

All run on real PAL captures. "copy" = the `_pal` copy was needed (section 4).

| Verifier | HDD OSD 1.10U, PAL | ROM 2.30 (E image), PAL |
|---|---|---|
| `verify_camera` | PARTIAL as written (0.47); **copy: FOUND**, screen matrix 16 of 16 | copy: FOUND |
| `verify_view_matrix` | FOUND, 19 calls | FOUND, 18 calls |
| `verify_placement` | FOUND, 228 rods, 133 orbs | FOUND |
| `verify_clock_state` | FOUND, 19 frames | FOUND, 18 frames |
| `verify_scale` | FOUND, 240 steps from power-on (factor 0.03) | FOUND, 307 steps, the scale moving in 97 |
| `verify_approach` | FOUND, 240 steps (the clock starts at frame 158) | FOUND, 307 steps |
| `verify_rod` | FOUND, 6 918 face records, 7 524 textured faces | FOUND, 6 568 and 7 128 |
| `verify_rod_pieces` | FOUND | FOUND |
| `verify_refraction` | FOUND, 5 340 faces | FOUND, 5 066 faces |
| `verify_reflection` | FOUND, 3 156 faces | FOUND, 3 004 faces |
| `verify_orbs` | FOUND, 252 strips, 504 sprites; fade falling 700 strips, 1 400 sprites | FOUND, 238 / 476; fade falling 700 / 1 400 |
| `verify_gs_state` | PARTIAL as written (`ZBUF`, 630 calls); **copy: FOUND**, every write as read (clock, configuration, the transition) | as written `ZBUF` too; copy: only the three known build differences |
| `verify_background` | FOUND: clock 288 strips, configuration 240, transition 1 360 | FOUND: 288, 256 |
| `verify_blur` | FOUND: 18 + 15 + 85 frame heads | FOUND: 18 + 16 |
| `verify_overlays` | FOUND: 18 + 15 + 85 frames (vignette 67 frames) | FOUND: 18 + 16 |
| `verify_cubes` | FOUND: 258 cubes with one move (19 frames), 126 cubes appearing (ramp of 33) | FOUND: 215 cubes |
| `verify_frame` | PARTIAL as written (`ZBUF`); **copy: FOUND**: 15 frames of the clock (93.5% of the frame), 12 of System Configuration (80.9%), every packet the model produces | copy: FOUND, 16 frames (94.3%) |
| `verify_opening_camera` | PARTIAL as written (`k`, waits); **copy: FOUND**, 206 frames | not run |

`verify_orbs` passes as written although it holds `SCREEN = [640, 224]`: the half height is
added and taken away again in its formula. A copy with 256 passes too.

The text positions `verify_overlays` prints (not checks) are computed for a 224-row window, so
in PAL they read 16 rows too high.

## 4. The `_pal` copies and their differences

```
verify_camera_pal.mjs        f(0.47) -> f(0.5405) in the screen matrix it compares with
                             (the rule: ay is the scene record's proportion, 0x002B2180)
verify_gs_state_pal.mjs      [R.ZBUF, 0x8cn] -> [R.ZBUF, big(((w + 63) >> 6) * ((h + 31) >> 5) * 2)]
model/clock_frame_pal.mjs    [REG.ZBUF, 0x8cn] -> [REG.ZBUF, big(((env.width + 63) >> 6) * ((env.height + 31) >> 5) * 2)]
verify_frame_pal.mjs         imports ../model/clock_frame_pal.mjs; nothing else
verify_orbs_pal.mjs          SCREEN = [640, 224] -> [640, 256]
verify_opening_camera_pal.mjs  fps = 60 -> 50 in the stage handlers;
                             integrate(middle) -> integrate(middle, constant(middle, 0x0036f9d0))
```

Each copy also has its own name in the `process.argv[1]` test. `clock_frame_pal.mjs` and
`verify_frame_pal.mjs` were copied from the versions of 16:42 (another worker is extending the
frame model); the `ZBUF` line is the only change needed there. Folding in: take `W`, `H` and
`ay` from what the probes already read instead of constants, and the frame rate from the mode
word (`0x002AD228` == 2; on ROM 2.30 the words at `0x0027B380` and `0x0027B388` read 2 on
the E image and 1 on the A image, which of the two is the mode was not read).

## 5. Not run

- The opening's other verifiers (cubes, lights, fog, overlays, towers) in PAL, and anything of
  the opening on ROM 2.30.
- `verify_transitions`, `verify_trail_fill` (another worker's, still changing).
- On ROM 2.30 in PAL: the cubes appearing, the menu → System Configuration transition.
- The sprites' fade rising, the hour turning and the written-state captures were not repeated
  in PAL.
- Text: positions and metrics are read, not recomputed.
- The configuration list ramp's length (74 in PAL, 90 in NTSC) is measured in memory; its
  writer was not read.

## 6. Files

- `References/scripts/verify_{camera,gs_state,frame,orbs,opening_camera}_pal.mjs`,
  `References/model/clock_frame_pal.mjs`.
- States `*-pal-*.p2s`, captures `*-pal-*`, dump
  `References/dumps/rom-0230E-pal-clock-ee-00100000.bin` (git-ignored).
