# The start state's fields by origin

Read on **HDD OSD 1.10U** (`hddosd.elf`, SHA-1 `e932f350...`), disassembly `D:/CodingProjects/CrystalOSD/asm/`,
2026-10-04. Produced by `References/scripts/start_origins.mjs` (field table: `node start_origins.mjs --fields`;
the piece table below: `--md`; writers: `--writers`). The script prints the same text on every run.
This page is a reading, not a fact: no verifier recomputes the init functions yet.

## What was compared

Four snapshots, each the clock's state at the entry of one frame, taken from Watson captures:

| JSON | capture, frame | what it is |
|---|---|---|
| `resources/clock/start.json` (`start`) | `hddosd-110U-whole3-clock` f0 | the clock running, counter 1940 |
| `resources/clock/start-boot.json` (`boot`) | `hddosd-110U-whole-boot-opening` f0 | the clock's first frame after the opening: counter 0, mode 2, `wide` = 1, camera offset -100.0 |
| `resources/menus/start-menu.json` (`menu`) | `hddosd-110U-whole3-menu` f0 | main menu on screen, counter 1471 |
| `resources/menus/start-clock.json` (`sqr`) | `hddosd-110U-whole3-square` f56 | System Configuration open, counter 1809 |

A field is one leaf of a piece (a piece is a named range of `clock_memory.mjs` `LAYOUT`, decoded by `PIECES` of
`tools/scene/instrument.mjs`; the byte offset of a leaf is found by changing one byte and seeing which leaf moves).
3813 fields in 89 pieces: 3324 in 86 `LAYOUT` pieces, plus `textRamps` (44), `listFade` (3) and `font` (442), which
have no `LAYOUT` entry (the addresses of the first two come from `tools/scene/export_fixture.mjs`).

The ELF has one PT_LOAD (va `0x200000`, size `0x3AE819`) and no section headers; `.bss` is materialised as zeros
in the file. Sections come from `CrystalOSD/OSDSYS_link.ld`: `.data` `0x2A47A0..0x3477E0`, `.rodata` to `0x36F980`,
`.sdata` to `0x3709A0`, `.sbss` to `0x370C98`, `.bss` from `0x370C98`. Addresses below `0x200000` (low memory:
screen, display environments, previous module, drive state, RTC mirror) are not in the image: no ELF value.

Writer search (read): a register-tracking pass over every function of `CrystalOSD/asm` (`lui`/`addiu` of
`%hi`/`%lo`/`%gp_rel` of a block or `(0xADDR & 0xFFFF)`, then `sw/sh/sb/swc1/sq` at an offset; 18788 events), then
the functions that are handed a block's address were read by hand. It does not follow stores through a pointer
loaded from memory, and it follows the uncached alias `0x2000xxxx` only where the source names it. A field is
called ELF-constant only when no store to it was found; that is a statement about the search, not a proof.

## Result

| origin class | fields | of which ELF = all JSONs |
|---|---|---|
| ELF-constant (no store found) | 281 | 281 |
| init-writer (set once when the clock module starts; function in the table) | 159 | 72 |
| per-frame-state (depends on the frames that ran, on menu input, or is rewritten each draw) | 3332 | 163 |
| opening-hand-off | 1 | 0 |
| external (RTC, console settings, drive, controller, video mode) | 37 | 13 |
| no writer found | 3 | 3 |
| total | 3813 | 532 |

`init-writer` by function: `func_00227F08` 71, `func_002324C8` 48, `do_load_font` 13, `func_0022EF40` 8,
`func_00234B88` 7, `func_0022A9C0` 4, `InitDraw` 4 (boot-level), `clock_stuff1` 2, `func_00232858` 1,
`func_00238F20` 1. Per-frame-state is dominated by `rings` (2471 leaves) and the font glyph cache (429 leaves);
the other 432 are the clock's own state, ramps, records and menu state.

Only 532 of 3813 fields equal the ELF value in all four JSONs: 281 ELF-constant, 163 per-frame fields that happen to
be at rest, 72 init-writer fields, 13 external, 3 without writer. Everything else needs an init writer, an input or
frames.

## Every piece

`fields` = leaves; `ELF = JSON` = leaves equal to the image in all JSONs that hold the piece. Writers are
HDD OSD 1.10U addresses. The per-leaf list (address, section, ELF value, the four JSON values, equal or not,
class) is `node start_origins.mjs --fields` (3813 lines), one piece with `--piece <name>`.

