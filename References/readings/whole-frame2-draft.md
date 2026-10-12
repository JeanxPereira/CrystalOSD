# The whole clock frame, second round: the menus' code, exact sums (draft)

## CHECKPOINT (2026-10-02, paused at the coordinator's request)

### Done and verified (offline reruns of `verify_frame.mjs --carry`)

- **Item 3, exact single-precision sums.** `References/model/clock_math.mjs` has `add(a, b)` and
  `sub(a, b)`: the double sum, with the part a double loses recovered by a two-sum, cut toward
  zero, denormals flushed (as `f`). Every `f(a ± b)` of the model (169 in `clock_camera`,
  `clock_cubes`, `clock_frame`, `clock_logic`, `clock_rest`, `ee_libm`, `clock_math`) is now
  `add`/`sub`; rewritten mechanically (scratchpad `fadds.mjs`) and checked: no `f(a ± b)` left.
  Two local names that shadowed the new `add` were renamed (`refracted`'s `add` → `extra`,
  `cubes`' `add` record → `added`). All 23 earlier captures pass unchanged (run `regress1`).
- **Item 1, the menus' code** in a new `References/model/clock_menus.mjs`, called by the frame
  where the events were taken (after the cubes and the menu ramp), and `between()` for the
  clock thread's step between frames. Read and modelled, HDD OSD 1.10U and ROM 2.30:
  - the main menu (`func_00232408`, ROM `0x0022E6E8`): its ramp, appearing at
    `weight = 128 - tail` in mode 2 and leaving at weight 128 in mode 3 (`func_002320B0`), the
    gate "no other page in front" (`func_00232020`: page, version, dialog and first-run ramps
    hidden and `D_003701D0` = 0), up/down, cross (Browser or `StartSysConfig`);
  - `StartSysConfig` (ROM `0x0022D040`, which first rebuilds the list, `0x00223710`);
  - System Configuration (`module_clock_231E48`, ROM `0x0022E0B8`): its ramp, the schedule
    (`func_00230FD8`, ROM `0x0022D160`), the selected entry's glow counter (+0x34), the input
    (`func_00231C50`/`func_002316B8`/`func_00231B38`, ROM `0x0022DFD8`/`0x0022DC00`/`0x0022DE80`):
    list moves (`func_00230860`), cross into an entry, square (clock alone), circle (close),
    confirm with the pulse, cancel; ROM: moves only with the ring, the standing cube's pulse,
    the wait on the drive write (`0x001F00A4`/`0x001F00B0`);
  - the entries' callbacks that touch the clock, found by following every call of every
    callback (scratchpad `reach.mjs`): only Clock Adjustment's. Opening (`D_00226FD0`, ROM
    `0x00222760`): field order by date format (`func_00226E68`), scale target 0, sprites hidden,
    seconds item 0, the time record from the items (`func_002358F8`), the date check.
    Confirm/cancel: scale target 1, sprites shown. Every frame inside it (`D_00227AD0`, ROM
    `0x00223258`): the field editor (`func_00227940`, ROM `0x002230A8`) and the time from the items;
  - the date check (`func_00227488`, ROM `0x00222BF0`) with the date library it calls, in a new
    `References/model/clock_date.mjs` (date to seconds `func_002149D8`, back `some_sort_of_lut_calc`,
    zone `func_00214728` with the base city 0x33 = +540 min read from the table, days of a month
    `func_002357D0`);
  - the thread's step (`clock_input_check_handler_p6_p7_tgt` from `0x00225A28`, ROM
    `0x00221060`): main menu falling and changed → screen code 9999 and the leaving flag; the
    flag with the first-run ramp hidden and mode 0 → set-mode(3) (`func_00234C28`, modelled).
