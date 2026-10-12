# End to end: the clock's frame from its inputs

Builds: **HDD OSD 1.10U** (canon) and **ROM 2.30**; NTSC and PAL (`CLOCK_VIDEO=pal`; ROM 2.30 PAL
is the 2.30 E image). The model takes the build (`CLOCK_BUILD=hdd|rom`) and has one branch per
build difference, listed below.

## What it produces

`References/model/clock_frame.mjs` exports `frame({ memory, events }, mesh)`: from the clock's
state at the entry of the frame function (HDD `0x00225E80`, ROM `0x00221558`) it returns, in
order, every packet the frame function sends, each as a list of register writes, and it leaves
in `memory` the state the next frame starts from. It reads nothing from the packets. Text
packets are produced on HDD OSD 1.10U when the snapshot carries `text` (see "Text"); without it,
and on ROM 2.30, the three text parts are gaps.
The mesh is `data/rod-mesh.json`; the sine table is the formula of `clock-camera.md`.

`References/scripts/verify_frame.mjs` reads the snapshot from probes, runs the model and compares
every write of every packet with what the console sent (*verified*, "Result"). With `--carry` it
runs every frame after the first from the state the model left, taking from the trace only the
inputs listed under "What the model takes as input".

### The model's files

| File | Holds |
|---|---|
| `model/clock_memory.mjs` | the state as named pieces of EE memory with their address in each build (`LAYOUT`), merged into probe ranges; `Memory`, read and written in place |
| `model/clock_math.mjs` | single-precision operations cut toward zero (`add`, `sub`: the double sum with the lost part recovered, cut toward zero, denormals flushed), the sine table, the matrix routines, the ramp tick |
| `model/clock_camera.mjs` | HDD `module_clock_225F38`: the screen matrix, the view matrix with libvu0's arithmetic, the approach offset's decay |
| `model/clock_rest.mjs` | head of the frame (clear, background tube, blur trips, copies, tint), vignette and fade, the trips after the rods, bars, column; the overlay level's state machine, the blur level, the menu ramp's step; the date and time and hint rows (`dateRow`, `hintRow`) |
| `model/clock_frame.mjs` | rods, orbs and extra passes, the GS state helpers, the orbs' motion and colours in overlay modes 2 and 3, and the frame's order |
| `model/clock_text.mjs` | the font library's text packets (`putString`) for the pages, date and time, and hint parts; HDD OSD only; `clock_frame.mjs` imports it |
| `model/clock_cubes.mjs` | the cubes of System Configuration: ramp, list step (ring; ROM 2.30's standing cubes), the pass, every send of a cube and of the highlight layer, the buffers put together |
| `model/clock_logic.mjs` | HDD `func_0022F1A0` (appearance ramp, time to angles, colours, progress) and the first half of `func_00232640` (spin, scene scale) |
| `model/clock_menus.mjs` | the menus' code that touches the clock: main menu, System Configuration, Clock Adjustment (opening, confirm, cancel, the list's string callback), the aspect entry and the reload of item 0 (`endOfFrame`), the thread's step between frames (`between()`) |
| `model/clock_date.mjs` | the date library that Clock Adjustment's date check calls |
| `model/ee_libm.mjs` | `cosf` as the C library computes it, with the EE's rounding (`model/check_cosf.mjs` checks it) |

## The snapshot

