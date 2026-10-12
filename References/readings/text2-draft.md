# Text, second round: alpha, the remaining places, ROM 2.30, PAL, languages, the frame model (draft)

## UPDATE 2026-10-03 (text lane, strings from the language table)

- `clock_text.mjs` now reads the language table from the ELF image (`elfImage`, `languageOf`, `languageTable`,
  `langId`, `tablePointers`): language = bits 4 to 8 of the word at `0x00371818` (1 when 0), table =
  `langtblptrs[language]` (`0x002AD200`), string = the ELF's bytes at the pointer `get_lang_string` (`0x002081B8`)
  returns (`table + 4 x id`; ids `0x55`/`0x56` read the same slots through `+0x154`/`+0x158`). `verify_text_frame.mjs --carry`
  reads the language word once, at the capture's first `Font_PutsPackets` (not in the measure probes' ranges), then for every
  string of the frame resolves the argument's pointer to an id of that table and takes the text from the ELF instead of the probe:
  equal on every string of every `--carry` capture (e.g. open: 1 928 table strings, 2 031 fixed ELF strings outside the table such as
  the clock template pieces at `0x00370178..`; fr-config: 324 and 240). A pointer found in another language's table but not the
  active one is a problem (kills a wrong language or table).
- Still from the probe (open): the RAM buffers the callers fill with the date and time (`0x00397B30`, `0x00400750`, `0x00400870`;
  e.g. open: 945 of 4 904, menu: 33 of 110): their content is the console's clock, not probed as state. The caller ids
  themselves are not derived (the id is found from the pointer the caller passed).
- `hddosd-110U-text2-jatable-boot`: D_002AD220 was written alone, so its manifest entry takes `--table=0x00348c30` (must be a
  `langtblptrs` entry); the probes do not hold D_002AD220 and adding a range to PROBES would change the spec of every capture.
- Mutation (`mutate.mjs` finds no arithmetic line in the verifier: the computing is in the model, so by hand on fr-config):
  language shift `>>> 4` to `>>> 5`, table index `+ 1`, string end `+ 1` all give PARTIAL. Not killed: restricting
  `tablePointers` to one language (the guard only fires with a wrong table, which the first two mutants produce), and the id
  value (only its being found matters).

## UPDATE 2026-10-03 (text lane, languages on HDD OSD, Japanese BIOS)

- Writer read first: `config_set_jpn_language` (`0x00203E58`, HDD OSD 1.10U) stores `(v & 0x1F) << 4`
  into bits 4 to 8 of `var_mechacon_config_param_1` (`0x00371818`; mask `-0x1F1`) and
  `config_set_langtbl` (`0x00208170`, called by `main` at `0x0020DAF4` once, and by the language entry's
  save path) copies `langtblptrs[v]` (`0x002AD200`, eight pointers, order Japanese, English, French,
  Spanish, German, Italian, Dutch, Portuguese) into `D_002AD220`. `get_lang_string` (`0x002081B8`) reads
  `D_002AD220` on every call; `config_get_osd_language` (`0x00203DD8`) reads the field. A write of the field
  alone changes only the layout row (hint slots `D_002B2470` + language x 16), not the strings, so the
  stimulus writes both words after the code is loaded: `0x00371818` = `0x07000000 | lang << 4`
  (the captured word is `0x07000010` for English) and `0x002AD220` = `langtblptrs[lang]`.
- Captures (HDD OSD, NTSC, `text_capture.mjs`, `verify_text2.mjs` FOUND on each, every packet, pen,
  place, alpha, panel and entry equal): `hddosd-110U-text2-fr-menu` (72 strings), `-fr-config` (408),
  `-de-menu` (72), `-de-config` (374), `-fr-boot` (326 strings, 20 cache uploads, accents
  uploaded inside the trace), `-de-boot` (342, 22 uploads), `-es-config` (374), `-pt-config`
  (374), `-it-config` (374), `-nl-config` (442). Boot ones: advance 230 frames, write, capture 80.
  The language word probed in the trace is `0x07000020` (French), `0x07000040` (German).
