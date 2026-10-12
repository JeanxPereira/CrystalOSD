# Lane model: results and refutations (workflow wf_207e7ea7-a0f)

Refuter verdicts outrank worker claims. A number a refuter contradicts is wrong; an irreproducible claim is not a fact.

## model 1

done: true

### Claims
- The two ROM 2.30 causes were already fixed in the tree at the checkpoint: menuList removed from LAYOUT and EVENTS, with the count and selected entry read from configPage; configEntries +0xE4 value count by language (0x002235D8 and 0x00205830, then 0x002294C0) written from the new `language` piece by `valueTable` in clock_menus.mjs. I did not rewrite them.
- I re-ran verify_frame.mjs --carry on the three target captures and each prints 'verdict: FOUND ... every packet the model produces equal'. rom-0230A-whole2-enter: 75 frames, 24178 of 24178 vertex packets and 31602 of 31602 state packets equal, every piece equal in every frame, no events. hddosd-110U-whole2-back: 99 frames. hddosd-110U-whole2-up: 35 frames.
- The first regression run failed 6 of 33 verify_frame entries on older ROM captures (whole-enter, whole-long, whole-config, whole-to-clock, rom-0230E-pal-clock-b, rom-0230E-pal-whole-config). Cause: those captures snapshot 0x28aff0 for only 0x14 bytes, and the model now reads configPage with 0x38 ('0x28aff0:0x38 is not in the snapshot' in clock_cubes.mjs:63 standingStep).
- Fix in References/model/clock_memory.mjs: new Memory.word(name, offset) reads the word straight from the piece's address, and int() and float() use it. A shorter snapshot of a piece now still serves the fields it holds.
- After the fix, run_all.mjs --filter verify_frame passes 33 of 33, covering every earlier whole and whole2 capture on both builds and PAL.
- run_all.mjs --changed passes 471 of 474. The 3 failures are verify_text.mjs on rom-0230A-text2-clock, -config and -open. They report '0 strings drawn' and do not import any model file. Those three trace files were last written at 22:47, about 50 minutes before the run, which looks like the text lane retaking them. I did not edit verify_text.mjs or those captures.

### Verdict lines
- rom-0230A-whole2-enter: verdict: FOUND 75 frames: every packet the model produces equal
- hddosd-110U-whole2-back: verdict: FOUND 99 frames: every packet the model produces equal
- hddosd-110U-whole2-up: verdict: FOUND 35 frames: every packet the model produces equal
- run_all --filter verify_frame: run_all: 33 of 33 pass
- run_all --changed: run_all: 471 of 474 pass (3 verify_text rom-0230A-text2-* fail, unrelated to the model)

### Files
- D:\CodingProjects\CrystalClockVK\References\model\clock_memory.mjs

### Captures


### Open
- Three verify_text.mjs entries fail on rom-0230A-text2-clock, -config and -open ('0 strings drawn', last line 'verdict: PARTIAL'). The verifier imports only lib, builds and extract_font, so my edit cannot reach it. I did not confirm the cause; the capture timestamps point to another lane retaking them. That lane needs to rerun or re-register them.
- I did not run mutate.mjs. I changed no verifier and no model rule, only how a snapshot piece is read.
- Only language 1 is reached by any capture. The other six language rows of the value table follow the words in the dump and no capture exercises them, so they stay open, as the checkpoint says.
- The remaining captures listed under 'Next' in the checkpoint (ROM back, adjust-*, leave, mode1/mode4, HDD down/to-clock, ROM PAL enter) and the aspect-ratio item were not part of this task and were not taken.

## model 1 refute

**confirmed**: Every re-run output matched the claims: the three verify_frame --carry runs print FOUND with the stated packet counts, and the model fix is in clock_memory.mjs. The only caveats are that I did not read the ROM 2.30 instructions at 0x002235D8, 0x00205830 and 0x002294C0 (the asm tree is HDD OSD only), and that the --changed total of 471 of 474 could not be reproduced because the 3 failing verify_text entries are now the only ones left to re-run.

**Claims**: a set of claims about the ROM 2.30 menu fixes, the verify_frame --carry runs, and the run_all results.

**Commands run**
- `CLOCK_BUILD=<rom|hdd> node References/scripts/verify_frame.mjs D:/CodingProjects/Watson/Runtime/captures/<cap>.trace.jsonl --carry` on the three target captures. The path goes first. My first attempt put `--carry` first and failed with ENOENT, which was my argument order, not a verifier fault.
- `node References/scripts/run_all.mjs --filter verify_frame`
- `node References/scripts/run_all.mjs --changed`
- `CLOCK_BUILD=rom node References/scripts/verify_text.mjs .../rom-0230A-text2-clock.trace.jsonl`
- Greps and reads of `References/model/clock_memory.mjs` and `clock_menus.mjs`.

**Output (verbatim, trimmed)**
- rom-0230A-whole2-enter: `verdict: FOUND 75 frames: every packet the model produces equal`
  - Frames compared: 75 (`state carried from the first frame (74 frames)`).
  - `vertex packets 24178 of 24178 equal; state packets 31602 of 31602 equal; sends with no face, equal: 0`
  - `state the model carried, against each frame's snapshot: every piece equal in every frame`
  - No events line is printed.
  - Coverage is `55780 of the 59938 packets (93.1%)`. The unmodelled packets are menu pages and text, date and time, the button hint, and sends after the frame function returned.