`verify_frame.mjs` reads the pieces of `clock_memory.mjs`'s `LAYOUT` with probes on the frame
function's first instructions (eight ranges to a probe; 13 ranges on HDD OSD and 13 on ROM 2.30
for the clock's own pieces), at the entry of each part the frame function calls (where that
part's packets start), and, in two probes at the bars function's entry, the state when the pages
function has returned (what the menus changed in the frame). Besides the clock's own variables the
pieces are data the program never writes (constants, the rectangle records' fixed fields, the
cubes' two colours) and values set once at start (the display environments, the cubes' two
matrices, ramp lengths, the proportions). Two pieces sit in probes of their own after the others, so that the ranges of the earlier
probes (which a capture's header names) stay as they are: `rtcMirror` (the console's clock words
that Clock Adjustment's cancel reads) and `configGate` (the gate that lets item 0 be reloaded);
captures taken before them do not hold them and the model skips what needs them. The text parts
read the probes of `verify_text2.mjs` in the same capture (see "Text"). A capture taken with only two probes (the frame
function at entry; rods and orbs at entry: the view and screen matrices, the state block, the rod
template, the seven orb rings, the screen size, the scene record) is read for the rods, orbs and
extra passes only.

The checks of one frame:

- every packet the model produces equals the packet sent at the same place, write by write;
- the two matrices the model computed equal the ones the rods were handed;
- each part starts at the packet where the model has it;
- with `--carry`, every piece of carried state equals the next frame's snapshot.

## Order of a frame (*read at HDD `0x00225E80` / ROM `0x00221558`, verified by the results*)

A frame is drawn with the state the previous frame's logic left: the drawing functions run first
and the clock logic (ROM `0x0022b1c0`) and the scale (ROM `0x0022e910`) after them.

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
                  menus' code (clock_menus.mjs)
                  menu text (HDD OSD with text probes; else not produced)
bars              the two letterbox bars when configuration item 0 is 0 or 2
date and time     (HDD OSD with text probes; else not produced)
button hint       (HDD OSD with text probes; else not produced)
column            two pixels at the right edge
state only        clock logic; spin + 30, scene scale; blur level; frame counter + 1; overlay step;
                  item 0 reloaded from the settings word (clock_menus.mjs endOfFrame)
```

ROM 2.30 addresses of the entry sequence: matrices `0x00221610`, background `0x002216d8`, rods,
orbs and extra passes `0x0022beb8`, five more drawing functions, clock logic `0x0022b1c0`, scale
`0x0022e910`.

The 2 packets sent between the frame function's return and the next entry (the display buffer
swap, from `0x0020C000` and `0x002892E8` on HDD OSD) are not the clock's.

## Per send (both builds)

`buffer(n)` binds a work buffer as texture, `work(target)` and `display` choose where to draw,
`blend(mode, ztst)`, `bind(texture, blended, ztst)`; the helpers are those of `clock-gs-state.md`.

A rod:

```
buffer(0), work(1, field), blend(1, 1)      refracted, far-side faces, add 0        -> 0x118
bind(2, 1, 2), blend(2, 2)                  grain, far-side faces
blend(0, 2)                                 grain with the rod's pair, far-side faces
buffer(1), display(field), blend(1, 2)      refracted, near-side faces, add 0       -> the frame
buffer(1), work(0, field), blend(1, 2)      refracted, near-side faces, add 255     -> 0x0D2
```

An orb: `display(field), blend(0, 3)`, header, trail, `bind(7, 1, 1)`, glow, `bind(6, 1, 1)`,
disc; then `work(0, field), blend(0, 3)` and the same again with the second set of colours.

An extra pass: `work(1, clear (0, 0, 0, 128), field)`; per rod, whole:
`bind(0, 0, 2), blend(1, 1)`, reflection, `bind(pass ? 2 : 3, 1, 2), blend(2, 1)`, grain; split:
`blend(0, 1), bind(0, 0, 2)`, reflection, `bind(pass ? 3 : 2, 1, 2), blend(2, 1)`, grain; then
`buffer(1), display(no field), blend(0, 1)` and the full-screen rectangle with alpha 30.

The cubes' sends (System Configuration), *read* in HDD `module_clock_237350`,
`module_clock_237860`, `module_clock_2308F0` and ROM `0x00233928`, `0x00233DD8`, `0x0022C8D0`:
per cube `bind the frame`, eight state changes, the half-buffer sprite; per layer cube the
buffer, `TEXCREFA` and two blends; then buffer 1 added to buffer 0, the blur chain, buffer 0 onto
the display. Verified as part of the carried results.

## Rules the model implements

Each is *read*; the carried results are equal only with it.

**Rods and orbs**

- **A split rod's grain is one face to a packet on ROM 2.30** (`0x002342d8` open, `0x00234314`
  emit, `0x0023431c` send, and the same at `0x0023437c`, `0x00234428`, `0x002344cc`). HDD OSD
  sends both pieces' faces in one send. The contents are the same.
- **The trail header's alpha goes through the sprites' fade ramp** (`clock-orbs.md`).
- **The refracted emitter's `g`** is the cosine routine at `angle = (int16)((1 - F) x 32768 / 0.1)`,
  and `bright = (int)(bright x ((1 - cos) x 0.5))` (ROM `0x00232a68..0x00232ac4`); 54 faces with
  `F` above 0.99 in `rom-0230A-clock-frame` and `rom-0230A-clock-frame-adjust` (sent with
  `PRIM 0x114`), all equal.
- **What a rod's node holds beyond the template**: number, matrix, Y scale, base colour `+0x80`,
  reflection colour `+0xC0`, strength `+0x90` (200 for the current rod, 160 for the others), `t`
  and `n`; the accent chaser (state `+0x250`) as piece A's colour; the fourth colour (state
  `+0x260`) as the reflection colour of both pieces in the extra passes. An orb's node is the
  template as the last rod left it, with only the matrix replaced.
- **Two words the program copies but never sets:** the fourth word of an orb ring entry's
  position (`module_clock_237300` writes x, y, z; `module_clock_239E98` copies sixteen bytes) and
  the rod record's two matrix pointers, which are the addresses of the frame function's locals
  (`module_clock_22FE98`, `0x0022FEA8`, `0x0022FEB0`). The carried state is compared without them.

**Floating point**

- **The EE's FPU has no denormals.** The camera's approach offset, multiplied by its factor every
  frame, goes from the smallest normal number to minus zero (`rom-0230E-pal-clock-b`, frame 3395:
  real `0x80000000`). The model's single-precision step returns a signed zero below the smallest
  normal number.
- **`cosf` is reproduced, not taken as measured.** `model/ee_libm.mjs` is the C library's `cosf`
  (`0x00294B28`, `__kernel_cosf` `0x00296CF8`, `__kernel_sinf` `0x002977A0`,
  `__ieee754_rem_pio2f` `0x00295850`, table `npio2_hw` at `0x0036EB00` read from the file) with
  every operation cut toward zero: 3 213 calls of the cube placement in six captures, 144
  distinct arguments, every result equal bit for bit (*verified*, `model/check_cosf.mjs`).
- **Every single-precision sum is the exact sum cut toward zero** (`add`, `sub` in
  `clock_math.mjs`); the 169 sums of the model use them.

**Cubes and menus**

- **The cubes use neither the camera's position nor its rotation.** The cube record's two matrix
  pointers (`+0x64`, `+0x60`) point at `0x004090F0` and `0x004090B0` (ROM `0x003750C0`,
  `0x00375080`), which `func_002324C8` fills once: `sceVu0UnitMatrix` and
  `sceVu0ViewScreenMatrix(512, ax, ay, 2048, 2048, 1, D_0036FC0C, 1, 65536)` (`0x00232528`,
  `0x00232534`). The view handed to the transform is the unit matrix (*measured* in all 110 cube
  transforms of `hddosd-110U-cubes-b`; the model's cubes are equal only with it).
- **Who writes the cubes' spin:** the first instructions of HDD `func_00232640` (ROM
  `0x0022E938`): `spin += 0x1E`, 16 bits.
- **The menu ramp's step** (HDD `module_clock_230DF0` / `func_00230D58`, ROM `0x0022CF70`): the
  ramp ticks; while rising, at counter = tail length (`D_003702D0`) the cubes' ramp is sent down;
  when full, square (pad bit `0x80` of `0x00370334`) sends it down and starts the cubes' ramp
  (ROM 2.30 chooses standing cubes or ring there, `0x0022C330`). One event carries the blur level
  and the cubes through the System Configuration to clock transition.
- **The menu transition's blur chain** (`func_00236350`, `func_00236058`, `func_00236110`) is the
  cubes' chain; 1 to 5 trips in `*-whole-to-clock` (390 + 390 packets equal on HDD OSD).
- **The main menu** (`func_00232408`, ROM `0x0022E6E8`): its ramp, appearing at
  `weight = 128 - tail` in mode 2 and leaving at weight 128 in mode 3 (`func_002320B0`); the gate
  "no other page in front" (`func_00232020`: page, version, dialog and first-run ramps hidden and
  `D_003701D0` = 0); up, down, cross (Browser or `StartSysConfig`, ROM `0x0022D040`, which first
  rebuilds the list, `0x00223710`).
- **System Configuration** (`module_clock_231E48`, ROM `0x0022E0B8`): its ramp; the schedule
  (`func_00230FD8`, ROM `0x0022D160`); the selected entry's glow counter (+0x34); the input
  (`func_00231C50`, `func_002316B8`, `func_00231B38`; ROM `0x0022DFD8`, `0x0022DC00`,
  `0x0022DE80`): list moves (`func_00230860`), cross into an entry, square (clock alone), circle
  (close), confirm with the pulse, cancel. ROM 2.30: moves only with the ring, the standing
  cube's pulse, the wait on the drive write (`0x001F00A4`, `0x001F00B0`).
- **The entries' callbacks that touch the clock** are Clock Adjustment's only (every call of every
  callback followed). Opening (`D_00226FD0`, ROM `0x00222760`): field order by date format
  (`func_00226E68`), scale target 0, sprites hidden, seconds item 0, the time record from the
  items (`func_002358F8`), the date check. Confirm and cancel: scale target 1, sprites shown.
  Every frame inside it (`D_00227AD0`, ROM `0x00223258`): the field editor (`func_00227940`, ROM
  `0x002230A8`) and the time from the items.
- **The date check** (`func_00227488`, ROM `0x00222BF0`) and the date library it calls
  (`clock_date.mjs`): date to seconds `func_002149D8`, back `some_sort_of_lut_calc`, zone
  `func_00214728` with the base city 0x33 = +540 min read from the table, days of a month
  `func_002357D0`.
- **The thread's step** (`clock_input_check_handler_p6_p7_tgt` from `0x00225A28`, ROM
  `0x00221060`): main menu falling and changed gives screen code 9999 and the leaving flag; the
  flag with the first-run ramp hidden and mode 0 gives set-mode(3) (`func_00234C28`).
- **The list's drawing runs the selected entry's string callback** (*read*, HDD `func_002311E8`,
  called from `browser_str_related`; ROM `0x0022D728`): with the page ramp not hidden and the menu
  ramp not full, when the page is not inside an entry (or the drawn entry is not the selected
  one) it calls the entry's `+0x18` callback. Clock Adjustment's (`D_00227420`, ROM
  `0x00222B88`) calls `func_00226E68` (ROM `0x002225F8`), which puts the three date fields back
  to the date format's order and to the full ranges (the year's 2000..2099). After confirm or
  cancel the first frame's drawing therefore widens the year range that the date check had
  narrowed to 1999 (zone +270 min). Model: `stringCallback`. Verified by
  `hddosd-110U-whole2-adjust-confirm` and `rom-0230A-whole2-adjust-confirm` (`verify_frame.mjs
  --carry`: every piece equal).
- **Cancel reads the console's clock** (*read*, `D_00227BE8`, ROM `0x00223368`; first
  `func_00235848`, ROM `0x00231CF0`): the time record is rebuilt from the six words the mechacon
  read left at HDD `0x001F0D1C..0x001F0D30` / ROM `0x001F0CB8` (`func_002358F8`), then
  `module_clock_set_anim_offset` (ROM `0x00231F88`) moves it by `((offset - old zone) + (summer -
  old summer) x 60) x 60` seconds, the old zone being the base city 0x33 = 540 min with no summer
  time. The logic of the same frame then eases the hands toward the live time. Model:
  `timeFromClock`, the piece `rtcMirror` (an external input), `BASE_ZONE` in `clock_date.mjs`.
  Cancel is verified by `hddosd-110U-whole2-adjust-cancel` and `rom-0230A-whole2-adjust-cancel`,
  and with summer time on by the `-adjust-cancel-summer` captures of both builds.
  Confirm writes the items to the console (`config_item_change_cb_clock_write_mechacon`, HDD
  `0x00235170`, ROM `0x00231738`). The six items 6 to 0xB are local time;
  `func_002148B8` (ROM `0x0020E1B8`) turns them to seconds (`func_002149D8`), moves them to the
  base zone with `func_00214788` (ROM `0x0020E158`: minus 3600 with summer time, minus zone x 60,
  plus the zone of city `0x33` x 60 (`get_timezone_info_struct(config_check_timezone_city(0x33))`, 540 in the captures), the inverse of `func_00214728`) and back to a date (`some_sort_of_lut_calc`). It
  stores the packed-decimal bytes of `func_00235138` (HDD; ROM 0x64 lower): `0x001F0D17` year mod
  100, `0x001F0D16` month with bit 7 set, `0x001F0D15` day, `0x001F0D13` hour, `0x001F0D12`
  minute, `0x001F0D11` second, the word `0x001F0D18 = 1`, and the six RTC mirror words
  `0x001F0D1C..0x001F0D30` (year to second), the words cancel reads; the other bytes of
  `0x001F0D10..0x001F0D33` stay. *Verified* on HDD OSD 1.10U by `verify_clock_write.mjs`
  (`rtcFromLocal` in `clock_date.mjs`; six words, seven BCD bytes, the flag and the untouched
  bytes recomputed at entry and return of the function, and, as a consistency check of the model, the cancel rule applied to
  the written words giving the items back) on `hddosd-110U-adjust-write` (zone 0, no summer time),
  `-adjust-write-summer` (bit 29 set) and `-adjust-write-zone` (zone -720, RTC = local + 21 h):
  two confirms each, the date moved in all of them. The ROM 2.30 function is the same code word
  for word (*read*, `find_in_rom.mjs`); no ROM capture. Not reached: the two `bltz` that leave
  the items unchanged for a negative year or hour (*read*).
- **The vignette's record is written every frame of mode 0** (*read*, `func_00234D60`, ROM
  `0x00231368`), whatever the ramp does; only the drawing waits for the ramp. With the PAL ramp
  (length 0x42) the last frames of a falling ramp leave alpha 0. Model: `overlay()` in
  `clock_rest.mjs`. Verified by `rom-0230E-pal-whole2-enter`.
- **ROM 2.30's list rebuild writes the value count and table of the last entry by the
  language** (*read*, `0x00223710` calls `0x002235D8(index of the last entry)`, which writes the
  entry's value count at `+4` and value table at `+0x10`; the language is the word cached at
  `0x0027B388` once the flag at `0x0027B390` is set, `0x00205830`; it then tail-jumps to
  `0x002294C0`, which fills the record at `0x00295900`, a record no piece of the model holds and
  nothing the clock draws reads). Model: the piece `language`, `valueTable` in `clock_menus.mjs`
  (`VALUE_TABLES`); the model notes when the language was never read from the drive (flag 0 or
  -1: that read is not modelled). The list's count and selected entry are read from
  `configPage` (`0x0028AFF0`, 0x38 bytes). Verified by `rom-0230A-whole2-enter` and
  `rom-0230E-pal-whole2-enter`, which meet language 1 only (Open).
- **The display block is written between frames**: the buffer swap sets the next field's offset
  in the environment. Every use writes the offset first, so nothing sent depends on it.

**Build differences in the cubes and the buffer helpers**

- Before a cube's depth quads HDD OSD calls blend 0 with depth test 2 (`0x00237604`), ROM 2.30
  with 3 (`0x00233BB0`).
- ROM 2.30's buffer helpers end with one more "blend 1, depth test GREATER": the blur function
  and the copy function (`clock-frame-rest.md`) and the cubes' blur chain (`0x002327B8`, at
  `0x002328D0`, also with no trip). The add and half-buffer sprites do not.
- ROM 2.30's frame-texture binder: `TEST 0x70000` at `0x002306AC`, `CLAMP 0` at `0x002306B0`.
- ROM 2.30's texture binder writes `TEST_1 = 0x30000 | ztst << 17` (`clock-gs-state.md`).

**PAL**

- ROM 2.30 in PAL draws the vignette taller: its vertical term is multiplied by 1.15 (constant
  at `0x002C81D8`) when the video mode is PAL (`0x0022FEE4..0x0022FF00`). HDD OSD's
  `func_002338E0` has no such step, so the radii are unchanged in HDD OSD PAL. Verified by
  `rom-0230E-pal-whole-menu`. ROM 2.30's cached video mode is the word at `0x0027B380` (read at
  `0x002052D0`; 2 is PAL).
- `ZBUF_1` follows the screen size (`ceil(W/64) x ceil(H/32) x 2`).

## Configuration item 0 (the aspect ratio)

**What resets a written item** (*read* in HDD; ROM addresses from the model's reading, not
re-read: the disassembly tree holds HDD OSD only). The frame function ends with `func_00235518`
(HDD `0x00235518`, called at `0x00225F0C`; ROM `0x00231A40`, a jump into the loader): when the
configuration is not dirty (`is_config_dirty`, `0x002354E8`; ROM 2.30 has no dirty test in that
path) it calls `config_load_clock_osd` (HDD `0x00234F88`, ROM `0x00231590`), which, with the gate
`D_00370300` (ROM `0x002C8920`) at 1, rewrites item 0 (`0x00409130` / `0x00375100`) from
`config_get_aspect_ratio` (HDD `0x00203D30`, ROM `0x002041C8`): bits 1..2 of the settings word
`var_mechacon_config_param_1` (HDD `0x00371818`, ROM `0x002C9680`), a ratio of 3 read as 0. A
write to item 0 is therefore gone at the end of the frame (*measured*, `model_aspect.mjs` on
`hddosd-110U-whole2-aspect-reset`: item 0 written 1, 0 in each of 49 frames). Bit 3 of the ROM's
word is the video output (ROM `0x00204230`), not the ratio (*measured*, `model_aspect.mjs` on
`rom-0230A-whole2-aspect0-bit3`: bit 3 set, item 0 in every frame 0). The entry's confirm
callback (`clock_config_change_cb_aspect_ratio`, HDD `0x00227D30`, ROM `0x00223400`) compares
item 0 with `config_get_aspect_ratio` and calls `config_mark_dirty` when they differ (*read*,
HDD). Where a setting enters from the entry's other callbacks is in Open.

**What item 0 does to a frame** (*read* in `func_002262C8`, `func_00226300`, `func_00226958`; ROM
`0x002219A0`, `0x002219D8`, `0x002220D8`):

| Item 0 | Letterbox bars | Date and time row | Hint row |
|---|---|---|---|
| 0 (4:3) | drawn | 14 (0xE) | 200 (0xC8) |
| 1 (full screen) | none | 14 (0xE) | 200 (0xC8) |
| 2 (16:9) | drawn | 32 (0x20) | 182 (0xB6) |

The item is never 3 (the word's 3 reads as 0). PAL scales the rows by 0.5405 / 0.47 in double
precision, cut to an integer. Verified: `model_aspect.mjs` (on every capture below: `verify_frame
--carry`, and every row the program gave `Font_SetLocate` for the date and the time and the
answer of the hints' row function, against the model's `dateRow` / `hintRow`): 48 of 48 date, 48
of 48 time and 48 of 48 hint rows equal (47 of 47 on the cancel captures); the PAL rows on
`hddosd-110U-pal-whole2-aspect2` (HDD OSD). The bars are compared packet by packet by
`verify_frame.mjs --carry` (`model_aspect.mjs` prints their count, 0 for item 1 and 196 for
item 2, and its verdict does not gate on it). `mutate.mjs model_aspect.mjs`: 2 of 2 mutants
killed.

**Model.** `clock_menus.mjs`: `aspectOf`, `reloadItem0`, `endOfFrame` (called last by `frame`),
the gate written by the list, the aspect entry's confirm and its value index (`valueIndex`);
`clock_rest.mjs`: `dateRow`, `hintRow`; `clock_memory.mjs`: the piece `configGate`. In a capture
that holds the gate, item 0 is no longer an external input: the model carries it and the gate.

| Capture (`--carry`, zero events) | What | Frames | Produced and equal, of the frame's packets |
|---|---|---|---|
| `hddosd-110U-whole2-aspect1` | word ratio 1: no bars | 49 | 40 474 of 46 993 (86.1%) |
| `hddosd-110U-whole2-aspect2` | word ratio 2: bars, rows 0x20 and 0xB6 | 49 | 40 768 of 47 287 (86.2%) |
| `hddosd-110U-whole2-aspect3` | word ratio 3 read as 0 | 49 | 40 768 of 47 287 (86.2%) |
| `hddosd-110U-pal-whole2-aspect2` | PAL, ratio 2: rows scaled | 49 | 38 878 of 44 712 (87.0%) |
| `hddosd-110U-whole2-aspect-set` | down, cross, right, then confirm | 49 | 40 474 of 45 574 (88.8%) |
| `hddosd-110U-whole2-aspect-cancel` | the same, then cancel: item 1 back to 0 | 49 | 40 762 of 45 815 (89.0%) |
| `hddosd-110U-whole2-aspect-reset` | item 0 written 1, read 0 from the first whole frame; no row comparison | 49 | 40 768 of 47 287 (86.2%) |
| `rom-0230A-whole2-aspect1` | word ratio 1 | 49 | 41 923 of 44 339 (94.6%) |
| `rom-0230A-whole2-aspect2` | word ratio 2 | 49 | 42 217 of 44 633 (94.6%) |
| `rom-0230A-whole2-aspect0-bit3` | word bit 3 only: item 0 stays 0 | 49 | 42 217 of 44 633 (94.6%) |
| `rom-0230A-whole2-aspect2-gate` | gate 0 and item 0 written 2 (a stimulus): the item stays | 49 | 42 217 of 44 633 (94.6%) |
| `rom-0230A-whole2-aspect-cancel` | the entry's cancel on ROM 2.30 | 49 | 42 029 of 47 083 (89.3%) |

## Text (HDD OSD 1.10U)

`clock_frame.mjs` imports `clock_text.mjs` (`putString`) and produces the text packets of the
three parts that draw text (the pages function's menu text, `func_00226300` date and time,
`func_002269E0` button hint) when the snapshot carries `text` (`{ state, strings: { pages, text,
hint } }`); without it, and on ROM 2.30, they are gaps. `verify_frame.mjs` builds `text` from
the capture's own probes (taken with `--verifiers verify_frame.mjs,verify_text2.mjs`).

- **Strings come from probes, not from a rule.** The argument pointer of each `Font_PutsPackets` /
  `calcDrawArea` call is probed; when it is an entry of the language table (`langtblptrs`, the
  language word probed) or a fixed ELF string, the text is the ELF image's string at that
  pointer and the probe's bytes are only compared with it; the date and time are RAM buffers
  the callers fill from the console clock, and their text is the probe's bytes. The caller's
  font state (place, colour, size: 0x160 bytes) is the probe's. Which caller draws which string,
  where and in which colour is `verify_text2.mjs`'s rule, not this model's.
- **Carried by the model:** the library's context (cache list, cells, colour table, packet
  room) is read at the capture's first character and carried through every character, string
  and frame; at every frame's first character the carried list and block are compared with
  the library's (`carried font cache equal to the library's at 24 of 24 frame starts` on
  `hddosd-110U-whole3-clock`, 84 of 84 on `hddosd-110U-whole3-boot`).
