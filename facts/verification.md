# What has been verified, on which build

Every row is a script in `References/scripts/` that recomputes what a function produced from the
inputs a trace probe recorded at its entry, and compares bit for bit. `CLOCK_BUILD=hdd` selects
HDD OSD 1.10U's addresses (`builds.mjs`); the default is ROM 2.30; `CLOCK_VIDEO=pal` selects
PAL (`pal.md`). Captures are in `Watson/Runtime/captures/`, named `hddosd-110U-…` and
`rom-0230A-…` (`rom-0230E-…` in PAL).

**HDD OSD 1.10U is the canon build, and it runs** (`hddosd-boot.md`).

**Re-running all of it.** `References/scripts/run_all.manifest.json` has 882 entries, one per
verifier, capture, build and video mode, and `node References/scripts/run_all.mjs` passes 882 of 882 (2026-10-05); `node References/scripts/run_all.mjs` runs them in
parallel and exits 1 on any that no longer passes (`--filter <regex>`, `--changed`, `--jobs <n>`).
`node References/scripts/mutate.mjs <verifier>` changes one constant, operator or comparison of
a verifier at a time and expects none of the mutants to end `FOUND`.

## The clock and System Configuration

| Script | What it recomputes | HDD OSD 1.10U | ROM 2.30 |
|---|---|---|---|
| `verify_clock_state.mjs` | time → current rod, angles, progress, colours, appearance | 19 frames; 53 with the hour turned in Clock Adjustment; 43 + 39 with the ramp and angles written; 86 with the hour turning on its own | 37 + 37 + 33 + 47 frames, with the hour turning; 86 with the hour turning on its own |
| `verify_placement.mjs` | rod and orb matrices, orb position, colour, ring; the sine table | 228 rods, 133 orbs | 780 rods, 455 orbs |
| `verify_camera.mjs` | the screen matrix (bit for bit), the view matrix (to 1.5e-5, in double precision) | one camera, 539 calls | one camera, 539 calls |
| `verify_view_matrix.mjs` | the view matrix bit for bit, through the library's own sine, rotation, cross product and normalize | 124 distinct matrices | 125 distinct matrices |
| `verify_approach.mjs` | the camera's approach from power-on | 217 steps | 177 steps |
| `verify_scale.mjs` | the scene scale easing toward its target | 47 steps, factor 0.03 | 19 steps, factor 0.1 |
| `verify_rod.mjs` | transform; textured emitter; rod centre | 4 180 face records, 4 356 faces | 3 956 face records, 4 356 faces |
| `verify_rod_pieces.mjs` | the split rod's two pieces; every texture offset | 57 split rods, 7 524 faces | 36 split rods, 4 752 faces |
| `verify_refraction.mjs` | refracted emitter: `PRIM`, colour, `UV`, `XYZ` | 3 179 faces, with its clamp | 3 073 faces, with its wrap |
| `verify_reflection.mjs` | reflection emitter; edge term `F` | 2 044 faces, 3 200 terms | 1 626 faces, 2 793 terms |
| `verify_orbs.mjs` | trail strips; the four sprites and their fade | 182 strips, 364 sprites; fade falling 910 / 1 820, rising 924 / 1 848 | 826 strips, 1 652 sprites; fade rising 924 / 1 848 |
| `verify_gs_state.mjs` | registers sent by the state helpers, per call | 3 220 calls, every write as read | 3 510 calls; differs in `CLAMP_1`, `TEST_1`, `TEXFLUSH` |
| `verify_background.mjs` | the background tube: every vertex of every strip, the grey ramp, when it is drawn | 8 240 strips, 485 442 vertices | 6 272 strips, 369 510 vertices |
| `verify_blur.mjs` | head of the frame: clear, blur trips, copies, tint; every sprite-helper packet | 757 frame heads, 36 954 sprites | 694 frame heads, 35 259 sprites |
| `verify_overlays.mjs` | fade overlay and its state machine, vignette, bars, right column | 757 frames | 694 frames |
| `verify_cubes.mjs` | the cubes of System Configuration: place, scale, colour, matrix, every face sent | 1 740 cubes in 6 captures | 1 722 cubes in 7 captures (one with the ring forced) |
| `verify_transitions.mjs` | mode and weight step, set mode, band ramp, orb position and colour blend in modes 2 and 3 | 8 captures: boot (plain and through the intro), open, close, leave, return, modes 1 and 4 written | 7 captures: boot, open, close, leave, return, modes 1 and 2 written |
| `verify_trail_fill.mjs` | the trail while its ring fills, down to an empty strip | 6 244 strips, 148 176 points | 4 172 strips, 98 784 points |
| `verify_rand.mjs` | the per-orb random angles | 14 of 14 | 7 of 7 |
| `verify_options.mjs` | the options dialog's ramp | 77 + 77 ticks, every value equal | 77 + 77 ticks, every value equal |
| `verify_exits.mjs` | the clock thread's exits for the drive's screen codes; code `0x72` with its gate word written to 1 and to 0 (`flow_exit72.mjs`, `clock-transitions.md` section 4b) | 11 codes; `0x72`: module 5 with the word 1, no exit with 0 | 12 codes; `0x72`: module 5 with the word 1, no exit with 0 |
| `verify_first_run.mjs` | the first-run stages' machine steps and logo images (`clock-transitions.md` section 4); stage 3 (the settings pages) is not computed | `fr-logos` 422 of 422 steps, 360 of 360 images; `fr-lang` 25 of 25; `fr-end` 125 of 125; PAL `pal-fr-logos` 364 of 364 steps, 300 of 300 images | `fr-logos` 335 of 335, 85 of 85 images; `fr-cold` 666 of 666, 360 of 360; `fr-full` 665 of 665, 360 of 360 |
| `model_aspect.mjs` | configuration item 0 (the aspect ratio): date, time and hint rows against the model, the reload of item 0, the bars' count (`clock-frame.md`) | 5 captures `hddosd-110U-whole2-aspect*` (48 of 48 date, time and hint rows; 47 of 47 on cancel), PAL `hddosd-110U-pal-whole2-aspect2` | 5 captures `rom-0230A-whole2-aspect*` incl. `aspect0-bit3` and `aspect2-gate` |
| `verify_frame.mjs` | **end to end**: every packet of the rods, orbs and extra passes of a frame, from a snapshot at the frame's start (`clock-frame.md`) | 14 frames: 2 744 vertex packets and 4 256 state packets, all equal | 9 + 29 frames: 8 226 vertex packets and 11 552 state packets, all equal |
| `verify_frame.mjs --carry` | **the whole frame** except text, from state carried frame to frame (`clock-frame.md`) | 11 captures incl. boot, through the intro, menu, config, transitions, PAL: all equal, 77.5–93.5% of the packets | 9 captures incl. PAL: all equal, 77.7–94.6% |
| `verify_frame.mjs --carry` on the `whole2` captures (the menus' code modelled) | main menu, System Configuration down, up, back, to the clock, leave, Clock Adjustment open, hour, confirm, cancel, overlay modes 1 and 4: every one FOUND with zero events (`clock-frame.md`) | 13 captures | 12 captures + `rom-0230E-pal-whole2-enter` (PAL) |
| `verify_frame.mjs --carry` on `hddosd-110U-whole3-version` | the Version page's ramp carried by `clock_menus.mjs` (triangle, job poll hold, circle) through open, held and close (`clock-transitions.md` 4f) | 124 frames, FOUND | not modelled (the page is HDD OSD's) |
| `verify_version.mjs` | the Version page's ramp, record, rows, job, panel words, hints and the front page's ramp, from `clock_version.mjs` (`clock-transitions.md` 4f) | 5 captures `hddosd-110U-whole3-version`, `-version-nav`, `-version-stim`, `-version-stim2`, `-version-stim3`: 126, 131, 106, 87, 87 frames | not modelled |
| `verify_frame.mjs --carry` on the `whole3` captures (with text) | the text packets of the clock alone, main menu, System Configuration, enter, Clock Adjustment, boot (`clock-frame.md`) | 6 captures + 2 PAL (`pal-whole3-config`, `pal-whole3-menu`): text packets all equal, 96.7–99.2% of the packets | not modelled (`text.md`) |
| `extract_rom_textures.mjs` | the ten textures, against GS memory | equal | equal |
| `extract_rod_mesh.mjs` | the rod mesh in the file against ROM memory | equal | equal |