- hddosd-110U-whole2-back: `verdict: FOUND 99 frames: every packet the model produces equal` (coverage 88.5%).
- hddosd-110U-whole2-up: `verdict: FOUND 35 frames: every packet the model produces equal` (coverage 82.0%).
- `run_all --filter verify_frame`: `run_all: 33 of 33 pass, 10 at once, 159 s`. This includes rom-0230A-whole2-to-clock, rom-0230E-pal-clock-b and rom-0230E-pal-whole-config.
- `run_all --changed`, run now: it re-ran only the 3 verify_text entries, `run_all: 0 of 3 pass`.
  - Each is `FAIL verify_text.mjs rom-0230A-text2-{clock,config,open} ... verdict: PARTIAL see the lines marked !`.
- `verify_text` on rom-0230A-text2-clock: `strings drawn: 0   characters: 0`, then `verdict: PARTIAL`.
- The text2 trace files were last written at 22:47 on 2026-10-02. Today's date command printed 23:42, so they are about 55 minutes old.
- `verify_text.mjs` imports `trace.mjs`, `gif.js`, `builds.mjs` and `extract_font.mjs`. It has no `References/model` import, so it does not use the model.

**Instructions and code read**
- `clock_memory.mjs` lines 139-146:
  - `word(name, offset)` takes the address as `addressOf(build, name) + offset` and returns `view(address + offset, 4)`, a 4-byte view.
  - `int()` and `float()` both call `word`.
  - `configPage` is `[0x002b2de8, 0x0028aff0, 0x38]`, and `language` is `[null, 0x0027b388, 0x10]`.
- `clock_menus.mjs`:
  - `valueTable` (lines 355-370) writes the count at +4 and the table at +0x10 from the new `language` piece. Its comment cites 0x002235D8, 0x00205830 and 0x002294C0.
  - `rebuildList` (lines 377-390) reads the count and selected entry from `configPage`.
  - Grep finds no `menuList` anywhere in `References/model` or `References/scripts`.
- I did not read the ROM 2.30 functions at 0x002235D8, 0x00205830 and 0x002294C0. `CrystalOSD\asm` holds HDD OSD code only. The cited ROM instructions are therefore unchecked, but the verifiers pass on the ROM captures.
- I did not compare `valueTable` against any ROM disassembly, so its constants (`VALUE_TABLES`) and polarity are unchecked beyond the verifier results.

**Verdict**: confirmed. Every re-run output matched the claims, including the 33 of 33 verify_frame pass and the 3 unrelated verify_text failures. The caveats are the unread ROM instructions and the 471 of 474 total, which I could not reproduce.

## model 2

done: true

### Claims
- All 16 listed captures were taken and pass with --carry, zero events, every carried piece equal in every frame. ROM 2.30: back, adjust-open, adjust-cancel, adjust-confirm, adjust-hour, leave, mode1, mode4. HDD: down, adjust-cancel, adjust-confirm, mode1, mode4, to-clock. ROM PAL: rom-0230E-pal-whole2-enter.
- Modes 1 and 4 were reached by memory write, not by the program. HDD writes 0x00370AB4/0x00370AB8, ROM writes 0x002C8F6C/0x002C8F70. The mode word in the traces shows mode 1 with its level counting up and mode 4 standing.
- I added two captures not on the list, adjust-cancel-summer on both builds. They write the settings word to 0x20021C10 (HDD 0x00371818, ROM 0x002C9680) after Clock Adjustment is open. They reach the summer-time term of the cancel path, which the plain cancel capture does not.
- Cause 1 (model fix): the list's drawing (func_002311E8, called from browser_str_related) calls the selected entry's +0x18 string callback when the page is not inside an entry. Clock Adjustment's callback (HDD D_00227420, ROM 0x00222B88) runs func_00226E68 (ROM 0x002225F8), which resets the date fields to the full ranges 2000..2099. Before the fix the model carried 1999 where the snapshot had 2000 after confirm. Fix is stringCallback in clock_menus.mjs. The capture that showed it is adjust-confirm on both builds.
- Cause 2 (model fix): cancel (HDD D_00227BE8, ROM 0x00223368) first runs func_00235848 (ROM 0x00231CF0). It rewrites the time record from the console clock words at HDD 0x001F0D1C / ROM 0x001F0CB8, then moves it by ((offset - 540) + 60 * summer) * 60 seconds. The hands then ease toward live time in the same frame. Before the fix the hand state diverged from frame 2 of adjust-cancel (ROM). Fix is timeFromClock in clock_menus.mjs, a new rtcMirror piece in clock_memory.mjs, and BASE_ZONE exported from clock_date.mjs.
- The rtcMirror piece is probed in a separate late probe in verify_frame.mjs. The earlier probes keep their ranges, so the existing captures' probe headers still match. It is also an external input.
- Cause 3 (model fix): func_00234D60 (ROM 0x00231368) writes the vignette record every frame of mode 0, whatever the ramp does, and only the drawing waits for the ramp. The PAL ramp (length 0x42) left alpha 0 where the model kept 1, in 7 frames. Fix is in overlay() in clock_rest.mjs. The PAL enter capture now passes.
- Mutation: mutate.mjs verify_frame.mjs leaves 4 mutants alive, all on coverage-counter lines (coverage.others) that no verdict reads. The model changes were mutated by hand instead: string callback never taken, summer term removed, base zone 541, zone offset ignored, time not taken on cancel, vignette record gated on the ramp again. Every mutant gave PARTIAL, except the plain non-summer cancel under the summer-term mutant, which passes as expected because it never uses the term.
- run_all.mjs --discover --only verify_frame.mjs registered the new captures: 24 whole2 captures, with and without --carry. run_all.mjs --changed passes 111 of 114.