| piece | address | section | fields | ELF = all JSON | classes (fields) | writers |
|---|---|---|---|---|---|---|
| time | 0x409230 | .bss | 4 | 0 | external: 4 | init func_00235848 (0x235848, called by module_clock_init_resources) -> func_002358F8 (0x2358F8) stores seconds/minutes/hours/day/month/year from rtcMirror (0x1F0D1C..0x1F0D30) and clears ms; per frame func_00235B10 (0x235B10) adds the frame period to ms and resyncs to the RTC |
| eased | 0x370a98 | .sbss | 4 | 0 | per-frame-state: 4 | init func_0022E9C8 (0x22E9C8, from func_0022EF40) sets the hands from the time; per frame func_0022EBD0 (0x22EBD0); module_clock_22F760 (0x22F760) stores the fraction (+8) |
| state | 0x404f70 | .bss | 140 | 12 | per-frame-state: 140 | init func_0022EF40 (0x22EF40): +0x250/+0x260 from D_002B5660/D_002B5650, per rod +0x10 and +0x14 = 0, +0x20 base colour from the table, current rod from the time (func_0022E9C8); per frame func_0022F1A0 (+0x10, +0x14), func_0022EBD0 (+0, +4, +6, +0x270), func_0022EE20 (+0x280..0x290), func_0022E8C0 (colour chase via func_00238D00) |
| appearance | 0x2b5640 | .data | 4 | 1 | init-writer(func_0022EF40): 1; per-frame-state: 3 | init func_0022EF40 stores length = D_003702E8 (set to 1 by func_00234B88); per frame func_0022F1A0 ticks it; func_0022F078/func_0022F110 start it |
| colours | 0x2b5600 | .data | 16 | 13 | per-frame-state: 16 | func_0022EAD0 (0x22EAD0) and func_0022EB50 (0x22EB50) pick the next table entry, func_00238D00 chases the colour; called per frame by func_0022EE20 |
| cycleCounters | 0x370268 | .sdata | 5 | 1 | per-frame-state: 5 | func_0022EAD0 (+0, +4), func_0022EB50 (+8, +0xC), func_0022EE20 (+0x10); per frame |
| cycleTables | 0x2b5570 | .data | 36 | 36 | ELF-constant: 36 | none found (func_0022EAD0/func_0022EB50 read it) |
| logicConstants | 0x36fbcc | .sdata | 3 | 3 | ELF-constant: 3 | none found |
| scene | 0x2b2170 | .data | 3 | 1 | per-frame-state: 3 | scale: module_clock_225D98 (0x225D98) stores 1.0 at thread start, func_00232640 (0x232640) per frame; leaving (+4): clock_input_check_handler_p6_p7_tgt (0x2259B8) clears at entry, sets at exit; field (+8): the same handler copies evenOddField (0x1F0CA4) each frame |
| scaleTarget | 0x370294 | .sdata | 1 | 1 | per-frame-state: 1 | clock_config_change_cb_clock, D_00227BE8, func_0022D760, func_0022D828, D_00226FD0 (menus, first run, Clock Adjustment) |
| scaleFactor | 0x36fc10 | .sdata | 1 | 1 | ELF-constant: 1 | none found |
| timeFilled | 0x370324 | .sdata | 1 | 0 | per-frame-state: 1 | func_002358F8 clears it (init and RTC resync); func_00235B10 sets it to 1 after the first resync |
| mode | 0x370ab4 | .sbss | 1 | 0 | per-frame-state: 1 | init func_00234B88 (0x234B88) stores 0, then module_clock_init_resources calls func_00234C28 (0x234C28) with 2; per frame func_00234EA8 (0x234EA8) |
| level | 0x370aa4 | .sbss | 1 | 0 | per-frame-state: 1 | init func_002324C8 (0x2324C8) stores 0; per frame func_00232640 |
| overlayLevel | 0x370ab8 | .sbss | 1 | 0 | per-frame-state: 1 | func_00234B88 (0), func_00234C28, func_00234EA8 (per frame) |
| vignetteRamp | 0x2b5f20 | .data | 4 | 1 | init-writer(func_00234B88): 1; per-frame-state: 3 | init func_00234B88 stores length = fps*80/60 and resets (func_00234AB0); per frame module_clock_234E70 / func_00234D18 tick it |
| vignetteLength | 0x3702e4 | .sdata | 1 | 0 | init-writer(func_00234B88): 1 | func_00234B88 stores fps*80/60 (fps 50 PAL, 60 NTSC) |
| menuRamp | 0x2b5780 | .data | 4 | 0 | init-writer(func_002324C8): 1; per-frame-state: 3 | init func_002324C8 stores length = body + fps/6; func_002324C8 (+0 write only at init), menu code ticks it |
| tail | 0x3702d0 | .sdata | 1 | 0 | init-writer(func_002324C8): 1 | func_002324C8 stores fps/6 |
| counter | 0x3702d4 | .sdata | 1 | 0 | per-frame-state: 1 | func_00232858 (0x232858) zeroes it at init; func_00232878 (0x232878) adds 1 per frame |
| proportions | 0x2b217c | .data | 2 | 0 | init-writer(clock_stuff1): 2 | clock_stuff1 (0x225958), run at each start of the clock thread: ax = 1.0, ay = D_0036FB84 or D_0036FB88 by is_pal_vmode |
| position | 0x2b2190 | .data | 4 | 4 | ELF-constant: 4 | none found (module_clock_225F38 reads it) |
| direction | 0x2b21a0 | .data | 4 | 4 | ELF-constant: 4 | none found (read by module_clock_225F38 / module_clock_238DC0) |
| up | 0x2b21b0 | .data | 4 | 4 | ELF-constant: 4 | none found |
| rotation | 0x2b21c0 | .data | 4 | 4 | ELF-constant: 4 | none found |
| cameraOffset | 0x370a80 | .sbss | 1 | 0 | per-frame-state: 1 | init module_clock_init_resources (0x225DB0) stores -100.0; per frame module_clock_225F38 (0x225F38) multiplies by 0.97 |
| zmax | 0x36fb8c | .sdata | 1 | 1 | ELF-constant: 1 | none found |
| cameraFactor | 0x36fb90 | .sdata | 1 | 1 | ELF-constant: 1 | none found |
| greyRamp | 0x2b5cd0 | .data | 4 | 1 | init-writer(func_00232858): 1; per-frame-state: 3 | init func_00232858 stores length = D_003702E0; per frame func_00233258 / func_002331C8 / func_00233210 |
| greys | 0x370aa8 | .sbss | 3 | 0 | per-frame-state: 3 | func_00232858 zeroes at init; func_00233258 per frame |
| ringRecord | 0x2b5f70 | .data | 6 | 5 | per-frame-state: 3; ELF-constant: 3 | func_00234D60 (0x234D60) stores alpha, cx, cy; rx, ry, z: none found |
| tint | 0x2b21e0 | .data | 15 | 11 | ELF-constant: 11; per-frame-state: 4 | module_clock_226000 (0x226000) stores +0x20..+0x2C from the screen size at each draw |
| blurRecord | 0x2b6120 | .data | 15 | 11 | ELF-constant: 11; per-frame-state: 4 | func_00236490 (0x236490) stores +0x20..+0x2C at each draw |
| copyRecord | 0x2b6060 | .data | 15 | 11 | ELF-constant: 10; per-frame-state: 5 | func_00236230 (0x236230) stores +0x20..+0x2C and +0x34 at each draw (uncached alias 0x2000xxxx) |
| fadeRecord | 0x2b5f30 | .data | 15 | 12 | per-frame-state: 8; ELF-constant: 7 | func_00234C28 (+0x20, +0x24, colour), func_00234E08 (0x234E08, +0xC alpha, per frame) |
| bars | 0x2b2220 | .data | 15 | 12 | ELF-constant: 10; per-frame-state: 5 | func_00226158 (0x226158) stores +0x14, +0x20, +0x24 at each draw |
| column | 0x2b2500 | .data | 15 | 12 | ELF-constant: 10; per-frame-state: 5 | func_00226A88 (0x226A88) stores +0x10, +0x20, +0x24 at each draw |
| template | 0x2b5490 | .data | 41 | 18 | per-frame-state: 41 | module_clock_22F5D0 (0x22F5D0) rewrites the rod record for each of the twelve rods; module_clock_22F760 (orbs), module_clock_22FE98 (0x22FE98); helper module_clock_22F380 is handed the record |
| rings | 0x2b6200 | .data | 2471 | 0 | per-frame-state: 2471 | init func_00239E60 (0x239E60) zeroes head/count/full of the seven rings (called from func_0022EF40); module_clock_22F908 / module_clock_239E98 push one entry per orb call |
| spriteFade | 0x2b61b0 | .data | 4 | 0 | init-writer(func_00238F20): 1; per-frame-state: 3 | init func_00238F20 (0x238F20, from func_0022EF40) stores length = fps*256/60, resets, starts rising; module_clock_239078 ticks it |
| clearColour | 0x2b21d0 | .data | 4 | 4 | ELF-constant: 4 | none found (func_002341C8 reads it) |
| display | 0x1f0a70 | lowmem | 4 | 0 | init-writer(InitDraw): 4 | boot-level InitDraw (0x20BD58, called from main) -> sceGsSetDefDBuff (0x289018) -> sceGsSetDefClear (0x288E28): clear colour 0; not run by the clock module |
| tubeConstants | 0x36fc14 | .sdata | 8 | 8 | ELF-constant: 8 | none found |
| orbConstants | 0x36fbdc | .sdata | 2 | 2 | ELF-constant: 2 | none found |
| orbColour | 0x2b5670 | .data | 4 | 4 | ELF-constant: 4 | none found (module_clock_22F908 reads it) |
| screen | 0x1f0cb4 | lowmem | 2 | 0 | external: 2 | boot-level InitDraw (0x20BD58): width 640, height 0xE0 (NTSC) or 0x100 (PAL) by is_pal_vmode_p9_tgt |
| index | 0x1f0ca0 | lowmem | 1 | 0 | per-frame-state: 1 | InitDraw stores 1; SwapBuffers toggles it each frame |
| item0 | 0x409130 | .bss | 1 | 1 | ELF-constant: 1 | none found directly (config_item_change_cb_clock_write_mechacon and config_save_clock_osd are handed the block) |
| configItems | 0x409130 | .bss | 20 | 12 | no-writer-found: 3; external: 17 | config_load_clock_osd (0x234F88): items 1-4, 6-11, 13-19 stored (items 9, 10, 11 are the time-of-day fields of the settings; run by func_00234F78 from module_clock_init_resources); items 0, 5, 12 are not stored there |
| mechaconParam | 0x371818 | .bss | 2 | 1 | external: 2 | config_first (0x203BF0, reads the console settings) and config_set_* (0x203xxx): language, aspect, time zone, summer time, date format |
| videoMode | 0x2ad228 | .data | 1 | 0 | external: 1 | handle_get_vidmode (0x20823C) reads rom0:ROMVER once and caches it |
| wide | 0x1f064c | lowmem | 1 | 0 | opening-hand-off: 1 | opening_transition_to_clock (0x21AEE4: stores 1 when the opening hands off to the clock), main (0x20E04C), clock_input_check_handler_p6_p7_tgt (0x225CCC at exit), browser_exit_previous_module |
| orbRandom | 0x405210 | .bss | 7 | 0 | init-writer(func_0022EF40): 7 | func_0022EF40 (0x22EF40) draws seven rand() values (newlib LCG); the values depend on the rand state when the clock starts |
| orbColours | 0x2b5680 | .data | 28 | 28 | ELF-constant: 28 | none found (module_clock_22F908 reads it) |
| pad | 0x370330 | .sdata | 4 | 3 | external: 4 | init func_00235E98 (0x235E98) zeroes D_00370334/38; per frame func_00235EB0 (0x235EB0) stores held/pressed/released/repeating from the controller |
| disc | 0x1f000c | lowmem | 1 | 0 | external: 1 | cdvd_handler_proc_prechk (0x211FD4), override_illegal_disc_type (0x211930), main (0x20DCA8) |
| screenCode | 0x370a7c | .sbss | 1 | 0 | per-frame-state: 1 | clock_input_check_handler_p6_p7_tgt (0x2259B8): disc state at entry or 0x64 when entered from the opening (wide = 1), then per disc-state change |
| configPage | 0x2b2de8 | .data | 14 | 8 | ELF-constant: 5; init-writer(func_00227F08): 1; per-frame-state: 6; init-writer(func_002324C8): 2 | func_00227F08 (0x227F08, via func_00228220 from func_002324C8) stores count (+8) and selected (+0x10); func_002324C8 stores level (+0x18) and ramp length (+0x1C); browser_str_related2 stores titleWidth (+0xC) at the first draw; func_002316B8, func_00231B38, func_00230F48 / func_00230FD8 (selected, ramp, glow) |
| configRamp | 0x2b2e04 | .data | 4 | 1 | init-writer(func_002324C8): 1; per-frame-state: 3 | init func_002324C8 (length = D_003702E0 + body + fps/6); func_00230F48 resets; func_00234A98..func_00234B10 ramp helpers tick it |
| configEntries | 0x2b2bf0 | .data | 126 | 106 | ELF-constant: 56; init-writer(func_00227F08): 70 | func_00227F08 (0x227F08) copies the entry templates D_002B2E88, D_002B2EC0, D_002B2EF8, D_002B2F30 .. into the list from entry 3 on, by config items (0x13 ...); entry fields changed by the input handlers are written through pointers: writer not found |
| mainMenu | 0x2b2e60 | .data | 10 | 6 | ELF-constant: 5; per-frame-state: 4; init-writer(func_002324C8): 1 | func_002324C8 stores ramp length (+0x18) = fps/6; the menu input handlers write selected through a pointer: writer not found |
| versionRamp | 0x2b3000 | .data | 4 | 3 | init-writer(func_0022A9C0): 1; per-frame-state: 3 | init func_0022A9C0 (0x22A9C0, from func_002324C8) stores length = tail; func_0022A360 / func_0022A9C0 reset |
| dialogRamp | 0x2b46b8 | .data | 4 | 4 | per-frame-state: 4 | func_0022D558 (reset), func_0022D5A0, func_0022D5D8, func_0022D6A8 (menus) |
| firstRunRamp | 0x2b46d0 | .data | 4 | 4 | per-frame-state: 4 | func_0022D760, func_0022D828, oobe_handler (first-run path) |
| pagePointers | 0x3701c0 | .sdata | 5 | 4 | init-writer(func_0022A9C0): 1; ELF-constant: 3; per-frame-state: 1 | func_0022A9C0 (0x22A9C0) copies the page template D_002B2F90 (30 entries of 0x54 bytes) to D_00404370 and stores the pointer; func_0022ABC8 / func_0022AD50 store the answered page (+0x10) |
| entryActive | 0x3702c8 | .sdata | 1 | 1 | per-frame-state: 1 | func_00231C50 (0x231C50) |
| menuLengths | 0x3702e0 | .sdata | 3 | 0 | init-writer(func_00234B88): 3 | func_00234B88 stores +0 = fps*40/60, +4 = fps*80/60, +8 = 1 |
| listConstants | 0x36fc00 | .sdata | 4 | 4 | ELF-constant: 4 | none found |
| adjustFields | 0x2b2580 | .data | 18 | 18 | per-frame-state: 18 | func_00226E68 (0x226E68) stores the six fields (item, lowest, highest) when Clock Adjustment opens; values equal the ELF in all captures |
| configGate | 0x370300 | .sdata | 1 | 1 | per-frame-state: 1 | func_00234F78 (0x234F78, init) stores 1; func_00234F50 / func_00234F58 / func_00234F68 store 0, -1, 1 while entries are open |
| configDirty | 0x370304 | .sdata | 3 | 3 | per-frame-state: 3 | config_mark_dirty (0x2352C0), config_save_clock_osd (0x2352D0), set_ps1drv_config_dirty (0x235438), func_00235448 / func_00235518 / func_00235570 |
| rtcMirror | 0x1f0d1c | lowmem | 6 | 0 | external: 6 | func_00200F88 (0x200F88) defaults to 2000-01-01 00:00:00; func_00200FC0 (0x200FC0) reads the RTC; config_item_change_cb_clock_write_mechacon (0x235170) writes it back on a Clock Adjustment confirm |
| cubeList | 0x3702a8 | .sdata | 6 | 6 | per-frame-state: 6 | func_00231B38 (0x231B38), module_clock_230550 (0x230550), func_00230860 (0x230860) |
| cubeColours | 0x2b5750 | .data | 12 | 12 | per-frame-state: 12 | D_00230410 / module_clock_2308F0 (0x2308F0) hand it to the colour chase func_00238D00; values equal the ELF in all captures |
| cubeRecord | 0x2b5af0 | .data | 41 | 19 | per-frame-state: 41 | module_clock_2306B0 (0x2306B0) and module_clock_2308F0 rewrite the cube record for each cube |
| spin | 0x370290 | .sdata | 1 | 0 | per-frame-state: 1 | init func_002324C8 stores 0; per frame func_00232640 |
| cubeConstants | 0x36fbe8 | .sdata | 6 | 6 | ELF-constant: 6 | none found |
| centreFactors | 0x36fc50 | .sdata | 2 | 2 | ELF-constant: 2 | none found |
| cubeView | 0x4090f0 | .bss | 16 | 12 | init-writer(func_002324C8): 16 | func_002324C8 calls sceVu0UnitMatrix on it |
| cubeScreen | 0x4090b0 | .bss | 16 | 9 | init-writer(func_002324C8): 16 | func_002324C8 calls sceVu0ViewScreenMatrix on it (constants 2048, 1.0, 512 and D_0036FC0C, 65536.0) |
| layerClear | 0x2b5cc0 | .data | 4 | 4 | per-frame-state: 4 | module_clock_2308F0 hands it to func_002342F0; values equal the ELF in all captures |
| addRecord | 0x2b5fe0 | .data | 15 | 11 | ELF-constant: 11; per-frame-state: 4 | func_00236110 (0x236110) stores +0x20..+0x2C at each draw |
| halfRecord | 0x2b6020 | .data | 15 | 11 | ELF-constant: 11; per-frame-state: 4 | func_00236198 (0x236198) stores +0x20..+0x2C at each draw |
| chainRecord | 0x2b60e0 | .data | 15 | 11 | ELF-constant: 11; per-frame-state: 4 | func_00236350 (0x236350) stores +0x20..+0x2C at each draw |
| body | 0x3702cc | .sdata | 1 | 0 | init-writer(func_002324C8): 1 | func_002324C8 stores fps*40/60 |
| cubeRamp | 0x2b5740 | .data | 4 | 2 | init-writer(func_002324C8): 1; per-frame-state: 3 | init func_002324C8 stores length = body; func_00230380 / func_002303C8 / module_clock_2308F0 / module_clock_230C00 start and tick it |
| textRamps | 0x2b2e04 | .data | 44 | 17 | init-writer(func_002324C8): 8; per-frame-state: 32; init-writer(func_00234B88): 2; init-writer(func_0022A9C0): 2 |  |
| listFade | 0x37029c | .sdata | 3 | 3 | per-frame-state: 3 |  |
| font | - | font library (EE heap) | 442 | 0 | per-frame-state: 429; init-writer(do_load_font): 13 |  |