- **Placement:** the packets inside the parts that are not text (button panels and icons, colour
  states) are not produced; a string's probe position (its trace packet index) tells the
  comparison where its packets start. That is alignment, not content.
- `hddosd-110U-whole3-clock`: 25 of 25 strings taken from the language table, 0 of 0 from fixed
  strings, 75 from the caller's buffers as probed (date and time). The verdict needs at least
  one string resolved through the image.

| Capture (`--carry`, zero events, HDD OSD) | What | Frames | Produced and equal, of the frame's packets | Text packets equal |
|---|---|---|---|---|
| `hddosd-110U-whole3-clock` | clock alone | 25 | 14 850 of 15 025 (98.8%) | 800 of 800 |
| `hddosd-110U-whole3-menu` | main menu | 24 | 8 448 of 8 736 (96.7%) | 1 680 of 1 680 |
| `hddosd-110U-whole3-config` | System Configuration | 25 | 25 025 of 25 725 (97.3%) | 4 225 of 4 225 |
| `hddosd-110U-whole3-enter` | main menu to System Configuration | 75 | 59 427 of 59 879 (99.2%) | 5 613 of 5 613 |
| `hddosd-110U-whole3-adjust-hour` | Clock Adjustment, hour held up | 45 | 43 110 of 43 650 (98.8%) | 5 670 of 5 670 |
| `hddosd-110U-whole3-boot` | power-on, empty glyph cache | 85 | 24 544 of 25 123 (97.7%) | 3 481 of 3 481 (19 of 19 picture uploads) |
| `hddosd-110U-pal-whole3-config` | PAL: System Configuration | 24 | 24 024 of 24 696 (97.3%) | 4 056 of 4 056 |
| `hddosd-110U-pal-whole3-menu` | PAL: main menu | 25 | 8 800 of 9 100 (96.7%) | 1 750 of 1 750 |