- New pieces in `clock_memory.mjs` (both builds): `configPage`, `configRamp`, `configEntries`,
  `mainMenu`, `versionRamp`, `dialogRamp`, `firstRunRamp`, `pagePointers`, `entryActive`,
  `menuLengths`, `configDirty` (HDD), `romWrite` (ROM), `configItems`, `listConstants`,
  `screenCode`, `disc`, `adjustFields`, `mechaconParam`. `ringRecord` shortened to 0x18 (the
  0x40 ran into the month-days table that `func_002357D0` writes).
- `verify_frame.mjs`: new external inputs `disc`, `configDirty`, `configItems`, `romWrite`,
  `mechaconParam`; the leaving flag (scene +4) is now the model's; the thread step runs after the
  external inputs and before the comparison; the menus' pieces are skipped on captures that do
  not hold them; the page's +0xC (its title's width, measured by the title's text drawing) is
  taken from the snapshot; a count of sends with no face.
- New captures (`Watson/Runtime/captures/`), all with **zero events**:

| Capture | What | Frames | Verdict |
|---|---|---|---|
| `hddosd-110U-whole2-enter` | main menu → System Configuration | 75 | FOUND, 89.9% |
| `hddosd-110U-whole2-adjust-open` | Clock Adjustment entered (fade down, scale 0, time from items) | 49 | FOUND, 85.7% |
| `hddosd-110U-whole2-adjust-hour` | inside Clock Adjustment, cursor moved, hour held up | 45 | FOUND, 85.8% |
| `hddosd-110U-whole2-leave` | main menu → Browser: mode 3, orb 0 leaving, thread ends | 130 | FOUND, 89.1% |
| `rom-0230A-whole2-down` | System Configuration, down (standing cubes) | 45 | FOUND, 87.1% |
| `rom-0230A-whole2-to-clock` | System Configuration → clock alone (square) | 49 | FOUND, 94.6% |

- Item 2, partly: the menu transition's blur chain (`func_00236350`, `func_00236058`,
  `func_00236110`) is the cubes' chain, already in the model and met with 1 to 5 trips in
  `*-whole-to-clock` (390 + 390 packets equal on HDD OSD). A send with no face on one side: the
  rod function always opens and sends the packet (`module_clock_237A28`: `func_002333E0`, the
  face loop, `func_00238DB0`, no count test), as the model does; a search of 64 × 64 rod and
  seconds angles with split values 0.004, 0.996 and the captured one found no orientation with
  an empty side (scratchpad `emptyside.mjs`), so it cannot be produced by writing angles. The
  only empty sends met are orb trails with an empty ring (70 in `hddosd-110U-whole-boot`, equal).

### Closed after the pause

