# The whole clock frame from its state (draft for `facts/`)

Written 2026-10-02 by the fork that extended the end-to-end model. Builds: **HDD OSD 1.10U**
(canon) and **ROM 2.30**, NTSC and PAL. Nothing in `facts/`, the other verifiers, `builds.mjs`,
`watson.json` or Watson was edited; no commit.

## What exists now

`References/model/clock_frame.mjs` exports `frame({ memory, events }, mesh)`: from the clock's
state at the entry of the frame function (HDD `0x00225E80`, ROM `0x00221558`) it produces, in
order, every packet the frame function sends except text, and it leaves in `memory` the state
the next frame starts from. The model is split by what the program's functions do:

| File | Holds |
|---|---|
| `model/clock_memory.mjs` | the state as named pieces of EE memory with their address in each build (`LAYOUT`), merged into probe ranges; `Memory`, read and written in place |
| `model/clock_math.mjs` | single-precision operations cut toward zero, the sine table, the matrix routines, the ramp tick |
| `model/clock_camera.mjs` | HDD `module_clock_225F38`: the screen matrix, the view matrix with libvu0's arithmetic, the approach offset's decay |
| `model/clock_rest.mjs` | head of the frame (clear, background tube, blur trips, copies, tint), vignette and fade, the trips after the rods, bars, column; the overlay level's state machine, the blur level, the menu ramp's step |
| `model/clock_frame.mjs` | rods, orbs and extra passes (as before), the GS state helpers, the orbs' motion and colours in overlay modes 2 and 3, and the frame's order |
| `model/clock_cubes.mjs` | the cubes of System Configuration: ramp, list step (ring; ROM 2.30's standing cubes), the pass, every send of a cube and of the highlight layer, the buffers put together |
| `model/clock_logic.mjs` | HDD `func_0022F1A0` (appearance ramp, time to angles, colours, progress) and the first half of `func_00232640` (spin, scene scale) |
| `model/ee_libm.mjs` | `cosf` as the C library computes it, with the EE's rounding (`model/check_cosf.mjs` checks it) |

`References/scripts/verify_frame.mjs` reads the snapshot with probes on the frame function's
first two instructions (13 ranges on HDD OSD, 13 on ROM 2.30), the entry of each part the frame
function calls (where that part's packets start), and the state when the pages function has
returned (two probes at the bars function's entry: what the menus changed in the frame). It then:

- compares every packet the model produces with the packet sent at the same place, write by write;
- compares the two matrices the model computed with the ones the rods were handed;
- checks that each part starts at the packet where the model has it;
- with `--carry`, runs every frame from the state the model left for it, taking from the trace
  only the inputs listed below, and compares every piece of carried state with each frame's
  snapshot.

A capture taken with the earlier two probes is still read (rods, orbs and extra passes only).

## Order of a frame, as modelled (both builds)

```
camera            screen matrix, view matrix (position z + approach offset), offset *= factor
head              display with the clear; background (grey ramp tick; 16 strips when the overlay
                  mode is 0); blur trips (level < 6 ? level : 10 - level); copy to work buffer 0;
                  copy to work buffer 1; tint back onto the display
rods              rods, orbs, the two extra passes
overlay           vignette ramp tick; vignette when the mode is 0 and the ramp is not idle; fade
pages             trips after the rods (level - 5 from level 5 up; ROM 2.30 always calls the blur
                  function, which ends with one more "blend 1, depth test GREATER")
                  cubes: ramp tick, list step, the pass                       (System Configuration)
                  menu ramp step (HDD module_clock_230DF0)
                  [menus and their text: not produced]
bars              the two letterbox bars when configuration item 0 is 0 or 2
[date and time: not produced]   [button hint: not produced]
column            two pixels at the right edge
state only        clock logic; spin + 30, scene scale; blur level; frame counter + 1; overlay step
```

The packets sent between the frame function's return and the next frame's entry (2 a frame, the
display buffer swap, from `0x0020C000` and `0x002892E8` on HDD OSD) are not the clock's.

## Result

`CLOCK_BUILD=hdd|rom node References/scripts/verify_frame.mjs <trace> --carry`. "Carried" = every
frame after the first runs from the state the model left. Coverage = packets produced and equal
out of all packets between two entries of the frame function.

**HDD OSD 1.10U**

| Capture | What | Frames | Produced and equal, of the frame's packets | Events | Carried |
|---|---|---|---|---|---|
| `hddosd-110U-whole-clock` | clock alone | 16 | 8 992 of 9 616 (93.5%) | none | FOUND |
| `hddosd-110U-whole-long` | clock alone | 65 | 36 530 of 39 065 (93.5%) | none | FOUND |
| `hddosd-110U-whole-menu` | main menu (vignette on, rods hidden) | 13 | 3 666 of 4 732 (77.5%) | none | FOUND |
| `hddosd-110U-whole-config` | System Configuration, six cubes on the ring | 12 | 9 984 of 12 348 (80.9%) | none | FOUND |
| `hddosd-110U-whole-to-clock` | System Configuration to the clock alone (square held): blur 10 to 0, cubes shrinking, the list leaving | 49 | 40 768 of 47 287 (86.2%) | menuRamp (1) | FOUND |
| `hddosd-110U-whole-enter` | main menu into System Configuration (down, cross held): vignette falling, grey rising, rods on, cubes growing | 75 | 53 814 of 59 879 (89.9%) | greyRamp (1), vignetteRamp (1), appearance (1), cubeRamp (1) | FOUND |
| `hddosd-110U-whole-boot` | power-on, the clock's first 57 frames: overlay mode 2, orb 0 flying in, rings filling, camera approach, scale held at 0 | 57 | 13 117 of 14 610 (89.8%) | none | FOUND |
| `hddosd-110U-whole-boot-opening` | power-on through the opening (`BootOpening`), the clock's first 49 frames: all seven orbs flying in | 49 | 11 269 of 12 554 (89.8%) | none | FOUND |
| `hddosd-110U-pal-clock-frame` | PAL: clock alone | 15 | 8 430 of 9 015 (93.5%) | none | FOUND |
| `hddosd-110U-pal-config-frame` | PAL: System Configuration | 12 | 9 984 of 12 348 (80.9%) | none | FOUND |
| `hddosd-110U-pal-whole-to-clock` | PAL: System Configuration to the clock alone | 49 | 38 878 of 44 712 (87.0%) | menuRamp (1) | FOUND |

**ROM 2.30** (PAL: the 2.30 E image)

| Capture | What | Frames | Produced and equal, of the frame's packets | Events | Carried |
|---|---|---|---|---|---|
| `rom-0230A-whole-clock` | clock alone | 16 | 10 208 of 10 832 (94.2%) | none | FOUND |
| `rom-0230A-whole-long` | clock alone | 65 | 41 502 of 44 037 (94.2%) | none | FOUND |
| `rom-0230A-whole-menu` | main menu | 13 | 3 718 of 4 784 (77.7%) | none | FOUND |
| `rom-0230A-whole-config` | System Configuration, five standing cubes | 13 | 11 189 of 13 334 (83.9%) | none | FOUND |
| `rom-0230A-whole-to-clock` | System Configuration to the clock alone | 49 | 42 221 of 44 637 (94.6%) | menuRamp (1) | FOUND |
| `rom-0230A-whole-enter` | main menu into System Configuration | 75 | 55 736 of 59 894 (93.1%) | greyRamp (1), vignetteRamp (1), appearance (1), menuList (1), cubeRamp (1), cubeMode (1) | FOUND |
| `rom-0230E-pal-clock-b` | PAL: clock alone (the PAL worker's capture) | 16 | 10 272 of 10 896 (94.3%) | none | FOUND |
| `rom-0230E-pal-whole-config` | PAL: System Configuration | 13 | 11 243 of 13 388 (84.0%) | none | FOUND |
| `rom-0230E-pal-whole-menu` | PAL: main menu (vignette) | 17 | 4 862 of 6 256 (77.7%) | none | FOUND |

"Events (n)" = in n frames of the capture the menus' code changed that piece and the model took
it from the trace (see below). 689 frames in all; 669 of them run from carried state, and in 661
of those nothing but the listed external inputs came from the trace.

Every line is `verdict: FOUND N frames: every packet the model produces equal`, with
`matrices computed equal to the ones handed to the rods: N of N`, `parts starting where the
model has them: 8N of 8N` and `state the model carried, against each frame's snapshot: every
piece equal in every frame`.

The three earlier captures still pass (`rom-0230A-clock-frame` 9 frames, `rom-0230A-clock-frame-adjust`
29 frames, `hddosd-110U-clock-frame` 14 frames: rods, orbs and extra passes).

## What is not produced

All of it is text or the menus' own drawing; the font is another worker's.

| Screen | Per frame, HDD OSD | Per frame, ROM 2.30 | What |
|---|---|---|---|
| clock alone | 24 + 13 | 24 + 13 | date and time; button hint |
| main menu | 33 + 24 + 23 | 33 + 24 + 23 | menu items' text (after the trips that follow the rods); date and time (sent with alpha 0); hint |
| System Configuration | 95 + 24 + 76 | 95 + 24 + 44 | the list's text; date and time; hint |
| every screen | 2 | 2 | the display buffer swap, sent after the frame function has returned |

In the main menu's pages gap on HDD OSD (measured, `hddosd-110U-whole-menu`): 27 glyph fans
(`PRIM 0x5D`, texture `0x2F04`) from `func_00232170`, and their state packets; nothing else.

## What the model takes as input

**The snapshot**, once: the pieces of `clock_memory.mjs`'s `LAYOUT`. Besides the clock's own
variables these are data the program never writes (constants, the rectangle records' fixed
fields, the cubes' two colours) and values set once at start (the display environments, the
cubes' two matrices, ramp lengths, the proportions).

**From outside, every frame** (`EXTERNAL` in `verify_frame.mjs`):

| Piece | Why |
|---|---|
| `time` | the time record, as the time keeper (HDD `func_00235B10`) leaves it |
| `index` | which display buffer is drawn to |
| `scene` + 8 | the field flag |
| `item0` | configuration item 0, reloaded every frame |
| `pad` | the pad words, as the pad reader (HDD `func_00235EB0`) leaves them |
| `wide` | whether the clock was entered from the opening (`0x001F064C`) |
| `display` | the display block: the buffer swap between two frames writes the next field's offset into it. Every packet sent from it has its offset written first, so this has no effect on what is sent |

**Events** (`EVENTS`): state that the menus' own code writes when something happens. The model
carries each of these by its rule (ramp ticks, list step, overlay step, ...) and takes the new
value only in a frame where the state after the pages function differs from the model's:
`menuRamp`, `cubeRamp`, `cubeList`, `cubeMode`, `standing`, `menuList`, `mode`, `orbRandom`,
`overlayLevel`, `fadeRecord`, `scaleTarget`, `greyRamp`, `vignetteRamp`, `appearance`,
`spriteFade`. Measured counts are in the table above (column "events"); a modelling error in
one of these rules would show as an event in every frame, not in one.

## What building it settled (each read, none fitted)

1. **The cubes use neither the camera's position nor its rotation.** The cube record's two
   matrix pointers (`+0x64`, `+0x60`) point at `0x004090F0` and `0x004090B0` (ROM
   `0x003750C0`, `0x00375080`), which `func_002324C8` fills once: `sceVu0UnitMatrix` and
   `sceVu0ViewScreenMatrix(512, ax, ay, 2048, 2048, 1, D_0036FC0C, 1, 65536)` (`0x00232528`,
   `0x00232534`). `config-cubes.md` says the translation does not reach the cube because `w` is
   0 and that the rotation does: the view handed to the transform is the unit matrix (measured
   in all 110 cube transforms of `hddosd-110U-cubes-b`; the model's cubes are equal only with it).
2. **`cosf` is reproduced, not taken as measured.** `model/ee_libm.mjs` is the C library's
   `cosf` (`0x00294B28`, `__kernel_cosf` `0x00296CF8`, `__kernel_sinf` `0x002977A0`,
   `__ieee754_rem_pio2f` `0x00295850`, table `npio2_hw` at `0x0036EB00` read from the file) with
   every operation cut toward zero: 3 213 calls of the cube placement in six captures, 144
   distinct arguments, every result equal bit for bit (`model/check_cosf.mjs`).
3. **The packets between a cube's faces** (not compared by `verify_cubes.mjs`) are now produced
   and equal: per cube `bind the frame`, eight state changes, the half-buffer sprite; per layer
   cube the buffer, `TEXCREFA` and two blends; then buffer 1 added to buffer 0, the blur chain,
   buffer 0 onto the display. Read in `module_clock_237350`, `module_clock_237860`,
   `module_clock_2308F0` and ROM `0x00233928`, `0x00233DD8`, `0x0022C8D0`.
4. **A build difference in the state before a cube's depth quads:** HDD OSD calls blend 0 with
   depth test 2 (`0x00237604`), ROM 2.30 with 3 (`0x00233BB0`).
5. **ROM 2.30's buffer helpers end with one more "blend 1, depth test GREATER"**: the blur
   function and the copy function (already in `clock-frame-rest.md`) and also the cubes' blur
   chain (`0x002327B8`, at `0x002328D0`, also with no trip). The add and half-buffer sprites do not.
6. **ROM 2.30's frame-texture binder is read** (`clock-frame-rest.md` has it as measured):
   `TEST 0x70000` at `0x002306AC`, `CLAMP 0` at `0x002306B0`.
7. **ROM 2.30 in PAL draws the vignette taller.** Its vertical term is multiplied by 1.15
   (constant at `0x002C81D8`) when the video mode is PAL (`0x0022FEE4..0x0022FF00`); HDD OSD's
   `func_002338E0` has no such step. `pal-draft.md` has the radii unchanged in PAL, which holds
   for HDD OSD only. Found as a mismatch in `rom-0230E-pal-whole-menu`, then read. ROM 2.30's
   cached video mode is the word at `0x0027B380` (read at `0x002052D0`; 2 is PAL).
8. **`ZBUF_1`** follows the screen size (`ceil(W/64) x ceil(H/32) x 2`), as the PAL worker
   measured; applied in the model. The PAL copies `clock_frame_pal.mjs` and `verify_frame_pal.mjs`
   are deleted.
9. **The EE's FPU has no denormals.** The camera's approach offset, multiplied by its factor
   every frame, goes from the smallest normal number to minus zero, not through denormals
   (`rom-0230E-pal-clock-b`, frame 3395: carried `0x807E22B0`, real `0x80000000`). The model's
   single-precision step now returns a signed zero below the smallest normal number.
10. **Who writes the cubes' spin:** the first instructions of HDD `func_00232640` (ROM
    `0x0022E938`): `spin += 0x1E`, 16 bits.
11. **The menu ramp's step** (HDD `module_clock_230DF0` / `func_00230D58`, ROM `0x0022CF70`): the
    ramp ticks; while rising, at counter = tail length (`D_003702D0`) the cubes' ramp is sent down;
    when full, square (pad bit `0x80` of `0x00370334`) sends it down and starts the cubes' ramp
    (ROM 2.30 chooses standing cubes or ring there, `0x0022C330`). This is what carries the
    blur level and the cubes through the System Configuration to clock transition with one event.
12. **Two words the program copies but never sets:** the fourth word of an orb ring entry's
    position (`module_clock_237300` writes x, y, z; `module_clock_239E98` copies sixteen bytes)
    and the rod record's two matrix pointers, which are the addresses of the frame function's
    locals (`module_clock_22FE98`, `0x0022FEA8`, `0x0022FEB0`). The carried state is compared
    without them.
13. **The display block is written between frames**: the buffer swap sets the next field's
    offset in the environment. Every use writes the offset first, so nothing sent depends on it.
14. `clock-frame.md`'s "Not covered": the matrices are no longer inputs, the state is carried,
    and a ring still filling and overlay mode 2 (orb 0 alone, and all seven after the opening)
    are met and equal in the two power-on captures.

## Still outside

- Text: date and time, button hint, the menus' and the list's text (and whatever the menus'
  pages draw besides text; in the main menu it is text only).
- What sets the events: the menus' code that starts the ramps, sets the overlay mode, asks the
  list to move, pulses a cube, sets the scale target. Not met in a whole-frame capture: the list
  moving (up or down), a confirmed value's pulse, overlay modes 1, 3 and 4, Clock Adjustment
  (the sprites' fade), the hour turning. The list moving, the pulse and the fade are covered
  piece by piece by `verify_cubes.mjs` and `verify_orbs.mjs`; mode 3's orb rule is the
  transitions worker's (`verify_transitions.mjs`) and is in the model unexercised.
- The time keeper, the pad reader, the configuration reload, the buffer swap: external inputs.
- The opening (`facts/opening.md`) and the first-run pages.
- A send with no face on one side; a transition on ROM 2.30 in PAL.
- Not needed from Watson. Met on the way: with five emulators busy `watson_pause` right after a
  launch can time out ("the CPU thread did not run pause in time") and a launch can find every
  instance taken; the capture helper retries both. Two emulators named in another worker's logs (`o2_*.log`: pids 6132 and 27024, instances 2
  and 1) were still running with no server when this work ended; they were left alone.
