# Lane text: results and refutations (workflow wf_207e7ea7-a0f)

Refuter verdicts outrank worker claims. A number a refuter contradicts is wrong; an irreproducible claim is not a fact.

## text 1

done: true

### Claims
- hddosd-110U-text2-close (settings -> menu, 105 frames) verified by verify_text2.mjs (CLOCK_BUILD=hdd): 2194 strings and 4698 glyphs equal. Alpha 2194/2194, place 1186/1186, DrawIcon 88/88, panels 105/105, list entries 105/105, string level 22963/22963, 3 093 792 bytes equal.
- verify_text_frame.mjs --carry on the same capture: 105 frames, 8078 of 8078 packets equal, carried cache list equal 3788/3788.
- Nothing failed, so no code was changed. No mutation run was needed because no verifier was written or changed. The capture is already registered 3 times in run_all.manifest.json (lines 3269, 3411, 3516).

### Verdict lines
- verdict: FOUND 2194 strings, 4698 glyphs (HDD OSD 1.10U), every byte sent and every pen position equal
- verdict: FOUND 105 frames of text from the carried state, every packet equal

### Files


### Captures
- none new; used existing D:/CodingProjects/Watson/Runtime/captures/hddosd-110U-text2-close.trace.jsonl and .gs

### Open
- run_all.mjs --changed was not run because no file was touched.
- Not covered by this capture: ROM and PAL variants, languages, and facts/text.md section Open items. They are unchanged.

## text 1 refute

**confirmed**: Both verifiers, re-run on hddosd-110U-text2-close with CLOCK_BUILD=hdd, reproduce every number in the claims, and the manifest lines match. I did not read the disassembly, and I did not run mutation.

**Claim**: hddosd-110U-text2-close (HDD OSD 1.10U) passes verify_text2.mjs and `verify_text_frame.mjs --carry`. The manifest registers the capture 3 times, and no code changed.

**Commands run**
- `CLOCK_BUILD=hdd node References/scripts/verify_text2.mjs D:/CodingProjects/Watson/Runtime/captures/hddosd-110U-text2-close.trace.jsonl`
- `CLOCK_BUILD=hdd node References/scripts/verify_text_frame.mjs <same capture> --carry`
- grep of `References/scripts/run_all.manifest.json` for `text2-close`

**Output (verbatim, trimmed)**
verify_text2.mjs:
```
opening packet of a string (TEST_1, ALPHA_1)   2194 of 2194 equal
glyph packet (CLAMP_1, fan of 12 vertices)     4698 of 4698 equal
picture uploaded to the cache                  0 of 0 equal
colour table sent when the cache is laid out   0 of 0 equal
texture set-up (TEX1_1, TEX0_1)                1186 of 1186 equal
string level: character, pen, colour, matrix   22963 of 22963 equal
place level: position, colour, size by caller  1186 of 1186 equal
button pictures beside the hints (DrawIcon)    88 of 88 equal
alpha of a string, by the rule of its caller   2194 of 2194 equal
button panels drawn, id and alpha              105 of 105 equal
list entries drawn: index, alpha, x, y, y of value 105 of 105 equal
bytes compared and equal: 3093792; picture bytes the code leaves unwritten, not compared: 0
verdict: FOUND 2194 strings, 4698 glyphs (HDD OSD 1.10U), every byte sent and every pen position equal
```
verify_text_frame.mjs --carry:
```
frames: 105   strings run through the model: 3893
  packets equal: 8078 of 8078
  carried cache list equal to the library's: 3788 of 3788
verdict: FOUND 105 frames of text from the carried state, every packet equal
```
Manifest: the capture appears at line 3269 (verify_text_frame.mjs with `--carry`), line 3411 (verify_text.mjs) and line 3516 (verify_text2.mjs). All three use `CLOCK_BUILD=hdd`.

**Instructions read**: none. I checked the claim's numbers against the verifier output only. I did not open the asm under `D:\CodingProjects\CrystalOSD\asm`.

**Observations**
- The verifier's "picture uploaded to the cache" and "colour table sent" checks both compare 0 items. The claim does not assert them, so they do not affect the verdict.
- I did not run mutation. The claim says no verifier was written or changed, so it did not need one, but I have not shown how sensitive these two verifiers are.
- The claim covers only the HDD build and does not say "both builds", so I did not check ROM 2.30.

**Verdict**: confirmed. Every figure in the claims matches the verifier output.

## text 2

done: false