### Verdict lines
- verdict: FOUND 49 frames: every packet the model produces equal   (rom-0230A-whole2-adjust-cancel, --carry)
- verdict: FOUND 49 frames: every packet the model produces equal   (hddosd-110U-whole2-adjust-cancel-summer, --carry)
- verdict: FOUND 75 frames: every packet the model produces equal   (rom-0230E-pal-whole2-enter, --carry)
- run_all: 111 of 114 pass, 10 at once, 618 s   (--changed; the 3 FAIL lines are verify_text.mjs rom-0230A-text2-clock, -config and -open)
- discovery: 588 entries in the manifest, 51 passing of 160 runs, in 4.6 min

### Files
- D:\CodingProjects\CrystalClockVK\References\model\clock_menus.mjs
- D:\CodingProjects\CrystalClockVK\References\model\clock_memory.mjs
- D:\CodingProjects\CrystalClockVK\References\model\clock_date.mjs
- D:\CodingProjects\CrystalClockVK\References\model\clock_rest.mjs
- D:\CodingProjects\CrystalClockVK\References\scripts\verify_frame.mjs
- D:\CodingProjects\CrystalClockVK\References\scripts\run_all.manifest.json (rewritten by run_all.mjs --discover --only verify_frame.mjs, not edited by hand)
- D:\CodingProjects\CrystalClockVK\References\readings\whole-frame2-draft.md

### Captures
- hddosd-110U-whole2-down
- hddosd-110U-whole2-adjust-cancel
- hddosd-110U-whole2-adjust-confirm
- hddosd-110U-whole2-mode1
- hddosd-110U-whole2-mode4
- hddosd-110U-whole2-to-clock
- hddosd-110U-whole2-adjust-cancel-summer
- rom-0230A-whole2-back
- rom-0230A-whole2-adjust-open
- rom-0230A-whole2-adjust-cancel
- rom-0230A-whole2-adjust-confirm
- rom-0230A-whole2-adjust-hour
- rom-0230A-whole2-leave
- rom-0230A-whole2-mode1
- rom-0230A-whole2-mode4
- rom-0230A-whole2-adjust-cancel-summer
- rom-0230E-pal-whole2-enter

### Open
- verify_text.mjs fails on rom-0230A-text2-clock, -config and -open in the suite (221 s each, verdict PARTIAL). It does not import any file of this lane. I left it alone: the text lane's work, not mine.
- The adjust-cancel captures (both builds) were retaken after the rtcMirror probe was added. The first ROM retake failed on an emulator timeout and was redone.
- The cancel path writes the time record's year, month, day and zone words (+0x10..+0x1C, +0x20), and ROM also stores seconds-of-clock at gp-0x6F78. I read these from the code but no probe holds them, so they are unchecked. Nothing the clock draws reads them.
- Leaving-entry drawing (D_003702A0/D_003702A4): not modelled. It adds nothing, because the date fields are only narrowed inside the entry, where no list move is possible, and the selected entry's draw widens them again on the first frame outside. This is argued from the code, not captured.
- The timeFromClock guard that skips the cancel time when rtcMirror or mechaconParam is missing pushes a note and is not reached by any capture. It matters only for older captures, which hold no cancel.
- Summer time is reached by a memory write of the settings word on both builds, not by a real console setting. The PAL ROM capture holds only the enter transition.
- Only language 1 is met on ROM (carried from the earlier checkpoint). The checkpoint's items 4 (aspect-ratio configuration item 0) and 5 (text) and the final report are untouched by this task.

## model 2 refute

**confirmed**: All 17 re-run captures (the 16 listed plus HDD and ROM adjust-cancel-summer) end in "verdict: FOUND ... every packet the model produces equal" with --carry. The model code matches the cited assembly, and mutate.mjs leaves 4 mutants alive, as claimed. I did not re-run run_all.mjs, the hand mutants, the mode-write events or the summer-bit writes.

**Claim**: the 16 listed captures pass with --carry and zero events; the Cause 1, 2 and 3 model fixes; the two summer captures; the mutation result; and the run_all and discovery counts.