## The init functions (HDD OSD 1.10U)

The clock is a thread (`module_clock_thread_proc`) created once by `module_clock_setup`. The init below runs at
every start of the clock thread (hand-off from the opening, exit from the browser or a menu), not once per boot.
Order, as read (fields of the four JSONs in bold):

| address | function | writes | caller, when |
|---|---|---|---|
| `0x20D4D0` | `main` | `wide` (0x1F064C) at `0x20E04C`, `0x20E060`; calls the boot-level functions below | OSD boot |
| `0x20BD58` | `InitDraw` | **screen**: 640 x 0xE0 (NTSC) or 0x100 (PAL, `is_pal_vmode_p9_tgt`); **display** environments (`sceGsSetDefDBuff` 0x289018, clear colour 0 by `sceGsSetDefClear` 0x288E28); **index** = 1 | `main`, boot |
| `0x208238` | `handle_get_vidmode` | **videoMode** (0x2AD228): reads `rom0:ROMVER` once | on demand, cached |
| `0x203BF0` | `config_first`, `config_set_*` | **mechaconParam** (0x371818: language, aspect, time zone, summer time, date format) | OSD boot |
| `0x200F88`, `0x200FC0` | RTC default, RTC read | **rtcMirror** (0x1F0D1C..0x1F0D30): 2000-01-01 00:00:00 by default, then the console RTC | OSD boot, on demand |
| `0x225900` -> `0x225890` | `module_clock_setup` -> `module_clock_prepare` | `CreateThread(module_clock_thread_proc, 0x225D30)`, `StartThread` | `handle_version_info` at `0x20AA7C` |
| `0x225D30` | `module_clock_thread_proc` | `module_clock_23A068` (0x23A068: D_00370344 = 0, unit matrix D_0041EAB0, `func_00239F48`), `module_clock_225D98` (0x225D98: **scene.scale** = 1.0); then loops `clock_stuff1` and the handler | thread start |
| `0x225950` | `clock_stuff1` | `sceGsResetPath`, `sceDmaReset(1)`; **proportions**: ax = 1.0, ay = D_0036FB84 (PAL) or D_0036FB88 | each loop of the thread |
| `0x2259B8` | `clock_input_check_handler_p6_p7_tgt` | clears 0x1F0644 and **scene.leaving** (+4); calls init resources; `StartFrame`; **scene.field** (+8) = evenOddField; **screenCode** (0x370A7C) from the disc state, 0x64 when `wide` = 1; then the frame loop and the exit switch | each loop of the thread |
| `0x225DB0` | `module_clock_init_resources` | the sequence below; **cameraOffset** = -100.0 (`0xC2C80000`, its last store) | the handler, once per thread loop |
| `0x238F10` -> `0x238EA0` | | `sceGsSyncPath`, GS DMA registers 0x10009020, 0x10009030, 0x1000E010, 0x10009000 for D_002A5720 | step 1 |
| `0x235E98` | `func_00235E98` | zeroes D_00370334, D_00370338, D_00370AD0, D_00370AD4 (pad history); **pad** is then read per frame by `func_00235EB0` | step 2 |
| `0x235848` | `func_00235848` | **time** via `func_002358F8` (0x2358F8: seconds, minutes, hours, day, month, year from **rtcMirror**; ms = 0; **timeFilled** = 0); time-zone struct at 0x409230 + 0x1C and + 0x20; `module_clock_set_anim_offset`; D_00370328 = 1000 / fps (the frame period; fps 50 PAL, else D_0036FC34) | step 3 |
| `0x234F78` | `func_00234F78` | **configGate** = 1, then `config_load_clock_osd` (0x234F88: **configItems** 1-4, 6-11, 13-19 from the console settings and the RTC) | step 4 |
| `0x234B88` | `func_00234B88` | **menuLengths** +0 = fps*40/60, +4 = fps*80/60, +8 = 1; **mode** = 0; g_clock_should_render_orbs = 0; **vignetteRamp** length = fps*80/60 and reset (`func_00234AB0`); **vignetteLength**; **overlayLevel** | step 5 |
| `0x2334A8`, `0x2347D8` x 10 | `clock_load_texture`, texture loads | GS memory uploads (not EE fields): the clock's textures; `func_002344F8` decodes them | steps 6, 7 |
| `0x226B10` | `do_load_font` | **font** library context (`Font_Load`): format, cell size, cell count, texture, table | step 8 |
| `0x22EF40` | `func_0022EF40` | **appearance** length = D_003702E8; **state** +0x250 and +0x260 (accent colours from D_002B5660), per rod +0x10 and +0x14 = 0, +0x20 base colour (D_002B5660 for the current rod, else D_002B5650); **orbRandom** = seven `rand()` draws; calls `func_0022E9C8` (0x22E9C8: **state** current rod = hours mod 12, **eased** hands from the time), `func_0022EF20` (`func_0022EBD0` time to angles, `func_0022EE20` colours: **colours**, **cycleCounters**), `func_00239E60` (0x239E60: zeroes head, count, full of the seven **rings**), `func_00238F20` (0x238F20: **spriteFade** length = fps*256/60, reset, rising) | step 9 |
| `0x2324C8` | `func_002324C8` | **cubeScreen** (`sceVu0ViewScreenMatrix`, constants 2048.0, 1.0, 512.0, D_0036FC0C, 65536.0), **cubeView** (`sceVu0UnitMatrix`), **spin** = 0, **level** = 0, **body** = fps*40/60, **cubeRamp** length = body, **menuRamp** length = body + fps/6, **configPage** level (+0x18) = 0 and ramp length (+0x1C) = D_003702E0 + body + fps/6, **tail** = fps/6, **mainMenu** ramp length (+0x18) = fps/6; calls `func_00228220` -> `func_00227F08` (0x227F08: **configEntries** from entry 3, **configPage** count and selected), `func_0022A9C0` (0x22A9C0: **versionRamp** length = tail, copies the page template D_002B2F90 to D_00404370, **pagePointers**[0]), `func_00234AB0` (mainMenu ramp reset), `enter_clock_module_208378`; then `func_0022D760` (first-run path) when that returns 1, else two sound commands (0x6150, 0x6140) | step 10 |
| `0x232858` | `func_00232858` | **greyRamp** length = D_003702E0, **greys** = 0, **counter** = 0 | step 11 |
| `0x22CB50` | `func_0022CB50` | font width cache D_00404F48 per language (text layout; **configPage.titleWidth** is computed later from it) | step 12 |
| `0x234C28` | `func_00234C28(2)` | **mode** = 2, **overlayLevel**, **fadeRecord** (+0x20, +0x24 from the screen size, colour) | step 13 |