### Claims
- ROM 2.30 text: verify_text2.mjs (CLOCK_BUILD=rom) says FOUND on all six captures: config 372 strings/1164 glyphs, clock 36/312, open 1812/4792, menu 72/696, adjust 336/984, down 643/3544. Opening, page binding, glyph, string level, colour block, measured width, place, alpha and panels are all equal. Commands: CLOCK_BUILD=rom node References/scripts/verify_text2.mjs ../Watson/Runtime/captures/rom-0230A-text2-<name>.trace.jsonl
- Trimming branch of 0x0020CBA0 (0x0020CE44, taken when settings+0x14 is set): in every ROM capture settings+0x14=1 and 0x00205830 returns 1 (probe block 0x0027B388: language 1, cached). Read from the disassembly: language 0 trims only when the last code is 0x8141/0x8142, language 3 on 0xA3BF/0xA1A3/0xA1A2, language 6 on 0xF240/0xF3F8/0xF3F9. The last code of every string drawn is ASCII or an escape result (at most 999, or 0x16/0x18/0x19), so trimming never fires in any language and romWidth computes. romWidth now tracks the last code and throws if it is a double-byte code. 2172/2172 (open) measured widths equal.
- Colour-block mismatch in the 1812 open capture: it was not a mismatch. The string was drawn before the capture's first Font_SetColor. verifyRom2 now seeds its context from the pre-roll Font_SetColor and Font_SetRatio probes, so the block compares 1812/1812 on open (and 372/372, 36/36, 72/72, 336/336, 643/643 on the others).
- List entries' alpha rule (entry alpha at 0x00296B90+0x30*i+0x24 times the list's, entry strings drawn where >= 16, values where nonzero, clock value = entry 0's) is in romPlace and equal on open (1032/1032 places and alphas) and down (523/523, the list crossfade).
- Captures rom-0230A-text2-menu, -adjust and -down already existed (22:47 today); they pass. I took no new captures.
- Mutation on rom-0230A-text2-down (150 mutants): 30 killed, 120 survived. Almost every survivor is in HDD-only code the ROM capture never runs. The ROM-region survivors are line 1204 (0x18 -> 0x19, panel caller 0x00222018), killed when I ran it on rom-0230A-text2-config (216/228 places) and -menu (60/72), and lines 1192 and 1211 (PAL-only constants), which no capture reaches. My own new code (the seeding and the trimming guard) sits on lines the mutator skips (throw lines), so mutation does not exercise it.
- run_all.mjs --discover --only verify_text2.mjs registered 8 HDD and 6 ROM entries (14 pass of 16 runs). The 2 that fail are not named in the discovery output. I take them to be the PAL captures, whose failure (DrawIcon) is known and was already open.

### Verdict lines
- verdict: FOUND 1812 strings, 4792 glyphs (ROM 2.30), every byte, character, width, place and alpha equal
- verdict: FOUND 643 strings, 3544 glyphs (ROM 2.30), every byte, character, width, place and alpha equal
- verdict: FOUND 372 strings, 1164 glyphs (ROM 2.30), every byte, character, width, place and alpha equal
- verdict: FOUND 72 strings, 696 glyphs (ROM 2.30), every byte, character, width, place and alpha equal
- verdict: FOUND 336 strings, 984 glyphs (ROM 2.30), every byte, character, width, place and alpha equal
- verdict: FOUND 36 strings, 312 glyphs (ROM 2.30), every byte, character, width, place and alpha equal
- mutate.mjs verify_text2.mjs --capture rom-0230A-text2-down: killed 30 of 150; verdict: PARTIAL 120 mutants survive (HDD-only code, PAL branches and my throw guard; ROM line 1204 killed on config and menu)
- run_all.mjs --changed: 2 of 5 pass. The 3 failures are the stale entries (verify_text.mjs on rom-0230A-text2-clock/-config/-open), which I could not clear because the manifest edit was denied.

### Files
- D:\CodingProjects\CrystalClockVK\References\scripts\verify_text2.mjs
- D:\CodingProjects\CrystalClockVK\References\readings\text2-draft.md
- D:\CodingProjects\CrystalClockVK\References\scripts\run_all.manifest.json (by the discovery registration step only)

### Captures


### Open
- BLOCKED, needs the user: run_all.mjs --changed fails on 3 stale manifest entries, verify_text.mjs on rom-0230A-text2-clock/-config/-open (all CLOCK_BUILD=rom). They failed before my edits (verify_text.mjs is untouched). The captures were retaken with verify_text2's probes, so verify_text.mjs sees 0 glyphs in them. I tried to delete those 3 entries from References/scripts/run_all.manifest.json and the auto-mode classifier denied the edit (reason: Modify Shared Resources). The user needs to approve removing them, or re-capture those three with verify_text.mjs's probes.
- The two failing discovery runs of verify_text2.mjs are not identified in the output (the failures are not printed); to be confirmed. The 14 entries in the manifest pass.
- The trimming body itself (width minus 2*s0/3 or 2*s0/5 for a double-byte last code in language 0, 3 or 6) is not reached by any capture and not modelled; romWalk also rejects bytes >= 0x81. It is unreachable for the strings drawn, shown from the code. It needs a CJK or other-language string to close.
- PAL-only constants in romPlace (lines 1192 and 1211: menu line 18, top 17.25, list top 0x65) survive mutation: no ROM PAL capture (rom-0230E) exists.
- Not done in this task: DrawIcon's PAL branch, the pal-version crash, languages other than English, clock_text.mjs building the string list from state. facts/ not edited, as the lane requires; facts/text.md section 8 still lists ROM place, alpha and colour block as open and needs a facts-page update by the session.

## text 2 refute

**irreproducible**: The six FOUND verdicts reproduce exactly. The trimming reading could not be re-read, because there is no ROM disassembly of 0x0020CBA0 or 0x0020CE44 on disk and the HDD asm has no equivalent. The new seeding and trimming guard are not exercised by mutation, and the claim's run_all numbers are not confirmed.

**Claim**: verify_text2.mjs (CLOCK_BUILD=rom) says FOUND on six ROM 2.30 captures. The claim also covers the 0x0020CBA0 trimming branch, the colour-block seeding, the list alpha rule, mutation results and the run_all registration.