`verify_frame.mjs --carry` also has the `whole2` captures (the menus' code modelled); every one
ends `FOUND`, and their coverage is in `clock-frame.md`.

## The cold start of the clock thread (`clock-config-items.md`, `clock-menu-leaves.md`, `clock-records.md`, `clock-rand-chain.md`)

The init functions of `module_clock_init_resources` (HDD OSD 0x225DB0) run in `cold_mips.mjs`, an EE interpreter over the program's initial image, and are compared with the rule. Ports in `Source/Scene/Cold*.cpp` are tested against the verifiers' exported values.

| Script | What it recomputes | HDD OSD 1.10U | ROM 2.30 |
|---|---|---|---|
| `verify_cold_ramps.mjs` | the init ramps and length setters (0x234B88, 0x232858, 0x2324C8, 0x238F20, 0x239E60, 0x22A9C0) | NTSC and PAL, 95 stores, 693 words | NTSC and PAL against the HDD stores (the level word and a page pointer differ by build) |
| `verify_cold_time.mjs` | the time record, time zone, frame period (0x235848) | 115 cases, NTSC and PAL | 115 cases with the image's own gp; the frame period compared |
| `verify_clock_write.mjs` | Clock Adjustment confirm (`0x00235170`): items and settings word to the six RTC words, seven BCD bytes, flag, mirror | 3 captures, 2 confirms each (zone 0, summer time, zone -720) | not captured (same code, read) |
| `verify_cold_camera.mjs` | `clock_stuff1`, 0x225D98, mode, the exit handler's screen code | 4 screen sizes, 16 handler cases | the same, NTSC and PAL |
| `verify_cold_state.mjs` | 0x22EF40: rods, hands, colours, seven rand angles | 66 cases, NTSC and PAL | 0230A only (the 0230E image has other data addresses) |
| `verify_cold_config.mjs` | the config list builder and `config_load_clock_osd` | 120 cases | not claimed |
| `verify_cold_font.mjs` | `do_load_font`, the width cache | NTSC and PAL | no witness (another function) |
| `verify_cold_rand_chain.mjs` | the generator's state from the calls before the clock | 3 logs | |
| `verify_cold_interpreter.mjs` | the interpreter's result for each of 13 init functions against the emulator's memory at their exits | 109 941 words, NTSC and PAL | 79 464 words, 0230A NTSC and 0230E PAL |
| `measure_cold_config_items.mjs`, `measure_cold_menu_leaves.mjs`, `measure_cold_records.mjs` | which code writes each leaf, or that none does | watch logs of full sessions | |

## Text (`text.md`)

| Script | What it recomputes | HDD OSD 1.10U | ROM 2.30 |
|---|---|---|---|
| `verify_text.mjs` | every glyph packet, string openings, texture set-ups and uploads; on HDD OSD also character, pen, colour and place of every string | 7 captures: 7 929 glyph packets, 41 575 string-level values, 312 places | 4 captures: 3 098 glyph packets, 2 576 pen steps |
| `verify_text2.mjs` | alpha of every caller, the remaining places, the languages, PAL; on ROM 2.30 string, place and alpha level | 18 captures `hddosd-110U-text2-*` (NTSC, incl. `close`, French, German, Spanish, Portuguese, Italian, Dutch, the Japanese table), 6 PAL (`pal-menu`, `-clock`, `-version`, `-config`, `-adjust`, `-down`: `DrawIcon` pictures equal): string, glyph, place, alpha, panels and entries equal | 6 captures `rom-0230A-text2-*` (`config`, `clock`, `open`, `menu`, `adjust`, `down`) and 5 PAL `rom-0230E-text2-pal-*`: opening, binding, glyph, string level, colour, width, place, alpha, panels equal; the ROM's button pictures are not compared (`text.md` section 6) |
| `verify_text_frame.mjs --carry` | the font library's context carried across characters, strings and frames | `menu` 770 of 770 packets, `boot` 3 599 of 3 599, `open` 10 552 of 10 552, `down` 4 710 of 4 710, `adjust` 1 386 of 1 386, `version` 1 488 of 1 488, `clock` 384 of 384, `close` 8 078 of 8 078; the six PAL captures (12, 11, 12, 12, 11, 46 frames); the language captures | not modelled (the model holds HDD OSD's font code only) |