HDD OSD captures taken without text probes (`whole`, `whole2`) keep the gaps: coverage as in
the tables of "Result". ROM 2.30 and ROM 2.30 PAL have no text: `clock_text.mjs` holds the HDD
OSD font code only, and `verify_text2.mjs` holds the ROM's.

`mutate.mjs verify_frame.mjs --capture hddosd-110U-whole3-boot`: 2 of 8 mutants killed; 6 survive:
five lines that add to the coverage counters (printed, no verdict reads them) and the `-1`
sentinel of the table id (only `< 0` is tested: equivalent).

## Where the model branches on the build

All *measured* on both, by the model passing on each with its own branch:

| | HDD OSD 1.10U | ROM 2.30 |
|---|---|---|
| Refracted face header | `PRIM`, `CLAMP_1` = region clamp to `0..W-1`, `0..H-1`, `RGBAQ` | `PRIM`, `CLAMP_1 0x1000000` twice, `RGBAQ` |
| Refracted lookup | 12.4 integers clamped to the screen | 1024 and 256 added, floor at 1024 |
| A split rod's grain | both pieces' faces in one packet | one face to a packet |
| Texture binder | `TEST_1 0x10000 \| ztst << 17`, `CLAMP_1` 5 | `TEST_1 0x30000 \| ztst << 17`, `CLAMP_1` 0 |
| Work buffer binder | `TEST_1 0x50000`, `TEXFLUSH`, `CLAMP_1` = region clamp | `TEST_1 0x70000`, register `0x7F`, `CLAMP_1` 5 |
| Display block | `0x001F0A70`, index at `+0x230`, screen size at `+0x244` | `0x001F0A10`, index at `+0x230`, screen size at `+0x240` |