Writes of the init outside the JSON fields, which a cold start also needs: D_00370328 (frame period), D_004051F0
and D_00405200 (cycling-colour scratch of `func_0022EE20`), D_00370334, D_00370338, D_00370AD0, D_00370AD4 (pad
history), D_003702E8 = 1 (source of the appearance length), D_00404F48 (font widths), D_00404370 (page copy), GS
memory (textures, font texture).

Per frame (`clock_orb_rendering_func`, `0x225E80`), in order: `module_clock_225F38` (camera; cameraOffset x 0.97),
`module_clock_226000` (tint, clear colour), `module_clock_22FE98` (rods, orbs, rings), `module_clock_234E70`
(overlay ramps), `module_clock_232458`, the text and panel functions (`0x2262C8`, `0x226300`, `0x2269E0`,
`0x226A88`), `func_0022F1A0` (state), `func_00232640` (scale, level, spin), `func_00232878` (counter + 1),
`func_00234EA8` (mode weight), `func_00235B10` (time), `func_00235518`, `func_00235EB0` (pad).

## What this means for building the start

- `start-boot.json` is a cold clock start: counter 0, mode 2, `scene.scale` 1.0, `cameraOffset` -100.0, ramps at
  rest, `wide` 1. It is the oracle for a port of the init: compare the init's output with it field by field, except
  `time`, `eased`, the state's colours and progress and `orbRandom`, which depend on the RTC and the rand state.