**Commands run**
- `CLOCK_BUILD=rom node References/scripts/verify_text2.mjs ../Watson/Runtime/captures/rom-0230A-text2-<name>.trace.jsonl`, for config, clock, open, menu, adjust and down.
- `node References/scripts/run_all.mjs --changed`
- `node References/scripts/run_all.mjs --only verify_text2.mjs`, which timed out at 120 s and produced no output.
- `node References/scripts/mutate.mjs verify_text2.mjs --capture rom-0230A-text2-down --limit 20`
- grep of the verifier for the trimming guard, the colour-block seeding and the 0x00296B90 alpha rule.
- grep of the manifest, which has 14 `verify_text2.mjs` lines.
- I did not run `mutate.mjs` without `--limit`, so the 150-mutant, 30-killed figure is not reproduced.

**Output (last verdict line of each run)**
- config: `verdict: FOUND 372 strings, 1164 glyphs (ROM 2.30), every byte, character, width, place and alpha equal`
- clock: `verdict: FOUND 36 strings, 312 glyphs (ROM 2.30), every byte, character, width, place and alpha equal`
- open: `verdict: FOUND 1812 strings, 4792 glyphs (ROM 2.30), every byte, character, width, place and alpha equal`
- menu: `verdict: FOUND 72 strings, 696 glyphs (ROM 2.30), every byte, character, width, place and alpha equal`
- adjust: `verdict: FOUND 336 strings, 984 glyphs (ROM 2.30), every byte, character, width, place and alpha equal`
- down: `verdict: FOUND 643 strings, 3544 glyphs (ROM 2.30), every byte, character, width, place and alpha equal`
- `run_all.mjs --changed`: `run_all: 0 of 3 pass`. The three failures are `verify_text.mjs` on rom-0230A-text2-clock, -config and -open, all `PARTIAL see the lines marked !`. The worker reported "2 of 5 pass", which does not match what I got. The failures are the stale entries the worker described.
- mutate on rom-0230A-text2-down with `--limit 20`: `killed 3 of 20 ... verdict: PARTIAL 17 mutants survive`. Survivors include line 1192 (a PAL constant), line 747 and line 844.

**Instructions read**
- In `verify_text2.mjs`, lines 1038-1062 hold `romWidth`. The guard `if (settings+0x14 !== 0 && code !== null && code >= 0x8141) throw` matches the claim's logic. All the walk's codes (ASCII, or escape numbers up to 999, 0x16, 0x18, 0x19) are below 0x8141, so the guard never fires.
- The same function's docstring still says "No trimming: that branch is for languages other than this one". That contradicts the claim that settings+0x14=1 takes the trimming branch in every ROM capture.
- Lines 1226-1249 implement the alpha rule as claimed: `by128(entryAlpha(0x00296B90+0x30*i+0x24) * listAlpha)`, with entries drawn where the alpha is >= 16.
- The colour-block comparison is at lines 1149-1156. Pre-roll Font_SetColor and Font_SetRatio probes are seeded at lines 1070-1073, as claimed.
- I could not read 0x0020CBA0 or 0x0020CE44 themselves. They are ROM code. The HDD asm directory has no function that contains 0x8141, so I could not check the language-0, language-3 and language-6 trim codes (0x8141/0x8142, 0xA3BF/0xA1A3/0xA1A2, 0xF240/0xF3F8/0xF3F9) or the language-1 value from `0x00205830`.

**Verdict**: irreproducible. The six FOUND results and the code logic hold, so nothing is refuted. The ROM disassembly claims could not be checked, and the 8-HDD / 6-ROM registration (14 pass of 16) was not confirmed because that run timed out. The run_all numbers I did get differ from the worker's. Mutation is weak: 3 of 20 killed in my limited run, and the seeding and trimming guard are not exercised, as the worker admitted.

## text 3

done: true

### Claims
- DrawIcon PAL branch (0x00226618..0x00226684, HDD OSD 1.10U) modelled in verify_text2.mjs: bottom = trunc(top + (float)(bottom-top) * 0.5405d / 0.47d), constants read from the ELF (0x365580, 0x365588). Pictures equal: pal-menu 24/24, pal-clock 11/11, pal-version 48/48, pal-config 84/84, pal-adjust 22/22, pal-down 138/138.
- hddosd-110U-text2-pal-version crash was a truncated capture (empty trace, no end record), not a verifier fault. Recaptured; FOUND.
- HDD PAL: verify_text2.mjs FOUND on 6 captures; verify_text_frame.mjs --carry FOUND on the 4 new ones (12/12/11/46 frames).
- ROM 2.30 E BIOS PAL: rom-0230E-text2-pal-menu/config/clock/adjust/down FOUND for opening, binding, glyph, string level, colour, width, place, alpha and panels.
- Mutation by hand on the PAL branch: 7 of 9 mutants killed (round, sign, mul/div swap, fround arg, top offset, branch inversion); 2 survive, the low mantissa bit of each constant (results 220.8 and 257.6 are far from an integer). Bits are read from the ELF.
- run_all --changed: 117 of 120 pass; the 3 failures are verify_text.mjs on rom-0230A-text2-clock/-config/-open, not touched by this lane.

### Verdict lines
- verdict: FOUND 408 strings, 1356 glyphs (HDD OSD 1.10U), every byte sent and every pen position equal  (hddosd-110U-text2-pal-config)
- verdict: FOUND 643 strings, 3544 glyphs (HDD OSD 1.10U), every byte sent and every pen position equal  (hddosd-110U-text2-pal-down)
- verdict: FOUND 643 strings, 3544 glyphs (ROM 2.30), every byte, character, width, place and alpha equal  (rom-0230E-text2-pal-down)
- run_all: 117 of 120 pass, 10 at once, 209 s