The grain's `CLAMP_1 0x1000000` (repeat) is in the textured emitter's own face header on both
builds: `PRIM 0x54`, then `CLAMP_1 0x1000000` (`clock-gs-state.md` has its writer).

## Result (*verified*)

Rods, orbs and extra passes, from one snapshot per frame (`verify_frame.mjs`, no `--carry`).
Every write equal: `PRIM`, `RGBAQ`, `ST`, `UV`, `XYZF2`, `CLAMP_1` of the vertex packets, and
`TEST_1`, `ALPHA_1`, `TEX0_1`, `TEX1_1`, `CLAMP_1`, `TEXA`, `FRAME_1`, `ZBUF_1`, `XYOFFSET_1`,
`SCISSOR_1` and the rest of the state packets. Packets are compared in order, so the depth-sorted
draw order of twelve rods and seven orbs is part of what agrees.

| Capture | Frames | What happens in them | Vertex packets | State packets |
|---|---|---|---|---|
| `hddosd-110U-clock-frame` | 14 | HDD OSD, the clock alone; both fields, both display buffers | 2 744 of 2 744 | 4 256 of 4 256 |
| `rom-0230A-clock-frame` | 9 | the clock alone; rod 5 split at `t` 0.265; both fields, both display buffers | 1 962 of 1 962 | 2 736 of 2 736 |
| `rom-0230A-clock-frame-adjust` | 29 | Clock Adjustment, the hour turned from 5 to 6 with the pad: the ring jumps, the new rod's `t` climbs from 0.004, the scene scale is near 0, the sprites' fade is at 0, a ring's head wraps from 49 to 0 | 6 264 of 6 264 | 8 816 of 8 816 |

The whole frame: `CLOCK_BUILD=hdd|rom node References/scripts/verify_frame.mjs <trace> --carry`.
"Carried" = every frame after the first runs from the state the model left. Coverage = packets
produced and equal out of all packets between two entries of the frame function. Every line is
`verdict: FOUND N frames: every packet the model produces equal`, with `matrices computed equal
to the ones handed to the rods: N of N`, `parts starting where the model has them: 8N of 8N` and
`state the model carried, against each frame's snapshot: every piece equal in every frame`.

**Captures taken without the menus' pieces (`whole`)** (the model takes the menus' state from the
trace as events, "Events in the carried runs").

**HDD OSD 1.10U**