- The other three JSONs are mid-run frames (counters 1940, 1471, 1809). They cannot come from the init alone: their
  per-frame fields need the init plus N frames (`counter` gives N), and the capture's menu input for the two menu
  JSONs.
- Pieces equal to the ELF in all four JSONs yet with writers (`adjustFields`, `cubeColours`, `layerClear`,
  `configGate`, `configDirty`, `cubeList`, `entryActive`, `dialogRamp`, `firstRunRamp`, `listFade`) hold the ELF
  value because the captures were at rest there; they are per-frame-state, not constants.
- `configEntries` entries 4 to 8 differ from the ELF: the list is rebuilt by `func_00227F08` from the console's
  items (count 9 in the image, 7 in the JSONs). The templates it copies (D_002B2E88, D_002B2EC0, D_002B2EF8,
  D_002B2F30, ...) are in the image, readable with `scene::ProgramImage`.
- `orbRandom` is seven `rand()` draws (newlib LCG, `rand` at 0x29C6E8). The state before the clock starts is set by
  `srand` in `func_00219988` (0x219988, sound) and moved by `rand` calls in the opening (`func_0021E6C8`,
  `InitLightsCubes`, `OpeningDrawLights`), in `history_pick_slot` and in the sound code. A cold start must replay
  those draws or take the state as an input.