- `rom-0230A-whole2-enter` (retaken, 75 frames, hold cross after one press of down): FOUND, zero events,
  every piece equal in every frame under `--carry`. Two ROM 2.30 causes fixed:
  1. `menuList` [`0x0028AFF0`] was the page's +0xC again (it overlaps `configPage`): removed from
     `LAYOUT` and `EVENTS`; the count and the selected entry are read from `configPage`
     (`clock_cubes.mjs`, `clock_rest.mjs`).
  2. The list rebuild (`0x00223710`) calls `0x002235D8(index of the last entry)`, which writes that
     entry's value count (+4) and value table (+0x10) by the language (`0x00205830`: the word cached
     at `0x0027B388` once the flag at `0x0027B390` is set; both read 1 in the dump). The jump table at
     `0x002C4920` is in language order: 0 (2, `0x0028A800`), 1 (7, `0x0028A860`), 2 (7, `0x0028A9B0`),
     3 (2, `0x0028AC20`), 4 (2, `0x0028AB00`), 5 (2, `0x0028AB60`), 6 (2, `0x0028ABC0`); 7 and more
     write nothing. It then tail-jumps to `0x002294C0`, which fills the record at `0x00295900` (count,
     table, selected entry by `0x00229468`) the same way; no piece of the model lies there, and
     nothing the clock draws reads it. New piece `language` in `clock_memory.mjs`; the model writes
     the table from it (`valueTable` in `clock_menus.mjs`) and notes when the language was never read
     from the drive (flag 0 or -1: that read is not modelled).
  Open: only language 1 is met (the capture's); the other six rows follow the table's words in the
  dump, no capture reaches them. Captures taken before the piece (`down`, `to-clock`) do not hold it;
  they never rebuild the list (they start with System Configuration open).
- `hddosd-110U-whole2-back` (99 frames) and `-up` (35 frames): FOUND, zero events, every piece equal.

### Closed after the second pause (captures not taken, now taken)

All under `--carry`, zero events, every piece equal in every frame, verdict FOUND, in the suite
(`run_all.manifest.json`; `run_all.mjs --changed`: 111 of 114 pass): ROM `back`, `adjust-open`, `adjust-cancel`,
`adjust-confirm`, `adjust-hour`, `leave`, `mode1`, `mode4`, `adjust-cancel-summer`; HDD `down`,
`adjust-cancel`, `adjust-confirm`, `mode1`, `mode4`, `to-clock`, `adjust-cancel-summer`; ROM PAL
`rom-0230E-pal-whole2-enter`. Modes 1 and 4 are reached by a memory write (`0x00370AB4`/`0x00370AB8`
on HDD OSD, `0x002C8F6C`/`0x002C8F70` on ROM 2.30, written after the code is loaded); the captures
show mode 1 counting its level up and mode 4 standing. `adjust-cancel-summer` writes the settings word
(HDD `0x00371818`, ROM `0x002C9680`) to `0x20021C10` (summer time on) after Clock Adjustment is open.
Three causes found and fixed in the model:

1. **The list's drawing runs the selected entry's string callback** (`func_002311E8`, called by
   `browser_str_related`, ROM `0x0022D728`): with the page ramp not hidden and the menu ramp not full,
   when the page is not inside an entry (or the drawn entry is not the selected one) it calls the entry's
   +0x18 callback; Clock Adjustment's (`D_00227420`, ROM `0x00222B88`) first calls `func_00226E68`
   (ROM `0x002225F8`), which puts the three date fields back to the date format's order and the full
   ranges 2000..2099. So after confirm or cancel the first frame's drawing widens the year range the date
   check had narrowed to 1999 (zone +270 min). Model: `stringCallback` in `clock_menus.mjs`. The entry that is
   leaving (`D_003702A0`) is drawn the same way and adds nothing: the fields are narrowed only inside
   the entry, where no move is possible, and the selected entry's drawing restores them on the first frame outside.
2. **Cancel reads the console's clock** (`D_00227BE8`, ROM `0x00223368`, first `func_00235848`, ROM
   `0x00231CF0`): the time record from the six words the mechacon read left at HDD `0x001F0D1C` / ROM
   `0x001F0CB8` (`func_002358F8`), then `module_clock_set_anim_offset` (ROM `0x00231F88`) moves it from the
   base zone (city 0x33, 540 min) with no summer time to the configured offset and summer time:
   `secondsOf + ((offset - 540) + 60 * summer) * 60`, back to a date. The logic of the same frame then
   eases the hands toward the live time (the model had left the hands where the items put them). New
   piece `rtcMirror`, probed in a probe of its own after the others (`LATE` in `verify_frame.mjs`, so the
   ranges of the earlier probes, which the captures' headers name, stay as they were), and an external
   input. Confirm keeps the time from the items (it writes them to the console: nothing the clock draws).
   Taken from the code but not from a capture: the time record's year, month and day (+0x10..+0x18) and
   the zone words (+0x1C, +0x20), which no probe holds and nothing drawn reads.
3. **The vignette's record is written every frame of mode 0** (`func_00234D60`, ROM `0x00231368`),
   whatever the ramp does; only the drawing waits for the ramp. With the PAL ramp (length 0x42) the last
   frames of a falling ramp leave alpha 0, where the model had left 1.

Mutation: `mutate.mjs verify_frame.mjs` leaves four mutants alive, all on the coverage counters (lines
that add to `coverage.others`), which no verdict reads; the verifier computes nothing else. The model
pieces were mutated by hand instead and every mutant is killed: string callback never taken, summer
term removed (the summer captures fail, the plain cancel still passes), base zone 541, zone offset
ignored, time not taken from the clock on cancel, vignette record gated on the ramp again.

Open: the PAL ROM capture holds the enter only (not the other transitions); the summer term is met on
both builds by a write, not by a console setting; `verify_text.mjs` (`rom-0230A-text2-*`) fails in the
suite and does not import any file of this lane.

### Configuration item 0 (the aspect ratio), closed (2026-10-03)

**What resets a written item.** The frame function ends with `func_00235518` (HDD OSD 1.10U
`0x00235518`, called at `0x00225F0C`; ROM 2.30 `0x00231A40`, a jump into the loader): it saves a dirty
configuration and, when nothing is dirty, being written or waiting (`is_config_dirty`, `0x002354E8`: the three
words at `0x00370304`..`0x0037030C`), calls `config_load_clock_osd` (`0x00234F88`, ROM `0x00231590`), which, with the gate
`D_00370300` (ROM `0x002C8920`) at 1, rewrites item 0 (`0x00409130` / `0x00375100`) from
`config_get_aspect_ratio` (`0x00203D30`, ROM `0x002041C8`: bits 1..2 of the settings word `0x00371818` / `0x002C9680`,
3 read as 0). ROM 2.30 has no dirty test in that path. A write to item 0 is therefore gone at the end of the frame
(`hddosd-110U-whole2-aspect-reset`: item 0 written 1, 0 from the first whole frame on). Bit 3 of the ROM's word is the video
output (`0x00204230`, item 2), not the ratio (`rom-0230A-whole2-aspect0-bit3`: bit 3 set, item 0 stays 0).

**How a real setting reaches it.** Entry 1 of System Configuration (id 0x6B HDD / 0x6F ROM, three values, item 0, value table
`0x002B2810` / `0x0028ACE0`). Cross in (`+0x14`) sets the gate to 0 (the first entry: -1), so the loader leaves the items
alone; the generic editor (`+0x1C`, `D_00228660`) moves the entry's value index with left and right and writes the table's value into
the item; confirm (`+0x20`, `clock_config_change_cb_aspect_ratio`, `0x00227D30`, ROM `0x00223400`) compares the item with
`config_get_aspect_ratio` and marks the configuration dirty when they differ (HDD `config_mark_dirty`, `0x002352C0`); the page
waits (level 2) while it is dirty and sets the gate to 1; `config_save_clock_osd` (`0x002352D0`) writes the word through
`config_set_aspect_ratio` (`0x00203D50`); the loader then reads the same value back. Cancel (`+0x24`, a null function) sets
the gate to 1 and calls the loader at once, so the item goes back to what the word holds. The list's drawing runs the
selected entry's string callback (`+0x18`, `clock_config_get_item_str`, `0x00228470`, ROM `0x002239D8`), which first
puts the value index where the item sits in the table (`func_002283C0`).

**What item 0 does to a frame** (`func_002262C8`, `func_00226300`, `func_00226958`; ROM `0x002219A0`, `0x002219D8`, `0x002220D8`):
0 (4:3): the two letterbox bars, date and time at row 14 (0xE), hints at 200 (0xC8); 1 (full screen): no bars, the same
rows; 2 (16:9): the bars, date and time at 32 (0x20), hints at 182 (0xB6). The item is never 3: the word's 3 reads as 0
(`aspect3`). PAL scales the rows by 0.5405 / 0.47 in double precision, cut to an integer.

**Model.** `clock_menus.mjs`: `aspectOf`, `reloadItem0`, `endOfFrame` (called last by `frame`), the gate
written by the list (cross in, confirm, cancel; the ROM wait on the drive keeps the gate), the aspect entry's confirm
(`CALLBACKS`) and its value index (`valueIndex`, the table's values 0, 1, 2 read from the HDD OSD image; ROM 2.30's table is
filled at run time and was not read, the ROM capture shows the same indices). `clock_rest.mjs`: `dateRow`, `hintRow`. `clock_memory.mjs`:
the piece `configGate`. `verify_frame.mjs`: the gate in a probe of its own after the rtc one (the captures taken before it
keep their probes); with the gate in the capture, item 0 is no longer an external input: the model carries it and the
gate. New verifier `References/scripts/model_aspect.mjs` (`verify_frame --carry`, and every row the program gave
`Font_SetLocate` for the date and the time, and the answer of the hints' row function, against `dateRow` / `hintRow`).

| Capture | What | Frames | Verdict |
|---|---|---|---|
| `hddosd-110U-whole2-aspect1` | word ratio 1: no bars | 49 | FOUND, zero events |
| `hddosd-110U-whole2-aspect2` | word ratio 2: bars, rows 0x20 and 0xB6 | 49 | FOUND |
| `hddosd-110U-whole2-aspect3` | word ratio 3 read as 0 | 49 | FOUND |
| `hddosd-110U-pal-whole2-aspect2` | PAL, ratio 2: rows scaled | 49 | FOUND |
| `hddosd-110U-whole2-aspect-set` | down, cross, right, then confirm: gate 0 to 1, word written 0x07000010 to 0x07000012 | 49 | FOUND |
| `hddosd-110U-whole2-aspect-cancel` | the same, then cancel: item 1 back to 0, gate 0 to 1 | 49 | FOUND |
| `rom-0230A-whole2-aspect1`, `-aspect2` | word ratio 1, 2 | 49 | FOUND |
| `rom-0230A-whole2-aspect0-bit3` | word bit 3 only: item 0 stays 0 | 49 | FOUND |
| `rom-0230A-whole2-aspect2-gate` | gate 0 and item 0 written 2 (a stimulus): the item stays | 49 | FOUND |
| `rom-0230A-whole2-aspect-cancel` | the entry's cancel on ROM 2.30 | 49 | FOUND |

Mutation (by hand, `asp_mut.mjs` in the scratchpad: 18 mutants of the model's pieces): 17 killed (shift of the ratio, ratio 3
unclamped, gate ignored, no reload, dirty skip, each row, the bars' condition three ways, the callback's dirty mark, the cancel's
gate and reload, the value index, the confirm's gate); one survives: the gate written by cross-in (`-1` / `0`), because
every capture presses cross before the trace starts. `mutate.mjs model_aspect.mjs`: 2 of 2 killed.

Open: ROM 2.30's confirm of a changed value (the drive write the aspect callback starts, `0x00231888`) and the generic editor
(`D_00228660`) and enter (`0x00228448`) callbacks are not modelled and not in a capture (the captures press right and cross in
before the trace starts); the gate's writers outside the list (`func_00234F50/58/68/78` from the main menu, the first-run
pages and Clock Adjustment's pages: ROM `0x00225070`..`0x00229A90`, `0x0022D2C0`) are not modelled; they are
not met in the captures (the gate is carried and compared in every frame: no difference).

### Text in the frame model (HDD OSD 1.10U), closed (2026-10-03)

`clock_frame.mjs` now imports `clock_text.mjs` (`putString`) and produces the text packets of the three parts that draw
text (the pages function's menu text, `func_00226300` date and time, `func_002269E0` button hint) when the snapshot
carries `text` ({ state, strings: { pages, text, hint } }); without it, and on ROM 2.30, they stay gaps.
`verify_frame.mjs` builds `text` from the capture's own probes (the capture is taken with `--verifiers verify_frame.mjs,verify_text2.mjs`;
`verify_frame.mjs` reads both probe sets):

- **Strings are produced from probed inputs, not derived.** The argument pointer of each `Font_PutsPackets` /
  `calcDrawArea` call is probed; when it is an entry of the language table (`langtblptrs`, language word probed) or a fixed ELF string,
  the text is the ELF image's at that pointer (and the probe's bytes are only compared with it); the date and time are RAM buffers
  the callers fill from the console clock: their text is the probe's bytes. The caller's font state (place, colour, size: 0x160 bytes)
  is the probe's. Which caller draws which string, where and with what colour, is `verify_text2.mjs`'s rule, not this model's.
- **Carried by the model:** the library's context (cache list, cells, colour table, packet room) is read once at the capture's first
  character and carried through every character and string and across frames; at every frame's first character the carried list and
  block are compared with the library's (`carried font cache equal ... at N of N frame starts`).
- **Placement:** the packets that are not text inside these parts (button panels and icons, colour states) are not produced; a string's
  probe position tells the comparison where its packets start (`gap` with `to`), the rest of each part is counted as "not text".

| Capture (`--carry`) | What | Frames | Produced | Text packets equal |
|---|---|---|---|---|
| `hddosd-110U-whole3-clock` | clock alone | 25 | 14850 of 15025 (98.8%, was 93.5%) | 800 of 800 |
| `hddosd-110U-whole3-menu` | main menu | 24 | 8448 of 8736 (96.7%, was 77.5%) | 1680 of 1680 |
| `hddosd-110U-whole3-config` | System Configuration | 25 | 25025 of 25725 (97.3%, was 80.9%) | 4225 of 4225 |
| `hddosd-110U-whole3-enter` | main menu to System Configuration | 75 | 59427 of 59879 (99.2%) | 5613 of 5613 |
| `hddosd-110U-whole3-adjust-hour` | Clock Adjustment, hour held up | 45 | 43110 of 43650 (98.8%) | 5670 of 5670 |
| `hddosd-110U-whole3-boot` | boot, empty glyph cache: 19 picture uploads | 85 | 24544 of 25123 (97.7%) | 3481 of 3481 |
| `hddosd-110U-pal-whole3-config` / `-menu` | PAL | 24 / 25 | 97.3% / 96.7% | 4056 of 4056 / 1750 of 1750 |

Still not produced, per frame: the non-text packets of the hint part (clock alone 4, main menu 7, System Configuration 23), of the
pages part (2 in the main menu and System Configuration) and of the date and time part (1); their content was not read. ROM 2.30:
no text (the model has no ROM font code; `verify_text2.mjs` holds it): coverage of the ROM captures is as before (87 to 95%).
HDD OSD captures taken before this one carry no text probes and stay gaps (`whole2-*`: 89.9% on `enter`).

Mutation: `mutate.mjs verify_frame.mjs --capture hddosd-110U-whole3-boot`: 2 of 8 killed, 6 survive: five on the coverage counters (they
print, no verdict reads them) and the `-1` sentinel of the table id (only `< 0` is tested); the verdict now needs at least one string
resolved through the ELF image. The new path was mutated by hand (thirteen mutants over `whole3-config`, `-enter`, `-boot`): measuring flag dropped, carried
state not kept (string, frame, across frames), skip of non-text packets removed or shifted, language table shifted (the other
language's pointer is flagged), part boundary moved, a byte of the expected packet flipped (opening/glyph and both sides of a
picture packet): all killed by some capture. Survivor, open: the packet's starting room (`headRoom`, 0x1FF less the head): no frame of these
captures runs a string out of room, so a character given up for room and asked again in a fresh packet is not exercised in a frame.

### Next, in order

1. (done, see above.)
4. (done: configuration item 0, above.)
5. (done: text in the frame model, above.)
6. The report.

### Limits met

- With five emulators shared by four workers, sessions waited up to 30 minutes for a slot; one
  queued session gave up (`with_emulator: gave up waiting for a slot`).
- `with_emulator.mjs` has a race: a slot directory read between its creation and its `owner`
  file throws ENOENT (`hddosd-110U-whole2-back` failed once on it). Not mine to edit.
- Interpreter traces of System Configuration take 15–20 minutes for 45 frames.
- The snapshot needs two probes of eight ranges on HDD OSD, three on ROM 2.30 (limit five).
