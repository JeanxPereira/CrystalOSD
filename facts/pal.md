# PAL

Builds: **HDD OSD 1.10U** (canon) and **ROM 2.30**, both run in PAL for
real, not stimulated. Addresses are HDD OSD's unless "ROM" is written. A PAL capture is
verified with `CLOCK_VIDEO=pal` (`builds.mjs`: `PAL`, `FPS`, `ROWS`).

## 1. How each build decides PAL, and how the PAL runs were obtained

**HDD OSD 1.10U** (*read*): `handle_get_vidmode` (`0x00208238`) reads `rom0:ROMVER` once and
caches the answer in `var_curvidmode` (`0x002AD228`): byte 4 of the string, the region letter,
gives `J` → 0, `A` or `H` → 1, `E` → 2; byte 5 goes to `var_curlang` (`0x002AD224`, `symbol_addrs.txt`).
`is_pal_vmode_p9_tgt` (`0x00208350`) is `handle_get_vidmode() == 2`, and has 70 callers. So the
video mode is the console's region and nothing else: no configuration item enters it.
`InitDraw` (`0x0020BD6C`) sets the screen to 640 × 256 in PAL (640 × 224 otherwise) and calls
`sceGsResetGraph(2, 1, PAL ? 3 : 2, 1)`.

**ROM 2.30** (*measured*): the same two functions are at ROM `0x002052C0` and `0x002058B8`
(`find_in_rom.mjs`). The OSDSYS of the 2.30 **E** image is the same code as the 2.30 **A**
image the ROM verifiers were written for: comparing 2 MB of EE memory of the two
(`$CRYSTALOSD_DATA/dumps/rom-0230A-clock-ee-00100000.bin`, `rom-0230E-pal-clock-ee-00100000.bin`),
`0x00200000..0x0027A26C` is equal word for word and the 41 words that differ up to
`0x00289000` are all data (version numbers, the region letter, the cached mode 1 → 2, buffer
and texture addresses). So every ROM 2.30 address holds on the E image. ROM 2.30's cached video
mode is the word at `0x0027B380` (read at `0x002052D0`; 2 is PAL).

**The PAL runs** (*measured*): the BIOS `$CRYSTALOSD_DATA/bios/megadump/ps2-0230e-20080220.bin`
(`0230EC20080220`).