## Fields still without a writer

- `configItems[0]` (0x409130, also `item0`), `configItems[5]` (0x409144), `configItems[12]` (0x409160): ELF 0, JSON 0.
  `config_load_clock_osd` stores the other items but not these; `config_item_change_cb_clock_write_mechacon` and
  `config_save_clock_osd` are handed the block. Writer not found, search finds only those two.
- `configEntries` entries 0 to 3 (56 leaves), and the input-driven fields of entries 4 to 8 (value index, callbacks
  chosen at run time): changed by the menu handlers through a pointer loaded from `configPage` + 4. Writer not
  found, search finds only `func_00227F08`.
- `mainMenu.selected` (0x2B2E70) and `configPage.selected` after the first frame: menu input through pointers;
  `func_002316B8` and `func_00231B38` store `configPage` +0x10 and +0x18; for `mainMenu` the search finds only the
  ramp helpers.
- `template` (41 leaves) and `cubeRecord` (41 leaves): rewritten for each rod and cube by `module_clock_22F5D0`,
  `module_clock_22F760`, `module_clock_22FE98`, `module_clock_2306B0` and `module_clock_2308F0`, partly through
  `module_clock_22F380`, which is handed the record. Stores at offsets 0x6C, 0x20 to 0x50, 0x80, 0xC0, 0x90 and
  0x60 of `template` are seen; the other leaves are not located one by one.