## The opening intro (`opening.md`)

The intro's verifiers run on ROM 2.30 through `extract_opening_rom_trace.mjs` (`opening.md`
section 6); the `_v2` copies (`verify_opening_{camera,camera_rom,cubes,fog,lights,towers,vu1}_v2.mjs`
and `verify_opening_overlays_v2.mjs`) route single-precision operations through the exact helpers
of `References/model/opening-lib.mjs` and give the same counts as the plain versions on every
capture of the page.

| Script | What it recomputes | HDD OSD 1.10U | ROM 2.30 |
|---|---|---|---|
| `verify_opening_camera.mjs`, `verify_opening_camera_rom.mjs` | camera integrator, fade, blur level, logo alpha | 247 frames, the whole intro | 359 frames (the ROM's own update function) |
| `verify_opening_stages.mjs`, `verify_opening_stages_rom.mjs` | stage handlers | with the camera | 359 frames; 31 fades, 35 blurs, 120 logo alphas |
| `verify_opening_cubes.mjs` | the five glass cubes: angles, matrices, every vertex packet and `ALPHA` | 994 cubes, 9 940 packets | 1 490 cubes, 14 900 packets; 1 540 cubes on the whole intro |
| `verify_opening_lights.mjs` | the four lights' sprites and trails | 218 frames | 318 frames, 5 088 sprite and 1 272 trail packets; 329 frames on the whole intro |
| `verify_opening_fog.mjs` | six fog layers | 246 frames, 25 092 packets | 347 frames, 35 394 packets; 358 frames on the whole intro |
| `verify_opening_overlays.mjs` | the ghost of the previous frame, the logo | 246 + 120 draws | logo 120 (the ghost half models HDD OSD's call sequence and does not apply) |
| `verify_opening_ghost.mjs` | the ghost | on the illegal-disc scene: 238 ghosts | 358 |
| `verify_opening_towers.mjs`, `verify_opening_vu1.mjs` | the towers' PATH1 packets from a model of the VU1 microprogram | up to 3 780 towers; both routines and the out-of-bounds path exercised (the moved-coordinates routine only with the code patched: no history reaches it) | 1 512 towers in 12 frames; 19 278 towers on `rom-0230A-opening3-towers-late-as-hdd` (`verify_opening_vu1_v2.mjs`) |
| `verify_opening_towers_ee.mjs` | the towers' VIF1 chain from the play history | 6 300 chains | 1 512 chains; 19 278 on `rom-0230A-opening3-towers-late-as-hdd` |
| `verify_opening_flat.mjs` | frame copy, bars, fade, dive blur | 557 calls | 784 calls: copy 359, bars 359, fade 31, blur 35 |
| `verify_opening_inputs.mjs` | `sinf`/`cosf`, libvu0 matrices, fog mesh, cube tables | 16 090 values | 124 680 values; 127 250 on the whole intro |
| `verify_opening_handoff.mjs`, `verify_opening_handoff_rom.mjs` | the hand-off to the clock or the illegal-disc scene | HDD OSD | 1 hand-off |
| `verify_opening_illegal.mjs`, `verify_opening_illegal_cubes.mjs` | the illegal-disc scene: values of the draw, its cubes | 239 frames, 1 768 948 writes equal; 1 190 cubes, 464 100 writes equal | through `verify_opening3_illegal_v2.mjs` below |
| `verify_opening3_stages.mjs`, `verify_opening3_stages_rom.mjs` | the stage machine under stimulated disc states, hard-disk words and the illegal scene's end wait; sound commands in command, argument registers and call site | 33 captures `hddosd-110U-opening3-*`; `-illegal` 242 frames; PAL `-pal-intro`, `-pal-illegal` (224 frames) | 42 captures `rom-0230A-opening3-*` (`-intro` 359 frames); 8 PAL `rom-0230E-opening3-pal-*` (`-intro` 291 frames) |
| `verify_opening3_handoff.mjs`, `verify_opening3_handoff_rom.mjs` | every branch of the hand-off to the clock (`opening.md` section 8) | 25 captures; PAL 2 | 34 captures; PAL 5 |
| `verify_opening3_illegal.mjs`, `verify_opening3_illegal_v2.mjs` | the illegal-disc scene's draw: fans, glows, boxes, banners, every write | `-illegal` 3 360 fans, 1 200 glows, 30 535 boxes, 131 banners; `-illdraw` 3 332, 1 190, 30 280, 128; PAL `-pal-illegal` (`_v2` only; `verify_opening3_illegal.mjs` says PARTIAL there) 3 108, 1 110, 28 212, 131 | `_v2` on `rom-0230A-opening3-ill-a-as-hdd` 2 604 fans, 930 glows, 23 668 boxes, 76 banners; PAL `rom-0230E-opening3-pal-ill-a-as-hdd` 3 234, 1 155, 29 368, 139 |

## PAL (`pal.md`)

Both builds were run in PAL for real (BIOS 2.30 E; `CLOCK_VIDEO=pal`). Every verifier of the
first table passes there on both builds except `verify_trail_fill.mjs` and `verify_first_run.mjs`,
which are not run on ROM 2.30 PAL (the sprites' fade rising is: `rom-0230E-flow-pal-fade-up3`).
On HDD OSD every opening verifier passes in PAL (`opening.md` section 7: stage machine 206
frames, flat draws 465, ghost 205, cubes 822, fog 205, lights 182, library inputs 70 436 values,
hand-off 1, logo 120; the illegal-disc scene `hddosd-110U-opening3-pal-illegal`; the towers on
`hddosd-110U-opening3-pal-towers-a` and `-late`). On ROM 2.30 PAL: the intro, stage machine and
hand-off (`rom-0230E-opening3-pal-*`, 291 frames), the illegal-disc scene
(`rom-0230E-opening3-pal-ill-a-as-hdd`), the towers (`rom-0230E-opening3-pal-towers-a-as-hdd`,
`-late-as-hdd`), the record written to hh:59:59 (`verify_clock_state.mjs` on
`rom-0230E-pal-clock-written`, 72 frames) and the text (`verify_text2.mjs`, 5 captures). No
script compares the hour carry in PAL (`pal.md` section 6).

## Where the builds differ, all measured on both

| | HDD OSD 1.10U | ROM 2.30 |
|---|---|---|
| Refracted lookup | 12.4 coordinates clamped to `0..W×16`, `0..H×16`; region clamp on the buffer | 1024 and 256 added, floor at 1024, no region clamp: strays up to 4.13 texels below the picture |
| Loaded textures other than the grain | clamp | repeat |
| Depth test in the texture binders | greater or equal | greater |
| Scene scale easing factor | 0.03 | 0.1 |
| Scene scale before the time is known | held at 0 | eased like any other frame |
| Refracted face header | one `CLAMP_1`: region clamp to the screen | two `CLAMP_1 0x1000000` |
| A split rod's grain | one packet for both pieces | one packet per face |
| Blur trips on the clock alone | 0 (`c < T ? 10 - c*10/T : 0`) | 5 before the rods (`5 + 5*clamp(T - c, 0, T)/T`) |
| Vignette's last sector | 6 vertices | 8 vertices |
| Glyphs | 12-vertex triangle fans | sprites |
| Cubes of System Configuration | always the ring of six | five standing cubes while the list has fewer than six entries |
| Opening: `CLAMP_1 = 0` in frame copy, blur and ghost | sent | not sent |
| Opening: length of the intro | 246 frames | 359 frames |

Everything else compared so far is the same code and gives the same values.

## Stimulated captures

Repeated on HDD OSD (`hddosd-110U-stim-*`): the hour turned in Clock Adjustment, the ramp and
angles written while paused, the sprites' fade falling and rising. The time keeper only corrects
the record when the console's second changes, so a record written to hh:59:59.9 runs on by
itself, turns the hour, and is pulled back within the second (measured on both builds).

## Not verified on either build

- Text on ROM 2.30: its button pictures, its trimming branch and languages other than English;
  languages other than English on either build beyond the captures of `text.md` section 5.
- The first-run intro's stage 3 (the settings pages), HDD OSD's stage 5, and the first run in PAL
  beyond HDD OSD's stages 0 to 2.
- Mode 1 of the overlay has no caller in either build.
- Text inside the whole-frame model on ROM 2.30.
- Open items per page are listed in `README.md`.

## A known weakness of the scripts

The single-precision helper `f(a + b)` shared by the older verifiers rounds the double sum
toward zero; when one addend is below the other's double precision it is lost, which is not
what the EE does. It showed in three ROM 2.30 cubes of the intro; `References/model/opening-lib.mjs`
has an exact `add`, used by the `_v2` copies of the opening's verifiers. Verifiers without a
`_v2` copy keep the plain helper; every capture taken passes with it.