- Strings are UTF-8; the accented letters are in block 0 of FNTOSD. Italian and Dutch tables
  hold `r0.94y+08Visualizzazioney+00r0.00` (id `0x5E`): the `y` escape is used by static
  clock strings in those two languages (the older note that no clock string uses `y` is wrong for them);
  `-it-config` (22 draws) and `-nl-config` (26) are equal, so `y` and `r` are verified there.
- Japanese BIOS `ps2-0210j-20040917.bin` (`text_jprobe.mjs`): HDD OSD does not boot. The EE kernel
  stops at `0x8000E160` from frame 7 to frame 3500 and beyond: `lhu v0,0(0xBA000006); andi v0,2; beqz
  back` (`0x8000E160..0x8000E174`) polls halfword `0x1A000006` bit 1, which reads 0 in the emulator; call
  chain `0x80001024` > `0x8000EB40` > `0x8000E690` > `0x8000E218` > `0x8000E18C` > `0x8000E0D4`. No EE
  thread exists, EELOAD is never reached, the ELF is not entered, 16 IOP modules loaded (last
  `IOP_SIF_manager`), no packet (`ja-boot` capture: 0). Stimulus: a `nop` over the `beqz` at
  `0x8000E174` written at frame 30: 24 IOP modules load (last `SyncEE`), then the EE kernel idles in
  `0x800110AC` (called from the loop at `0x800138FC/0x80013904`, testing `0x800254E4`/`0x800254C0`) until
  frame 6000, again with no thread: the ELF is still not entered. Not pursued further.
- Japanese without the J BIOS: `config_get_osd_language` returns the field, forced to 1 on a
  non-Japanese console, so the field cannot be 0 on the E BIOS; the layout row stays English. Writing the
  Japanese table pointer alone (`0x002AD220` = `0x00348C30`, `hddosd-110U-text2-jatable-boot`, boot,
  advance 230) draws the Japanese strings (`戻る`, `決定`, `本体設定`, `ブラウザ`, `システム設定`) through blocks
  2 (26 x 26 kanji) and 4 (26 x 26 kana) of FNTOSD, 4 bits a pixel: 308 strings, 2 149 glyphs, 777 cache
  uploads, 107 colour-table sends, string, place, alpha equal, FOUND. The pictures the code leaves
  unwritten (13 680 bytes) are not compared. Not verified: a Japanese console's layout row 0 (needs the J
  BIOS), blocks 1, 3 and 5. By the code (`text_blocks.mjs` over all eight tables, every string, escapes
  skipped) the tables use only blocks 0, 2 and 4 (table 0 also the line break `0x0A`, which has no
  glyph and is in list strings not drawn); blocks 1 (157 glyphs), 3 (3 390), 5 (the wide mark) are
  reached by no clock string. JISUCS (`References/dumps/hddosd-host/JISUCS`) was not examined: the tables are UTF-8 and the verified draws need no
  conversion, so it is open (no
  capture of it).
- Manifest: 35 `verify_text2.mjs` entries (all pass, rebuilt by hand: `run_all.mjs --discover --only verify_text2.mjs`
  cannot import it, `verify_text2.mjs` reads `process.argv[2]` at load, finds 0 candidates and drops the verifier's entries),
  11 `verify_text_frame.mjs --carry` entries for the new captures (FOUND, 85 to 87 frames for the boot ones). The three
  `verify_text.mjs rom-0230A-text2-clock/-config/-open` entries (failing since the ROM probes moved to `verify_text2`) removed.
  No verifier changed, so no mutation run.
- Scripts, new: `text_capture.mjs` (capture with `CLOCK_BIOS`), `text_jprobe.mjs` (where the EE is),
  `text_lang_word.mjs` (the language word of a capture), `text_blocks.mjs` (block of each character).

## UPDATE 2026-10-02 (text lane, ROM 2.30 closed at string, place and alpha level)

- `verify_text2.mjs` with `CLOCK_BUILD=rom` passes FOUND on all six captures
  `rom-0230A-text2-config` (372 strings), `-clock` (36), `-open` (1 812), `-menu` (72),
  `-adjust` (336), `-down` (643): opening, page binding, glyph, string level, colour block, measured
  width, place, alpha, panels all equal.
- Trimming branch of `0x0020CBA0` (`0x0020CE44`, taken when `settings+0x14` is set): in every
  capture `settings+0x14 = 1` and `0x00205830` returns 1 (probe block at `0x0027B388`: language 1,
  cached). Read from the code: language 0 trims only when the last code is `0x8141`/`0x8142`,
  language 3 on `0xA3BF`/`0xA1A3`/`0xA1A2`, language 6 on `0xF240`/`0xF3F8`/`0xF3F9`; the codes
  of the strings drawn (bytes below `0x81`, escape results at most 999 or `0x16/0x18/0x19`) can
  never equal one, so the width stands in every language. `romWidth` computes the last code and
  throws if it is ever a double-byte code. The double-byte trimming body itself (width minus
  `2 s0 / 3` or `2 s0 / 5`) is not reached by any capture: open.
- Colour block 1 mismatch of 1 812: not a mismatch; the string was drawn before the capture's first
  `Font_SetColor`. The context is now seeded from the pre-roll `Font_SetColor` and `Font_SetRatio`
  probes: 1 812 of 1 812 equal.
- List entries' alpha (entry alpha at `0x00296B90 + 0x30 i + 0x24` times the list's, strings drawn
  where >= 16, in order) is in `romPlace` and equal on `-open` and `-down` (crossfade).