- The state's rod reflection colours (+0x30 + 0x30 i): no store in the init; first set by the colour chase
  (`func_0022E8C0` -> `func_00238D00`) in the first frame.
- The rand state before the clock starts (above).
- Low memory with no image value: `display` (0x1F0A70..), `screen`, `index`, `wide`, `disc`, `rtcMirror`; their
  writers are the boot-level functions of the table.

ELF-constant fields (281) have no store found. They are read by the functions named in the table. All 281 equal the
ELF in all four JSONs, and the tables they sit in (`cycleTables`, `orbColours`, `orbColour`, `orbConstants`,
`tubeConstants`, `logicConstants`, `cubeConstants`, `centreFactors`, `listConstants`, the camera vectors,
`clearColour`, `zmax`, `cameraFactor`, `scaleFactor`, the unwritten leaves of the rectangle records and of
`configPage`, `mainMenu`, `pagePointers`) are `.data` or `.sdata` that the search found no function writing.

## External inputs

| input | fields | where it enters |
|---|---|---|
| RTC | `time` (4), `rtcMirror` (6), `configItems` 6-11 (date and time of the settings) | `func_00200FC0` -> `func_00235848` and `func_00235B10`; Clock Adjustment writes back through `config_item_change_cb_clock_write_mechacon` |
| console settings (language, aspect ratio, time zone, summer time, date and time format, video output) | `mechaconParam` (2), `configItems` 1-4, 13-19 | `config_first` 0x203BF0, `config_load_clock_osd` 0x234F88 |
| video mode (PAL or NTSC) | `videoMode`, `screen`, every fps-scaled length (`menuLengths`, ramps, `body`, `tail`), `proportions` | `handle_get_vidmode` 0x208238, `is_pal_vmode_p9_tgt` |
| drive | `disc`, `screenCode` | cdvd handlers |
| controller | `pad` (4) | `func_00235EB0` |
| rand state | `orbRandom` (7) | newlib `rand` |
| opening | `wide` (1) | `opening_transition_to_clock` 0x21AEE4 (the hand-off is already ported: `scene::opening::HandOff`) |