| Capture | What | Frames | Produced and equal, of the frame's packets | Events | Carried |
|---|---|---|---|---|---|
| `hddosd-110U-whole-clock` | clock alone | 16 | 8 992 of 9 616 (93.5%) | none | FOUND |
| `hddosd-110U-whole-long` | clock alone | 65 | 36 530 of 39 065 (93.5%) | none | FOUND |
| `hddosd-110U-whole-menu` | main menu (vignette on, rods hidden) | 13 | 3 666 of 4 732 (77.5%) | none | FOUND |
| `hddosd-110U-whole-config` | System Configuration, six cubes on the ring | 12 | 9 984 of 12 348 (80.9%) | none | FOUND |
| `hddosd-110U-whole-to-clock` | System Configuration to the clock alone (square held): blur 10 to 0, cubes shrinking, the list leaving | 49 | 40 768 of 47 287 (86.2%) | menuRamp (1 frame) | FOUND |
| `hddosd-110U-whole-enter` | main menu into System Configuration (down, cross held): vignette falling, grey rising, rods on, cubes growing | 75 | 53 814 of 59 879 (89.9%) | greyRamp, vignetteRamp, appearance, cubeRamp (2 frames) | FOUND |
| `hddosd-110U-whole-boot` | power-on, the clock's first 57 frames: overlay mode 2, orb 0 flying in, rings filling, camera approach, scale held at 0 | 57 | 13 117 of 14 610 (89.8%) | none | FOUND |
| `hddosd-110U-whole-boot-opening` | power-on through the opening (`BootOpening`), the clock's first 49 frames: all seven orbs flying in | 49 | 11 269 of 12 554 (89.8%) | none | FOUND |
| `hddosd-110U-pal-clock-frame` | PAL: clock alone | 15 | 8 430 of 9 015 (93.5%) | none | FOUND |
| `hddosd-110U-pal-config-frame` | PAL: System Configuration | 12 | 9 984 of 12 348 (80.9%) | none | FOUND |
| `hddosd-110U-pal-whole-to-clock` | PAL: System Configuration to the clock alone | 49 | 38 878 of 44 712 (87.0%) | menuRamp (1 frame) | FOUND |

**ROM 2.30** (PAL: the 2.30 E image)

| Capture | What | Frames | Produced and equal, of the frame's packets | Events | Carried |
|---|---|---|---|---|---|
| `rom-0230A-whole-clock` | clock alone | 16 | 10 208 of 10 832 (94.2%) | none | FOUND |
| `rom-0230A-whole-long` | clock alone | 65 | 41 502 of 44 037 (94.2%) | none | FOUND |
| `rom-0230A-whole-menu` | main menu | 13 | 3 718 of 4 784 (77.7%) | none | FOUND |
| `rom-0230A-whole-config` | System Configuration, five standing cubes | 13 | 11 189 of 13 334 (83.9%) | none | FOUND |
| `rom-0230A-whole-to-clock` | System Configuration to the clock alone | 49 | 42 221 of 44 637 (94.6%) | menuRamp (1 frame) | FOUND |
| `rom-0230A-whole-enter` | main menu into System Configuration | 75 | 55 736 of 59 894 (93.1%) | greyRamp, vignetteRamp, appearance, cubeRamp, cubeMode (2 frames) | FOUND |
| `rom-0230E-pal-clock-b` | PAL: clock alone | 16 | 10 272 of 10 896 (94.3%) | none | FOUND |
| `rom-0230E-pal-whole-config` | PAL: System Configuration | 13 | 11 243 of 13 388 (84.0%) | none | FOUND |
| `rom-0230E-pal-whole-menu` | PAL: main menu (vignette) | 17 | 4 862 of 6 256 (77.7%) | none | FOUND |

**Captures with the menus' code modelled (`whole2`)**, every one `verdict: FOUND N frames: every
packet the model produces equal`, every carried piece equal in every frame, zero events
(`verify_frame.mjs --carry`; no text probes). The mode word of `mode1` and `mode4` is written into
memory (HDD `0x00370AB4`/`0x00370AB8`, ROM `0x002C8F6C`/`0x002C8F70`): the
captures show mode 1 counting its level up and mode 4 standing. The `adjust-cancel-summer`
captures write the settings word (HDD `0x00371818`, ROM `0x002C9680`) to turn summer time on after
Clock Adjustment is open, which reaches the cancel path's summer term; summer time is reached by
that write on both builds, not by a console setting.

| Capture, HDD OSD 1.10U | What | Frames | Produced and equal, of the frame's packets |
|---|---|---|---|
| `hddosd-110U-whole2-enter` | main menu into System Configuration | 75 | 53 814 of 59 879 (89.9%) |
| `hddosd-110U-whole2-down` | System Configuration, down | 45 | 37 601 of 43 365 (86.7%) |
| `hddosd-110U-whole2-up` | System Configuration, up | 35 | 29 281 of 35 708 (82.0%) |
| `hddosd-110U-whole2-back` | System Configuration to the main menu (circle) | 99 | 70 590 of 79 793 (88.5%) |
| `hddosd-110U-whole2-to-clock` | System Configuration to the clock alone (square) | 79 | 58 168 of 65 961 (88.2%) |
| `hddosd-110U-whole2-leave` | main menu to Browser: mode 3, orb 0 leaving, thread ends | 130 | 30 183 of 33 882 (89.1%) |
| `hddosd-110U-whole2-adjust-open` | Clock Adjustment entered: fade down, scale 0, time from the items | 49 | 40 768 of 47 592 (85.7%) |
| `hddosd-110U-whole2-adjust-hour` | inside Clock Adjustment, cursor moved, hour held up | 45 | 37 440 of 43 650 (85.8%) |
| `hddosd-110U-whole2-adjust-confirm` | Clock Adjustment confirmed | 49 | 40 768 of 50 359 (81.0%) |
| `hddosd-110U-whole2-adjust-cancel` | Clock Adjustment cancelled | 49 | 40 768 of 50 359 (81.0%) |
| `hddosd-110U-whole2-adjust-cancel-summer` | cancelled with summer time on | 49 | 40 768 of 50 408 (80.9%) |
| `hddosd-110U-whole2-mode1` | overlay mode 1 | 35 | 8 085 of 10 490 (77.1%) |
| `hddosd-110U-whole2-mode4` | overlay mode 4 | 34 | 7 854 of 8 806 (89.2%) |

| Capture, ROM 2.30 | What | Frames | Produced and equal, of the frame's packets |
|---|---|---|---|
| `rom-0230A-whole2-enter` | main menu into System Configuration | 75 | 55 780 of 59 938 (93.1%) |
| `rom-0230A-whole2-down` | System Configuration, down (standing cubes) | 45 | 38 757 of 44 488 (87.1%) |
| `rom-0230A-whole2-back` | System Configuration to the main menu | 99 | 73 169 of 77 417 (94.5%) |
| `rom-0230A-whole2-to-clock` | System Configuration to the clock alone (square) | 49 | 42 217 of 44 633 (94.6%) |
| `rom-0230A-whole2-leave` | main menu to Browser | 130 | 30 703 of 34 195 (89.8%) |
| `rom-0230A-whole2-adjust-open` | Clock Adjustment entered | 49 | 42 108 of 48 924 (86.1%) |
| `rom-0230A-whole2-adjust-hour` | inside Clock Adjustment, hour held up | 45 | 38 604 of 44 814 (86.1%) |
| `rom-0230A-whole2-adjust-confirm` | Clock Adjustment confirmed | 49 | 42 059 of 50 114 (83.9%) |
| `rom-0230A-whole2-adjust-cancel` | Clock Adjustment cancelled | 49 | 42 151 of 50 206 (84.0%) |
| `rom-0230A-whole2-adjust-cancel-summer` | cancelled with summer time on | 49 | 42 147 of 50 300 (83.8%) |
| `rom-0230A-whole2-mode1` | overlay mode 1 | 35 | 8 225 of 9 825 (83.7%) |
| `rom-0230A-whole2-mode4` | overlay mode 4 | 35 | 8 225 of 9 205 (89.4%) |
| `rom-0230E-pal-whole2-enter` | PAL: main menu into System Configuration | 75 | 57 495 of 61 933 (92.8%) |

`rom-0230A-whole2-enter`: 24 178 of 24 178 vertex packets and 31 602 of 31 602 state packets equal,
`state the model carried, against each frame's snapshot: every piece equal in every frame`, no
event line (`CLOCK_BUILD=rom node References/scripts/verify_frame.mjs <trace> --carry`). The
configuration page's piece `configPage` is read with its 0x38 bytes; `clock_memory.mjs` reads a
word of a piece from the piece's address, so a capture that probed fewer bytes of a piece still
serves the fields it holds (every other `whole` and `whole2` capture on both builds still ends
FOUND).