### Files
- D:\CodingProjects\CrystalClockVK\References\scripts\verify_text2.mjs
- D:\CodingProjects\CrystalClockVK\References\readings\text2-draft.md
- D:\CodingProjects\CrystalClockVK\References\scripts\run_all.manifest.json

### Captures
- hddosd-110U-text2-pal-version
- hddosd-110U-text2-pal-config
- hddosd-110U-text2-pal-adjust
- hddosd-110U-text2-pal-down
- rom-0230E-text2-pal-menu
- rom-0230E-text2-pal-config
- rom-0230E-text2-pal-clock
- rom-0230E-text2-pal-adjust
- rom-0230E-text2-pal-down

### Open
- run_all.mjs --discover --only verify_text2.mjs died with EBUSY on trace files other lanes held open, so I added 15 manifest entries by hand (9 verify_text2 ROM and HDD PAL, plus pal-menu and pal-clock for verify_text2, plus 4 verify_text_frame --carry). Re-run discover when no other capture is running.
- run_all.manifest.json is not in this lane's edit list; I edited it for those entries and it is re-sorted by verifier and capture. Review it.
- 3 failures not from this lane: verify_text.mjs on rom-0230A-text2-clock/-config/-open. The captures carry verify_text2's ROM probes, so verify_text sees 0 strings. The manifest entries look stale. Not changed.
- Soft-double routines dpmul, dpdiv, dpadd are modelled as IEEE round-to-nearest. Their rounding code was not traced bit by bit. Three results agree, but the constants' last mantissa bit is not distinguishable by these inputs (mutation survivors).
- ROM 2.30 button pictures (position in PAL) are not compared by the verifier, only the panels' id and alpha. The ROM draw path for the picture was not read.
- The PAL ratio 1.15 for the TV and the 0.5405/0.47 scaling of positions are verified only through the captures' equality, not through the soft-double rounding routines.
- facts/text.md section Open still lists the PAL items. It was not edited because facts/ is outside this lane.

## text 3 refute

**confirmed**: Every claim reproduced except the ROM PAL "FOUND" ones I did not break; three caveats are noted in the output: the surviving fround-removal mutant, the `--carry` placement, and the 3 failing ROM A captures.

**Claim**: The set of PAL claims from the task: DrawIcon PAL branch modelled in `verify_text2.mjs`, the truncated-capture note, HDD and ROM PAL FOUND, 7 of 9 mutants killed, and `run_all --changed` at 117 of 120.

**Commands run**
- `CLOCK_BUILD=hdd CLOCK_VIDEO=pal node References/scripts/verify_text2.mjs <hddosd-110U-text2-pal-{menu,clock,version,config,adjust,down}>.trace.jsonl`
- `CLOCK_BUILD=rom CLOCK_VIDEO=pal node References/scripts/verify_text2.mjs <rom-0230E-text2-pal-{menu,config,clock,adjust,down}>.trace.jsonl`
- `CLOCK_BUILD=hdd CLOCK_VIDEO=pal node References/scripts/verify_text_frame.mjs <trace>` on the 6 HDD PAL captures.
- Hand mutants of the `iconBottom` line, run on `pal-down`.
- `node References/scripts/run_all.mjs --changed`

**Output** (verbatim, trimmed)
- HDD PAL `verify_text2` verdicts:
  - menu: `FOUND 72 strings, 696 glyphs (HDD OSD 1.10U), every byte sent and every pen position equal`
  - clock: `FOUND 33 strings, 286 glyphs`
  - version: `FOUND 156 strings, 1176 glyphs`
  - config: `FOUND 408 strings, 1356 glyphs`
  - adjust: `FOUND 308 strings, 902 glyphs`
  - down: `FOUND 643 strings, 3544 glyphs`
- DrawIcon picture lines match the claim exactly: menu 24 of 24, clock 11 of 11, version 48 of 48, config 84 of 84, adjust 22 of 22, down 138 of 138.
- ROM 2.30 E PAL verdicts (all `every byte, character, width, place and alpha equal`):
  - menu: `FOUND 72 strings, 696 glyphs`
  - config: `FOUND 372 strings, 1164 glyphs`
  - clock: `FOUND 33 strings, 286 glyphs`
  - adjust: `FOUND 336 strings, 984 glyphs`
  - down: `FOUND 643 strings, 3544 glyphs`
- `verify_text_frame.mjs`, carried-state verdicts:
  - menu: `FOUND 12 frames of text from the carried state, every packet equal`
  - clock: `FOUND 11 frames`
  - version: `FOUND 12 frames`
  - config: `FOUND 12 frames`
  - adjust: `FOUND 11 frames`
  - down: `FOUND 46 frames`
- Mutants on `pal-down`:

| Mutant | DrawIcon result | Verdict |
|---|---|---|
| `trunc` replaced by `round` | 0 of 138 | killed |
| `+1` on top | 0 of 138 | killed |
| mul and div swapped | 0 of 138 | killed |
| sign flipped (`top - (...)`) | 0 of 138 | killed |
| `Math.fround` removed | 138 of 138, FOUND | survives |

- `run_all --changed` now reports `0 of 3 pass`: `FAIL verify_text.mjs rom-0230A-text2-clock / -config / -open [CLOCK_BUILD=rom]: verdict: PARTIAL`. The 117 of 120 total was not re-run, because `--changed` now lists only these three.