## Proposed port order

By fields reached per function; all are small and parametric in fps (the PAL flag):

1. The ramp helpers (`func_00234AB0`, `AC0`, `AE0`, `B10`, `A98`, `A70`) and the length setters `func_00234B88`,
   `func_00232858`, `func_00238F20`, `func_00239E60`, `func_0022A9C0` and `func_002324C8` without its list builder.
   They set 61 init-writer fields and every ramp's length, and need only the PAL flag and `ProgramImage`.
2. `func_0022EF40` with `func_0022E9C8` and `func_0022EF20` (`EBD0`, `EE20`: already modelled per frame in
   `ClockState`) and a `rand` replay: `state` (140), `eased`, `colours`, `cycleCounters`, `appearance`, `orbRandom`.
   Needs the time (step 3) and the rand state (input).
3. `func_00235848`, `func_002358F8` and `func_00235B10` (the time record from the RTC and the time zone): `time`,
   `timeFilled` and the per-frame time. Inputs: the RTC mirror and the time-zone table (`config_check_timezone_city`,
   `get_timezone_info_struct`).
4. `clock_stuff1` (proportions), `module_clock_225D98` (scale 1.0), the constant stores of
   `module_clock_init_resources` (cameraOffset) and `func_00234C28(2)`: a few fields, but they decide equality with
   `boot` at frame 0.
5. `func_00227F08` (the configuration list builder, 71 fields) with `config_load_clock_osd` (`configItems`): needs the
   console settings as input; the templates come from `ProgramImage`.
6. `do_load_font` and `func_0022CB50` (font library context, width cache): 13 fields plus `titleWidth`; already needed
   by `scene::Font`.
7. Boot-level `InitDraw` (screen, display, index) as app inputs (window size, video mode), not as code.

Then check: run steps 1 to 5 once and compare with `start-boot.json` field by field (the script's table lists which
fields must match and which depend on inputs); for the other three JSONs run N frames (`counter`) over the cold start
with the capture's input.