The configuration item 0 captures are in "Configuration item 0", the text captures in "Text".

`mutate.mjs verify_frame.mjs` leaves 4 mutants alive, all on lines that add to
`coverage.others`, which no verdict reads: the verifier computes nothing else.

### Events in the carried runs

"Events" lists the pieces whose value the model took from the trace: in that frame the model's
own value differed from the console's after the pages function and was replaced by it
(`verify_frame.mjs`, `real.copy(mine)`). In those frames the model reads the answer for that
piece; an event is not an external input.

- In the 20 captures of the `whole` tables that hold no menus' pieces (689 frames), 669 frames run
  from carried state and **7 of them carry an event** (12 piece-events): `hddosd-110U-whole-to-clock`
  1 frame, `hddosd-110U-pal-whole-to-clock` 1, `rom-0230A-whole-to-clock` 1, `hddosd-110U-whole-enter`
  2 (1641, 1681), `rom-0230A-whole-enter` 2 (2030, 2070). The other 662 frames take nothing but
  the external inputs from the trace.
- **Zero events in all 46 captures that hold the menus' pieces**, with the menus' code modelled
  (`verify_frame.mjs --carry`, each ends FOUND and prints no event line): every `whole2` capture of
  both builds listed above, the item 0 captures, and the `whole3` captures. This covers every
  menu change met: main menu into System Configuration (both builds, ROM PAL), back, up, down,
  to the clock alone, to the Browser, Clock Adjustment's opening, hour, confirm and cancel. On a
  capture that holds the menus' pieces every event is a fault of the model; a modelling error in
  an event's rule shows as an event in every frame, not in one. The other `whole` captures
  with no event show no menu change (the clock alone, the main menu and System Configuration at
  rest, the power-on runs).

Coverage of what the model produces, per frame, without text probes: clock alone 93.5% to 94.3%;
main menu 77.5% to 77.7%; System Configuration 80.9% to 84.0%; Clock Adjustment 80.9% to 85.8%
(HDD OSD) and 83.8% to 86.1% (ROM 2.30) over the open, hour, confirm and cancel captures. With
text probes (HDD OSD): clock alone 98.8%, main menu 96.7%, System Configuration 97.3%, Clock
Adjustment 98.8%. In the rods, orbs and extra passes alone, ROM 2.30's clock sends 677 packets a
frame and the model produces 522 (77.1%); HDD OSD 500 of 601 (83.2%): the same draws in fewer
packets. In Clock Adjustment the clock's own packets are 520 of 996
(`rom-0230A-clock-frame-adjust`).

## What the model takes as input

**The snapshot, once:** the pieces of `LAYOUT` (see "The snapshot").

**From outside, every frame** (`EXTERNAL` in `verify_frame.mjs`): these stay external in every
carried run.