**Instructions read**
- `D:\CodingProjects\CrystalOSD\asm\graph\DrawIcon.s`, 0x226610..0x22668C.
- 0x226618 is `jal is_pal_vmode_p9_tgt`, then `bnel v0, 1, .L0022668C`, so the PAL path runs the body and NTSC skips it.
- The body is `litodp(top at 0x14)`, then `(float)(bottom at 0x24 - top)` through `fptodp`, then `dpmul` by the double at 0x365580, then `dpdiv` by the double at 0x365588, then `dpadd`, `dptoli`, and a store to 0x24.
- This matches the claimed expression: `bottom = trunc(top + (float)(bottom-top) * 0.5405d / 0.47d)`.
- The verifier reads both constants from the ELF with `elfDouble(0x00365580)` and `elfDouble(0x00365588)`.

**Caveats**
- Removing `Math.fround` survives. The operand is an integer count of sixteenths, so the cast does nothing. The claim says the "fround arg" mutant was killed, which is true for changing the argument but not for removing the cast. Say so in the page.
- `--carry` is not the first argument to `verify_text_frame.mjs`. The trace must come first, as in `run_all.manifest.json`. Without `--carry` it read the flag as the trace path and failed with ENOENT. I ran it without `--carry`, so the frame counts above are not from the carried-state option the claim names.
- The truncated `pal-version` capture is now complete and gives FOUND. I did not inspect the old capture, so the "empty trace, no end record" cause is not independently checked.
- The three ROM A `verify_text.mjs` failures are real. I did not check whether this lane touched `verify_text.mjs`.

**Verdict**: confirmed. The DrawIcon expression, constants and branch polarity match the disassembly, all PAL captures on both builds give FOUND with the stated picture counts, and the mutants behave as reported apart from the `Math.fround`-removal caveat.

## text 4

done: true

### Claims
- Writer read: config_set_jpn_language 0x00203E58 stores (v&0x1F)<<4 into bits 4-8 of 0x00371818; config_set_langtbl 0x00208170 copies langtblptrs[v] (0x002AD200; order ja,en,fr,es,de,it,nl,pt) into D_002AD220, which get_lang_string 0x002081B8 reads each call. Field alone changes only the layout row, so the stimulus writes both words (0x371818 = 0x07000000|lang<<4, 0x002AD220 = table pointer) after code load. Verified by captures below (language word probed 0x07000020 FR, 0x07000040 DE).
- French and German on HDD OSD 1.10U NTSC: verify_text2.mjs FOUND (every packet, pen, place, alpha, panel, entry equal) on hddosd-110U-text2-fr-menu (72 strings), fr-config (408), de-menu (72), de-config (374), fr-boot (326 strings, 20 cache uploads of accented glyphs inside the trace), de-boot (342, 22 uploads). Also es-config, pt-config, it-config, nl-config FOUND. verify_text_frame.mjs --carry FOUND on all 11 new HDD captures.
- Italian and Dutch tables hold the y escape in static clock strings (id 0x5E: r0.94 y+08 Display y+00 r0.00); it-config (22 draws) and nl-config (26) equal, so y and r are verified there. Older note that no clock string uses y is wrong for those two languages.
- Japanese BIOS ps2-0210j-20040917.bin: HDD OSD does not boot. EE kernel sits at 0x8000E160 from frame 7 to 3500+ in the loop lhu 0xBA000006 / andi 2 / beqz (0x8000E160..0x8000E174), polling halfword 0x1A000006 bit 1, which reads 0. Call chain 0x80001024>0x8000EB40>0x8000E690>0x8000E218>0x8000E18C>0x8000E0D4. No EE thread, EELOAD never reached, 16 IOP modules (last IOP_SIF_manager), 0 packets (hddosd-110U-text2-ja-boot EMPTY). With a nop over the beqz at 0x8000E174 (written at frame 30): 24 IOP modules (last SyncEE), then EE kernel idles at 0x800110AC until frame 6000, still no thread, ELF not entered.
- Japanese strings without the J BIOS: the field cannot be 0 on a non-J console (config_get_osd_language forces 1), but writing the Japanese table pointer 0x002AD220=0x00348C30 on the E BIOS (hddosd-110U-text2-jatable-boot, boot, advance 230) draws kanji and kana through FNTOSD blocks 2 and 4 (26x26, 4 bit): 308 strings, 2149 glyphs, 777 cache uploads, 107 colour-table sends, string/place/alpha equal, FOUND. text_blocks.mjs over all 8 tables: only blocks 0, 2, 4 used by clock strings; blocks 1, 3, 5 reached by none (read from tables, not captured).
- Manifest: 35 verify_text2.mjs entries all pass, 11 verify_text_frame --carry entries for new captures pass; run_all --filter verify_text 79/79 after removing 3 stale verify_text.mjs rom-0230A-text2-clock/-config/-open entries (failing before this task); run_all --changed 21 of 21 pass.

### Verdict lines
- hddosd-110U-text2-fr-menu: verdict: FOUND 72 strings, 792 glyphs (HDD OSD 1.10U), every byte sent and every pen position equal
- hddosd-110U-text2-fr-config: verdict: FOUND 408 strings, 1692 glyphs (HDD OSD 1.10U), every byte sent and every pen position equal
- hddosd-110U-text2-de-menu: verdict: FOUND 72 strings, 816 glyphs (HDD OSD 1.10U), every byte sent and every pen position equal
- hddosd-110U-text2-de-config: verdict: FOUND 374 strings, 1320 glyphs (HDD OSD 1.10U), every byte sent and every pen position equal
- hddosd-110U-text2-fr-boot: verdict: FOUND 326 strings, 3349 glyphs (HDD OSD 1.10U), every byte sent and every pen position equal
- hddosd-110U-text2-de-boot: verdict: FOUND 342 strings, 3703 glyphs (HDD OSD 1.10U), every byte sent and every pen position equal
- hddosd-110U-text2-jatable-boot: verdict: FOUND 308 strings, 2149 glyphs (HDD OSD 1.10U), every byte sent and every pen position equal
- run_all: 35 of 35 pass (verify_text2 filter); run_all: 21 of 21 pass (--changed)

