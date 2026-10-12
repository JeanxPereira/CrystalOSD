# The opening module: closing what `facts/opening.md` left open (draft)

## CHECKPOINT (paused 2026-10-02 ~18:55 at the coordinator's request)

No emulator session of mine is running or queued (all waiting wrappers were stopped before they
launched; nothing was killed mid-capture).

### Done and verified (re-run offline, every verdict FOUND unless said)

| Item | Script | Capture(s) | Result |
|---|---|---|---|
| 6, exact arithmetic | `extract_opening_exact.mjs` writes `verify_opening_{camera,camera_rom,cubes,fog,lights,towers,vu1}_v2.mjs` (every single-precision +, -, /, sqrt through `opening-lib.mjs`'s exact `add`, `sub`, `quotient`, `root`) | every `*-opening-*`, `*-opening2-*` capture | all FOUND, same counts as the old helper (e.g. cubes 994 / 1 490 ROM, towers up to 3 780, camera 247 / 359 ROM) |
| 3, stage machine, HDD OSD | `verify_opening_stages.mjs` (all eight handlers of `jtbl_00365400`, the three disc-state tables, the hard-disk branches, stage 6's end wait, stage 7's restart; exact integrator; fade alpha of both scenes; first-frame set-up of both scenes) | `hddosd-110U-opening3-intro` (247 frames), `-illdraw` (239, illegal scene: stages 4, 5, 6 and the end wait's stamp), `-disc65-a` (36), `-late-a` (26: stage 6 with z written 1130, the z > 1128 fade branch), `-late-b` (1: z written 1161, stage 7 runs OpeningInitAnimation and returns 2) | all equal |
| 3, stage machine, ROM 2.30 | `verify_opening_stages_rom.mjs` (ROM handlers read at 0x0021A510..0x0021AA70: stage 0 starts the scene, stages numbered +1, 18-entry tables with 0x75, the ROM-only hard-disk hold and stage-3 countdown) | `rom-0230A-opening3-intro` (raw ROM trace, 359 frames) | equal |
| 1, ROM hand-off | `verify_opening_handoff_rom.mjs` (ROM 0x002164A8, read in full: early forced-clock exit, disk-ready wait, 12-entry table 0x002C41A0 incl. 0x72's CDDA test and 0x75) | `rom-0230A-opening3-intro` | 1 hand-off equal (forced clock: module 2, previous 1) |
| 2, illegal-disc scene draws | `verify_opening_illegal.mjs` (colour scale of func_002243F8, particle turn and places of func_00223608 with libm `sinf`/`cosf`, both 7-fan functions, the five glows of func_00223230/func_00222EE0, the 128 drifting tiles of func_0021E950, the banner's alpha and rectangle) | `hddosd-110U-opening3-illdraw` | 238 scales, 238 turns, 3 332 fan packets, 1 190 glows, 30 280 tile packets (184 not drawn), 237 tile-state carries, 128 banner alphas and draws: 1 768 948 writes equal |
| 2, illegal-disc cubes | `verify_opening_illegal_cubes.mjs` (func_00222678 with callback D_002221F0; differences from the intro's cubes listed in its header) | `hddosd-110U-opening3-illdraw` | 1 190 cubes, 90 440 record values, 11 900 packets, 464 100 writes |
| 2, flat draws and ghost in the illegal scene | existing `verify_opening_flat.mjs`, `verify_opening_ghost.mjs` | `-illdraw`, `-ill74` | 844 / 808 flat draws, 238 ghosts |
| 4, PAL intro, HDD OSD | all opening verifiers with `CLOCK_VIDEO=pal` | `hddosd-110U-opening3-pal-intro` (BIOS 2.30 E) | stages 206 frames, flat 465, ghost 205, cubes 822, fog 205, lights 182, inputs 70 436, hand-off 1, overlays (`_v2`) 205 ghosts + 120 logos |
| 4, PAL fix | `verify_opening_overlays_v2.mjs`: in PAL func_0021D990 takes the logo rectangles 0x20 bytes further into D_00365158 (`sltu s1, zero, is_pal; sll s1, 5` at 0x0021DA10..0x0021DA20) | PAL and NTSC | both FOUND |
| 5, Framebuffer clears | `extract_opening_clear.mjs` | `-opening3-pal-intro`, `-opening-full`, `-opening3-ill-map` | 3 032 clear sprites: XYOFFSET_1 in effect puts them at window (-1728, -1936)..(-1088, -1712) (PAL -1920..-1664), SCISSOR_1 0..639 x 0..223 (255): 0 pixels drawn, in every frame target |
| ROM intro, HDD verifiers via `extract_opening_rom_trace.mjs back` | flat, ghost, overlays_v2 (logo half), cubes_v2, fog_v2, lights_v2, inputs | `rom-0230A-opening3-intro-as-hdd` | flat 784, ghost 358, logo 120, cubes 1 540, fog 358, lights 329, inputs 127 250 |
| ROM disc-state writer | write watchpoint | — | ROM 2.30 writes the disc state at `0x0020F740` (`sw s1, 0x10(v0)`); HDD OSD at `0x00211FD4` |

New files: `References/scripts/elf_words.mjs`, `extract_opening_exact.mjs`, `extract_opening_clear.mjs`,
`verify_opening_stages.mjs`, `verify_opening_stages_rom.mjs`, `verify_opening_handoff_rom.mjs`,
`verify_opening_illegal.mjs`, `verify_opening_illegal_cubes.mjs`, the seven `*_v2.mjs` copies and
`verify_opening_overlays_v2.mjs`. Scratchpad helpers: `o3cap.mjs` (one session, config JSON:
build/bios/elf/args/state, verifiers, `rom: true` maps them through `plan`, `extraProbes`,
`patches`, `writes`, steps `[advance, traceFrames, name, writesAfterAdvance, reads]`),
`o3_run.sh` (retries when `with_emulator.mjs` itself crashes on its lock race), `o3_state.mjs`.

### In progress (state at the pause)

- Found at the pause: **code patches written at frame 1 are lost** (the OSD's code is loaded
  afterwards), so `-disc65-*`, `-ill74` ran with the disc state not held (it went back to 0x64;
  those captures still verify as plain runs). Patch with the writes, after the advance.
- `-disc65-b` and `-late-b` mostly fell outside the scene (module ended / single frame); `-late-b`
  verified its one frame.
- Also found: on the default HDD OSD run the clock is forced (`0x002AD22C` = 0), so the stage-2
  disc switch and its sounds need `0x002AD22C = 1` (ROM: `0x0027B394 = 1`).

### Next, in order (the capture commands, `o3_run.sh <name> '<json>'`)

H = `"build":"hddosd-1.10U-host"`, OP = `"args":"SkipSearchLater BootOpening"`, IL = `"args":"SkipSearchLater BootIllegal"`,
ST = `verify_opening_stages.mjs,verify_opening_flat.mjs,verify_opening_ghost.mjs,verify_opening_handoff.mjs`,
NOP = `["0x211fd4","00000000"]` (ROM `["0x20f740","00000000"]`), PALB = BIOS `ps2-0230e-20080220.bin` (+ the ELF for HDD OSD),
NATIVE = `PROBES` of `verify_opening_stages_rom.mjs` + `verify_opening_handoff_rom.mjs`.

1. `illegal`: {H, IL, verifiers ST, steps [[100,290,"hddosd-110U-opening3-illegal"]]} — the illegal scene through its end wait and the hand-off.
2. `disc6c`: {H, OP, ST, steps [[135,0,null,[NOP-as-write, ["0x1f000c","6c000000"], ["0x2ad22c","01000000"]]], [0,280,"...-disc6c"]]} — stage-2 sound branch `0x6140,7 0x6150,11`, snapshot 0x6C, hand-off execute 1.
3. `enter`: {H, OP, ST, [[135,0,null,[["0x2ad22c","01000000"]]],[0,280,"...-enter"]]} — snapshot path with disc 0x64.
4. `disc65`: as 2 with 0x65; trace 30, then advance 880 and trace 150 (stage 1 without the wait; stage 2 entered by z > 56 at about counter 950).
5. `ready`: {H, OP, ST, [[135,0,null,[["0x2ad230","01000000"],["0x2ad22c","01000000"]]],[0,80,"...-ready-a"],[0,200,"...-ready-b",[["0x2ad234","01000000"]]]]} — both hard-disk branches of stages 1 and 2, sound `0x6150,f`, hand-off module 0 / execute 6.
6. `mecha` (IL, write 0x1F0008 = 1 at 100, trace 250), `ill74` (IL, NOP + 0x74 at 100, trace 250), `ill72` (IL, NOP + 0x72 and 0x1F0D58 = 0, trace 180; then 0x1F0D58 = 1, trace 160).
7. `palillegal`: {PALB, IL, verifiers `verify_opening_illegal.mjs,verify_opening_illegal_cubes.mjs,`+ST, [[100,290,"hddosd-110U-opening3-pal-illegal"]]} with `CLOCK_VIDEO=pal`.
8. ROM: `romill` (rom: true, verifiers illegal + illegal_cubes + flat + ghost, extraProbes NATIVE; at 60 write NOP + 0x1F0010 = 0x74; trace 420 then 260), `rompalintro` (PALB without ELF, the intro set, NATIVE, [[50,380,...]]), `romcount` (NOP + 0x1F0010 = 0x6C + 0x27B394 = 1 at 60; trace 420: the countdown 7 / 58), `romready` (0x27B398 = 1, 0x27B394 = 1 at 60; trace 100; 0x27B39C = 1; trace 250), `romtowers` (state `rom-0230A-opening-towers-full.p2s`, verifiers `verify_opening_towers_ee.mjs,verify_opening_vu1_v2.mjs`, trace 330: towers late in the dive).
9. PAL towers: `o3_state.mjs` with BIOS 2.30 E to make `hddosd-1.10U-host-opening-pal-towers-full.p2s` (bp 0x00221D30, table 0x001F0198) and `rom-0230E-opening-pal-towers-full.p2s` (bp 0x0021D428, table 0x001F0138), history spec `[[1+12e, 63, e % 6] for e in 0..20]`; then towers verifiers with `CLOCK_VIDEO=pal`.
10. Then run every verifier on every new capture (`o3_all.sh`), write the report below.

### Limits met

- 8 ranges per probe: the stage verifiers pack 0x001F0008..0x001F0D5B and 0x0027B394..0x0027C5D7 into single ranges; the tile tables were probed 8 bytes short (0x80 instead of 0x88; the last coordinate pair is taken from the ELF; the PROBES now ask 0x88).
- A probe before the trace is armed (preroll) carries state but no packets: the stage verifiers now keep preroll probes (needed for a one-frame stimulus like `-late-b`).
- `with_emulator.mjs` crashes (EPERM / ENOENT on `emulator.slot-N/owner`) when two waiters race for a freed slot; `o3_run.sh` retries.
- Many sessions queued from several workers with no fairness in the wrapper: my captures waited up to 30 minutes.
- Probes cannot be armed at a given frame inside a trace, so a disc state that the CDVD handler rewrites needs its writer patched (code patch, said so in the results).

## Report

### Step 1: illegal scene through its end wait and hand-off (HDD OSD 1.10U)

Capture `hddosd-110U-opening3-illegal` (`BootIllegal`, advance 100, trace 290, probes of
stages, flat, ghost, hand-off, illegal, illegal_cubes; 240 scene frames, emulator frames 128..370).
Default run: `0x002AD22C` non-zero, so no forced clock (`enter_clock_module` returns 0).

| Verifier | Result |
|---|---|
| `verify_opening_stages.mjs` | 242 frames, handlers stage 0 x1, 4 x1, 5 x110, 6 x130 (end wait to its result 2), sound `0x6150,6` x1, fade alphas 239: all equal |
| `verify_opening_handoff.mjs` | frame 370 (counter 243, z 800.12): snapshot 0x64, left execute -1, module 2, previous-was-opening 1: equal |
| `verify_opening_flat.mjs` | 854 flat draws equal |
| `verify_opening_ghost.mjs` | 240 ghost draws equal |
| `verify_opening_illegal_cubes.mjs` | 1 200 cubes, 91 200 record values, 12 000 packets, 468 000 writes equal |
| `verify_opening3_illegal.mjs` (copy of `verify_opening_illegal.mjs`) | 240 scales, 240 turns, 3 360 fans, 1 200 glows, 30 535 box packets (185 not drawn), 239 box carries, 131 banner alphas and draws: 1 783 858 writes equal; also FOUND on `-illdraw` |

Why a copy: the original verifier ends a packet window at the next probe record *of its own list*.
On a capture whose older form carried every verifier's probes that happened to end the last glow's
window at the ghost's probe; on this capture (probe-indexed, narrowed to the verifier's own
records) the window ran on into the ghost's rectangle (same packet shape), so the original says
PARTIAL (glow 14 writes sent, 8 computed; banner draws 0/131). The copy ends a window at the next
probe record of any verifier on the capture (`everyAt`), and reads the ELF words inline
(`elf_words.mjs` throws when imported without a script path, which hid the copy's PROBES from
`run_all.mjs --discover`).

Mutation (`mutate.mjs`, 60 mutants): 49 killed, 11 survive, all explained: UV source origin terms
(lines 51, 53) are multiplied by 0 in every glow and banner draw (source origin 0,0);
`wrapDown <` to `<=` differs only when a float equals its limit exactly; the glow's `on` 1 to 2
is equivalent (`on < 1` only); the tile fade branch `z < 672` (lines 152) is not reached: the
scene's z starts at 672 and only grows; the tile `ahead < 192` threshold 192 to 193 differs only
for values in [192, 193) that no frame has; lines 186's `near < 0` is dead (negative `near` skips
the tile before) and `64 < near`, `64 -> 65`, `< -> <=` are equivalent because `near` never
exceeds 64.

Registered: `run_all.mjs --discover --only` for the six verifiers on the new capture; `--changed`
passes for every entry of them (the three `verify_text.mjs` ROM entries it also ran fail, outside
this lane).

Open: the hand-off's forced-clock exit (needs `0x002AD22C` = 0 before the hand-off) is still not
reached; this run goes through the table with snapshot 0x64.

## Report, stimulated branches on HDD OSD 1.10U (steps 2-6 and the forced-clock hand-off)

Corrections to the checkpoint, found on the way:

- The default HDD OSD run does not force the clock (`0x002AD22C` non-zero), so the stage-2 branches need no write there; `forced` writes it to 0 for the hand-off exit.
- Patches and writes land at emulator frame 135 (module counter 8): for `BootIllegal` too (a disc state written at frame 100 is lost, the module's start rewrites it). The module's counter is `frame - 127`.
- The exec word `0x002AD234` is rewritten every frame by `pad_handler_hddboot_check_20CC50` (0x0020CC50) from the mailbox word `0x0038AD00` while the ready word `0x002AD230` is non-zero: mailbox 1 sets exec 1, mailbox -1 clears ready and sets exec -1, mailbox 0 sets exec 0, and past `20 x fps` vblanks (1 200) it clears ready and sets exec -1. A write to `0x002AD234` is lost; the stimulus is the mailbox.
- The CDDA count `0x001F0D58` is rewritten every frame by `sound_handler_2150D0` (store at `0x002151E4`, `sw v1, 0xC(s0)` from `D_002AEC40 + 0x538`); holding it needs that store nopped (patch written after the advance, as for the disc-state writer `0x00211FD4`).
- The hard-disk stage-1 clear (`20 x fps` frames of the module counter) can only be reached with the pad handler disabled (`0x0020CC50` = `jr ra`), its own clear comes first at vblank 1 200.

New verifiers (copies, the originals untouched): `verify_opening3_stages.mjs` (also compares every sound command the handlers send, `sound_handler_queue_cmd` 0x00200C00 and `sceSdRemote` 0x00294738 told apart by the return address, against the computed command, its argument registers and call site; counts the branch of every frame; models a scene end and the module restart after it; skips the fade of a frame that ends the scene and of a frame before the trace was armed) and `verify_opening3_handoff.mjs` (names the branch, checks the previous-was-opening word as 0 when nothing sets it). Captures in `Watson/Runtime/captures/hddosd-110U-opening3-*`, each one command through `with_emulator.mjs` (interpreters, `o3_run.sh`), probes of stages, flat, ghost, hand-off and the two sound functions.

| Capture | Stimulus (after the advance) | What it reaches | Result |
|---|---|---|---|
| `disc6c` | NOP at 0x211FD4, `0x1F000C` = 0x6C | stage 2 table target 0x6140,7 then 0x6150,0x11 (2 sends equal), snapshot 0x6C, hand-off execute 1 | 229 frames; hand-off equal |
| `enter` | NOP, `0x1F000C` = 0x64 | snapshot path with disc 0x64, 0x6140,1 from the default site | 229 frames; hand-off module 2 |
| `disc65-a`, `-b` | NOP, 0x65, then advance 520 | stage 1 holds (38 + 47 frames) until z > 56 at counter 617, stage 2 first time by the table (0x6140,1), dive, hand-off module 2 | 38 and 135 frames equal |
| `disc69`, `disc71` | NOP, 0x69 / 0x71, advance 520 | the other holding states of `jtbl_00365420`; 0x71 hand-off module 2 | 173 and 166 frames |
| `disc6a`, `6b`, `6d`, `6e`, `6f`, `70`, `73` | NOP, the state | stage 2 table targets (0x6150,f for 6A 6B 73; 0x6140,7 + 0x6150,0x11 for 6D 6E; 0x6140,1 for 6F 70) and every hand-off table entry: execute 2, 2, 1, 0, 5, 4, 3 | 229..239 frames each, hand-offs equal |
| `ready-a` | `0x2AD230` = 1 | stage 1 hard-disk branch, exec 0 (waiting), 86 frames | equal |
| `readymid` | `0x2AD230` = 1, trace counter 160..260 | the same branch across counter 171..209, where `20 x fps / 6` switches `B+0x18` | 106 frames equal |
| `ready-b` | then mailbox `0x0038AD00` = 1 | stage 1 hard-disk exec set (go, `B+0x18` = 0.003), stage 2 first time by ready + exec 1 (0x6150,f, snapshot untouched = 0), hard-disk velocities, hand-off module 0 / execute 6 | 101 frames, hand-off equal |
| `readyneg` | `0x2AD230` = 1 and mailbox -1 (advance 2) | ready cleared by the pad handler, exec -1: stage 1 by the disc table, stage 2 by the table with hard-disk velocities (`exec != 0`), hand-off module 2 | 210 frames, hand-off equal |
| `readyclear` | pad handler disabled, `0x2AD230` = 1, advance 1 160 | stage 1's own clear of the ready flag at counter 1 201 (the `ready flag cleared` frame), then the disc branch releases the stage | 134 frames, hand-off equal |
| `mecha` | `0x1F0008` = 1 (illegal scene) | stage 6 leaves at the MECHACON flag, 162 frames, no end | 256 frames equal |
| `ill74-a` | NOP, 0x74 held | stage 6 else-branch, flag 0 (never ends), 164 frames | 257 frames equal |
| `ill74-b` | then `D_003700F4` = 1 | the else-branch ends the scene (result 2) at once, hand-off 0x74 module 4, module restart | 156 frames, hand-off equal |
| `ill74-c` | NOP, 0x74, `D_003700F4` = 1 written at counter 107 | the same end pinned at the boundary: counter 128 no end, 129 result 2 (`0x80 < frame`) | 65 frames equal |
| `ill72-a`, `-b` | NOP, 0x72, patch 0x2151E4, `0x1F0D58` = 0, then 1 | 0x72 without CDDA: stage 6 does not end (92 frames); with CDDA: ended, `sceSdRemote(1, 0x6150, 6, 0, 0xF)` from 0x0021F328, stamp, end after 0x80 frames, hand-off module 5 | 186 and 130 frames, hand-off equal |
| `forced` | `0x2AD22C` = 0 | stage 2 forced branch (0x6140,1 from 0x0021F158, snapshot left 0), hand-off forced-clock exit (module 2, previous 1) | 238 frames, hand-off equal |
| `forcedsnap` | `0x2AD22C` = 0 and `D_003700A0` = 0x6C | the forced-clock exit with a snapshot that the table would send to execute 1: the exit wins (module 2, execute -1) | 238 frames, hand-off equal |

`run_all.mjs --discover --only` registered both verifiers on every capture that carries their probes (stages 34 passing of 41 runs, hand-off 25 of 25; the failing runs are captures without the probes or in the wrong video mode). `run_all.mjs --only` of both and `--changed` pass.

Mutation. `verify_opening3_stages.mjs` (91 mutants over the 33 captures): 79 killed, 12 survive, all explained: the three of the else-branch's end test (`0x80`, `<`, `>>> 0`) are killed by `ill74-c` (53 killed on that one capture and none of line 128 alive; the `>>> 0` shift is equivalent, `(0 + 0x80) >> 1 < frame` for every frame beyond 64); the x and y terms of the integrator (`B+0x20`, `+0x24`, `+0x40`, `+0x44` and camera x/y indices) are computed on values that are 0 in every frame of every capture (no handler writes them non-zero: stages 2, 6, 7 and the scene set-ups write 0, `OpeningInitAnimation` sets only the z step and the roll), so an index error there changes nothing; `<` to `<=` of the roll wrap (equal to pi exactly never happens); the fade's 0.0078125 mutant (1e-6 relative) shifts a value below one truncation step; the PAL 1.2 survivor is a comment line. `verify_opening3_handoff.mjs` has no arithmetic for `mutate.mjs` to mutate; mutated by hand (copy edited by `sed`, run on the capture that reaches the branch): `READY_A === 0` to `!== 0` (killed on `forcedsnap`, equivalent on `forced` where the table gives the same module), the forced module, `execute = 6`, the exec test `=== 1`, the 0x72 `saved > 0`, the 0x74 module, the 0x6C execute, the previous-was-opening default: all killed on the capture named.

Open: every entry of the hand-off table (0x6A..0x74, the default 0 and 0x71) and the forced and ready exits are reached and equal; stage 1's ready-flag clear and the pad handler's 1 200-vblank clear depend on code the stimulus disables or bypasses (said above); the hard-disk exec values other than 1 and -1 and a hard-disk hand-off with the clock forced are not captured; the sound command ids' meaning is still unread. ROM 2.30 and PAL are not covered by these captures.


## Report, PAL illegal-disc scene and PAL towers (checkpoint steps 7 and 9)

### Step 7: the illegal-disc scene in PAL (HDD OSD 1.10U, BIOS 2.30 E)

Capture `hddosd-110U-opening3-pal-illegal` (`BootIllegal`, advance 100, trace 290; 296 frames,
224 scene frames; one command through `with_emulator.mjs`, interpreters), run with
`CLOCK_BUILD=hdd CLOCK_VIDEO=pal`:

| Verifier | Result |
|---|---|
| `verify_opening3_stages.mjs` | 224 frames: handlers stage 0 x1, 4 x1, 5 x92, 6 x130 (end wait to its result 2), integrator with k = 1.2 equal 224, fade alphas 221, sound `0x6150,6` x1 sent and equal |
| `verify_opening3_handoff.mjs` | frame 352 (counter 225): table, snapshot 0x64, execute -1, module 2, previous-was-opening 1: equal |
| `verify_opening_flat.mjs` | 800 flat draws equal (34 bar rows above and below, PAL) |
| `verify_opening_ghost.mjs` | 222 ghost draws equal |
| `verify_opening_illegal_cubes.mjs` | 1 110 cubes, 84 360 record values, 11 100 packets, 432 900 writes equal |
| `verify_opening3_illegal_v2.mjs` (copy of `verify_opening3_illegal.mjs`) | 222 scales, 222 turns, 3 108 fans, 1 110 glows, 28 212 box packets (204 not drawn), 221 box carries, 131 banner alphas and draws (the PAL banner rectangle: `y` and `h` scaled by the two doubles at `0x003653d8`, `0x003653e0`): 1 648 372 writes equal |

The same verifier on `-illegal` and `-illdraw` (NTSC): FOUND, same counts as `verify_opening3_illegal.mjs`.

Why a copy: `verify_opening3_illegal.mjs` says PARTIAL on the PAL capture: frame 130's boxes are 68 packets
sent against 128 computed. The probe of `sound_handler_queue_cmd` (0x00200C00, called from
`0x00200A48 - 8` with command 0x60D0) at packet 748 lies inside that frame's box loop: the sound
thread's periodic call (every second frame: 128, 131, 133, 135 ...) ran while the main thread was
drawing the boxes, and the verifier ended the packet window at it (the other 60 boxes come after
it, up to the next cube probe at 811). The call sends no GS packet. The copy leaves a probe of that
call (pc 0x00200C00, ra 0x00200A48) out of the window ends. In NTSC the call never fell inside a
box loop; the rule was only needed here.

Mutation (`mutate.mjs`, all 177 candidates, PAL capture): 146 killed, 31 survive, all explained: the
UV source origin terms (lines 61, 63) are multiplied by 0 in every glow and banner draw (source
origin 0, 0); the two wrap loops (`<` to `<=`, lines 68, 69) differ only when a float equals its
limit exactly; the glow colour factor 0.015625 changed by 1e-6 relative (line 106) moves a product
across an integer only when it lies within 1e-6 of one, which no glow has; the glow's `on` 1 to 2
(line 149) is equivalent (`on < 1` only); the tile fade branch `z < 672` (line 162, all five
mutants) is not reached, the scene's z starts at 672 and only grows; the tile `ahead < 192` and
`near` clamps (lines 186, 191, 196: 192 to 193, 0 to 1, 64 to 65, the `<` to `<=` and the 1e-6 factor)
differ only for values in [192, 193), at exactly 0, or at exactly 64, which no frame has; line 278's
`sent[3]` only fills the printed set of glow alphas (not a compared value). The PAL line (banner
rectangle scaling, line 314) has no survivor.

Registered: `run_all.mjs --discover --only` for the six verifiers; the PAL capture and the two NTSC
ones pass `verify_opening3_illegal_v2.mjs`, the PAL capture passes the other five.

### Step 9: PAL towers, both builds

States (`Watson/Runtime/states/`, made with `o3_state.mjs`: paused at the entry of
`OpeningInitTowersFog`, the history table written, 21 entries of mask 0x3F, counts 1 + 12e,
main cell e mod 6, saved; BIOS 2.30 E):
`hddosd-1.10U-host-opening-pal-towers-full.p2s` (breakpoint 0x00221D30, table 0x001F0198, 126 towers)
and `rom-0230E-opening-pal-towers-full.p2s` (breakpoint 0x0021D428, table 0x001F0138, 126 towers).
The ROM breakpoint at `0x0021D428` was hit on the PAL ROM, the same address as in 2.30 A.

Captures (verifiers `verify_opening_towers_ee.mjs`, `verify_opening_vu1_v2.mjs`, unchanged, no
code of them mentions the video mode; `CLOCK_VIDEO=pal`):

| Capture | Frames | Result |
|---|---|---|
| `hddosd-110U-opening3-pal-towers-a` (state, trace 40) | 45 | 5 670 chains: set-up tables 126/126 each, 504 place values, brightness 400/400, 45 `sinf`, 2 993 760 chain words, 272 160 matrix values equal; VU1: 5 670 towers, all packets equal, no hidden vertex |
| `hddosd-110U-opening3-pal-towers-late` (advance 150, trace 70) | 52 | 6 552 chains, 3 459 456 words equal; VU1: 6 552 towers, 45 864 packets, 524 160 writes equal, 413 vertices sent without drawing |
| `rom-0230E-opening3-pal-towers-a` (state, trace 40) | 46 | ROM 2.30 E: 5 796 chains, 3 060 288 words equal; VU1: 5 796 towers, 40 572 packets, 463 680 writes equal |
| `rom-0230E-opening3-pal-towers-late` (advance 200, trace 100) | 99 | 12 474 chains, 6 586 272 words equal; VU1: 12 474 towers, 87 318 packets, 997 920 writes equal, 453 hidden vertices |

The ROM captures are taken with the ROM-mapped probes of `verify_opening_towers_ee.mjs` and
rewritten with `extract_opening_rom_trace.mjs back` to `*-as-hdd` (the header's probe list removed,
as in the earlier ROM captures, since it names the ROM's addresses); both verifiers run on that
file with `OPENING_BUILD=rom`. The towers' arithmetic and tables are therefore the same in PAL on
both builds (set-up places, brightness table, chain, VU1 packets).

Capture note: a capture that carries two verifiers whose probes share a pc with different ranges
(`0x002219B4`: chain only, or chain and PATH1 buffer) must list both probes; the capture helper
now merges by pc and ranges (`mergeProbes` of `lib/trace.mjs`), not by pc alone: the first PAL
capture lost the VU1 verifier's records (0 towers) for that reason and was retaken.

Open: the illegal-disc scene on the PAL ROM is not captured (not in this task); the PAL towers captures cover frames 0..45 and the dive's end (HDD frames 150..202,
ROM frames 200..299), not every frame between.


## Report, ROM 2.30 and the PAL ROM (checkpoint step 8)

### What was run

Every capture is one command through `with_emulator.mjs` (interpreters, `exact`). Probes are those of
the verifiers below, mapped to the ROM by `extract_opening_rom_trace.mjs plan` where a HDD OSD
verifier is reused, the ROM's own addresses otherwise. Stimuli are memory writes after the advance
to emulator frame 60 (module counter = frame - 61); the disc-state writer `0x0020F740`
(`sw s1, 0x10(v0)`) is written to a NOP first, so the disc state `0x001F0010` stays as written.
Words the stimuli write, with the ROM 2.30 code that reads them (`disasm_rom.py`):

| Word | Address | Read by |
|---|---|---|
| disc state | `0x001F0010` | stage 2 and 7 tables, the snapshot in stages 3 and 7 |
| MECHACON flag | `0x001F000C` | stage 7 (`0x0021A990`) |
| CDDA count | `0x001F0CF8` | stage 7 for 0x72 (`0x0021A9F8`), the hand-off (`0x002165B8`) |
| clock not forced | `0x0027B394` (default 0 = forced; `0x002058E0` returns `== 0`) | stage 3, hand-off |
| hard-disk ready, exec | `0x0027B398` (`0x00205910`), `0x0027B39C` (`0x00205920`) | stages 2 and 3, hand-off |
| drive count | `0x0027C5D4` (`0x00207ED8`) | stage 2's hold |
| sound word | `0x00300440` (`0x00208398` returns `== 6`) | stage 3 |
| snapshot, end flag | `0x002C86A8`, `0x002C86F4` | stage 7, hand-off |

The CDDA count is stored by two copies of the sound status snapshot, `0x002129D8` (function
`0x002128E8`) and `0x0020FDB0` (function `0x0020FC90`, found with a write watchpoint on the recompiler
build: the interpreter never checks watchpoints). Both are patched to NOP to hold `0x001F0CF8`
(one NOP alone did not hold it). A disc-state hold is not always taken: one `count` run lost it (disc
0x65 from the first frame); the branch counts in the verifier's output show it and the rerun held.

New verifiers (copies, the originals untouched):

- `verify_opening3_stages_rom.mjs` (copy of `verify_opening_stages_rom.mjs`): also compares every
  sound command the ROM's handlers send (`sound_handler_queue_cmd` `0x00200BE8`, told apart by the
  return address: `0x0021A7E0`, `A828`, `A888`, `A89C`, `A8B8`, `A8CC`, `A900`, `AA24`) against the
  computed command, its argument registers and call site; counts the branch of every frame; models a
  scene end and the module restart after it; skips the fade of a frame that ends the scene and of a
  frame before the trace was armed. Its fade probe `0x00218E58` is the one of
  `verify_opening_flat.mjs` (one record serves both).
- `verify_opening3_handoff_rom.mjs` (copy of `verify_opening_handoff_rom.mjs`): names the branch,
  reads the jump table `0x002C41A0` from the ROM image instead of listing the states, and takes the
  exec word at the exit for the ready branch (the function loops on it while it is 0).

### Results (ROM 2.30 A, NTSC unless said; captures `rom-0230A-opening3-<name>`)

| Name | Stimulus | What it reaches | Result |
|---|---|---|---|
| `forced` | none | stage 3's forced-clock sound `0x5014,1` from `0x0021A7E0`; the hand-off's forced-clock exit | 359 frames; hand-off equal |
| `forcedsnap`, `forcedexecsnap` | snapshot 0x6C; exec 1 and snapshot 0x6C | the exit wins over the table (execute -1); exec 1 turns the exit off (table: execute 1, module 1) | 356, 341 frames; equal |
| `forcedexec`, `forcedready`, `forcedreadyneg` | exec 1; ready + exec 1; ready + exec -1 + snapshot 0x6C | forced clock with the hard-disk words | equal |
| `d6a`, `d6b` | disc 0x6A, 0x6B | stage 3 table target `0x0021A8A4` (`0x5015,0,0,0xF`); execute 2 | 236, 244 frames |
| `count`, `d6d`, `d6e` | disc 0x6C, 0x6D, 0x6E | the countdown: `0x5014,7`, `0x5015,0,0,0x10`, 58 frames down, `0x5015,7,0,0x11`; execute 1, 1, 0 | 236, 238, 238 frames; 3 sound sends each equal |
| `d6f`, `d70`, `d73`, `d75` | 0x6F, 0x70, 0x73, 0x75 | table default `0x0021A8C0` (`0x5014,1`) for 6F and 70, `0x0021A8A4` for 73 and 75; execute 5, 4, 3, 3 | 237..245 frames |
| `d72` | 0x72 | execute -1, module 2 (the CDDA count is 0) | 240 frames |
| `d65`, `d69`, `d71` | 0x65, 0x69, 0x71 held, advance 440 | stage 2 holds until z > 56, stage 3 first time by the table, hand-off with that snapshot (module 2, previous 1) | 257..260 frames |
| `d71z` | 0x71 held, camera z written 60 at counter 570 | stage 3 entered with `go` 0, set at counter 601 (`600 < counter`); PAL (`rom-0230E-opening3-pal-d71z`): at 501 | 67, 68 frames |
| `ready-a`, `readymid` | ready 1 | stage 2's hard-disk branch with exec 0, across counter 155..250 where `20 x fps / 6` switches `B+0x18` | 107, 106 frames |
| `readyexec`, `readysnd`, `readyexecsnap` | ready + exec 1 (+ sound word 6; + snapshot 0x6C) | stage 2 leaves when the drive count reaches 0x7C (counter 124); stage 3 sound `0x5015,0,0,0xF`, or with the word at 6 `0x5015,0,0,0x11` from `0x0021A828`; hand-off execute 6 and module 2, or execute 1 and module 0 with the snapshot | 215, 214, 223 frames |
| `ready-b` | ready, exec 1 written at counter 100 | the same, then the module restart after the scene | 196 frames |
| `readyneg`, `readynegsnap` | ready + exec -1 (+ disc 0x6C) | stage 2 leaves at once; stage 3 by the table; hand-off module 2 (execute 1 with snapshot 0x6C) | 102 frames |
| `readyclear`, `readyexec2` | ready + exec 0 (or 2), advance 1100 | the 20 s time-out of stage 2 at counter 1201; exec 2 is not exec 1 and waits; hand-off with exec 2: module 2 | 178, 179 frames |
| `readywait` | ready + exec 0, advance 1100 | the hand-off is entered with exec 0 and does not return. Read after the trace: `0x001F05E8` = 0, `0x001F0014` = -1, `0x001F05EC` = 1; after exec is written 1: module 2, execute 6 (reads, not a verifier) | 180 frames |
| `ill-a` (+ `ill-b`), `ill74-a`, `ill72-a`, `ill-m1` | disc 0x74 held through the intro | hand-off 0x74 (module 4), the illegal-disc scene through stages 5, 6, 7 | 425..427 frames (+ 267); hand-off and sound equal |
| `ill74-b` | end flag `0x002C86F4` written | stage 7 ends at once; hand-off module 4 again; module restart | 206 frames |
| `ill74-c` | flag 2 written at counter 100 | the end at the boundary: counter 128 no end, 129 result 2 (`0x80 < counter`) | 60 frames |
| `ill72-b`, `ill72-c` | disc 0x72, CDDA count 0, then 1 | 0x72 ends only with a positive count: `0x5015,6,0,0xF` from `0x0021AA24`, stamp, end after 0x80 frames, hand-off module 5 | 206, 130 frames |
| `ill-m2` | MECHACON flag, disc 0x6A | stage 7 leaves at the flag; the snapshot is not rewritten | 208 frames |
| PAL: `pal-intro`, `pal-count`, `pal-readyexec`, `pal-readysnd`, `pal-readymid`, `pal-d71z`, `pal-ill-a`, `pal-ill-b` (`rom-0230E-opening3-…`, BIOS 2.30 E) | as the NTSC ones | the 291-frame intro and its forced hand-off; the countdown `(int)(1.2 x 58)` = 69 frames; the hold's limit 0x67; `20 x fps / 6` = 166; `10 x fps` = 500; the illegal scene | equal |

Every row is `FOUND` for both new verifiers (the hand-off one prints no hand-off where the capture
ends before it).

**HDD OSD verifiers on the ROM, through the trace rewriter** (`extract_opening_rom_trace.mjs back`,
then the header's probe list removed; `CLOCK_BUILD=rom OPENING_BUILD=rom`):

| Capture (`…-as-hdd`) | Verifier | Result |
|---|---|---|
| `rom-0230A-opening3-ill-a`, `-ill-b` | `verify_opening3_illegal_v2.mjs` | 186 + 266 scales, 2 604 + 3 724 fans, 930 + 1 330 glows, 23 668 + 33 874 box packets, 76 + 266 banners: 1 382 468 + 1 979 752 writes equal |
| same | `verify_opening_illegal_cubes.mjs` | 930 + 1 330 cubes, 70 680 + 101 080 record values, 362 700 + 518 700 writes |
| same | `verify_opening_flat.mjs`, `verify_opening_ghost.mjs` | 1 096 + 798 flat draws, 422 + 266 ghosts |
| `…-ill74-a`, `-ill74-b` | the four | 915 + 1 020 cubes, 73 + 94 banners (the banner's ramp down once the flag is set), all equal |
| `rom-0230E-opening3-pal-ill-a`, `-b` | the four | 1 155 + 1 325 cubes, 139 + 265 banners (PAL rectangle), 1 715 882 + 1 970 600 writes equal |
| `rom-0230E-opening3-pal-intro` | flat, ghost, cubes_v2, fog_v2, lights_v2, inputs | 634 flat draws, 289 ghosts, 1 229 cubes, 289 fog frames, 264 light frames, 99 960 library values equal (`verify_opening_overlays_v2.mjs` says PARTIAL on a ROM trace: its ghost half models HDD OSD's `CLAMP_1`, known, not changed here) |
| `rom-0230A-opening3-towers-a`, `-towers-late` (state `rom-0230A-opening-towers-full.p2s`: trace 40, then advance 160 and trace 160; frames 59..426, the dive to its end) | `verify_opening_towers_ee.mjs`, `verify_opening_vu1_v2.mjs` | 5 796 and 19 278 chains, 3 060 288 + 10 178 784 words equal, 278 208 + 925 344 matrix values; VU1: 5 796 + 19 278 towers, 40 572 + 134 946 packets, 463 680 + 1 542 240 writes equal, 507 vertices sent without drawing |

### Findings

- The ROM's stage-3 sounds come from `0x00200BE8` at eight call sites; the illegal scene's end wait
  uses it too (`0x5015, 6, 0, 0xF`), where HDD OSD calls `sceSdRemote`.
- The hard-disk hold's limit is the drive-count word `0x0027C5D4` at 0x7C (0x67 in PAL); it equals
  the module counter in every capture (124 NTSC). The stage-3 countdown is 58 frames (69 in PAL).
- The hand-off waits on exec with module 0, execute -1 and previous 1 written, and returns only when
  another thread writes the word (seen in `readywait`, not compared).
- Hand-off table, every entry and the default: 0x6A, 0x6B execute 2; 0x6C, 0x6D execute 1; 0x6E
  execute 0; 0x6F execute 5; 0x70 execute 4; 0x71 module 2; 0x72 module 5 with CDDA > 0, else module
  2; 0x73, 0x75 execute 3; 0x74 module 4; a snapshot outside the table (0) module 2.
- The illegal-disc scene, its cubes, the flat draws, the ghost and the towers are the same code and
  tables on ROM 2.30, in NTSC and PAL: every HDD OSD verifier says FOUND on the rewritten trace.

### Mutation

`mutate.mjs verify_opening3_stages_rom.mjs` over the 47 registered captures (41 mutants of the lines
that compute): 41 killed (4 by a crash), none survives. The lines it does not select (the conditions on
`fps`, the drive-count limit, the exec words, the end-flag test) were mutated by hand (`sed` on a copy,
run on the capture that reaches the branch; 38 mutants). The first pass left six alive, each for want of
a capture, and each killed by the capture added for it: `10 x fps < counter` to `<=` (`d71z`, `pal-d71z`:
`go` is set at counter 601 / 501), the drive-count test `<` to `<=` (it first only changed the label
line: the verifier now uses one `limit`), exec `=== 1` to `!== 1` (`readyexec2`), the hard-disk velocities
without the ready flag (`readyclear`), the MECHACON test (`ill-m2`, with a disc state that differs from
the snapshot) and the end flag's `0x80`, `<` and `ended` tests (`ill74-c`). One equivalent remains:
`s.countA >= 0` to `> 0` (the countdown variable is 7 or -1, never 0).
`verify_opening3_handoff_rom.mjs` has no arithmetic for `mutate.mjs`; 30 hand mutants (the forced test's
three terms, the ready branch's exec test, execute 6, module 0, previous, each table entry, the table's
base and size, the 0x72 test and both of its modules, the outside default, the previous-was-opening
rule): all killed on the capture named by the branch (four needed a capture of their own: `forcedexecsnap`,
`forcedreadyneg`, `readyexecsnap`, `readynegsnap`) except one equivalent: taking the exec word at the entry
instead of the exit differs only if exec changes during the call, which no capture has (the wait is not
captured).

### Registered

`run_all.mjs --discover --only` for the two new verifiers (run in a directory of hard links to the
ROM captures: another worker held a capture the scan opens), and the HDD OSD verifiers added to
`run_all.manifest.json` on the new `*-as-hdd` captures by running each and appending the passing
entries (towers 4, illegal-scene verifiers 24, PAL intro 6; `OPENING_BUILD=rom` where the plain run
does not pass: flat, ghost, towers). `run_all.mjs --filter` of the two new verifiers and every `opening3-*-as-hdd` entry: 136 of 136 pass.
`run_all.mjs --changed` passes for every entry of this lane (the 36 failures it printed are
`verify_frame.mjs` entries of other lanes and four `verify_opening_vu1.mjs` entries that pass when run alone: the machine was loaded).

### Open

- The hand-off's wait on exec 0 (module 0, execute -1) is entered and not left inside one capture:
  only another thread writes exec, and a write cannot be made inside a trace. The values the loop
  leaves are read after the trace (`readywait`), not verified.
- The meaning of the sound command ids (`0x5014`, `0x5015` and their arguments), as on HDD OSD.
- Hard-disk exec values other than 1, -1, 0 and 2, and the ready word cleared during a run: the
  drive state machine at `0x002083B0` (it rewrites `0x00300440` while ready is set) was not read.
- The illegal scene's end wait for the disc states whose table entry is the flag branch
  (0x65..0x69, 0x71) is reached only as 0x74's: the same target `0x0021AA48`.