## UPDATE 2026-10-03 (text lane, PAL closed on both builds at string, place, alpha level)

- DrawIcon PAL branch (`0x00226618..0x00226684`, HDD OSD 1.10U): `is_pal_vmode` = 1 replaces the
  bottom `b` (field `+0x24`, sixteenths) by `dptoli(litodp(t) + dpdiv(dpmul(fptodp((float)(b - t)),
  D_00365580), D_00365588))`, `t` = top (`+0x14`). The constants are read from the ELF in
  `verify_text2.mjs`: `0x3FE14BC6A7333333` (the float 0.5405 as a double) and
  `0x3FDE147AE0000000` (the float 0.47). A 25-wide picture (b - t = 192) sends +28 sixteenths,
  a 28-wide one (224) +33; the truncation is toward zero. Verified: `-pal-menu` 24/24,
  `-pal-clock` 11/11, `-pal-version` 48/48, `-pal-config` 84/84, `-pal-adjust` 22/22, `-pal-down`
  138/138 pictures equal.
- `-pal-version` crash: the capture was truncated (empty trace, no end record; the session had been
  killed), not a verifier fault. Recaptured; verifier unchanged for it.
- New captures (HDD OSD PAL, state `hddosd-1.10U-host-pal-*`): `hddosd-110U-text2-pal-version`,
  `-pal-config`, `-pal-adjust`, `-pal-down`; ROM 2.30 E BIOS: `rom-0230E-text2-pal-menu`,
  `-pal-config`, `-pal-clock`, `-pal-adjust`, `-pal-down`. `verify_text2.mjs` FOUND on all 15
  (HDD 6, ROM 5 with `CLOCK_BUILD=rom CLOCK_VIDEO=pal`); `verify_text_frame.mjs --carry` FOUND on
  the four new HDD PAL captures. ROM PAL: menu line 18 and top `H/2 - 17.25`, hints, list at 0x65,
  clock value, alpha rules: all equal (menu 696/696 glyphs, down 3544/3544).
- Mutation of the PAL branch (by hand, on `-pal-config`): trunc to round, `+` to `-`, `*` to `/`,
  `fround(b - t)` to `b + t`, top shifted by one sixteenth, branch inverted: all killed. Survivors:
  the low mantissa bits of the two constants (one ulp): the two results (220.8 and 257.6 of a
  sixteenth) are not near an integer, so the verifier cannot tell them apart. The bits are read
  from the ELF, not typed.
- Open: the soft-double routines (`dpmul`, `dpdiv`, `dpadd` in `asm/core`) are modelled as
  IEEE round-to-nearest, as the three results allow; their rounding code was not traced bit by bit.
  ROM 2.30's button pictures (position in PAL) are not compared, only the panels' id and alpha.