| Piece | Why |
|---|---|
| `time` | the time record, as the time keeper (HDD `func_00235B10`) leaves it |
| `index` | which display buffer is drawn to |
| `scene` + 8 | the field flag (the scale at +0 and the leaving flag at +4 stay the model's) |
| `disc` | the disc state the drive reports |
| `configDirty` | whether the configuration is being saved (the save runs outside the clock) |
| `configItems` | the configuration items as the configuration code leaves them (Clock Adjustment edits items 6 to 0xB) |
| `romWrite` | ROM 2.30: the state of the write of the clock to the drive |
| `mechaconParam` | the console settings word (time zone, summer time, aspect ratio), read from the drive |
| `rtcMirror` | the console's clock words that Clock Adjustment's cancel reads (HDD `0x001F0D1C`, ROM `0x001F0CB8`) |
| `item0` | configuration item 0, reloaded every frame; in a capture that probed the reload gate the model carries it and the gate instead |
| `pad` | the pad words, as the pad reader (HDD `func_00235EB0`) leaves them at the end of the frame before |
| `wide` | whether the clock was entered from the opening (`0x001F064C`) |
| `timeFilled` | HDD OSD: whether the time keeper has filled the time record yet |
| `display` | the display block (see the rules above); no effect on what is sent |

The view and screen matrices are computed by the model (`clock-camera.md` verifies the screen
matrix's formula and `verify_view_matrix.mjs` the view matrix, both bit for bit). The step from
one frame's state to the next is checked per piece by `verify_clock_state.mjs` and by `--carry`.

**Events** (`EVENTS` in `verify_frame.mjs`): state that the menus' own code writes when something
happens. The model carries each by its rule (ramp ticks, list step, overlay step, menus' code)
and takes the new value only in a frame where the state after the pages function differs from the
model's: `menuRamp`, `cubeRamp`, `cubeList`, `cubeMode`, `standing`, `mode`, `orbRandom`,
`overlayLevel`, `fadeRecord`, `scaleTarget`, `greyRamp`, `vignetteRamp`, `appearance`,
`spriteFade`. Counts per capture: "Events in the carried runs".

## What is not produced

HDD OSD with text probes: the packets of the three text parts that are not text, per frame (clock
alone: hint 4, date and time 1; main menu: hint 7, pages 2, date and time 1; System
Configuration: hint 23, pages 2, date and time 1: button panels and icons and colour states;
their content is not read), and, on every screen, 2 packets of the display buffer swap, sent after
the frame function has returned. The text itself is produced ("Text").

Without text probes on HDD OSD, and on ROM 2.30 always: text and the menus' own drawing; the
font is `text.md`'s.

| Screen | Per frame, HDD OSD | Per frame, ROM 2.30 | What |
|---|---|---|---|
| clock alone | 24 + 13 | 24 + 13 | date and time; button hint |
| main menu | 33 + 24 + 23 | 33 + 24 + 23 | menu items' text (after the trips that follow the rods); date and time (sent with alpha 0); hint |
| System Configuration | 95 + 24 + 76 | 95 + 24 + 44 | the list's text; date and time; hint |
| every screen | 2 | 2 | the display buffer swap, sent after the frame function has returned |

In the rods, orbs and extra passes alone, the rest of ROM 2.30's clock-alone frame, per frame, by
the function that has it sent (HDD OSD names): 101 background, blur and tint
(`module_clock_226000`); 24 date and time (`func_00226300`); 13 button hint (`func_002269E0`); 6
letterbox bars (`func_002262C8`); 4 fade overlay (`module_clock_234E70`); 4 right edge column
(`func_00226A88`); 2 display buffer swap; 1 `module_clock_232458`. The whole-frame model produces
the background, bars, fade and column among these.

In the main menu's pages gap on HDD OSD (*measured*, `hddosd-110U-whole-menu`): 27 glyph fans
(`PRIM 0x5D`, texture `0x2F04`) from `func_00232170`, and their state packets; nothing else.

## Not covered

- Text on ROM 2.30 (both video modes); the non-text packets of the text parts; text packets with
  item 0 other than 0 (those captures have no text probes: only the rows are compared).
- The menus' code is *read* and modelled, and exercised only by the captures above. Not met in a
  capture: a confirmed value's pulse; overlay modes 1 and 4 set by the program (the captures
  write the mode word). Mode 3's orb rule is `verify_transitions.mjs`'s; the whole-frame captures
  that exercise it are `*-whole2-leave`. The list moving, the pulse and the fade are covered
  piece by piece by `verify_cubes.mjs` and `verify_orbs.mjs`.
- The time record's year, month, day and zone words (`+0x10..+0x1C`, `+0x20`) that Clock
  Adjustment's cancel writes, and on ROM 2.30 the seconds-of-clock word stored at `gp-0x6F78`:
  *read* in the code, held by no probe; nothing the clock draws reads them.
- A send with no face on one side: the rod function always opens and sends the packet
  (`module_clock_237A28`: `func_002333E0`, the face loop, `func_00238DB0`, no count test), as the
  model does, and no orientation of the rod and seconds angles gives an empty side (*read*). Met
  only for orb trails with an empty ring (70 in `hddosd-110U-whole-boot`, equal); never met for
  a rod.
- Orb mode 2 on ROM 2.30; a transition other than the main menu into System Configuration on ROM
  2.30 in PAL; the opening (`opening.md`) and the first-run pages.

## Open

- **ROM 2.30 value tables by language.** The model's `VALUE_TABLES` (`clock_menus.mjs`) take, from
  the jump table at ROM `0x002C4920`: language 0 (2 values, `0x0028A800`), 1 (7, `0x0028A860`), 2
  (7, `0x0028A9B0`), 3 (2, `0x0028AC20`), 4 (2, `0x0028AB00`), 5 (2, `0x0028AB60`), 6 (2,
  `0x0028ABC0`). A second reading of the same table gives language 3 `0x0028AB00`, 4 `0x0028AB60`,
  5 `0x0028ABC0`, 6 `0x0028AC20`. The two orders disagree for languages 3 to 6 and neither is
  a fact. Only language 1 is met by any capture, so no verifier decides it. Settled by dumping
  the seven words at `0x002C4920` from a ROM 2.30 capture (`References/scripts/dump_ee.mjs`) and
  by reading `0x002235D8`. The ROM instructions at `0x002235D8`, `0x00205830` and `0x002294C0`
  have not been read in a disassembly (the disassembly tree holds HDD OSD only); the ROM captures
  verify what they produce, language 1 only.
- **How a setting reaches item 0, beyond the confirm callback.** Entry 1 of System Configuration
  (id 0x6B HDD / 0x6F ROM, three values, value table `0x002B2810` / `0x0028ACE0`). The model
  writes the gate with cross in (-1 for the first entry, 0 for the others), moves the value
  index with the generic editor (`D_00228660`), saves through `config_set_aspect_ratio`
  (`0x00203D50`) with the gate back to 1, and on cancel (`+0x24`) sets the gate to 1 and reloads
  at once. The cross-in handler, the cancel handler and the save path are not re-read, and no
  probe holds the gate or the word in the `aspect-set` capture (word 0x07000010 to 0x07000012
  reported there); the captures `aspect-set`, `aspect-cancel` and the ROM `aspect-cancel` pass
  with the gate and item 0 carried. The gate written by cross in is exercised by no capture:
  every capture presses cross before the trace starts. Settled by a capture that presses cross
  inside the trace (`verify_frame.mjs --carry`, `model_aspect.mjs`).
- **ROM 2.30's value table of the aspect entry** (`0x0028ACE0`) is filled at run time and was not
  read; HDD OSD's (0, 1, 2 at `0x002B2810`) is read from the image. The ROM captures show the
  same indices. Settled by dumping `0x0028ACE0` from a ROM 2.30 capture (`dump_ee.mjs`).
- **ROM 2.30's confirm of a changed aspect value** is neither modelled nor captured: the callback
  tail-jumps to ROM `0x00231888`, which starts a drive write (the `romWrite` states); the model
  has only the existing wait branch. No capture confirms a changed aspect on ROM 2.30 (the
  entry's cancel only).
- **The generic editor and the enter callback** (`D_00228660`; `clock_config_get_initial_value`,
  `0x00228448`, which also clears `D_003701A4` and `D_002B2E1C`) are not modelled and in no
  capture: the captures press right and cross in before the trace starts, so their effect arrives
  as the starting snapshot.
- **Gate writers outside the entry list** (`func_00234F50`, `func_00234F58`, `func_00234F68`,
  `func_00234F78` from the main menu, the first-run pages and Clock Adjustment's pages; ROM jals
  at `0x00225070` to `0x00229A90` and `0x0022D2C0`) are not modelled and not met: the gate is
  carried and compared in every frame with no difference.
- **ROM 2.30 PAL** has the main menu into System Configuration only (`rom-0230E-pal-whole2-enter`);
  the PAL rows of item 0 are verified on HDD OSD only (`hddosd-110U-pal-whole2-aspect2`).
- **Leaving-entry drawing** (`D_003702A0` / `D_003702A4`) is not modelled. It adds nothing by the
  code (the date fields are narrowed only inside the entry, where no list move is possible, and
  the selected entry's drawing widens them again on the first frame outside); no capture tests
  that argument.
- **The cancel's time guard**: `timeFromClock` skips the cancel time when `rtcMirror` or
  `mechaconParam` is missing and pushes a note; no capture reaches it (older captures hold no
  cancel).
- **Text: strings are probed, not derived.** Which caller draws which string, where and in which
  colour is `verify_text2.mjs`'s rule. Other languages, Japanese and another language-table
  pointer are met only by the text captures of `verify_text2.mjs`, not in a whole frame
  (`word 0x07000010`, English, is the only one). The packet's starting room (`headRoom`,
  `0x1FF` less the head) and the room-exhausted branch (a character given up and asked again in a
  fresh packet) are exercised by no whole-frame capture: no frame runs a string out of room.
  Settled by a whole3-style capture with a long string in a small packet room.
- **Which code sets overlay modes 1 and 4** (the callers of the mode setter): no capture reaches
  them by the program; the captures write the mode word.