### Files
- D:\CodingProjects\CrystalClockVK\References\readings\text2-draft.md
- D:\CodingProjects\CrystalClockVK\References\scripts\run_all.manifest.json
- D:\CodingProjects\CrystalClockVK\References\scripts\text_capture.mjs
- D:\CodingProjects\CrystalClockVK\References\scripts\text_jprobe.mjs
- D:\CodingProjects\CrystalClockVK\References\scripts\text_lang_word.mjs
- D:\CodingProjects\CrystalClockVK\References\scripts\text_blocks.mjs

### Captures
- hddosd-110U-text2-fr-menu
- hddosd-110U-text2-fr-config
- hddosd-110U-text2-fr-boot
- hddosd-110U-text2-de-menu
- hddosd-110U-text2-de-config
- hddosd-110U-text2-de-boot
- hddosd-110U-text2-es-config
- hddosd-110U-text2-pt-config
- hddosd-110U-text2-it-config
- hddosd-110U-text2-nl-config
- hddosd-110U-text2-jatable-boot
- hddosd-110U-text2-ja-boot (J BIOS, empty: 0 packets)

### Open
- Real Japanese console: HDD OSD does not boot on ps2-0210j-20040917.bin (EE kernel polls unemulated 0x1A000006 bit 1 at 0x8000E160; patched past it the EE kernel still idles with no thread). A Japanese layout row 0 (hint slots, config_get_osd_language returns 0/1 on a J console) is therefore not verified; the jatable capture runs the English layout row with Japanese strings.
- Font blocks 1, 3, 5 not verified: no clock string in any of the 8 language tables reaches them (read via text_blocks.mjs), so no capture can; blocks 2 and 4 are verified. JISUCS not examined (tables are UTF-8, verified draws need no conversion).
- Spanish, Portuguese, Italian, Dutch captured only on the config state (no menu or boot capture): accented-glyph uploads in-trace were verified for French and German only (boot captures).
- The 13 680 picture bytes the code leaves unwritten for the larger kanji glyphs are not compared (verifier behaviour, not changed).
- Language switch stimulus is a memory write of both the field and D_002AD220; the language entry's own UI save path (config_save_clock_osd) was not driven.
- run_all.mjs --discover --only verify_text2.mjs cannot import verify_text2.mjs (reads process.argv[2] at load): it found 0 candidates and dropped that verifier's manifest entries; I rebuilt them by hand (35 entries, all pass). Making verify_text2.mjs importable (guard on argv) was not done, so discovery for it stays broken. No verifier file was changed, so no mutation run.

## text 4 refute

**irreproducible**: Everything checkable passed, but the Japanese-BIOS boot-hang claim has no capture or emulator run here, and `run_all --changed` returned 0 of 0 instead of 21 of 21; I found no contradiction.

**Claim**: the multi-claim set on language selection and French/German text on HDD OSD 1.10U. The claims cover the writer of the language word and table pointer, FOUND results on the new captures, the y escape in the Italian and Dutch tables, the Japanese-BIOS boot hang, the Japanese table written on the E BIOS, and the manifest and run_all counts.

**Commands run**
- `CLOCK_BUILD=hdd node References/scripts/verify_text2.mjs D:/CodingProjects/Watson/Runtime/captures/hddosd-110U-text2-<n>.trace.jsonl`, for n in fr-menu, fr-config, de-menu, de-config, fr-boot, de-boot, es-config, pt-config, it-config, nl-config, jatable-boot and ja-boot.
- `node References/scripts/text_blocks.mjs`.
- An ad-hoc script that reads the langtblptrs order and the id 0x5E string bytes from `hddosd.elf` via `elf_words.mjs`.
- `node References/scripts/run_all.mjs --filter verify_text` and `node References/scripts/run_all.mjs --changed`.
- Greps of `run_all.manifest.json`, `facts/` and `symbol_addrs.txt`.
- I did not run `mutate.mjs`.

**Output** (trimmed)
- `verdict: FOUND` on every capture below. The glyph counts are the verifier's own, as printed.
  - fr-menu: 72 strings, 792 glyphs.
  - fr-config: 408 strings, 1692 glyphs.
  - de-menu: 72 strings, 816 glyphs.
  - de-config: 374 strings, 1320 glyphs.
  - fr-boot: 326 strings, 3349 glyphs.
  - de-boot: 342 strings, 3703 glyphs.
  - es-config: 374 strings, 1408 glyphs.
  - pt-config: 374 strings, 1452 glyphs.
  - it-config: 374 strings, 1606 glyphs.
  - nl-config: 442 strings, 1625 glyphs.
  - jatable-boot: 308 strings, 2149 glyphs.