**Commands run**:
- `CLOCK_BUILD=rom|hdd node verify_frame.mjs <capture>.trace.jsonl --carry` on all 16 listed captures plus the HDD and ROM adjust-cancel-summer captures.
- The ROM PAL enter capture was run with `CLOCK_VIDEO=pal`.
- `node mutate.mjs verify_frame.mjs --limit 20`.
- Read `timeFromClock`, `stringCallback`, `BASE_ZONE` and `zoned` in `References/model/clock_menus.mjs` and `clock_date.mjs`.
- Read `func_00235848`, `module_clock_set_anim_offset`, `D_00227420` and `D_00227BE8` in `D:\CodingProjects\CrystalOSD\asm\` and the head of `func_00226E68`.
- Grepped the scripts for the mode addresses.

**Output** (last lines, trimmed; the "carried pieces" line is from the HDD adjust-confirm run):
- ROM: back FOUND 99 frames; adjust-open 49; adjust-cancel 49; adjust-confirm 49; adjust-hour 45; leave 130; mode1 35; mode4 35; adjust-cancel-summer 49.
- HDD: down 45; adjust-cancel 49; adjust-confirm 49; mode1 35; mode4 34; to-clock 79; adjust-cancel-summer 49.
- ROM PAL: `rom-0230E-pal-whole2-enter` verdict: FOUND 75 frames: every packet the model produces equal.
- Every one of those runs ended with `verdict: FOUND N frames: every packet the model produces equal`.
- HDD adjust-confirm: "state the model carried, against each frame's snapshot: every piece equal in every frame".
- mutate.mjs: "killed 0 of 4 ... PARTIAL 4 mutants survive". The survivors are lines 252, 259, 268 and 271, all `add(result.coverage.others, ...)`, matching the claim.

**Instructions read**:
- `func_00235848` calls `config_check_timezone_city(0x33)` and `get_timezone_info_struct`, stores the result at `D_00409230+0x1C` and zeroes `+0x20`.
- It loads the six words from 0x1F0D1C..0x1F0D30 and calls `func_002358F8`.
- It then calls `module_clock_set_anim_offset(offset, summer)`.
- That function computes `((offset - old_zone) + (summer - old_summer) * 60) * 60`, with the multiplier 0x3C and no summer-adjusted base. This matches `timeFromClock` with `BASE_ZONE = 540`.
- `D_00227BE8` calls `func_00235848` first.
- `D_00227420` calls `func_00226E68`, as the claim says.
- The mode word and level addresses in the verifiers match the claim: HDD 0x370AB4/0x370AB8 and ROM 0x2C8F6C/0x2C8F70.

**Not verified**:
- I did not confirm the 2000..2099 constants in `D_003655B0`.
- I did not confirm that the mode words were written by memory write or that the settings word was written at 0x20021C10 (the trace grep timed out).
- I did not re-run `run_all.mjs` (111 of 114 passes, discovery counts) or the six hand mutants.

**Verdict**: confirmed on what I checked, which is the 17 verifier runs, the cited assembly and the mutate.mjs survivors.

## model 3

done: true

### Claims
- Reset cause: the frame function ends with func_00235518 (HDD 0x00235518, called at 0x00225F0C; ROM 0x00231A40, a jump into the loader). When the configuration is not dirty (HDD) and the gate D_00370300 (ROM 0x002C8920) is 1, config_load_clock_osd (HDD 0x00234F88, ROM 0x00231590) rewrites item 0 from config_get_aspect_ratio (HDD 0x00203D30, ROM 0x002041C8: bits 1..2 of the settings word 0x00371818 / 0x002C9680, 3 read as 0). Observed in hddosd-110U-whole2-aspect-reset: item 0 written 1 reads 0 from the first whole frame. The ROM address 0x002041C8 corrects the checkpoint's reading: ROM 0x00204230 is the video output (bit 3), shown by rom-0230A-whole2-aspect0-bit3 where bit 3 set leaves item 0 at 0.
- Real setting path, read from code and exercised on HDD OSD: entry 1 of System Configuration. Cross in sets the gate to 0 (-1 for entry 0). The generic editor moves the value index. Confirm (+0x20, HDD 0x00227D30, ROM 0x00223400) marks the configuration dirty when item 0 differs from the word. The save writes the word through config_set_aspect_ratio and the gate returns to 1. Cancel sets the gate to 1 and reloads at once. Capture hddosd-110U-whole2-aspect-set shows gate 0 to 1 and the word 0x07000010 to 0x07000012. hddosd-110U-whole2-aspect-cancel and rom-0230A-whole2-aspect-cancel show item 1 returning to 0.
- Item 0 in a frame: 1 draws no bars (bars are sent for 0 and 2), 2 draws the bars with date/time at row 0x20 and hints at 0xB6, 0 and 1 use rows 0xE and 0xC8. This follows func_002262C8, func_00226300 and func_00226958 (ROM 0x002219A0, 0x002219D8, 0x002220D8). Verified by model_aspect.mjs: 48/48 date, 48/48 time and 48/48 hint rows equal on every word capture, bars 0 packets for item 1 and 196 for item 2. The PAL scaled rows are verified on hddosd-110U-pal-whole2-aspect2.
- Captures taken (all under --carry): HDD aspect1, aspect2, aspect3 (ratio 3 reads as 0), aspect-set, aspect-cancel, pal-aspect2; ROM aspect1, aspect2, aspect0-bit3 (control), aspect2-gate (gate 0 plus item 0 written 2, a stimulus), aspect-cancel. Each is FOUND under model_aspect.mjs and verify_frame.mjs --carry: zero events, no state piece different, every packet the model produces equal. Verifiers: model_aspect.mjs and verify_frame.mjs. Build is the capture's build (HDD OSD 1.10U or ROM 2.30, PAL only on HDD).
- Mutation: mutate.mjs model_aspect.mjs killed 2 of 2. By hand (scratchpad asp_mut.mjs) the model's pieces were mutated 18 ways and 17 were killed: ratio shift, ratio 3 unclamped, gate ignored, no reload, dirty skip, each of the four rows, three variants of the bars condition, the callback's dirty mark, the cancel's gate, the cancel's reload, the value index, and the confirm's gate. Run on all captures of the task.
- Regression: run_all.mjs --changed is 119 of 119 pass. The manifest gained 22 entries: verify_frame --carry and model_aspect for 11 captures.

### Verdict lines
- verdict: FOUND 96 date and time rows, 48 hint rows, item 0 1 in every frame: true (hddosd-110U-whole2-aspect1)
- verdict: FOUND 96 date and time rows, 48 hint rows, item 0 2 in every frame: true (hddosd-110U-whole2-aspect2)
- verdict: FOUND 96 date and time rows, 48 hint rows, item 0 0 in every frame: true (hddosd-110U-whole2-aspect3)
- verdict: FOUND 96 date and time rows, 48 hint rows, item 0 2 in every frame: true (hddosd-110U-pal-whole2-aspect2)
- verdict: FOUND 96 date and time rows, 48 hint rows (hddosd-110U-whole2-aspect-set)
- verdict: FOUND 94 date and time rows, 47 hint rows (hddosd-110U-whole2-aspect-cancel)
- verdict: FOUND 96 date and time rows, 48 hint rows, item 0 1 in every frame: true (rom-0230A-whole2-aspect1)
- verdict: FOUND 96 date and time rows, 48 hint rows, item 0 2 in every frame: true (rom-0230A-whole2-aspect2)
- verdict: FOUND 96 date and time rows, 48 hint rows, item 0 0 in every frame: true (rom-0230A-whole2-aspect0-bit3)
- verdict: FOUND 96 date and time rows, 48 hint rows, item 0 2 in every frame: true (rom-0230A-whole2-aspect2-gate)
- verdict: FOUND 94 date and time rows, 47 hint rows (rom-0230A-whole2-aspect-cancel)
- mutate.mjs model_aspect.mjs: killed 2 of 2 (verdict: FOUND every mutant changed the verdict)
- run_all: 119 of 119 pass, 10 at once, 337 s

### Files
- D:\CodingProjects\CrystalClockVK\References\model\clock_memory.mjs
- D:\CodingProjects\CrystalClockVK\References\model\clock_menus.mjs
- D:\CodingProjects\CrystalClockVK\References\model\clock_rest.mjs
- D:\CodingProjects\CrystalClockVK\References\model\clock_frame.mjs
- D:\CodingProjects\CrystalClockVK\References\scripts\verify_frame.mjs
- D:\CodingProjects\CrystalClockVK\References\scripts\model_aspect.mjs
- D:\CodingProjects\CrystalClockVK\References\scripts\run_all.manifest.json
- D:\CodingProjects\CrystalClockVK\References\readings\whole-frame2-draft.md

### Captures
- hddosd-110U-whole2-aspect1
- hddosd-110U-whole2-aspect2
- hddosd-110U-whole2-aspect3
- hddosd-110U-whole2-aspect-set
- hddosd-110U-whole2-aspect-cancel
- hddosd-110U-pal-whole2-aspect2
- hddosd-110U-whole2-aspect-reset
- rom-0230A-whole2-aspect1
- rom-0230A-whole2-aspect2
- rom-0230A-whole2-aspect0-bit3
- rom-0230A-whole2-aspect2-gate
- rom-0230A-whole2-aspect-cancel

### Open
- Mutant 18 survives: the gate value written by cross-in (-1 for entry 0, 0 for the others). Every capture presses cross before the trace starts, so no frame in a trace contains the entering edge. The model's rule is read from HDD func_002316B8 and ROM 0x0022DD98..0x0022DDC4. It is open until a capture presses cross inside the trace.
- ROM 2.30 confirm of a changed value is neither modelled nor captured. The aspect callback tail-jumps to ROM 0x00231888, which starts a drive write (romWrite states). The model only has the existing wait branch for it. No capture confirms a changed aspect on ROM, only cancel (rom-0230A-whole2-aspect-cancel).
- The generic editor (D_00228660, left/right) and the enter callback (clock_config_get_initial_value, 0x00228448, which also clears D_003701A4 and D_002B2E1C) are not modelled. The captures press right and cross before the trace starts, so their effect arrives only as the starting snapshot. The value table is read from the HDD OSD image (0, 1, 2 at 0x002B2810). ROM 2.30's table at 0x0028ACE0 is filled at run time and was not read: the ROM captures show the same indices, but the table values were not taken from memory.
- Gate writers outside the entry list (func_00234F50/58/68/78 from the main menu, first-run pages, Clock Adjustment's pages; ROM jals at 0x00225070 to 0x00229A90 and 0x0022D2C0) are not modelled. They do not occur in these captures: the gate is carried and compared in every frame with no difference.
- The text rows (date, time, hints) are checked from the program's Font_SetLocate arguments and the hint row function's answer against dateRow and hintRow. The whole-frame model still produces no text packets (gap), and clock_text.mjs is not in this lane. PAL is verified on HDD OSD only (hddosd-110U-pal-whole2-aspect2). ROM 2.30 PAL has no aspect capture.
- hddosd-110U-whole2-aspect-reset (item 0 written 1, read 0 from the first whole frame on) is an observation capture. The reset happens at the end of the first, partial frame, so no whole frame shows the change. It carries no gate probe and is not in the manifest. The reload itself is proved by the cancel captures, where item 0 flips 1 to 0 inside the trace.
- The task wording says 'bars off / text lower' for items 1 and 2. The code gives bars off only for item 1 (bars for 0 and 2) and text lower only for item 2. The model and the draft follow the code.
- Line endings: the model files are LF like the rest of the tree. My Python edits first converted several to CRLF. All edited files were normalised back to LF before the final runs. The scratch mutation script and capture helper (asp_cap.mjs) live in the session scratchpad.

## model 3 refute

**irreproducible**: Everything I re-ran passes and the cited instructions match, so I found nothing to refute. The hand-mutation claim (17 of 18 killed) and the cross-in/cancel gate path I could not reproduce, so I can't call the whole set confirmed.

**Claims**: the reset cause, the setting path, the item 0 effect on the frame, the capture list, the mutation counts, and the regression count.

**Commands run** (from D:/CodingProjects/CrystalClockVK/References/scripts, captures in D:/CodingProjects/Watson/Runtime/captures):
- `CLOCK_BUILD=hdd|rom node model_aspect.mjs <capture>.trace.jsonl` on all 11 listed captures. The PAL capture ran with `CLOCK_VIDEO=pal`.
- `node verify_frame.mjs <capture>.trace.jsonl --carry`. The file goes first; my first attempt put `--carry` before it and failed with ENOENT. Run on hddosd aspect1, aspect-set, aspect-cancel, aspect-reset, PAL aspect2, and ROM aspect2-gate and aspect-cancel.
- `node mutate.mjs model_aspect.mjs --limit 20`.

**Output** (verbatim, trimmed). Each of the 11 captures printed `date row`, `time row` and `hint row` as N of N equal, with these verdicts:
```
hddosd-110U-whole2-aspect1      FOUND 96 date and time rows, 48 hint rows, item 0 1 in every frame: true
hddosd-110U-whole2-aspect2      FOUND ... item 0 2 in every frame: true
hddosd-110U-whole2-aspect3      FOUND ... item 0 0 in every frame: true
hddosd-110U-whole2-aspect-set   FOUND 96 date and time rows, 48 hint rows, item 0 1 in every frame: true
hddosd-110U-whole2-aspect-cancel  date row: 47 of 47 equal ... FOUND 94 date and time rows, 47 hint rows
hddosd-110U-pal-whole2-aspect2  FOUND ... item 0 2 in every frame: true
rom-0230A-whole2-aspect1, aspect2, aspect0-bit3, aspect2-gate: FOUND 96 ... (item 0 1 / 2 / 0 / 2 in every frame: true)
rom-0230A-whole2-aspect-cancel  FOUND 94 date and time rows, 47 hint rows
```
- Bars line from `model_aspect.mjs`: `letterbox bar packets equal: 0` for aspect1 (item 1) and `196` for aspect2 (item 2).
- `verify_frame.mjs --carry` ended `verdict: FOUND 49 frames: every packet the model produces equal` on all 7 captures I ran.
- `mutate.mjs`:
```
mutants: 2 of 2 candidates
killed 2 of 2 (0 by a crash, 2 by a wrong verdict)
verdict: FOUND every mutant changed the verdict
```
- `hddosd-110U-whole2-aspect-reset`:
  - `model_aspect.mjs` prints item 0 = 0 x49 and 196 bar packets.
  - It also prints `verdict: PARTIAL 0 date and time rows`. It has no row comparison, and it is not in the `model_aspect.mjs` manifest list.
  - This is consistent with the claim that item 0 written 1 reads 0 from the first frame.
  - It is not one of the 11 reported captures.

**Instructions read** (D:\CodingProjects\CrystalOSD\asm\):
- `config/config_get_aspect_ratio.s` (0x00203D30): `lw 0x371818; srl 1; andi 3; slti v1,v0,3; movz v0,zero,v1`. That is bits 1..2, and a value of 3 reads as 0. Matches.
- `config/func_00235518.s`: it calls `is_config_dirty`, and if the result is 0 it jumps to `config_load_clock_osd`. Matches "not dirty".
- `config/config_load_clock_osd.s`: `bne D_00370300, 1` skips the reload, so the gate must be 1. It writes item 0 from `config_get_aspect_ratio`. Matches.
- `clock/clock_orb_rendering_func.s` line 48: `jal func_00235518` at 0x00225F0C. Matches.
- `clock/func_002262C8.s`: the bars function `func_00226158` is called only when item 0 is 0 or 2, so item 1 draws none. Matches.
- `clock/func_00226300.s`: the date row is 0x20 only when item 0 == 2, otherwise 0xE. Matches.
- `graph/func_00226958.s`: `xori 2; movz s0,0xB6` gives 0xB6 for item 2, else 0xC8. Matches.
- `clock/clock_config_change_cb_aspect_ratio.s` (0x00227D30): it compares item 0 with `config_get_aspect_ratio` and jumps to `config_mark_dirty` when they differ. Matches the confirm step.
- Not read: the cross-in handler that sets the gate to 0, the cancel handler that sets it to 1, and the save path through `config_set_aspect_ratio`. I did not read the ROM addresses either.

**Problems**:
1. I could not find `asp_mut.mjs`. A search of the scratchpad directories under `C:\Users\usuario\AppData\Local\Temp\claude\D--CodingProjects-CrystalClockVK\*\scratchpad` returned nothing, and a filesystem-wide `find` did not finish in time. So the "17 of 18 by hand" claim has nothing to run. The reproducible mutation evidence is only `mutate.mjs`, which found 2 candidates and killed both.
2. `model_aspect.mjs` prints the bar counts, but the verdict does not gate on bars. It gates on the rows and on item 0 matching the capture's name.
3. `verify_frame.mjs --carry` lists "button hint" and "date and time" as "not produced", for example 1176 packets of date and time. So the text packets are compared only by row through `model_aspect.mjs`, not packet by packet.
4. I did not check the setting-path claims against a capture. These are the gate going 0 to 1, the word 0x07000010 to 0x07000012, and cancel returning item 1 to 0 on the ROM. `aspect-set` and `aspect-cancel` pass the frame model, but I did not probe the gate or the word directly.
5. `run_all.mjs --changed` (119 of 119) was not re-run. It takes about 337 s, and the manifest does contain the model_aspect and verify_frame --carry entries for these captures.
6. Contradiction with another facts page: `facts/clock-frame.md` lines 383-386 say "no capture has aspect ratio 1 or 2 with the clock alone, so the bars are verified only for the item 0 the captures hold". The new captures contradict this, so that page is stale and must be rewritten.

**Verdict**: irreproducible. The verifier runs, the instruction reading, and the bars, rows and gate expressions all match, and I found no refutation. The scratchpad mutation script, the setting-path handlers and the regression total were not reproduced, and `facts/clock-frame.md` needs updating.

## model 4

done: true

### Claims
- clock_frame.mjs imports clock_text.mjs (putString via dynamic import, with process.argv[1] ??= '' because verify_text2/elf_words read argv[1] at load and the suite's -e probe discovery has none) and produces the text packets of the three text parts (pages, date and time, hint) when the snapshot carries text; otherwise and on ROM 2.30 they stay gaps. Verified by verify_frame.mjs --carry on the whole3 captures (build hdd).
- Text is produced from probed inputs, not derived: the text of each string is the ELF image's string at the probed argument pointer (language table or fixed string, probe only compared), the date and time are the probed RAM buffers, the caller's font state (0x160 bytes: place, colour, size) is the probe's. The library context is read at the capture's first character, then carried through characters, strings and frames and checked against the library's at every frame start.
- Coverage per capture, HDD OSD 1.10U (NTSC): clock alone 14850/15025 = 98.8% (was 93.5%), text 800/800 equal; main menu 8448/8736 = 96.7% (was 77.5%), 1680/1680; System Configuration 25025/25725 = 97.3% (was 80.9%), 4225/4225; enter (menu to config, 75 frames) 59427/59879 = 99.2%, 5613/5613; Clock Adjustment hour 43110/43650 = 98.8%, 5670/5670; boot with empty glyph cache 24544/25123 = 97.7%, 3481/3481 incl. 19 picture uploads. PAL: config 24024/24696 = 97.3% (4056/4056), menu 8800/9100 = 96.7% (1750/1750). Zero events, every piece equal, carried font cache equal at every frame start.
- ROM 2.30 and ROM PAL: text is not produced (clock_text.mjs is HDD only, the ROM font code is not modelled); coverage unchanged: rom-0230A-whole2-enter 93.1%, -down 87.1%, -to-clock 94.6%, rom-0230E-pal-whole2-enter 92.8%, all FOUND. Old HDD captures (whole2-*) have no text probes and stay gaps (whole2-enter 89.9%).
- Text packets that are not text inside the parts (button panels and icons, colour states) are not produced: per frame hint part 4 (clock) / 7 (menu) / 23 (config), pages part 2, date and time 1. A string's probe position (its trace packet index) places its packets for the comparison; this is alignment, not content.
- Mutation: mutate.mjs verify_frame.mjs on hddosd-110U-whole3-boot kills 2 of 8; 6 survive: five coverage counters that only print (as before) and the -1 sentinel of the table id (equivalent). The new path was mutated by hand (13 mutants over whole3-config/-enter/-boot, plus byte-flip mutants of the packet comparison and a language shift): measuring flag, carry across strings and frames, skip of non-text packets, part boundary, packet byte flips, picture packet halves, other-language pointer: all killed. After the language-pointer survivor was found the verdict now requires at least one string resolved through the image.
- Suite: new captures hddosd-110U-whole3-{clock,menu,config,enter,adjust-hour,boot} and hddosd-110U-pal-whole3-{config,menu} registered with --carry (discover also added hddosd-110U-whole2-aspect-reset, previously unregistered); none of the 62 earlier verify_frame entries lost; run_all.mjs --changed: 128 of 128 pass, and 82 of 82 after the last verifier edit.

### Verdict lines
- verdict: FOUND 25 frames: every packet the model produces equal (hddosd-110U-whole3-config)
- verdict: FOUND 85 frames: every packet the model produces equal (hddosd-110U-whole3-boot)
- run_all: 82 of 82 pass, 10 at once, 208 s
- verdict: PARTIAL 6 mutants survive: the verifier does not check what those lines compute (mutate.mjs verify_frame.mjs, 2 of 8 killed; survivors are coverage counters and an equivalent sentinel)

### Files
- D:\CodingProjects\CrystalClockVK\References\model\clock_frame.mjs
- D:\CodingProjects\CrystalClockVK\References\scripts\verify_frame.mjs
- D:\CodingProjects\CrystalClockVK\References\readings\whole-frame2-draft.md
- D:\CodingProjects\CrystalClockVK\References\scripts\run_all.manifest.json (entries added by run_all.mjs --discover --only verify_frame.mjs)

### Captures
- hddosd-110U-whole3-clock (20 frames, state clock)
- hddosd-110U-whole3-menu (20, state menu)
- hddosd-110U-whole3-config (20, state config)
- hddosd-110U-whole3-enter (70, menu, down, hold cross)
- hddosd-110U-whole3-adjust-hour (40, config, cross, 3x right, hold up)
- hddosd-110U-whole3-boot (80 frames after 230 frames from boot, SkipSearchLater)
- hddosd-110U-pal-whole3-config (20, PAL)
- hddosd-110U-pal-whole3-menu (20, PAL)
- all taken with: node References/scripts/with_emulator.mjs node References/scripts/capture.mjs --verifiers verify_frame.mjs,verify_text2.mjs --build hdd --mode exact

### Open
- ROM 2.30 text (both video modes) is not produced: clock_text.mjs has no ROM font code (verify_text2.mjs holds it, not importable as a model), and clock_text.mjs is outside this lane's files.
- The non-text packets inside the text parts (button panels/icons, colour states: hint 4/7/23 per frame, pages 2, date and time 1) are counted as not produced; their content was not read.
- Strings come from probes: argument pointers, the caller's font state (0x160 bytes) and the date/time RAM buffers; which caller draws which string, where and in which colour is verify_text2.mjs's rule, not derived here.
- Survivor of the hand mutation: the packet's starting room (headRoom 0x1FF-4) and the room-exhausted branch (character given up and asked again in a fresh packet) are not exercised by any whole-frame capture; no frame in these captures runs a string out of room.
- Only the language of the capture (English, word 0x07000010) is met in a frame; other languages, Japanese and a different language-table pointer are exercised by the text lane's captures, not by whole frames.
- Existing HDD whole2-* captures carry no text probes and keep their gaps; the text path needs the whole3-style capture (verify_frame.mjs plus verify_text2.mjs probes).
- mutate.mjs survivors on verify_frame.mjs: five coverage-counter lines that no verdict reads, and the -1 sentinel of the table id (equivalent).

## model 4 refute

**confirmed**: Every cited number reproduced on the cited captures, including the mutation result when run on whole3-boot, and the code matches the description.

**Claims**: the seven bullets about clock_frame.mjs importing clock_text.mjs, text from probed inputs, per-capture coverage, ROM and old-capture behaviour, text packets not produced, mutation and suite.

**Commands run**
- `CLOCK_BUILD=hdd node verify_frame.mjs <capture>.trace.jsonl --carry` on the 6 NTSC whole3 captures and the 2 PAL whole3 captures (`CLOCK_VIDEO=pal`).
- `CLOCK_BUILD=rom` on rom-0230A-whole2-{enter,down,to-clock}, and `CLOCK_BUILD=rom CLOCK_VIDEO=pal` on rom-0230E-pal-whole2-enter.
- `CLOCK_BUILD=hdd` on hddosd-110U-whole2-enter.
- `node mutate.mjs verify_frame.mjs --capture hddosd-110U-whole3-boot --env CLOCK_BUILD=hdd --limit 20`.
- Greps of verify_frame.mjs and clock_frame.mjs for the import, `process.argv[1] ??= ''` and the ROM guard.

**Output** (coverage, text packets equal, verdict)
- clock: 14850/15025 (98.8%), text 800/800, FOUND 25 frames. Hint 100 / 25 frames = 4 per frame, date and time 25 = 1 per frame.
- menu: 8448/8736 (96.7%), text 1680/1680. Hint 168 / 24 = 7, pages 48 / 24 = 2.
- config: 25025/25725 (97.3%), text 4225/4225. Hint 575 / 25 = 23.
- enter: 59427/59879 (99.2%), text 5613/5613, FOUND 75 frames.
- adjust-hour: 43110/43650 (98.8%), text 5670/5670.
- boot: 24544/25123 (97.7%), text 3481/3481 with `text picture packets 19 of 19`, FOUND 85 frames.
- PAL config: 24024/24696 (97.3%), text 4056/4056.
- PAL menu: 8800/9100 (96.7%), text 1750/1750.
- Every capture ends with `verdict: FOUND ... every packet the model produces equal`.
- Carried font cache: `equal to the library's at 24 of 24 frame starts` (clock) and `84 of 84` (boot).
- Text source in the clock capture: `25 of 25 text taken from the language table, 0 of 0 from fixed strings ... 75 from the caller's buffers as probed (date and time)`.
- ROM captures: rom-0230A-whole2-enter 93.1%, -down 87.1%, -to-clock 94.6%, rom-0230E-pal-whole2-enter 92.8%, all `verdict: FOUND`.
- hddosd-110U-whole2-enter: 53814/59879 = 89.9%, FOUND.
- Mutation on whole3-boot: `killed 2 of 8 (0 by a crash, 2 by a wrong verdict)`, `verdict: PARTIAL 6 mutants survive`. The survivors are line 230 (`1 -> 2`, the -1 sentinel) and five `add(result.coverage.others, ...)` counters at lines 347, 352, 359, 368 and 371.

**Instructions read**: this is model and verifier code, not PS2 assembly. In verify_frame.mjs, line 26 has `process.argv[1] ??= ''` and line 29 the dynamic import of clock_text.mjs. Line 40 shows the ROM build table, and the comment at lines 31-34 and the doc comment at line 192 say text is HDD only ("null without them or on ROM 2.30"). In clock_frame.mjs, lines 20-21 have `process.argv[1] ??= ''` followed by the dynamic `await import('./clock_text.mjs')` of `putString`. I did not re-read the 13 hand mutants or the run_all 128/128 and 82/82 figures. I ran the verifier for each registered capture, not `run_all.mjs`.

**Notes**
- Running `mutate.mjs` without `--capture` uses the first six manifest captures instead. That run killed 0 of 8 and also left `4 -> 5` and `0 -> 1` on line 230 alive. The claim's "2 of 8" is stated for whole3-boot, so it holds.
- Line 230 mutations of the language-pointer constants other than the sentinel survive in the generic run. The claim covers this with the "at least one string resolved through the image" verdict condition and the hand mutants.

**Verdict**: confirmed. Every figure the claims cite reproduced.