- HDD OSD: `watson_launch { bios: <0230e>, elf: $CRYSTALOSD_DATA/dumps/hddosd-host/hddosd.elf, args:
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
| Vignette centre | `(0x10A0, (H / 2) << 4)` | y 1792 | y 2048 | measured |
| Vignette radii | HDD OSD: `1184, 592` unchanged (`func_002338E0` has no PAL step). ROM 2.30: the vertical term is multiplied by 1.15 when the video mode is PAL (`0x0022FEE4..0x0022FF00`, constant `0x002C81D8`) | 1184, 592 | HDD OSD 1184, 592; ROM 2.30 vertical term × 1.15 | measured on both: HDD OSD `hddosd-110U-pal-whole-to-clock`, ROM 2.30 `rom-0230E-pal-whole-menu` (`verify_frame.mjs`); the ROM step is read |
| Orb sprites' centre | `+ W/2`, `+ H/2` | 320, 112 | 320, 128 | measured |
| Refracted lookup (HDD OSD) | clamp to `0..W×16`, `0..H×16` | 3584 | 4096 | measured |
| Date and time `y` | `func_00226300` `0x00226350`: `y × 0.5405 / 0.47` (doubles `D_00365570`, `D_00365578`) when PAL | | × 1.15 | read; the draws it makes are equal in `verify_text2.mjs` on the PAL captures of both builds (section 3) |
| Button hint `y` | `func_00226958`: `y × 0.5405 / 0.47` (`D_00365590`, `D_00365598`) | 200 | 230 (sent at 229.6) | measured as sent; equal in `verify_text2.mjs` on the PAL captures |
| Button picture bottom (`DrawIcon`, HDD OSD `0x00226618..0x00226684`) | `is_pal_vmode_p9_tgt` at `0x00226618`, then `bnel v0, 1`: NTSC skips the body. PAL: `bottom = trunc(top + (float)(bottom - top) × 0.5405 / 0.47)` in 1/16 pixels, doubles at `0x00365580` and `0x00365588` | as drawn | scaled | read (`DrawIcon.s` `0x226610..0x22668C`); verified by `verify_text2.mjs` on 6 HDD OSD PAL captures (section 3). ROM 2.30: pictures not compared |
| Menu and configuration text metrics | double constants, PAL = NTSC × 1.15: 6 → 6.9, 10 → 11.5, 17 → 19.55, 24 → 27.6, 27 → 31.05, 42 → 48.3 (`D_003655A0`, `D_003656A8..E8`; callers `func_00226CA0`, `func_00229080`, `func_0022A410`, `func_0022AF60`, `func_0022C450`) | | | read; the draws are equal in `verify_text2.mjs` on the PAL captures, with no check of each constant on its own |
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
| Configuration list ramp (`D_002B2E04`) | `StartSysConfig`: `D_003702E0 + D_003702CC + D_003702D0` = `fps × 40 / 60` + `fps × 40 / 60` + `fps / 6`, set on every opening | 40 + 40 + 10 = 90 | 33 + 33 + 8 = 74 | read; measured in memory and by `verify_transitions.mjs` (`clock-transitions.md`) |
| Options dialog ramp | `D_003702D0 + D_003702CC` | 50 | 41 | read; ramp values compared in NTSC (`clock-transitions.md`) |
| Cubes' move for one place | `func_00230860`: speed `= 2 × distance / (rate / 2)`, slowing `= speed / (rate / 2)`, `rate` 59.94 or 50 | 24 frames (206, 7) | 19 frames (240, 9) | measured (`verify_cubes`) |
| Wrap of the counter at `D_002B2DE8 + 0x34` (adds 310 a frame) | `func_00230FD8`, `func_00228978`, `func_0022AB08`, `func_0022B3A8`: `fps × 31400 / 60` | 31 400 | 26 166 | read |
| Scroll steps | `D_0022E428` `0x0022E480`: ± 6 instead of ± 5; `D_00228748`; `func_0022C210`: ± 30 | | | read |
| Frame time for the time keeper (`D_00370328`) | `func_00235848`: `1000 / (PAL ? 50 : 59.94)` | 16.683 ms | 20 ms | measured in memory |
| Opening: integrator factor `k` | `D_0036F9D0` when PAL | 1 | 1.2 | measured (`verify_opening_camera.mjs`) |
| Opening: waits | `2 × fps`, `10 × fps`, `20 × fps / 6` | 120, 600, 200 | 100, 500, 166 | measured for the first; the intro runs 206 frames instead of 247 |
| Opening: proportion | `InitDoubleBuffer`: `D_0036F980` / `D_0036F984` | 0.457627 | 0.526271 | read |
| **Not scaled**: camera approach `× 0.97` a frame, scene scale factor 0.03 (ROM 0.1), clock easing 0.1, progress 0.004 a frame, colour walk every 9th frame, orb trail one point per 3 frames, cube spin 30 a frame, pulse `× 0.95` | per frame in both modes | | | measured: the same verifiers pass unchanged |

## 3. Verifiers in PAL

All run on real PAL captures, with `CLOCK_VIDEO=pal`. "rule" marks a verifier that held an NTSC constant and now holds the rule (section 4).

| Verifier | HDD OSD 1.10U, PAL | ROM 2.30 (E image), PAL |
|---|---|---|
| `verify_camera` | rule: FOUND, screen matrix 16 of 16 | rule: FOUND |
| `verify_view_matrix` | FOUND, 19 calls | FOUND, 18 calls |
| `verify_placement` | FOUND, 228 rods, 133 orbs | FOUND |
| `verify_clock_state` | FOUND, 19 frames | FOUND, 18 frames |
| `verify_scale` | FOUND, 240 steps from power-on (factor 0.03) | FOUND, 307 steps, the scale moving in 97 |
| `verify_approach` | FOUND, 240 steps (the clock starts at frame 158) | FOUND, 307 steps |
| `verify_rod` | FOUND, 6 918 face records, 7 524 textured faces | FOUND, 6 568 and 7 128 |
| `verify_rod_pieces` | FOUND | FOUND |
| `verify_refraction` | FOUND, 5 340 faces | FOUND, 5 066 faces |
| `verify_reflection` | FOUND, 3 156 faces | FOUND, 3 004 faces |
| `verify_orbs` | FOUND, 252 strips, 504 sprites; fade falling 700 strips, 1 400 sprites; fade rising 924 strips, 1 848 sprites (`hddosd-110U-flow-pal-fade-up2`, 178 calls, length 213) | FOUND, 238 / 476; fade falling 700 / 1 400 |
| `verify_gs_state` | rule: FOUND, every write as read (clock, configuration, the transition) | as written `ZBUF` too; rule: only the three known build differences |
| `verify_background` | FOUND: clock 288 strips, configuration 240, transition 1 360 | FOUND: 288, 256 |
| `verify_blur` | FOUND: 18 + 15 + 85 frame heads | FOUND: 18 + 16 |
| `verify_overlays` | FOUND: 18 + 15 + 85 frames (vignette 67 frames) | FOUND: 18 + 16 |
| `verify_cubes` | FOUND: 258 cubes with one move (19 frames), 126 cubes appearing (ramp of 33) | FOUND: 215 cubes; 190 cubes appearing (`rom-0230E-flow-pal-cubes-appear`) |
| `verify_transitions` | FOUND: power-on (`hddosd-110U-flow-pal-boot`), open (`-pal-open`), close (`-pal-close`) | FOUND: open (`rom-0230E-flow-pal-open`), close (`-pal-close`) |
| `verify_trail_fill` | FOUND: 2 086 strips, 49 392 points (`hddosd-110U-flow-pal-boot`) | not run |
| `verify_clock_state` and `verify_placement` with the hour turned in Clock Adjustment | FOUND: 66 frames (`hddosd-110U-flow-pal-hour`) | FOUND: 67 frames (`rom-0230E-flow-pal-hour`) |
| `verify_frame` | rule: FOUND: 15 frames of the clock (93.5% of the frame), 12 of System Configuration (80.9%), 49 frames of System Configuration to the clock (87.0%, `hddosd-110U-pal-whole-to-clock`), every packet the model produces | rule: FOUND, 16 frames of the clock (94.3%, `rom-0230E-pal-clock-b`), 13 of System Configuration (84.0%, `rom-0230E-pal-whole-config`), 17 of the main menu (77.7%, `rom-0230E-pal-whole-menu`) |
| `verify_opening_camera` | rule: FOUND, 206 frames | not run; the ROM's intro in PAL is run by `verify_opening3_stages_rom.mjs` on `rom-0230E-opening3-pal-intro`: FOUND, 291 frames (`opening.md` section 6) |
| `verify_text2` (`CLOCK_VIDEO=pal`; text and its rules in `text.md`) | FOUND on 6 captures `hddosd-110U-text2-pal-`: `menu` 72 strings 696 glyphs, `clock` 33 / 286, `version` 156 / 1 176, `config` 408 / 1 356, `adjust` 308 / 902, `down` 643 / 3 544. Button pictures (`DrawIcon`) equal: 24 of 24, 11 of 11, 48 of 48, 84 of 84, 22 of 22, 138 of 138 | FOUND on 5 captures `rom-0230E-text2-pal-`: `menu` 72 / 696, `config` 372 / 1 164, `clock` 33 / 286, `adjust` 336 / 984, `down` 643 / 3 544 (opening, binding, glyph, string level, colour, width, place, alpha, panels) |
| `verify_text_frame` with `--carry` (`CLOCK_VIDEO=pal`) | FOUND on the same 6 captures: 12, 11, 12, 12, 11 and 46 frames (menu, clock, version, config, adjust, down), every packet equal | not run (the model is HDD OSD only) |
| `verify_first_run` | FOUND on `hddosd-110U-flow-pal-fr-logos` (stages 0, 1, 2): 364 of 364 machine steps, 300 of 300 logo images; the ramp lengths are read from memory, so the images test that rows and alpha follow the probed ramp | not run |
| `verify_transitions` on the first run | FOUND on `hddosd-110U-flow-pal-fr-logos`, every value equal | not run |
| `verify_clock_state`, `verify_placement` with the time record written to hh:59:59 | FOUND on `hddosd-110U-flow-pal-hour-free`: 97 frames (rod progress and appearance 1 164 of 1 164); orb matrix, position, colour, ring 679 of 679 | `verify_clock_state` FOUND on `rom-0230E-pal-clock-written`: 72 frames (rod progress and appearance 864 of 864) |
| `verify_orbs`, sprites' fade rising | see the `verify_orbs` row | FOUND on `rom-0230E-flow-pal-fade-up3`: 924 strips, 1 848 sprites; ramp state at the calls: 178 rising, 284 shown |
| `model_aspect` (`clock-frame.md`) | FOUND on `hddosd-110U-pal-whole2-aspect2`: 96 date and time rows, 48 hint rows, item 0 = 2 in every frame (the scaled rows) | no capture |
| `verify_frame` with `--carry`, whole frame with text (`clock-frame.md`) | FOUND on `hddosd-110U-pal-whole3-config` (text 4 056 of 4 056 packets, 97.3% of the frame) and `-pal-whole3-menu` (1 750 of 1 750, 96.7%) | FOUND on `rom-0230E-pal-whole2-enter`: 75 frames, 92.8% of the frame (57 495 of 61 933 packets); text is not produced on ROM 2.30 |
| Opening, illegal-disc scene (`verify_opening3_stages`, `verify_opening3_handoff`, `verify_opening_flat`, `verify_opening_ghost`, `verify_opening_illegal_cubes`, `verify_opening3_illegal_v2`; `opening.md`) | FOUND on `hddosd-110U-opening3-pal-illegal`: stages 224 frames (handlers 0, 4, 5 × 92, 6 × 130; sound `0x6150,6` once), hand-off 1, flat 800 draws, ghost 222, cubes 1 110 (432 900 writes), `verify_opening3_illegal_v2` 3 108 fans, 1 110 glows, 28 212 boxes, 131 banners, 1 648 372 writes | FOUND: `verify_opening3_illegal_v2.mjs` on `rom-0230E-opening3-pal-ill-a-as-hdd`: 3 234 fans, 1 155 glows, 29 368 boxes, 139 banners; `verify_opening3_stages_rom.mjs` and `verify_opening3_handoff_rom.mjs` on the `rom-0230E-opening3-pal-` captures `count`, `readyexec`, `intro`, `d71z`, `ill-a` (`opening.md` section 6) |
| Opening, towers (`verify_opening_towers_ee`, `verify_opening_vu1_v2`, unchanged; `opening.md`) | FOUND: `hddosd-110U-opening3-pal-towers-a` 5 796 chains, 3 060 288 words, 5 796 VU1 towers, 40 572 packets; `-pal-towers-late` 6 552 chains, 45 864 packets, 413 vertices sent without drawing | FOUND: `rom-0230E-opening3-pal-towers-a-as-hdd` 5 796 chains, 40 572 packets; `-pal-towers-late-as-hdd` 12 474 chains, 87 318 packets, 453 vertices sent without drawing (run with `OPENING_BUILD=rom`; the traces are rewritten by `extract_opening_rom_trace.mjs`) |

The PAL towers captures cover the start of the towers state and the end of the dive, not every
frame between (HDD OSD 45 and 150..202 frames; ROM 46 and 200..299).

`verify_orbs` passes as written although it holds `SCREEN = [640, 224]`: the half height is
added and taken away again in its formula. With 256 it passes too.

The text positions `verify_overlays` prints (not checks) are computed for a 224-row window, so
in PAL they read 16 rows too high; the text is checked by `verify_text2.mjs` (section 3).

## 4. What PAL changed in the verifiers

Four NTSC constants, now rules: `verify_camera.mjs` takes `ay` from the video mode;
`verify_gs_state.mjs` computes `ZBUF_1` as `ceil(W/64) × ceil(H/32) × 2` (it held `0x8C`);
`verify_orbs.mjs` takes the rows from the video mode; `verify_opening_camera.mjs` takes the rate
and, in PAL, the integrator factor at `0x0036F9D0`. The frame model's `ZBUF_1` is the same rule.

`verify_opening3_illegal.mjs` says PARTIAL on the PAL illegal-disc capture (frame 130: 68 box
packets sent, 128 computed): the sound thread's periodic `sound_handler_queue_cmd` probe (pc
`0x00200C00`, ra `0x00200A48`) falls inside the box loop and ends the packet window.
`verify_opening3_illegal_v2.mjs` differs from it only by not letting that probe end a window, and
is FOUND on the PAL capture and on the NTSC `-illegal` and `-illdraw` captures.

## 5. Floating point

The EE's FPU has no denormals: the camera's approach offset, multiplied by its factor every
frame, goes from the smallest normal number to minus zero, not through denormals
(`rom-0230E-pal-clock-b`, frame 3395: carried `0x807E22B0`, real `0x80000000`). The frame model's
single-precision step returns a signed zero below the smallest normal number (`verify_frame.mjs`,
`clock-frame.md`). *Measured*.

## 6. Open

- ROM 2.30 in PAL: `verify_trail_fill.mjs` and `verify_first_run.mjs` are not run.
- HDD OSD PAL first run: only the logos (stages 0 to 2) are captured; the language prompt, the
  User Preferences pages and the end stage are not.
- Hour carry in PAL: `rom-0230E-pal-clock-written` (state `rom-0230E-pal-clock.p2s`) has the time
  record written to hour 5, 59 min, 59 s, 900.0 ms. `verify_clock_state.mjs` is FOUND on its 72
  frames, but no script compares the carry itself nor the return to the console's time afterwards.
  The wrap from hour 23 to 0 is not exercised.
- Text in PAL: the soft-double routines (`dpmul`, `dpdiv`, `dpadd`) are modelled as IEEE
  round-to-nearest in `verify_text2.mjs`, not traced bit by bit. Hand mutants of the `DrawIcon`
  line on `hddosd-110U-text2-pal-down`: `trunc` to `round`, `+1` on the top, multiply and divide
  swapped and the sign flipped are killed; removing `Math.fround` survives (the operand is an
  integer count of sixteenths). ROM 2.30 button pictures are not compared in PAL, no mutation was
  run on the ROM PAL text captures, and languages other than English are not captured in PAL.
- `verify_opening3_illegal_v2.mjs` on the PAL capture: 31 of 177 mutants survive (UV origin terms
  that are 0, wrap and clamp edges, the tile-fade branch `z < 672`, one glow value, constants
  below a truncation step). The stage verifier prints that the integrator is equal in 224 frames,
  not the factor 1.2.