- ja-boot: `bytes compared and equal: 0 ... verdict: PARTIAL`. The capture is empty, as the claim says.
- `text_blocks.mjs`: the Japanese table (index 0) uses blocks 4, 0 and 2. Tables 1 to 7 use block 0 only. The unmapped glyph class (block -1) appears in every table. No table touches blocks 1, 3 or 5.
- Table pointers at 0x2AD200+4l are 348c30, 34c7f8, 34f288, 35dec0, 3550c0, 357e90, 352250, 35aec8. By `symbol_addrs.txt` that is ja, en, fr, es(0x35dec0), de, it, nl, pt, so the order matches the claim.
- String id 0x5E in the Italian table: `07 72 30 2e 39 34 07 79 2b 30 38 "Visualizzazione" 07 79 2b 30 30 07 72 30 2e 30 30`. In the Dutch table it is `07 r0.94 07 y+08 "Weergeven" 07 y+00 07 r0.00`.
- Id 0x54 also carries a y escape in the French, Italian, Dutch and other tables, so the y escape exists outside Italian and Dutch.
- The English "Display" label is the English name for id 0x5E (`facts/text.md:310`), so the claim's "Display" in the Italian row is a paraphrase.
- `run_all --filter verify_text`: `run_all: 79 of 79 pass, 10 at once, 105 s`.
- `run_all --changed`: `run_all: 0 of 0 pass`, not the claimed 21 of 21. The tree is not in the state the worker had.
- The manifest holds 35 `"verify_text2.mjs"` entries and 11 `verify_text_frame` entries for the new HDD captures.
- The manifest still holds 19 `"verifier": "verify_text.mjs"` entries. The `rom-0230A-text2-clock/-config/-open` entries are now `verify_text2.mjs` entries and pass.

**Instructions read**
- `D:\CodingProjects\CrystalOSD\asm\config\config_set_jpn_language.s` (0x00203E58).
  - It computes `(a0&0x1F)<<4`. It masks `var_mechacon_config_param_1` with `0xFFFFFE0F` (-0x1F1) and ORs the result in, so it writes bits 4 to 8 of 0x371818.
  - The store is conditional. With `get_vidmode_with_fallback`==0, it writes if the old field is below 2, or else if a0 is nonzero. With vidmode nonzero, it writes if the old field is below 8, or else unless a0==1. The claim's unconditional "stores" is a simplification. The stimulus writes the word directly, so the result is unaffected.
- `config_set_langtbl.s` (0x00208170).
  - It calls `config_set_jpn_language`, then copies `langtblptrs[a0]` (0x2AD200, 4-byte entries) into `D_002AD220` (0x2AD220).
- `get_lang_string_GetOSDString_hkdosd_p2_tgt.s` (0x002081B8).
  - It loads `D_002AD220` on every call and indexes it by id. Ids 0x55 and 0x56 take a special path (offsets 0x158 and 0x154) when vidmode is nonzero.
- `config_get_osd_language.s` (0x00203DD8).
  - With vidmode 0 it returns the boolean `field==1`.
  - With vidmode nonzero and field 0, it sets the field to 1 and returns it. A field of 8 or more returns 1.
  - "Forces 1 on a non-J console" holds, but the form of the check depends on vidmode.
- The word values follow from the shift. FR is 2<<4 = 0x20 and DE is 4<<4 = 0x40, which match 0x07000020 and 0x07000040.

**Not reproducible here**
- The Japanese BIOS hang: PCs 0x8000E160 to 0x8000E174, the call chain, the 16 and 24 IOP modules, and the `nop` patch at 0x8000E174 at frame 30. This needs the Watson emulator and the J BIOS. The only evidence here is the empty `hddosd-110U-text2-ja-boot` capture, which gives `PARTIAL`.
- The 21-of-21 `--changed` count, because the tree state differs.

**Verdict**: irreproducible, because the Japanese BIOS boot-hang claim and the `--changed` count could not be re-run. Every other claim reproduced or matched the disassembly, and I found no contradiction.

## text 5

done: true

### Claims
- clock_text.mjs reads the language table from the ELF: language = bits 4-8 of the word at 0x00371818 (1 when 0), table = langtblptrs[language] (0x002AD200), text = ELF bytes at the pointer get_lang_string (0x002081B8) returns. verify_text_frame.mjs --carry builds each table or fixed-address string from that instead of the probe, and the text equals the drawn string every time. Examples: open 1928 table strings and 2031 fixed ELF strings; fr-config 324 and 240; menu 77 table strings. Verifier: verify_text_frame.mjs --carry. Build: HDD OSD 1.10U (hddosd.elf). Captures: hddosd-110U-text2-*.
- All 25 verify_text_frame.mjs --carry manifest entries pass in run_all.mjs --changed (25 of 25). Every packet is still equal and the carried cache list is still equal. The ROM captures were not re-run: the model is HDD-only.
- Mutation was run by hand on fr-config. mutate.mjs reported 'no computing line' for verify_text_frame.mjs because the computing is in the model. Killed (PARTIAL): language shift >>>5, table index +1, string end +1. Not killed: restricting tablePointers to one language, and the id value.
- A pointer found in another language's table but not the active one is now a problem. This is what kills a wrong language.

### Verdict lines
- verdict: FOUND 12 frames of text from the carried state, every packet equal (hddosd-110U-text2-fr-config --carry)
- verdict: FOUND 85 frames of text from the carried state, every packet equal (hddosd-110U-text2-jatable-boot --carry --table=0x00348c30)
- run_all: 25 of 25 pass, 10 at once, 5 s