- Manifest: nine `verify_text2.mjs` PAL entries, six more (`-pal-menu`, `-pal-clock` and four
  `verify_text_frame.mjs --carry`) added by hand because `run_all.mjs --discover` died on files
  other lanes held open (EBUSY). Existing failures not from this lane: `verify_text.mjs` on
  `rom-0230A-text2-clock/-config/-open` (captures carry `verify_text2`'s ROM probes: 0 strings).

## CHECKPOINT (paused 2026-10-02 ~19:00 for the Watson upgrade)

### Done and verified (verifier re-run, every value equal)

Scripts: `References/scripts/verify_text2.mjs` (copy of `verify_text.mjs` extended; the original
is untouched and its verdicts stand), `References/scripts/verify_text_frame.mjs`, model
`References/model/clock_text.mjs`. Captures in `Watson/Runtime/captures/`.

1. **Alpha of every string, HDD OSD NTSC** — rule per caller read and verified
   (`verify_text2.mjs`, `CLOCK_BUILD=hdd`):
   - date/time `func_00230008`, menu items `func_00231E78`, list title `func_00230E10`, entries
     `D_0037029C`/`D_003702A0` × list alpha (checked on every `func_002311E8` call: index, alpha,
     x, y, value y), button panels `func_002269E0` (panel 7 alone / panel 8 / panels 1–6 by
     `func_002326F0`, capped at 128; every `draw_button_panel` call's id and alpha checked),
     arrow pulse `|(int)(sinf(n·0x7AA8/(fps·0x7AA8/60)/10000)·128)|`, version page
     `func_0022A1D8`, clock value = its entry's alpha. `Font_SetColor`'s a3 and the held float
     `a/128` both compared.
   - Captures: `hddosd-110U-text2-menu` (66 strings), `-boot` (314; alphas 11..128 rising),
     `-open` (2 817 strings, menu → System Configuration, every caller's alpha 0..128),
     `-down` (643, list crossfade: entries 16..128, values 48..128, clock value 8..80),
     `-adjust` (308, editing colours), `-version` (156, version page places too), `-clock` (36).
     All: string, glyph, place, alpha, panels, entries equal.
2. **Places of the remaining HDD callers (NTSC)**: list entry while edited `0x2312D0`, values
   `0x231354` (centred on 430 at the value line), arrow `0x231624`, clock value fields /
   separators / AM-PM (`clock_str_related`: from x − half the cached template width
   `D_00370158`, advancing by `func_00213E90` = (int)((int)(reach − start) + pitch × scale), two
   spaces' width after the date), version page (title centred on 404, labels right-aligned on
   391, values at 417, rows from `rec[0x14]−2` at `top−17` stepping 11, colours by selection and
   row flag). All equal in the captures above.
6. **Escapes `y`, `s`, `a`, decorations, clip**: closed from the code, no capture needed.
   Static strings use only `r`, `o`, `p` and (Browser CD-player labels only, not the clock
   module) `y`; `a` and `s` appear in no string; `c` only through a Browser format string. The
   decoration flag (`own+0x1C`, set only by `func_002129D8`) and clip (`own+0x20`,
   `func_00212808/18`) are written only by `func_00263070`/`func_0026AC40`/`func_0026B458`
   (software keyboard / text entry, called from the Browser); the clock module never sets them.
   Line break: no string drawn in the captures holds one.
7. **`References/model/clock_text.mjs`**: carries the library context (cache LRU list per
   `_scePFont_Putc` 0x00291894..0x00291978, cells, block layout, set-up flag, packet room 0x1FF
   with a 4-quadword head, give-up-and-continue) across characters, strings and frames.
   `verify_text_frame.mjs --carry` (context read ONCE at the capture's first character):
   menu 770/770 packets, boot 3 599/3 599, open 10 552/10 552, down 4 710/4 710, adjust
   1 386/1 386, version 1 488/1 488, clock 384/384; carried cache list equal to the library's at
   every string (99 … 4 799 checks). Not yet: building the string list itself (texts and places)
   from the frame's state inside the model; the strings' own font state is taken from each
   string's probe.

### Partly done

3. **ROM 2.30 string and place levels** (`verifyRom2` in `verify_text2.mjs`, ROM probes
   `ROM_PROBES`): captures `rom-0230A-text2-config`, `-clock`, `-open`. Equal so far: openings,
   page bindings, glyphs, **string level** (set, index, fixed width, pen: 1 164 / 286 / 4 792 of
   as many), colour block = setters (one mismatch of 1 812 in `-open`, not looked at), ROM alpha
   for date, menu, title, hint panels (`-open`: 660/660; panels 106/106). Not passing yet:
   - the measure model `romWidth` throws on `settings+0x14 != 0` (the trimming branch of
     0x0020CBA0 at 0x0020CE44): it runs only for the languages 0x00205830 returns 0, 3 or 6; the
     language is not in the probes → add a range for it (0x00205830 → 0x002053A0, not read yet)
     or take English; until then widths are NaN and the place level fails (48/216, 22/33,
     172/1010).
   - the list entries' alpha: the entry list must be "alpha ≠ 0" for values and "≥ 16" for the
     entry strings (draw_menu_item); the clock value's alpha is entry 0's. Half-written in
     `romPlace`.
   - ROM menu items, hints, list, clock value rules are written (ROM addresses: menu
     0x0022E3E0, hints 0x00221E48, list 0x0022D728, clock value 0x00222830; ramps E04 0x0028B00C,
     E78 0x0028B070, R3000 0x0028B110, 46B8 0x00293BA8, 46D0 0x002953F0, 5780 0x00296740; gp
     0x002CFEF0: tail gp−0x75FC, offsets gp−0x7600/−0x75EC, weight gp−0x6F80) but untested.
   - Build differences found while reading (not yet measured): ROM panels drop an alpha under
     128 (HDD caps at 128); ROM panel 8 returns without panels 1–6; ROM menu line 18 in PAL and
     top `H/2 − 17.25` in PAL (HDD 16 and 14); ROM hint y without the +1; ROM measures the clock
     template every frame (HDD caches it) and advances fields by their measured width.
4. **PAL**: `hddosd-110U-text2-pal-menu` and `-pal-clock`: every string, place and alpha equal;
   only DrawIcon fails: in PAL the button picture's bottom is scaled (DrawIcon 0x00226618: PAL
   branch through `litodp` from 0x00226630, not read yet; sent +1.75 px for a 12-px picture).
   `-pal-version` crashes the verifier (not diagnosed).

### Not started

5. **Languages**: plan: European language by writing the language field (bits 4–8 of
   `var_mechacon_config_param_1` 0x00371818; on a non-Japanese console field 0 is forced to 1 by
   `config_get_osd_language` 0x00203DD8, so Japanese needs a J BIOS: megadump has up to
   `ps2-0210j-20040917.bin`; untested whether HDD OSD boots on it). The read of 0x00371818 from
   the menu state was queued and cancelled by the pause.

### Next, in order

1. ROM: language range or English assumption for the measure; entry alpha list; rerun
   `rom-0230A-text2-config/-clock/-open`; capture `rom-0230A-text2-menu` (failed on a
   `with_emulator.mjs` race: ENOENT on `emulator.slot-0/owner` between mkdir and write),
   `-adjust`, `-down`.
2. PAL: read DrawIcon's PAL branch; fix; diagnose `-pal-version`; capture `-pal-config`,
   `-pal-adjust`, `-pal-down`; ROM PAL (`rom-0230E`).
3. Languages (French/German by memory write on HDD OSD; Japanese on a J BIOS).
4. `clock_text.mjs`: build the frame's string list from state (needs the language table: the
   current table pointer is `D_002AD220`, entries are string pointers into the ELF).
5. Report.

Capture commands (scratchpad `text/tcap2.mjs`, each through `with_emulator.mjs`):
`CLOCK_BUILD=hdd|rom [CLOCK_VIDEO=pal] node tcap2.mjs verify_text2.mjs <state|boot> <name> <frames> [hold] [presses] [writes] [advance]`,
e.g. `... config rom-0230A-text2-down 40 - '[[["down"],6,0]]'`. Running at pause: only
`hddosd-110U-text2-close` (100 frames, chain2), left to finish; chain3/chain4 queued sessions
were stopped before they started.

### Limits hit

- 8 ranges per probe (the HDD panels probe uses all 8); 32 probes per capture (HDD uses 13, ROM 14).
- Config-screen traces are slow (100 frames ≈ 15–25 min with 5 emulators).
- `with_emulator.mjs` race (ENOENT reading `owner`) killed one session.