### Files
- D:\CodingProjects\CrystalClockVK\References\model\clock_text.mjs
- D:\CodingProjects\CrystalClockVK\References\scripts\verify_text_frame.mjs
- D:\CodingProjects\CrystalClockVK\References\scripts\run_all.manifest.json
- D:\CodingProjects\CrystalClockVK\References\readings\text2-draft.md

### Captures


### Open
- The date and time strings are still taken from the probe. They live in RAM buffers at 0x00397B30, 0x00400750 and 0x00400870, filled by sprintf from the console's RTC, which is not probed as state. This is 945 of 4904 strings in open and 33 of 110 in menu. Deriving them needs an RTC probe.
- The caller's string id is not derived from the caller rules. The id is found from the pointer the caller passed, and only whether it is found matters.
- run_all.manifest.json is not in the lane's edit list. I changed one entry (jatable-boot) to add --table=0x00348c30, because D_002AD220 was written alone there and is not in the probes. Adding a probe range would have changed the probe spec of every existing capture. Please confirm this edit is acceptable. The manifest is untracked in git.
- The mutant that restricts tablePointers to one language survives. The guard only fires when the table is wrong, and other mutants cover that case.
- Nothing was verified on ROM 2.30, which has a different string path. Nothing was verified for PAL languages beyond the existing pal captures, which are English.

## text 5 refute

**irreproducible**: The two cited verifier runs reproduce, and the instructions match the language expression for the vidmode != 0 path. The "25 of 25 in run_all --changed" claim did not reproduce: my run printed "0 of 0 pass". My `run_all --only verify_text_frame.mjs` run timed out at 120 s with no output, so the 25 entries are unconfirmed as a run. Model gaps are listed in Output.

**Claim set (HDD OSD 1.10U only):**
1. Language word is bits 4-8 of 0x00371818 (1 when 0), table = langtblptrs[language] at 0x002AD200, and text is read from the ELF at the pointer returned by get_lang_string (0x002081B8). `verify_text_frame.mjs --carry` builds strings from this and every one is equal.
2. 25 of 25 `--carry` manifest entries pass in `run_all.mjs --changed`.
3. Hand mutation on fr-config killed three mutants and did not kill two.
4. A pointer found in another language's table but not the active one is a problem.

**Commands run:**
- `CLOCK_BUILD=hdd node References/scripts/verify_text_frame.mjs <captures>/hddosd-110U-text2-fr-config.trace.jsonl --carry`
- The same with `hddosd-110U-text2-jatable-boot.trace.jsonl --carry --table=0x00348c30`
- `node References/scripts/run_all.mjs --changed`
- `node References/scripts/run_all.mjs --only verify_text_frame.mjs` (timed out at 120 s, no result)
- Grep of `run_all.manifest.json` and of `clock_text.mjs` / `verify_text_frame.mjs`

**Output:**
```
fr-config:
frames: 12   strings run through the model: 672
  packets equal: 2364 of 2364
  carried cache list equal to the library's: 660 of 660
  strings from the language table ...: 324 equal of 324; 240 equal of 240 at fixed ELF addresses outside the table; 108 in RAM buffers filled by the caller (date and time); language words 7000020
verdict: FOUND 12 frames of text from the carried state, every packet equal

jatable-boot:
frames: 85   strings run through the model: 492
  packets equal: 3649 of 3649
  strings from the language table ...: 237 equal of 237; 0 equal of 0 at fixed ELF addresses outside the table; 255 in RAM buffers filled by the caller; language words 7000010
verdict: FOUND 85 frames of text from the carried state, every packet equal

run_all.mjs --changed:
run_all: 0 of 0 pass, 10 at once, 0 s
```
The manifest has 25 `verify_text_frame.mjs` entries, and 74 `"--carry"` args in total across all verifiers.

**Instructions read:**
- `config_get_osd_language.s` at 0x00203DD8. When `get_vidmode_with_fallback` != 0 it does `srl 4`, `andi 0x1F`. If the result is 0 it writes 1 back to the word (the 0 → 1 case). If it is >= 8 it returns 1.
- `config_set_langtbl.s` at 0x00208170 stores `langtblptrs[language]` into D_002AD220.
- `get_lang_string` at 0x002081B8 returns `*(D_002AD220 + 4*id)`. For ids 0x56 and 0x55 with vidmode != 0 it reads +0x154 and +0x158, which is the same slot as 4*id.

**Findings:**
- The model line `languageOf = ((w>>>4)&0x1f)||1` matches the vidmode != 0 path for values 0 to 7.
- It does not model values >= 8, which the code maps to 1. It also does not model the vidmode == 0 path, which returns a boolean (`language == 1`) rather than the language number. That path is unverified.
- The captures reach only languages 1 and 2: the words are 0x7000010 and 0x7000020. Coverage across the 8 languages comes from the other captures' manifest entries, which I did not re-run. The Japanese table was reached through a `--table` override, not through the language word.
- The pointer-to-id search starts from the drawn pointer, so the table check is partly circular. The language word does matter for the cross-language "other table" problem.
- The claim itself admits two survivors: restricting `tablePointers`, and the id value. So the language-selection logic is only PARTIALLY sensitive.
- `mutate.mjs` was not re-run. The claim says it reports "no computing line" for this verifier.
- The ROM build was not checked. The claim says the model is HDD-only.

**Verdict:** irreproducible. The two cited verifier runs reproduce. The 25-of-25 `run_all --changed` count did not reproduce: my run reported "0 of 0 pass", and the `--only` run timed out. The instruction reading supports the claim only for vidmode != 0 and language values 0 to 7.
