# Sound: who queues what, per sender group (scout reading, 2026-10-06)

Reading, not fact: merged from seven scouts (a to g). Every row is READ from the HDD OSD 1.10U disassembly unless it says MEASURED
(seen in a capture trace, scout g only) or INFER. ROM 2.30 is given where a scout gave it. Extends `sound-events-scout.md` (2026-10-03).
Build ids: HDD 0x6140 / 0x6150 / 0x6300 = ROM 0x5014 / 0x5015 / 0x5200.

## Common mechanics (READ)
- `sound_handler_queue_cmd` HDD 0x00200C00 / ROM 0x00200BE8 (find_in_rom 16/16). Ring slot = 0x1F0658 + 8*(head & 0x7F) (ROM base 0x1F05F8):
  `sh a0` +0, `sh a1` +2, `sh a2` +4, `sh a3` +6 (stores 0x00200CBC, 0x00200CD4, 0x00200CDC, 0x00200CE4); head 0x1F0A60 +1 at 0x00200CF8;
  dropped when head - tail (0x1F0A5C) >= 0x80; busy word 0x1F0A58. t0..t3 are not stored.
- Address temporaries (scout e, confirmed by scouts d and g): after a successful call `a3 = 0x1F0658 + 8*s` and `a2 = 0x1F065C + 8*s`, s = head & 127
  at that call (addu at 0x00200CB4 and 0x00200CC0). A call that follows another without reloading a2/a3 queues the low 16 bits of these.
- Trampolines (one `j sound_handler_queue_cmd`): `j_sound_handler_queue_command_3` HDD 0x00232850 / ROM 0x0022EAE8; `j_sound_handler_queue_command_0`
  HDD 0x0022AAE8 (Version page); HDD 0x00228F38 / ROM 0x00224600 (entry frame callbacks); HDD 0x0022C920 / ROM 0x002288B0 (front page).
  Tail-jumped sites show the ra of the caller of the site, not a ra inside it.
- Drain `sound_handler_exec_queue_cmd` 0x00200A80, only from `pad_sound_handler_thread_proc` 0x0020CD20: `sceSdRemote(1, cmd, a1, a2, a3)`
  (jal 0x00200B7C; wire pc HDD 0x00294738 / ROM 0x0026DA20). Within one drain a 0x6300 whose a2 equals the previous entry's a2 is skipped
  (0x00200B2C..0x00200B5C); the first entry of a drain is always sent.
- Pad words (HDD gp-relative): edge 0x00370334 (ROM gp-0x75A8, 0x002C8948 INFERRED by arithmetic), held 0x00370330 (ROM gp-0x75AC), repeat 0x0037033C
  (0x1000 and 0x4000 only; ROM gp-0x75A0). Bits: 0x1000 up, 0x4000 down, 0x8000 left, 0x2000 right, 0x20 confirm, 0x40 circle, 0x10 triangle, 0x80 square.
  Bit labels come from the facts, not from the pad library (INFER).
- Ramp = {length, value, changed, state@+0xC}; 0 idle, 1 rising, 2 held, 3 falling. `func_00234A98(r,n)` = (state == n); `func_00234AC0` 0 -> 1;
  `func_00234AE0` 2 -> 3; `func_00234B10` ticks.
- Frame order, `module_clock_232458` 0x00232458 (READ): 232438, 230C00 (jal 0x00232468), 230DF0 (jal 0x00232470), 229828, `module_clock_22A990`
  (version page; jal 0x00232480), `module_clock_231E48` (System Configuration; jal 0x00232488), `func_00232408` (main menu, tail `menupos_p3_p8_tgt`),
  then oobe_handler, func_0022AF60, func_0022B3A8 (front page input), func_0022D828, tail func_0022D5D8. The pad update `func_00235EB0` runs after
  `module_clock_232458` in `clock_orb_rendering_func` (jal 0x00225F14, scout b): inputs see the previous iteration's edge word. Entry frame callbacks
  (draw phase) queue before the list/confirm/cancel sounds (input phase) in one frame.

## (a) Main menu: cursor, confirm, back (scout a)
| Event | Command (a0, a1, a2, a3) | Caller | jal/j pc | ra | Gate / condition | Order vs state change | Status |
|---|---|---|---|---|---|---|---|
| Cursor move up/down | 0x6300, 1, 6, a3 leftover (open) | `menupos_p3_p8_tgt` 0x002322E0 | jal 0x00232380 (a2 in delay slot 0x00232384), one jal for both | 0x00232388 | items ramp 0x002B2E78 state 2; `func_00232020` nonzero; word 0x002B2174 == 0; pad 0x1000 else 0x4000 (up beats down beats 0x20 beats 0x10); up needs sel-1 >= 0, down sel+1 < count (0x002B2E68), no wrap, no sound at the ends | selected (0x002B2E70) stored BEFORE the jal, same frame | READ |
| Confirm, Browser (selected 0) | 0x6300, 1, 4, a3 leftover (open) | `func_00231FB0`(0), called from menupos at jal 0x002323B4 | tail j 0x00232004 (a2 at 0x00232000) | 0x002323BC | as move, bit 0x20, selected == 0, mode word 0x00370AB4 (`func_00234B80`) == 0, a0 == 0 (a0 != 0 skips the sound, 0x00231FE8) | ramp 2 -> 3 (`func_00234AE0` 0x00231FE0) BEFORE the queue | READ |
| Confirm, System Configuration (selected 1) | 0x6300, 1, 4, a3 leftover (open) | `StartSysConfig` 0x00230EC0, jal from menupos 0x002323D4 | tail j 0x00230F34 | 0x002323DC | as move, 0x20, selected == 1; SysConfig ramp 0x002B2E04 state 0, else no change and no sound | length word, `func_00234AC0` (rising), func_00234D18, func_002331C8, func_0022F078, then the sound (last) | READ |
| Back, System Configuration (circle 0x40) | 0x6300, 1, 0xA, a3 leftover (open) | `func_00230F80`, chain module_clock_231E48 -> j func_00231C50 (0x00231E70) -> j func_002316B8 (0x00231E08) -> j func_00230F80 (0x002318B8) | tail j 0x00230FC4 (a2 at 0x00230FC0) | 0x00232490 (A, D); 0x0023248C (B): see Disagreements | `func_00231C50` gate: 0x002B2E04 state 2 (0x00231D1C), 0x002B5780 state 0 (0x00231DDC), 0x002B2E00 == 0; `func_00234A98(0x002B2E04,2)` inside | ramp 2 -> 3 (0x00230FA8) BEFORE the queue | READ |
| Back, Version page (circle 0x40) | 0x6300, 1, 0xA, a3 leftover (open) | `func_0022A308`, from `func_0022A7A8` j 0x0022A970, entered by tail j 0x0022A9B8 from `module_clock_22A990` | tail j 0x0022A34C (via `j_sound_handler_queue_command_0`) | 0x00232484 (A); 0x00232488 (C): see Disagreements | 0x002B3000 state 2 (0x0022A320) | `func_00234AE0` (0x0022A330) BEFORE the queue | READ |
| Version open (triangle, main menu) | 0x6300, 1, 4, a3 leftover (open) | `func_0022A298`, jal from menupos 0x002323EC | tail j 0x0022A2EC | 0x002323F4 | gates as move, then 0x10; 0x002B3000 state 0 and `callback_queue_submit` nonzero (0x0022A2C8) else no sound | `func_00234AC0` (0x0022A2D0) BEFORE the queue | READ |
| Version page move (neighbour, scout a) | 0x6300, 1, 6 | `func_0022A7A8` | jal 0x0022A89C (up), 0x0022A8F4 (down) | 0x0022A8A4, 0x0022A8FC | sel-1 >= 0 / sel+1 < count | selected stored first (0x0022A888, 0x0022A8E0) | READ |

The main menu itself has no cancel: menupos tests only 0x1000, 0x4000, 0x20, 0x10. Command 0xA comes from the two overlays in front of it.
Neighbours (scouts b, c, d): Square pairs (2,3) and (0,1) in group (d); SysConfig list move (1,5) and enter (1,4) in group (b).
ROM 2.30: `menupos` 0x0022E5C0 (find_in_rom 14/16; 0x128 below ROM `func_00232408` 0x0022E6E8); move a0 0x5200 at 0x0022E658, a1 at 0x0022E65C,
jal 0x22EAE8 at 0x0022E660, a2 = 6 delay 0x0022E664, ra 0x0022E668. Browser confirm `func_00231FB0` ROM 0x0022E220 (15/16): a0 0x0022E260, a2 = 4 0x0022E270,
j 0x22EAE8 at 0x0022E274, menupos jal 0x0022E694, ra 0x0022E69C. StartSysConfig ROM 0x0022D040, menupos jal 0x0022E6B4, ra 0x0022E6BC, its final j not read.
ROM SysConfig circle and version circle: not resolved by scout a (find_in_rom maps both to 0x002261A0); scout b read the SysConfig circle (group b). Command 0x5200.

### Probes (a)
- HDD pc 0x00200C00: a0, a1, a2, a3, ra on every hit. Site by ra: 0x00232388 move (1,6); 0x002323BC Browser confirm (1,4); 0x002323DC SysConfig confirm (1,4);
  0x00232490 SysConfig circle (1,0xA); 0x00232484 version circle (1,0xA); 0x002323F4 version open (1,4); 0x0022A8A4 / 0x0022A8FC version move (1,6).
- Inputs at pc 0x002322E0 (menupos entry, once a frame): 0x002B2E60..0x002B2E88 (selected 0x2B2E70, count 0x2B2E68, ramp state 0x2B2E84), 0x002B2174,
  0x002B2E04..0x002B2E14, 0x002B3000..0x002B3010, pad word 0x00370334, mode word 0x00370AB4; plus the return values behind `func_00232020`
  (`func_0022D6A8`, `func_0022E300` objects, `func_0022AAF0` value).
- Order check: same range at pc 0x002323F8 (menupos epilogue), or compare the next frame entry.
- SysConfig / version circle: entry pc 0x002316B8 and 0x0022A7A8: pad word, ramp states, 0x002B2E00, 0x002B5780+0xC.
- Ring: 0x001F0658..0x001F0A60 with words 0x001F0A5C, 0x001F0A60, 0x001F0A58; wire pc 0x00294738.
- ROM 2.30: queue pc 0x00200BE8; menupos 0x0022E5C0; ramp 0x0028B070; selected 0x0028B068; leaving 0x0028A344; SysConfig ramp 0x0028B00C;
  pad word 0x002C8948 (inferred); version ramp ROM address not read.

## (b) System Configuration: list and entries (scout b)
All sites: a0 = 0x6300, a1 = 1, a2 = N; no site sets a3 (leftover, open). ROM a0 = 0x5200. Gate of the dispatcher `func_00231C50` (ROM 0x0022DFD8, module 0x0022E0B8,
jal 0x0022E768): R1 (0x002B2E04) state 2, R2 (0x002B5780) state 0, then level 0x002B2E00: 0 -> `func_002316B8` (j 0x00231E08), 1 -> `func_00231B38` (j 0x00231E24), 2 runs neither.
| Event | Command | Caller | jal/j pc (HDD) | ra | Condition | Order vs state change | Status |
|---|---|---|---|---|---|---|---|
| Enter from main menu | 0x6300, 1, 4 | `StartSysConfig` 0x00230EC0 | j 0x00230F34 (a0 0x00230F24, a1 0x00230F2C, a2 0x00230F30) | 0x002323DC | R1 state 0 | after R1 length and `func_00234AC0` (rising) | READ |
| List up | 0x6300, 1, 5 | `func_002316B8` | j 0x00231764 (a0 0x00231750, a1 0x00231758, a2 0x00231760) | 0x0023248C | edge & 0x1000 (0x002316C8); tested first | after selected change (wraps to count-1) and both focus callbacks | READ |
| List down | 0x6300, 1, 5 | `func_002316B8` | j 0x00231804 (a0 0x002317F0, a1 0x002317F8, a2 0x00231800) | 0x0023248C | edge & 0x4000 (0x0023176C); only if up not set | after selected (wraps to 0), focus callbacks | READ |
| Enter an entry | 0x6300, 1, 4 | `func_002316B8` 0x0023180C | j 0x0023187C (a2 at 0x00231878) | 0x0023248C | edge & 0x20 in list mode | after enter cb (+0x14), level := 1 (0x00231848), func_00234F58/50 | READ |
| Leave (circle) | 0x6300, 1, 0xA | `func_00230F80` via j 0x002318B8 from 0x002318A4 | j 0x00230FC4 (a2 at 0x00230FC0) | 0x0023248C | edge & 0x40, R1 state 2 | after `func_00234AE0(R1)` (0x00230FA8) | READ |
| Triangle, Options dialog | 0x6300, 1, 4 | `func_002316B8` 0x002318C0 (reads item 0x13, jal 0x002318C8) | jal pcs below | pc + 8 | edge & 0x10; table below; other selections no sound | BEFORE R1 falling and the dialog start (`func_0022D558`) | READ |
| In-entry confirm | 0x6300, 1, 4 | `func_00231B38` 0x00231B48 | jal 0x00231BD4 (a2 in delay 0x00231BD8) | 0x00231BDC | level 1, edge & 0x20 | after confirm cb (+0x20), level := 2 or 0 (is_config_dirty), func_00234F68 | READ |
| In-entry cancel | 0x6300, 1, 0xA | `func_00231B38` 0x00231BE8 | jal 0x00231C30 (a2 in delay 0x00231C34) | 0x00231C38 | level 1, edge & 0x40 and not 0x20 | after cancel cb (+0x24), level := 0 (delay slot 0x00231C1C), config_load_clock_osd | READ |

Triangle rows (jal pc, ra = pc + 8): item 0x13 nonzero: selected 0 0x00231928 (dialog D_002B3240, id 0x6A), 6 0x00231960 (D_002B4660, 0x1F9), 7 0x00231998 (D_002B44D0, 0x1D7),
8 0x002319D0 (D_002B4348, unreachable, INFER); item 0x13 zero: selected 0 0x00231A4C, 5 0x00231A84, 6 0x00231ABC, 7 0x00231AF4 (unreachable, INFER).

Frame callbacks (entry +0x1C), DRAW phase, called by `func_002311E8` (jalr 0x002312F0, ra 0x002312F8) for the selected entry while level == 1 (bne 0x002312A8); gate R2 state 0. Sound (1,6) in all of them, queued after the index or item update.
| Callback | Event | jal/j pc | ra | Condition | Status |
|---|---|---|---|---|---|
| Clock Adjustment, `D_00227AD0` -> `func_00227940` (jal 0x00227B0C, ra 0x00227B14; R2 gate 0x00227AF4..0x00227B04) | field left | jal 0x0022798C (a2 delay 0x00227990) | 0x00227994 | edge & 0x8000 (0x00227958), field - 1 wrapped by count | READ |
| | field right | jal 0x002279B8 (a2 at 0x002279B4) | 0x002279C0 | edge & 0x2000 (0x00227998), +1, 0 at count | READ |
| | value up | jal 0x00227A28 (a2 at 0x00227A24) | 0x00227A30 | repeat word 0x0037033C & 0x1000 (0x002279E8), item + 1, func_00227488 first | READ |
| | value down | tail j 0x00227AA0 via 0x00228F38 (a2 at 0x00227A8C) | 0x00227B14 | repeat & 0x4000 (0x00227A34) | READ |
| 2 or 3 values, `D_00228660` (ids 0x6B, 0x6F, 0x72, 0x1F9; R2 gate 0x00228678..0x00228684) | left | jal 0x002286BC (a2 0x002286C0) | 0x002286C4 | edge & 0x8000, valueIndex (+8) - 1 wrapped by valueCount (+4) | READ |
| | right | jal 0x002286F4 (a2 0x002286F8) | 0x002286FC | edge & 0x2000, +1, 0 at count; chosen value then written (sw 0x00228718) | READ |
| Slide lists, `D_00228748` (ids 0x75, 0x1D7, 0x12E; R2 gate 0x002288A0..0x002288B0; returns while D_003701A4 != 0, 0x00228898) | left | jal 0x002288E0 (a2 0x002288E4) | 0x002288E8 | HELD word 0x00370330 & 0x8000 (0x002288B8); D_003701A8 = old index, D_003701A4 = -0x96 after | READ |
| | right | jal 0x00228914 (movz in delay slot) | 0x0022891C | HELD & 0x2000 (0x002288F0); D_003701A4 = +0x96 after | READ |

Slide timer: D_003701A4 steps toward 0 by 6 per draw (5 when `is_pal_vmode` is 1; 0x00228850..0x00228888): a held direction repeats every 25 draws (59.94 Hz) or 30 (PAL).
Clock Adjustment up and down in one frame queue two sounds. Repeat word timing (func_00235EB0, 0x00235F3C..0x00235FA4): one at press, none until 0x1F frames, then every 3rd frame (READ, not measured).
No sound in the enter (+0x14), confirm (+0x20), cancel (+0x24) or focus (+0x28) callbacks of any entry (grep of 0x6300 in 0x00226FD0..0x00228740 finds only these three).

Options dialog interior (front page D_003701D0; `func_0022B3A8` jal 0x002324A8 calls `func_0022B790` jal 0x0022B4EC or `func_0022B5F8` jal 0x0022B4FC). Read to the bit and function; the gating of `func_0022B3A8` on the page state is not traced.
| Event | Function | Command | Site | ra | Condition |
|---|---|---|---|---|---|
| list move | `func_0022B8E8` | 0x6300, 1, 5 | jal 0x0022B9AC (a2 0x0022B9B0) | 0x0022B9B4 | index changed (beq 0x0022B904) and D_00370A88 == 0 |
| value left | `func_0022BA10` | 0x6300, 1, 6 | tail j 0x0022BA6C | 0x0022B890 | after valueIndex - 1 wrap and func_0022BAE0 |
| value right | `func_0022BA78` | 0x6300, 1, 6 | tail j 0x0022BAD8 | 0x0022B8AC | after valueIndex + 1 wrap |
| confirm | `func_0022BC80` | 0x6300, 1, 4 | tail j 0x0022BD48 | 0x0022B8C4 | after confirm cb or item write; level 2, +0x3C or 0x90 |
| cancel | `func_0022BD60` | 0x6300, 1, 0xA | tail j 0x0022BE14 | 0x0022B8DC | after cancel cb or config_load_clock_osd; level 3 |
| confirm via AEB8 | `func_0022AEB8` | 0x6300, 1, 4 | jal 0x0022AF14 (a2 delay 0x0022AF18) | 0x0022AF1C | level 0, +0x50 hook returns 0, `func_0022BBD8` done, D_00370A88 == 0 |
| dialog close | `func_0022C960`, `func_0022D5A0` (from D_0022C998, func_0022D5D8) | 0x6300, 1, 0xA | tail j 0x0022C98C, 0x0022D5CC | caller | after `func_00234AE0(dialog ramp)` and func_00230F48, front page ramp state 3 and dialog ramp state 2 |

Mapping: `func_0022B5F8` edge 0x1000 -> func_0022AE20 -> func_0022B8E8(sel-1 wrap); 0x4000 -> func_0022ADC0 -> func_0022B8E8(sel+1 wrap); 0x20 -> func_0022AEB8.
`func_0022B790` (page+0x38 == 0): 0x8000 -> func_0022BA10; 0x2000 -> func_0022BA78; 0x20 -> func_0022BC80; 0x40 -> func_0022BD60.

Runtime list (`func_00227F08`): item 0x13 (word 0x0040917C) == 0: entries 0..3 from the ELF table 0x002B2BF0, idx4 = template 0x75, idx5 = 0x1F9, idx6 = 0x1D7, count 7 (sw 0x0022918C);
item 0x13 != 0: idx4 = 0x12E added, count 8. The capture in facts/clock-menu-leaves.md has 7 entries, so item 0x13 = 0 there (INFER).

ROM 2.30 (READ, a0 0x5200; ROM page 0x0028AFF0, selected 0x0028B000, level 0x0028B008, R1 0x0028B00C, R2 0x00296740):
- StartSysConfig: a0 0x0022D0AC, a2 4 at 0x0022D0B8, j 0x0022EAE8 at 0x0022D0BC, ra 0x0022E6B8 (scout a gives 0x0022E6BC for the jal at 0x0022E6B4; see Disagreements).
- list up j 0x0022DCBC (a0 0x0022DCA8, a2 0x0022DCB8), down j 0x0022DD6C (a2 0x0022DD68), enter j 0x0022DDE4 (a2 0x0022DDE0), all ra 0x0022E76C; list input `func_002316B8` = ROM 0x0022DC00
  (extra ring branch before the moves, `lw -0x7618(gp)`, slti 6; triangle only for selected 0; 267 words differ).
- circle `func_00230F80` = 0x0022D108: ramp-fall jal 0x0022D130, a2 0xA at 0x0022D148, j 0x0022D14C.
- confirm jal 0x0022DF60 (a2 0x0022DF64), ra 0x0022DF68; cancel 0x0022DFBC (a2 0x0022DFC0), ra 0x0022DFC4; in-entry `func_00231B38` = ROM 0x0022DE80 (extra branch 0x0022DEA4..0x0022DF50); ROM confirm also tests 0x001F00B0 == 5 and 0x001F00A4 == 0x12 (0x0022DF1C..0x0022DF38) to set level 2.
- triangle: only selected 0, jal 0x0022DE48 (a2 4 at 0x0022DE4C), ra 0x0022DE50, then jal 0x002310E8, tail j 0x002288B8; selected not 0 exits (bnez 0x0022DE38): no sound.
- frame callbacks: Clock Adjustment `D_00227AD0` = 0x00223258 -> 0x002230A8 (jal 0x00223294): left jal 0x00223114, right 0x00223140, up 0x002231B0, down tail j 0x00223228 (ra 0x0022329C); 2 or 3 values 0x00223C00: 0x00223C5C, 0x00223C94 (R2 = lui 0x29 + 0x6740);
  slide lists 0x00223CE8: 0x00223ED8, 0x00223F0C, held word gp-0x75AC (0x00223EAC), slide +-0x20D stepped by 0x19 or 0x15 (0x00223E60..0x00223E78).
- front page through stub 0x002288B0: 0x00226EB4 (4), 0x00227904 (5), 0x002279B8 tail (6), 0x00227A24 tail (6), 0x00227C94 tail (4), 0x00227D5C tail (0xA); front-page functions ROM 0x00226E58, 0x00227840, 0x00227968, 0x002279D0, 0x00227BE8, 0x00227CC8 (find_in_rom 13 to 16 of 16).
- ROM Square: see group (d).

### Probes (b)
- HDD enqueue pc 0x00200C00 with a0..a3, ra; ring 0x001F0658..0x001F0A64 (lock 0x1F0A58, tail 0x1F0A5C, head 0x1F0A60).
- Dispatcher entry pc 0x00231C50: pad words 0x00370330, 0x00370334, 0x00370338, 0x0037033C (4 bytes each); page 0x002B2DE8..0x002B2E1C (0x38 bytes); R2 0x002B5780..0x002B578F; item 0x13 word 0x0040917C;
  entries 0x002B2BF0 + 0x38 * count; D_003702C8 0x003702C8. To prove order, read selected (0x002B2DF8) and level (0x002B2E00) at each jal/j pc in the tables.
- Frame callbacks: pc 0x00227940 (a0 = entry record; edge 0x00370334, repeat 0x0037033C; rows of D_002B2580, 12 bytes each; items from 0x00409130); pc 0x00228660 and 0x00228748 (a0 = entry record, 0x00370334, 0x00370330, 0x003701A4, 0x003701A8, R2 0x002B5780, and the PAL flag).
- Front page: pc 0x0022B3A8: 0x003701D0 and the record it points to, 0x00370A88, 0x00370334, 0x00370330.
- ROM 2.30: enqueue pc 0x00200BE8; dispatcher 0x0022DFD8, list 0x0022DC00, in-entry 0x0022DE80; pad words gp-0x75A8 (edge), gp-0x75AC (held), gp-0x75A0 (repeat), gp taken from the register at the probe;
  page 0x0028AFF0 (selected 0x0028B000, level 0x0028B008, R1 0x0028B00C), R2 0x00296740; callbacks 0x002230A8, 0x00223C00, 0x00223CE8 (slide word gp-0x7754). ROM ring, head and tail were not re-read by scout b.

## (c) Version page (scout c, HDD only; ROM not examined)
All sites: a0 = 0x6300, a1 = 1, a2 = N through `j_sound_handler_queue_command_0` 0x0022AAE8; a3 never set. Page state D_002B3000; record D_002B2FE8 (+4 row table, +8 row count, +0xC shown, +0x10 selected, +0x14 first shown).
| Event | Command | Caller | jal/j pc | ra | Condition | Order | Status |
|---|---|---|---|---|---|---|---|
| Open page | 0x6300, 1, 4 | `func_0022A298` (jal 0x002323EC from menupos) | j 0x0022A2EC (a2 0x0022A2E8) | 0x002323F4 | 0x002B3000 state 0; `callback_queue_submit(D_0020AAD8)` nonzero (0x0022A2C8, else no sound); main-menu gates as group (a), pad order 0x1000, 0x4000, 0x20, then 0x10 (0x00232394) | handle stored D_00370A84 (0x0022A2CC) and `func_00234AC0` (0x0022A2D0), then the sound | READ |
| Row enter (row with sub-rows) | 0x6300, 1, 4 | `func_00228F68` via j 0x0022A958 from `func_0022A7A8` (triangle 0x10, 0x0022A928; row = table + selected*16; sub-row count at row+8, zero returns at 0x0022A944, no sound) | j 0x00228FC4 (a2 0x00228FC0) | 0x00232488 | `func_00234A98(D_003701C0+0x1C, 0)` true (0x00228F80) | D_003701C0 = 0x404370 + 0x54*a0 and `func_00234AC0(row+0x1C)` (0x00229FA8) first | READ |
| Move up | 0x6300, 1, 6 | `func_0022A7A8` | jal 0x0022A89C (a2 delay 0x0022A8A0) | 0x0022A8A4 | pad 0x1000 and new selected >= 0 (else restored at 0x0022A890) | selected - 1 stored BEFORE (0x0022A888, delay slot); first shown (+0x14) adjusted after | READ |
| Move down | 0x6300, 1, 6 | `func_0022A7A8` | jal 0x0022A8F4 (a2 delay 0x0022A8F8) | 0x0022A8FC | pad 0x4000 and selected + 1 < count (+8) (else restored 0x0022A8E4) | selected + 1 stored BEFORE (0x0022A8E0) | READ |
| Back | 0x6300, 1, 0xA | `func_0022A308` via j 0x0022A970 from `func_0022A7A8` (circle 0x40 at 0x0022A960) | j 0x0022A34C (a2 0x0022A348) | 0x00232488 (C); 0x00232484 (A): see Disagreements | state == 2 (0x0022A320) | `func_00234AE0` (0x0022A330) BEFORE | READ |

`func_0022A7A8` gates in order: ramp state != 0 (bnez 0x0022A7CC returns when 0); `func_0022A1D8()` (alpha) >= `func_00228F40()` (0x0022A7E4 slt, 0x0022A7E8 return); hint set (func_002266E0, func_002266D0); state 2 (0x0022A854);
`func_00234A98(D_003701C0+0x1C,0)` (0x0022A864). Pad tests: 0x1000 (0x0022A870), 0x4000 (0x0022A8C4), 0x10 (0x0022A928), 0x40 (0x0022A960). `func_0022A7A8` is entered by tail j 0x0022A9B8 from `module_clock_22A990`, jal 0x00232480 in `module_clock_232458`; the two (1,6) sites use real jal.
Not sent when circle is pressed with a row sub-page in front (the 0x0022A7E4 and 0x0022A864 gates return first). The sound is queued once per press edge in which selected changed. Sub-pages (`func_00229028`, `func_00229080`, `func_002297D0`, `func_00228FD8`, `func_0022AEB8`) contain 0x6300 and were not read for this group.
a3 at the move sites (INFER): `movz a3,t0,v0` at 0x0022A820 leaves 0x57, or 1 when the row's sub-row count is 0; callees `func_002266E0`, `func_002266D0`, `func_00234A98` do not write a3, `get_vidmode_with_fallback`/`handle_get_vidmode` not read.
The a3 of open/enter/back is stale from callers (`callback_queue_submit`/SignalSema clobber on open).

### Probes (c)
- Enqueue: pc 0x00200C00, regs a0, a1, a2, a3, ra; accept ra in {0x002323F4, 0x00232488, 0x0022A8A4, 0x0022A8FC} for the Version page (0x00232388 and others are not the page).
- Per-site pcs: 0x0022A2EC, 0x00229FC4, 0x0022A89C, 0x0022A8F4, 0x0022A34C (probe at the jump pc sees a2 already set when the addiu precedes; for delay-slot sites probe the next pc or use the 0x00200C00 probe). Scout c lists 0x00229FC4 for the row enter while its table gives the j at 0x00228FC4: not reconciled (Open).
- Ranges: ramp 0x002B3000..0x002B3010 (state +0xC); record 0x002B2FE8..0x002B3000 (count +8 at 0x2B2FF0, selected +0x10 at 0x2B2FF8, first +0x14 at 0x2B2FFC); D_003701C0 (0x003701C0) and the record it points to +0x1C (0x00404370 + 0x54*i + 0x1C);
  pad word 0x00370334; D_00370A84; ring 0x001F0658..0x001F0A60 plus 0x001F0A5C / 0x001F0A60; main-menu gate words 0x002B2E78..0x002B2E80, 0x002B2174.
- Rule per site: sound queued at or after the state word changes; for the moves the selected word changes first.

## (d) Square: hide and show (scout d; scout b read the same sites)
Square test bit 0x80 (`scene::pad::Square`). Menu ramp D_002B5780 (ROM 0x00296740): +0 length, +4 counter, +8 changed, +0xC state. Each pair is queued in one call of one function, on the press frame, not at a ramp end.
| Event | Command | Caller | jal/j pc | ra | Condition | Order | Status |
|---|---|---|---|---|---|---|---|
| Hide, first | 0x6300, 1, 2, a3 stale (open) | `func_00230C80` 0x00230C80 (entered by j 0x0023189C from `func_002316B8`, ROM j 0x0022DE04) | jal 0x00230CB8 (a0 0x00230CB0, a2 delay 0x00230CBC) | 0x00230CC0 | list ramp 0x002B2E04 state 2 (0x00231D1C); menu ramp state 0 (0x00231DDC); 0x002B2E00 == 0; in `func_002316B8` 0x1000, 0x4000, 0x20 clear and 0x80 set (0x00231884); menu ramp state 0 (0x00230C98..0x00230CA0) | after `func_00234AC0` (jal 0x00230CA8, state 1) | READ |
| Hide, second | 0x6300, 1, 3, a3 = 0x658 + 8*s of the first (INFER from the queue code) | same | tail j 0x00230CD4 (a0 0x00230CC4, a2 0x00230CD0) | 0x00232490 (D); 0x0023248C (B): see Disagreements | same call | after the first | READ (ra chain INFERRED from saves/restores) |
| Show, first | 0x6300, 1, 0, a3 stale (open) | `func_00230CE8` 0x00230CE8, jal 0x00230DD4 from `func_00230D58` | jal 0x00230D28 (a0, a2 zero in delay 0x00230D2C) | 0x00230D30 | state 2 (0x00230DBC) and D_00370334 & 0x80 (andi 0x00230DC8, beqz 0x00230DCC); `func_00230CE8` re-tests state 2 (0x00230D00) | after `func_00234AE0` (jal 0x00230D10: state 3, changed 1, counter = length) and `func_00230380` (jal 0x00230D18, cubes ramp 0x002B5740 0 -> 1) | READ |
| Show, second | 0x6300, 1, 1, a3 = 0x658 + 8*s of the first (INFER) | same | tail j 0x00230D44 (a2 at 0x00230D40) | 0x00232478 (inferred: entry ra of `func_00230D58` = of `module_clock_230DF0` = return of jal 0x00232470) | same call | after the first | READ (ra INFERRED) |

`func_00230D58` is entered by j 0x00230E08 from `module_clock_230DF0` (ticks the menu ramp with `func_00234B10` at 0x00230DFC first). State 1: cubes step only (func_00234A68 == D_003702D0 -> func_002303C8), no sound. State 0 returns (0x00230D78).
Within one frame the show check (`module_clock_230DF0`) runs before the hide check (`module_clock_231E48`): a press in state 2 flips to 3 in the first, and the second then sees state 3 and cannot hide.
Neighbours: `func_002316B8` Up/Down a2 = 5, 0x20 a2 = 4 (group b). a3 is never written in `func_00230C80` / `func_00230CE8`.
Drain: `vblankHandler` 0x0020C950 calls `iWakeupThread(D_001F0000)` at 0x0020CA40 each vblank; `pad_sound_handler_thread_proc` wakes from SleepThread (0x0020CD60) and calls the drain (jal 0x0020CD74). Both entries of a pair are in the ring before the next vblank, so one drain sends both
(the 0x6300 dedup keeps both: 2/3 and 0/1 differ). Residual: a vblank between the two enqueue calls would split the pair (window of a few instructions, not excluded). The app kSquareGap = 26 samples is the RPC time, a capture value.
App check (scout d): Main.cpp:377-384 matches the code in direction and frame (menuRamp 2 -> 3 with Square = show (0, 1); 0 -> 1 with Square = hide (2, 3); both on the press frame); Menus::menuStep (Menus.cpp:508) = the state-2 case of `func_00230D58`, Menus.cpp:256 = the 0x80 branch of `func_002316B8`, same branch priority (Up, Down, Cross, Square, Circle, Triangle).
App a3 values 1784 (0x6F8) and 1800 (0x708) in ClockSound.cpp:94,99 are 0x658 + 8*20 and + 8*22: ring slots of one capture, not constants; app first-call values 384 (hide) and 0xFFFF8000 (show) are stale registers (open).
ROM 2.30 (a0 0x5200, a1 1, a2 = 2, 3, 0, 1 identical): hide `func_00230C80` = 0x0022CE00 (3 words differ from HDD), jal 0x0022CE38 (ra 0x0022CE40), j 0x0022CE54; show `func_00230CE8` = 0x0022CE68, jal 0x0022CEA8 (ra 0x0022CEB0), j 0x0022CEC4;
show trigger `func_00230D58` = 0x0022CED8 (module 0x0022CF70, j at 0x0022CF88), jal expected at 0x0022CED8 + 0x7C = 0x0022CF54 (same code, not disassembled); hide trigger `func_002316B8` = 0x0022DC00 (andi 0x80 at 0x0022DDEC, j 0x22CE00 at 0x0022DE04; 267 words differ, branch order the same 0x1000, 0x4000, 0x20, 0x80, 0x40, 0x10);
`module_clock_231E48` = ROM 0x0022E0B8, j to 0x0022DFD8, j 0x22DC00 at 0x0022E08C (gate differs, find_in_rom head 5/16, only the j target read). Ring ROM base 0x001F05F8, so ROM a3 = 0x05F8 + 8*idx.

### Probes (d)
- HDD pc 0x00200C00: gpr 4..7, 31; keep a0 == 0x6300, a1 == 1, a2 in {2, 3, 0, 1}. Memory: head 0x001F0A60 (4), tail 0x001F0A5C (4).
- Entries pc 0x00230C80 and 0x00230CE8: menu ramp 0x002B5780 (0x10), pad 0x00370334 (4), list ramp 0x002B2E04 (0x10), 0x002B2E00 (4), cubes ramp 0x002B5740 (0x10); a3 at entry closes the first-call a3.
- pc 0x00230CB8 / 0x00230CD4 / 0x00230D28 / 0x00230D44 (the jal/j) and 0x00230DD4 (jal `func_00230CE8`).
- Wire: pc 0x00294738 and drain 0x00200A80 with ring 0x001F0658 (0x400) and words 0x001F0A58.. as in verify_sound_ee_queue.mjs.
- ROM 2.30: pc 0x00200BE8; hide entry 0x0022CE00, jal 0x0022CE38, j 0x0022CE54; show entry 0x0022CE68, jal 0x0022CEA8, j 0x0022CEC4; show trigger jal expected 0x0022CF54. Ranges: menu ramp 0x00296740 (0x10), pad 0x002C8948 (4),
  list ramp 0x0028B00C (0x0028AFF0 + 0x1C: lui 0x29, addiu -0x5010 at 0x0022DD7C / 0x0022DD84; the +0x1C is from the HDD code), ring 0x001F05F8, wire pc 0x0026DA20. The ROM cubes ramp and 0x002B2E00 equivalents were not located.

## (e) Clock set-up and clock thread start (scout e)
Addresses: `module_clock_thread_proc` HDD 0x00225D30 (size 0x68; the jal is at 0x00225D50) / ROM 0x00221408 (find_in_rom 14/16, same shape, id 0x5015); `func_002324C8` / ROM 0x0022E7A8 (14/16, NOT the same: one command);
`module_clock_init_resources` 0x00225DB0 (jal 0x00225E48) / ROM 0x00221488 (16/16); handler `clock_input_check_handler_p6_p7_tgt` 0x002259B8 (jal 0x002259DC) / ROM 0x00221060;
condition word `should_enter_clock_module_2AD22C` 0x002AD22C / ROM 0x0027B394 (getter `enter_clock_module_208378` returns (word == 0), ROM 0x002058E0); drain thread 0x0020CD20 / ROM 0x00200A98; wire 0x00294738 / ROM 0x0026DA20 (drain jal 0x00200B64).
| Event | Command | Caller | jal/j pc | ra | Condition | Order | Status |
|---|---|---|---|---|---|---|---|
| Clock thread start | 0x6150, 1, 0, 0 (immediates: a1 0x00225D44, a2 0x00225D48, a3 0x00225D4C, a0 0x00225D54 in the delay slot) | `module_clock_thread_proc`, after SleepThread (0x00225D3C) woken by main (WakeupThread 0x0020E30C) | jal 0x00225D50 | 0x00225D58 | unconditional, once per thread creation (thread created by `module_clock_prepare` 0x00225890: CreateThread 0x002258D0, StartThread 0x002258E0) | before `module_clock_23A068` (0x00225D58), `module_clock_225D98` (0x00225D60) and the loop 0x00225D70 | READ; MEASURED in `sound-ee-boot` frame 127 (scout g) |
| Set-up, first | 0x6150, 6, 0, 0xF (immediates: a1 0x00232610, a2 0x00232614, a3 0x0023261C delay slot, a0 0x6150 from 0x002325F0) | `func_002324C8`, from `module_clock_init_resources` jal 0x00225E48 | jal 0x00232618 | 0x00232620 | `enter_clock_module_208378` (jal 0x002325E4) returned 0, i.e. word 0x002AD22C != 0 (the plain start; the word holds 1); beqz v0 at 0x002325EC | after matrices, ramp lengths, func_00234AB0 (0x002325DC) | READ; MEASURED in `sound-ee-boot` frame 127 (scout g) |
| Set-up, second | 0x6140, 2, a2 = (0x065C + 8*s) & 0xFFFF, a3 = (0x0658 + 8*s) & 0xFFFF, s = head & 127 at the first call | `func_002324C8` | tail j 0x00232634 (a0 0x00232624, a1 0x0023262C; a2, a3 not set) | 0x00225E50 | same branch | immediately after the first | READ; MEASURED in `sound-ee-boot` frame 159 (scout g) |

Forced-clock branch (v0 != 0, word == 0): `func_00234AE0(s1)` and j `func_0022D760` (0x00232608); no sound queued here (the opening queued 0x6140,1 instead: facts/opening.md:170).
Path: main wakes thread -> loop 0x00225D70 -> clock_stuff1 -> handler 0x002259B8 -> jal `module_clock_init_resources` (0x002259DC) -> `do_load_font` 0x00225E38, `func_0022EF40` 0x00225E40 -> jal `func_002324C8` 0x00225E48 -> `func_00232858` 0x00225E50 -> handler StartFrame (0x002259E4).
The set-up runs at the start of every handler entry (every wake), so each re-wake sends the pair again; 6150,1 does not repeat (the loop has no exit).
`func_002324C8` internals: matrices 0x00232528, 0x00232534, 0x0023253C; D_003702CC = fps*40/60 (0x00232574), D_003702D0 = fps/6 (0x002325D0), ramp lengths D_002B5740, D_002B5780, D_002B2DE8+0x18/0x1C, D_002B2E60+0x18 (0x002325D8).
Timing: no fixed frame count in the code. In the capture behind kClockCommands the gap from 6150,1 to the pair is 24830 samples = 31.0 frames at 800.8 samples per frame (that capture's load time, not a rule); per-build value is to be measured.
Writers of 0x002AD22C: `enable_enter_clock_module_208398` (0x002083A0, stores 0; main when no config or first run forced), `disable_enter_clock_module_208388` (stores 1). Readers of the getter 0x00208378: main 0x0020DF54, `opening_transition_to_clock` 0x0021AEF4,
`OpeningProcessInner` 0x0021F140, `func_002324C8` 0x002325E4.
CORRECTION to `sound-events-scout.md` (2026-10-03): "Clock set-up: 6150,(6,0,0xF) then 6140,(2,0,0xF)" is wrong for the second command; a2/a3 are the clobbered address halves above (the earlier reading's (0, 0xF) would hold only if the ring were full, and then the second call is dropped by the same full test).
Cross-check with kClockCommands (captured): last entry {24853, 0x6140, {2, 1756, 1752}}: s = 16 gives 0x065C + 128 = 1756 and 0x0658 + 128 = 1752, exact match; s = 16 is what the table implies (slot 0 = 6150,1; slots 1..15 = fifteen 0x60D0; slot 16 = 6150,6).
ROM set-up (READ): `func_002324C8` ROM 0x0022E7A8: jal 0x002058E0 (0x0022E8C8), beqz v0 0x0022E8D0; at 0x0022E8F4 a0 0x5014, a1 = 2 (0x0022E8FC), j 0x00200BE8 (0x0022E904): ONE command, 0x5014,2, a2/a3 left over (same clobber expected, ring base 0x1F05F8, values not read). No ROM counterpart of 0x6150,(6,0,0xF) in this function.
Branch polarity is the same (v0 != 0 -> jal 0x002310E8, j 0x002295D8). ROM thread start: SleepThread 0x00221414, a1 = 1 (0x0022141C), a2 = 0, a3 = 0, a0 0x5015 (0x0022142C delay slot), jal 0x00200BE8 at 0x00221428 (ra 0x0022142C per scout e's probe list; jal + 8 would be 0x00221430, see Disagreements).

### Probes (e)
- HDD enqueue pc 0x00200C00 (a0..a3, ra). Filter by ra: 0x00225D58 (sender 1), 0x00232620 (set-up first), 0x00225E50 with a0 = 0x6140 (set-up second).
- Ring state at the first set-up call: range 0x1F0A58..+0x10 (busy 0x1F0A58, tail 0x1F0A5C, head 0x1F0A60) and 0x1F0658..+0x400; s = head & 127.
- Condition: word 0x002AD22C (4 bytes) at pc 0x002324C8.
- Wire pc 0x00294738 (a0..a3, t0); ramp pc 0x002009E0 with counter 0x002AAF80; the 0x8070 send has ra 0x0020CE34; word 0x1F0114 at pc 0x0020CE28.
- ROM 2.30: enqueue 0x00200BE8 (ra 0x0022142C for 0x5015,1; the 0x5014,2 send is a tail call, ra = what init_resources passed: read when probing); set-up pc 0x0022E7A8, branch 0x0022E8D0, send 0x0022E904; word 0x0027B394;
  ring 0x1F05F8, busy 0x1F09F8, tail 0x1F09FC, head 0x1F0A00; drain 0x00200A98, wire 0x0026DA20, ramp 0x002009F8, counter 0x0027A104, ramp cmd 0x500D, 60 steps (as in verify_sound_ee_queue.mjs).
- Extend `References/scripts/verify_sound_ee_queue.mjs` (captures hddosd-110U-sound-ee-boot / -queue, rom-0230A-sound-ee-boot / -queue; manifest ~5609-5640) and `References/model/sound_ee.mjs`: add the a2/a3 clobber to the enqueue model and a set-up check.

## (f) Disc-state change on the clock (scout f)
Polled word: live disc state `disc_type_1F000C` 0x001F000C (ROM 0x001F0010). Last-seen state D_00370A7C = gp-0x6EF4 (ROM 0x002C8F1C = gp-0x6FD4). Change flag D_002B2174 (ROM 0x0028A344). Mode word D_00370AB4 (getter `func_00234B80`; ROM 0x002C8F6C, getter 0x00231188 reads gp-0x6F84), 0 = orbs full.
Tables: compare `jtbl_00365500` (11 entries; ROM 0x002C4740, 12 entries 0x6A..0x75), sound `jtbl_00365530` (10 entries; ROM 0x002C4770, 12 entries). Clock thread `clock_input_check_handler_p6_p7_tgt` 0x002259B8 (size 0x374; loop top 0x00225A28; ROM 0x00221060, loop top 0x002210C0).
The ROM is the same algorithm re-scheduled (`diff_rom.mjs` 208 words differ), tables 12 long (state 0x75 exists), ids renumbered. `func_00234C28` (set-mode(3)) ROM 0x00231230, jal 0x00221204.
| Dispatch key D_00370A7C (HDD) | Command (a0, a1, a2, a3) | jal pc (HDD) | ra (HDD, as stated by scout f) | ROM jal | ROM ra (as stated) |
|---|---|---|---|---|---|
| 0x6C, 0x6D, 0x6E | 0x6150, 2, 0, 0xE | 0x00225B40 (target 0x00225B34) | 0x00225B48 | 0x002211C0 | 0x002211C8 |
| 0x6A, 0x6B, 0x73 (ROM also 0x75) | 0x6150, 2, 0, 0xF | 0x00225B5C (target 0x00225B50) | 0x00225B68 | 0x002211DC | 0x002211E8 |
| 0x6F, 0x70, 0x71, 0x72, 0x74 | 0x6150, 2, 0, 0 | 0x00225B7C (target 0x00225B6C) | 0x00225B80 | 0x002211F8 | 0x00221200 |

a0 `addiu 0x6150`, a1 `addiu 2`, a2 `daddu zero`, a3 `addiu 0xE` / `0xF` / `daddu zero`: immediates (0x00225B34..0x00225B7C); a3 is set in the delay slot at pc + 4 of the jal. ROM id 0x5015. ROM sound-table targets: 0x002211B4 = 0xE, 0x002211D0 = 0xF, 0x002211EC = 0, ROM 0x6F, 0x70, 0x71, 0x72, 0x74 -> 0 and 0x6A, 0x6B, 0x73, 0x75 -> 0xF.
Per-frame algorithm (READ, HDD):
1. Each clock-thread loop iteration (one per frame; `OpeningDoWaitNextFrame` jal 0x00225BA8, then b 0x00225A28): flag = [D_002B2174], s0 = lw 0x1F000C (0x00225A30), D_00370A7C (0x00225A38 / 0x00225A48).
2. flag == 0 (beqz 0x00225A34): go to the compare at 0x00225A4C. flag != 0: `func_0022FEF8` (D_002B46D0[0xC] != 0, via `func_0022E300` and `func_00234A98`, 0x00225A3C); returns 0 -> sound branch 0x00225AFC; else the compare.
3. Compare (0x00225A4C): D_00370A7C == [0x1F000C] -> skip to 0x00225ACC. Else idx = state - 0x6A. idx >= 0xB (state < 0x6A or > 0x74): 0x00225AB8 sets D_00370A7C = state, flag = 0, [0x1F0D4C] = 1; no sound. Otherwise jr through `jtbl_00365500`:
   0x72 -> 0x00225A78 (if [0x1F0D58] <= 0, skip to 0x00225AC4 without updating D_00370A7C); every other 0x6A..0x74 -> 0x00225A88: `func_0022FF28` (nonzero if any of D_002B2E04, D_002B3000, `func_0022D6A8` is not idle); flag = 1 (0x00225AA8) when FF28 == 0, or FF28 != 0 and `func_0022FEF8` != 0; then 0x00225AB0 sets D_00370A7C = state and [0x1F0D4C] = 1.
4. Sound branch (0x00225AFC), reached only with flag != 0 and `func_0022FEF8` == 0: mode word != 0 -> 0x00225B90 (no sound). Mode 0: idx = D_00370A7C - 0x6A (already the NEW state), `sltiu idx, 0xA`, jr `jtbl_00365530`; then `func_00234C28(3)` (jal 0x00225B84), back to the loop.
   Out-of-range states reach the default in the code, but step 3 clears the flag for them, so they never get here.
5. After set-mode(3) the mode word stays 3: the sound is not reached again until mode returns to 0 (only 0x00234EF0 in the mode 1/2 ramp and `func_00234B88` 0x00234C00 write 0). One sound per accepted change, only with mode 0.
6. Exit (0x00225B90..0x00225CD4): once mode != 0 and `get_clock_should_render_orbs` <= 0 the thread leaves, choosing exec/module by D_00370A7C: 0x6A, 0x6B -> [0x1F0010] = 2; 0x6C, 0x6D -> 1; 0x6E -> 0; 0x71 -> 5; 0x73 -> 3; 0x72 -> [0x1F0648] = 5; 0x74 -> [0x1F0648] = 4; 0x6F, 0x70 and the rest -> [0x1F0648] = 3, then [0x1F064C] = 2 (READ, not traced).
   A disc ends the clock after the 128-unit orb fade: the sound is the start of the clock exit.

When: compare every frame; sound once, on an accepted change, with flag set, D_002B46D0 (+0xC) idle and mode 0 (weight reaches 128, about 128 frames after the thread starts, facts/clock-transitions.md). At thread entry D_00370A7C = [0x1F000C] (0x00225A04), or 0x64 when the previous module [0x1F064C] == 1 (opening) or `func_0022FEF8` != 0 (0x00225A00..0x00225A24; facts/opening.md:747). Idle with the entry state: no sound.
Order vs state change: D_00370A7C and the flag are updated in the compare step, the enqueue follows, then mode := 3.
Writers of 0x001F000C: `cdvd_handler_proc_prechk` 0x00211D78 (store `sw s0, 0x1F000C` 0x00211FD4; ROM 0x0020F740, facts/opening.md:33), called each wake of `cdvd_handler_thread_proc` (jal 0x00211AE0) from byte 0x1F40200F (CDVD disc type). Mapping (0x00211D98..0x00211FD0):
type 0 -> 0x64; 1 -> 0x65; 2 -> 0x66; 3 -> 0x67; 4 -> 0x68; 5 -> 0x69; 0x10 -> 0x6A; 0x11 -> 0x6B; 0x12 -> 0x6C; 0x13 -> 0x6D; 0x14 -> 0x6E; 0x20 -> 0x6F; 0x21 -> 0x70; 0x22 -> 0x71; 0xFD -> 0x72; 0xFC, 0xFE -> 0x73; 0xFF -> 0x74; other -> 0x65.
0x74 is sticky when D_00392924 (`unksema_392900` + 0x24) is 0x74 (0x00211DA4..0x00211DB8). Names INFER from the standard CDVD disc-type enum, not this code: 0x10 PS CD, 0x11 PS CD-DA, 0x12 PS2 CD, 0x13 PS2 CD-DA, 0x14 PS2 DVD, 0xFC/0xFE DVD video, 0xFD CD-DA, 0xFF illegal.
Other writers: `override_illegal_disc_type` 0x00211920/0x00211930 (0x74, and D_00392924); `main` 0x0020DCA8 (0x65 at boot). Idle in the lab runs: 0x64 (facts/opening.md:229: 0x64 from the second call on; the first call reads 0x65).
Native app (READ): `src/app/HostInputs.cpp:35` kNoDisc = 0x64; line 97 `out.screenCode = kNoDisc`; `ColdStart.cpp:151/191/221` copies it into `m.screenCode` and `f.menu.disc`; so the disc state the native clock compares (`Menus.cpp:529`, screenCode == ext.disc) is the constant 0x64, always equal to its last-seen value.
The else at `Menus.cpp:536` only pushes a note; no 0x6150,2 emission exists in `src/` (grep 6150: opening Timeline, Main.cpp:488, ClockSound only). 0x64 is the console no-disc value (type byte 0) and the idle value, so the native idle state is the console idle state: these sounds never play at idle and nothing is missing there.
`Opening.cpp:40/54` (options.disc.first / later) is the opening's own disc table, not this one.

### Stimulus for a capture (scout f)
- The disc word does not hold when written: the program rewrites it at HDD 0x00211FD4 / ROM 0x0020F740 (facts/opening.md:33-40). Patch that store to a nop; a write or patch at emulator frame 1 is lost, the stimulated captures patch and write at emulator frame 135 (HDD, module counter = frame - 127) or 60 (ROM).
- Write 0x1F000C (ROM 0x1F0010) after the clock thread has started and the mode word is 0 (about 128 frames after thread start; confirm D_00370AB4 == 0). Writing earlier changes the compare only; the sound still waits for mode 0 (flag stays 1). The written value must differ from the held one.
- Values: 0x6A, 0x6B, 0x73 -> (2,0,0xF); 0x6C, 0x6D, 0x6E -> (2,0,0xE); 0x6F, 0x70, 0x71, 0x72 -> (2,0,0) (0x72 also needs [0x1F0D58] > 0, else D_00370A7C is not updated and no flag is set); 0x74 -> (2,0,0). 0x64..0x69 give nothing (flag cleared). ROM: same plus 0x75 -> 0xF.
- The flag also needs `func_0022FF28` idle or `func_0022FEF8` busy: with the menu closed they are idle (INFER; writers not read). Expect the clock to exit about 128 frames after the sound (step 6): end the capture before, or follow the hand-off.

### Probes (f)
- HDD (CLOCK_BUILD=hdd): pc 0x00225A4C (compare), s0 = disc word; ranges 0x1F000C+4, 0x370A7C+4, 0x370AB4+4, 0x2B2174+4, 0x2B46D0+0x10, 0x1F0D58+4, 0x1F0D4C+4.
- The three jals 0x00225B40 / 0x00225B5C / 0x00225B7C (a3 set in the delay slot: sample at pc + 4 or at enqueue entry); enqueue entry pc 0x00200C00: a0..a3, ra (ra 0x00225B48 -> 0xE, 0x00225B68 -> 0xF, 0x00225B80 -> 0, as stated by scout f).
- Wire pc 0x00294738; ring 0x1F0658..0x1F0A60; pc 0x00211FD4 (writer) to prove the nop patch holds.
- ROM (CLOCK_BUILD=rom): compare pc 0x002210D4 (s0 = 0x1F0010; ranges 0x1F0010, 0x2C8F1C, 0x2C8F6C, 0x28A344, 0x28A340+0x10), jals 0x002211C0 / 0x002211DC / 0x002211F8, enqueue entry 0x00200BE8 (ra 0x002211C8 / 0x002211E8 / 0x00221200), writer 0x0020F740. ROM id for 0x6150 is 0x5015.
  ROM compare 0x002210D4..0x00221134, sound branch 0x0022116C (flag [0x28A344], ramp test 0x0022BF18, mode test 0x00231188).

## (g) The opening (scout g; the only group with MEASURED rows)
Addresses: `OpeningProcessInner` HDD 0x0021EF00 (the 0x0021F150 of the brief is a jal inside it) / ROM 0x0021A510 (head 16/16, body differs from stage 2 on); `module_opening_thread_proc` 0x0021ABD0 / ROM 0x002161C8 (16/16);
start-sound `opening_thread_set_vars_2` 0x0021AE78 (0x0021AEA8 is its first jal) / ROM 0x00216470 (find_in_rom 4/16; address read from the ROM thread-proc jal at 0x002161E8); module word 0x001F0648 / ROM 0x001F05E8 (lw 0x5E8 at 0x00216478).
Wire a2/a3 are the sign-extended halfwords (MEASURED).

### A. Thread start (once per module run, before `OpeningInit`, so before D_00370000 is initialised at 0x0021ACC8)
`module_opening_thread_proc` 0x0021ABD0: SleepThread (0x0021ABE0), `opening_thread_set_vars` (jal 0x0021ABE8), `opening_thread_set_vars_2` (jal 0x0021ABF0, so ra inside it = 0x0021ABF8), `OpeningInit` (jal 0x0021ABF8). Condition: word 0x1F0648 (BootOpening = 1, BootIllegal/BootWarning = 4; facts/opening.md section 1, opening-map.md).
| Module 0x1F0648 | Code | Call | jal pc / ra | a0 | a1 | a2 | a3 | Status |
|---|---|---|---|---|---|---|---|---|
| 4 (illegal scene) | 0x0021AE9C..0x0021AEAC | first | jal 0x0021AEA8 / ra 0x0021AEB0 | 0x6150 (0x0021AE9C) | 2 (0x0021AEA0) | 0 (0x0021AEA4) | 0 (delay slot 0x0021AEAC) | READ; MEASURED (`hddosd-110U-opening3-ill74`, `-pal-illegal`, emulator frame 127): 6150, a1 2, a2 0, a3 0, ra 0x21AEB0 |
| 4 | 0x0021AEB4..0x0021AEBC | second | tail j 0x0021AEBC, no jal; ra = 0x0021ABF8 (the thread proc) | 0x6140 | 6 (0x0021AEB8) | leftover = 0x1F065C + 8i | leftover = 0x1F0658 + 8i | READ; MEASURED: 6140, a1 6, a2 0x1F065C, a3 0x1F0658, ra 0x21ABF8 (ring index 0) |
| 1 (BootOpening) | 0x0021AEC4..0x0021AED0 | only | tail j 0x0021AED0, ra 0x0021ABF8 | 0x6140 (0x0021AEC8) | 0 (0x0021AECC) | leftover from `opening_thread_set_vars` and SleepThread: NOT READABLE statically (`config_get_aspect_ratio` 0x00203D30 does not touch a2/a3) | same | READ only; not measured: no capture with the 0x00200C00 probe covers emulator frame ~127 of a BootOpening run (earliest `opening3-disc6f`, frame 136) |
| other | 0x0021AED8 | none | | | | | | READ |

No pad input is read in the module (facts/opening.md header), so there is no abort path; "start/abort" of the earlier reading is this one thread-start function.
ROM 2.30 (READ, 0x00216470..0x002164A4): module 4: ONLY `0x5014,6` (tail j 0x200BE8 at 0x0021648C, a1 at 0x00216490); module 1: `0x5014,0` (0x00216498 / 0x0021649C). No `0x5015,(2,0,0)` in the ROM. ra = 0x002161F0 (jal at 0x002161E8 in the ROM thread proc).

### B. Stage 2 of `OpeningProcessInner` (decision stage; entered through jtbl_00365400[2] = 0x0021F0F8)
Condition chain (READ, 0x0021F0F8..0x0021F208; tables read from the ELF with `elf_words.mjs`):
1. `is_pal` -> fps 60/50; D_00370000 > 10*fps sets go D_00370094 = 1 (0x0021F100..0x0021F124). go may already be 1 from stage 1 (0x0021F02C or 0x0021F0E8).
2. go == 0 -> leave (0x0021F12C). s0 = D_00370090 (0x0021F130); s0 != 1 -> leave, no sound (0x0021F138). The data value of that word is 1 (opening-map.md) and it is set to -1 right after the sound (0x0021F204): one sound group per ELF load.
3. `enter_clock_module_208378()` (returns [0x2AD22C] == 0) nonzero: `6140,1` (forced clock); snapshot D_003700A0 untouched.
4. Else `is_hdd_boot_ready()` and `get_hddboot_exec() == s0 (1)` (0x0021F160..0x0021F178): `6150,(0,0,0xF)`.
5. Else snapshot D_003700A0 = [0x1F000C] (0x0021F190), idx = disc - 0x6A; idx >= 10 unsigned (0x0021F188) -> `6140,1`; else `jtbl_00365470[idx]`: idx 0, 1, 8, 9 -> 0x0021F1D8; idx 2, 3, 4 -> 0x0021F1B0; idx 5, 6, 7 -> 0x0021F1F4 (ELF 0x365470..0x365494).
| Site (jal pc / ra) | a0 | a1 | a2 | a3 | When (read) | MEASURED |
|---|---|---|---|---|---|---|
| 0x0021F150 / 0x0021F158 | 0x6140 (0x0021F14C) | 1 (0x0021F154) | leftover | leftover | clock forced ([0x2AD22C] == 0) | `-forced`: a2 0x3DB800, a3 0x8000 |
| 0x0021F1B4 / 0x0021F1BC | 0x6140 (0x0021F1B0) | 7 (0x0021F1B8) | leftover | leftover | disc 0x6C, 0x6D, 0x6E, not forced, not hdd-exec | `-disc6c`: a2 0x3DB800, a3 0x8000 |
| 0x0021F1C8 / 0x0021F1D0 | 0x6150 (0x0021F1BC) | 0 (0x0021F1C0) | 0 (0x0021F1C4) | 0x11 (0x0021F1CC) | right after the previous one, same call | `-disc6c`: a2 0, a3 0x11 |
| 0x0021F1E4 / 0x0021F1EC | 0x6150 (0x0021F1D8) | 0 (0x0021F1DC) | 0 (0x0021F1E0) | 0xF (0x0021F1E8) | hdd ready and exec == 1 (0x0021F178 -> 0x0021F1D8), or disc 0x6A, 0x6B, 0x72, 0x73 | `-disc6a`, `-ready-b`: a2 0, a3 0xF |
| 0x0021F1F8 / 0x0021F200 | 0x6140 (0x0021F1F4) | 1 (0x0021F1FC) | leftover | leftover | disc 0x6F, 0x70, 0x71 and every state outside 0x6A..0x73 | `-enter`, `-disc6f`: a2 0x3DB800, a3 0x8000 |

"leftover" a2 of the 6140 calls (READ): a2 = 0x003DB800 (`addiu a2,s1,%lo(D_003DB800)` at 0x0021EF44, not reloaded in stage 2; `is_pal_vmode_p9_tgt`, `enter_clock_module_208378`, `is_hdd_boot_ready`, `get_hddboot_exec_2083B8` do not write a2/a3; `handle_get_vidmode` returns early at 0x0020824C once `var_curvidmode >= 0`). a3: source not read.
MEASURED (`opening3-enter`, `-forced`, `-disc6f`, `-disc6c`, `-disc6a`, `-ready-b`): every 6140 queue call has a2 = 0x3DB800 and a3 = 0x8000; the wire (frame after) is `sceSdRemote(1, 0x6140, a1, 0xFFFFB800, 0xFFFF8000)`. The 6150 calls have a2 = 0 and a3 = 0xF / 0x11 (t0 on the wire = queued a3).
`verify_opening3_stages.mjs` (lines 94-102) compares a0, a1 for 6140 and a0..a3 for 6150: a2/a3 of 6140 are NOT verified.
Frame, relative to D_00370000 at the entry of the `OpeningProcessInner` call (+1 per frame in `OpeningDrawEnd`; starts at the field parity), MEASURED: `-enter` (disc 0x64), `-forced`, `-disc6a/6c/6f`: queued in the call whose entry counter is 122 (emulator frame 249; wire frame 250).
Stage 1 sets go and stage 2 on the call with counter 121 (2*fps = 120 < counter); the stage-2 handler first runs on the next call (INFER from 0x0021F0E8 plus the jump at the top of the next call; matches the measured 122). `-ready-b` (hdd ready, mailbox 1): entry counter 103 (emulator frame 230), `6150,(0,0,0xF)` from ra 0x0021F1EC. The frame follows stage 1's release (disc state, hdd exec) or the camera crossing z 56.
ROM 2.30 stage 3 (counterpart of HDD stage 2; READ 0x0021A7B0..0x0021A908): forced `0x5014,1` (jal 0x0021A7D8, ra 0x0021A7E0) and default `0x5014,1` (jal 0x0021A8C4) as HDD; the hdd-exec branch splits on [0x00208398]: `0x5015,(0,0,0x11)` jal 0x0021A820 vs `(0,0,0xF)` jal 0x0021A8B0;
table 0x6C..0x6E: `0x5014,7` (jal 0x0021A880), `0x5015,(0,0,0x10)` (jal 0x0021A894; a3 is 0x10, not 0x11) and a countdown (0x0021A8D8..0x0021A904) that later sends `0x5015,(7,0,0x11)` (jal 0x0021A8F8); the table has 12 entries (`sltiu 0xC`, 0x0021A838). Agrees with facts/opening.md section 8 (0x5014,7; 0x5015,10; countdown 58; 0x5015,7,11).

### C. Not in BootOpening
`6150,(6,0,0xF)`: in HDD OSD 1.10U it is NOT queued: stage 6 calls `sceSdRemote(1, 0x6150, 6, 0, 0xF)` directly (jal 0x0021F320, ra 0x0021F328; a1 = 0x6150, a2 = 6, a3 = 0, t0 = 0xF), reachable only in the illegal scene (BootIllegal, camera z 672 / stage 4+), never in the normal opening (stage 3 ends it). The ROM queues it (`0x5015,6,0,0xF`, jal 0x0021AA1C).
`6150,(1,0,0)` (ra 0x00225D58), `6150,(6,0,0xF)` (ra 0x00232620) and `6140,2` (ra 0x00225E50) are the clock (group e), not the opening (MEASURED in `sound-ee-boot` frames 127 and 159).
CORRECTION to `sound-events-scout.md`: its "Opening stage 2 ... 6150,(6,0,0xF)" is the direct send of stage 6 in the illegal scene on HDD (not queued), and the clock set-up's 6150,(6,0,0xF) is group (e).

### Native today (scout g, READ)
- `src/scene/opening/Types.hpp:36-40`: `SoundEvent{id, argument, counter}`: one argument. `src/scene/opening/Timeline.cpp:68-90` (stage 2): forced -> `{0x6140,1}`; hdd ready and exec == 1 -> `{0x6150,0xF}`; table idx 0, 1, 8, 9 -> `{0x6150,0xF}`; idx 2..4 -> `{0x6140,7}`, `{0x6150,0x11}`; else `{0x6140,1}` (idx unsigned, as 0x0021F188). Precedence, `pending` and the snapshot match 0x0021F130..0x0021F204.
- `src/app/Main.cpp:486-494`: for each event while `chain->phase() == Opening` (sampled before `chain->step()`): forwards only ids 0x6150 and 0x6140; `0x6150 -> audio->send(id, 0, 0, argument)`, `0x6140 -> audio->send(id, argument, 0, 0)`.
- Missing: (1) thread-start sounds produced nowhere (BootOpening 6140,0; module 4: 6150,(2,0,0) then 6140,6); (2) `SoundEvent` cannot carry a 6150 with a1 != 0 (needed by 6150,(2,0,0) and the stage-6 direct 6150,(6,0,0xF)); (3) 6140 a2/a3: console 0xB800 / 0x8000 at stage 2 (measured) and ring-address junk at start, app sends 0, 0;
  (4) INFER: `inOpening` is sampled before `chain->step()`, events from the step that ends Opening would be dropped, a start event at phase entry comes before the first Opening step: check the order; (5) stage-6 direct send not modelled (outside BootOpening). All five stage-2 variants are emitted with the right a0/a1/a3.

### Probes (g)
- HDD: entry 0x0021AE78 with range 0x001F0648:0x4; 0x00200C00 (a0..a3, ra): expect ra 0x0021AEB0 and 0x0021ABF8. Needs a BootOpening capture (`SkipSearchLater BootOpening`) starting at emulator frame <= 120 (interpreter; the module's first frame is 128) with the 0x00200C00 probe. Closes the 6140,0 row and its a2/a3.
- Entry 0x0021EF00 with 0x00370000:0x4, 0x003DB850:0x4, 0x00370090:0x8 (D_00370090, D_00370094), 0x001F000C:0x4, 0x002AD22C:0xC, 0x002AD230:0x8: counter and conditions at each send.
- 0x00200C00 with ra in {0x0021F158, 0x0021F1BC, 0x0021F1D0, 0x0021F1EC, 0x0021F200}: a0..a3 low 16 bits (6140: a2 0xB800, a3 0x8000).
- Wire 0x00294738: a0 = 1, a1 = cmd, a2, a3, t0 (wire a2/a3/t0 = queued a1/a2/a3). Ring 0x1F0658..0x1F0A60, head/tail 0x1F0A60 / 0x1F0A5C.
- ROM 2.30: 0x00216470 + 0x001F05E8:0x4; 0x00200BE8 (ra in {0x002161F0, 0x0021A7E0, 0x0021A828, 0x0021A89C, 0x0021A8B8, 0x0021A8CC, 0x0021A904, 0x0021AA24}); the counter is at gp-relative -0x78F0 (0x0021A798). ROM wire pc unresolved (find_in_rom: HDD 0x200A80 -> ROM 0x2007D8 head 6/16; 0x294738 -> 0x206218 head 3/16: not trusted).
- Native: a test that runs Timeline with the stimulus table of the facts and asserts the event list including a start event, with `SoundEvent` extended to a1/a2/a3.

## Cross-cutting
1. a3 is never loaded at the 0x6300 sites. Scouts a, b, c, d agree: no site in the main menu, System Configuration, Version page or Square sets a3 (or t0). The queued a3 halfword is whatever the register held: a ring-slot leftover when the site follows another queue call
   (the second of a pair gets `0x1F0658 + 8*s` of the first, group d), and a stale caller or callee value otherwise. Scout c INFERS 0x57 or 1 at the Version move sites (`movz a3,t0,v0` at 0x0022A820); scout d notes the app's 1784 / 1800 are `0x658 + 8*idx` of one capture, not constants. Do not assume 0.
   Whether the IOP reads slot.a3 for 0x6300 at all is unread. A verifier must record a3 per site; a probe at pc 0x00200C00 closes it.
2. The 0x6140,2 clock set-up (group e) is the ring-temporary case: its a2/a3 are `(0x065C + 8*s)` and `(0x0658 + 8*s)` with s = head & 127 at the preceding 6150,6 enqueue (s = 16 in the capture). The same rule explains the opening's start-pair second entry (6140,6 with a2 0x1F065C, a3 0x1F0658 at ring index 0, MEASURED, group g).
   The opening's stage-2 6140 calls instead carry a2 0x3DB800 and a3 0x8000 (MEASURED), not ring temporaries; a3 0x8000 is not traced to an instruction.
3. Origin of each `kClockCommands` entry (`D:/CodingProjects/CrystalClockVK/src/audio/ClockSound.cpp`, 19 entries; scout e):

   | # | Entry | Source |
   |---|---|---|
   | 0 | 0x6150,(1,0,0) at 0 | EE queue, thread proc 0x00225D50 (ring slot 0) |
   | 1 | 0x8070,(10,0,0x1F0662..) at 23 | NOT the clock: direct `sceSdRemote(1,0x8070,a2=0xA,a3=sp[0])` at 0x0020CE2C in `pad_sound_handler_thread_proc` after the drain, when word 0x1F0114 is nonzero (0x14: a3 = 0 at 0x0020CDF8; 0x15: 2; 0x13: 0xF; 0x12: 1; other: stale sp[0]); it clears 0x1F0114 at 0x0020CE38. Writers of 0x1F0114 (more exist in the Browser and two zeroing sites: facts/sound-events.md section 1): main 0x0020DD5C (0x14 if `config_get_spdif_mode` == 0, else 0x15, at boot) and `clock_config_change_cb_spdif_mode` 0x00227DD8. It is the boot S/PDIF push, seen because that was the first drain. The third arg 0x1F0662 is a stale t0, not a parameter |
   | 2..16 | fifteen 0x60D0,(1,v,v), v = 344*k, k = 0..14 | the drain ramp: `sound_handler_2009E0(0xF)` called at 0x00200BC0; one queue_cmd per drain (jal 0x00200A40; a1 = 1, a2 = a3 = v); counter D_002AAF80 incremented at 0x00200A5C until 15. Enqueued in drain N, sent in drain N+1. Not clock commands; they occupy ring slots 1..15 |
   | 17 | 0x6150,(6,0,15) at 24830 | EE queue, `func_002324C8` 0x00232618 (slot 16) |
   | 18 | 0x6140,(2,1756,1752) at 24853 | EE queue, `func_002324C8` tail call 0x00232634; a2/a3 = clobbered address halves, s = 16 |

   So entries 0, 17, 18 come from the two clock senders; 2..16 are the drain ramp; 1 is elsewhere. The +23 sample offset of entries 1 and 18 is wire order inside one drain. The t0 column (e.g. 2684494352) is a stale register at the wire, never a command argument.
   Consequence for the native replay (scout e): entry 18's a2/a3 must be computed (0x065C + 8s, 0x0658 + 8s, s = head & 127 at the 6150,6 enqueue), not copied; 17/18 are sent only when 0x002AD22C != 0; each clock re-wake sends 17/18 again without entry 0.
4. Drain cadence: scout e records the first drain at about 800 samples and later ones at 1602, with who wakes `pad_sound_handler_thread_proc` as an open item (probe pc 0x0020CD68, ra of the waker). Scout d read the wake: `vblankHandler` 0x0020C950 calls `iWakeupThread(D_001F0000)` at 0x0020CA40 unconditionally each vblank, and the thread wakes from SleepThread (0x0020CD60). The two are not reconciled (Open).
   A verifier of the sent list must model the drain separately from the queued list (equal 0x6300 a2 in one drain collapse, scouts a, b).
5. Disc state in the app: idle value 0x64 (no disc; `HostInputs.cpp:35` kNoDisc), always equal to the last-seen value, so the 0x6150,2 disc-change sounds (group f) never fire at idle and nothing is missing there. A disc source and the clock-exit switch (step 6 of group f) are needed before they can fire.
6. Command-id pairing: HDD 0x6140 / 0x6150 / 0x6300 = ROM 0x5014 / 0x5015 / 0x5200, paired by call site. The ROM set-up (group e) and ROM thread start (group g) differ from the HDD in what they send, not only in ids.

## Disagreements between scouts
- ra of the System Configuration list sites and the Square hide second call: scout b says 0x0023248C; scouts a and d say 0x00232490 (return of the jal at 0x00232488; MIPS jal returns at pc + 8). Not reconciled. Applying pc + 8, 0x00232490 is the consistent value; the probe at pc 0x00200C00 settles it.
- ra of the Version circle and row enter: scout a says 0x00232484; scout c says 0x00232488 (jal 0x00232480 in `module_clock_232458`; pc + 8 gives 0x00232488, which matches scout c). Not reconciled; scout a's probe list uses 0x00232484.
- ra at ROM StartSysConfig: scout a says 0x0022E6BC (jal 0x0022E6B4); scout b says 0x0022E6B8. Not reconciled.
- Scout f's ras 0x00225B68 and 0x00225B80 do not equal pc + 8 of its jal pcs 0x00225B5C and 0x00225B7C (0x00225B64, 0x00225B84); ROM 0x002211E8 vs jal 0x002211DC (0x002211E4) likewise; scout e's ROM 0x0022142C vs jal 0x00221428 (pc + 8 = 0x00221430). Left as stated; the probe records ra.
- Scout d writes the `module_clock_231E48` j at 0x00232E70; scouts a and b write 0x00231E70. Scout d's is probably a typo (INFER); the lower address is in the module.
- Scout c lists the row-enter probe pc as 0x00229FC4 while its own site table gives j 0x00228FC4. Not reconciled.
- Scout d's drain reading (one vblank wake) versus scout e's open drain-cadence item (800 then 1602 samples): not reconciled, see Cross-cutting 4.
- `sound-events-scout.md` (2026-10-03) versus scouts e and g: its set-up second command (2,0,0xF) is wrong (scout e), and its stage-2 6150,(6,0,0xF) is the stage-6 direct send (scout g). Corrected above.

## Open
(a)
- a3 (and t0) at the queue call is never loaded by any main-menu site; probe a3 at pc 0x00200C00 over a capture with cursor moves.
- `func_00232020` chain (`func_0022D6A8`, `func_0022E300`, `func_0022AAF0`) not read; facts name it: page, version, dialog and first-run ramps hidden and D_003701D0 = 0. Read those or probe their return values.
- Button naming (0x20 cross, 0x40 circle) rests on the facts pages and behaviour; the libpad mapping was not read.
- Browser confirm requires the mode word 0x00370AB4 == 0 (0x002323A4); nonzero queues nothing. Writer: facts/clock-transitions.md (mode/weight).
- ROM: SysConfig circle and version circle sites unresolved by scout a (find_in_rom ambiguity 0x002261A0); StartSysConfig final j in ROM not read.
- The drain skips a 0x6300 whose a2 equals the previous entry's a2 within one drain (readings only): a verifier of the sent list must model the drain separately.

(b)
- a3 at every site: probe a3 at pc 0x00200C00 per event (pad word, list state at 0x00231C50); if deterministic it comes from a callee return value or a last load.
- Entry names for ids 0x6A, 0x6B, 0x6F, 0x72, 0x75, 0x1F9, 0x1D7, 0x12E. INFER only: idx1 has 3 values on item 0 (the Aspect entry of the facts, Screen Size) and 0x1D7 gets 9 values from `func_00228228` (Language-type). Probe the string returned by `get_lang_string_GetOSDString_hkdosd_p2_tgt` for each id at `func_002311E8`.
- Value of item 0x13 on the captures (decides 7 or 8 entries and the triangle row): word 0x0040917C at 0x00231C50.
- D_00370A88 meaning (blocks the front page move and AEB8 confirm sounds).
- `func_0022B3A8` gating on the page state not traced; the Options dialog conditions are partial.
- ROM: gp, ring head and tail, and the item 0x13 equivalent not resolved statically. ROM triangle for entries other than 0 sends no sound (bnez 0x0022DE38).
- Pad bit labels come from the facts, not the pad library.
- Clock Adjustment up/down repeat words come from `func_00235EB0` repeat timing; per-frame sound count while held (1 at press, none until 0x1F frames, then every 3rd frame) is READ, not measured.

(c)
- a3 values at all five Version sites (probe above).
- Pad-word timing (edge vs repeat) for 0x1000 / 0x4000 at 0x00370334.
- Whether the 0x0022A7E4 alpha gate lets the first held frame through (needs a capture).
- ROM 2.30 equivalents of the Version page (0x5200?) not read.
- Sounds of sub-pages (`func_00229028`, `func_00229080`, `func_002297D0`, `func_00228FD8`) not read.

(d)
- a3 of the first queue call of each Square pair (384 / 0xFFFF8000 in the app): stale register; probe a3 at pc 0x00230C80 / 0x00230CE8 entry and at 0x00200C00.
- Whether the IOP uses slot.a3 at all.
- ROM gate (0x0022DFD8 vs HDD 0x00231C50) and the ROM `func_002316B8` body: only the Square branch order and j targets read.
- Where per frame `func_00235EB0` runs relative to `module_clock_232458` (scout d: not read; scout b reads it after the jal at 0x00225EBC, see the frame-order note): press frame = the frame whose pressed word has bit 0x80.
- A vblank between the two enqueue calls of a pair.
- The app's gates (list ramp 2, 0x002B2E00 == 0, menu ramp 0/2) versus the console's were not compared line by line; ROM gating needs its own probe.

(e)
- Drain cadence (800 samples first, then 1602): who wakes `pad_sound_handler_thread_proc`. Probe pc 0x0020CD68, ra of the waker.
- Exact frames from 6150,1 to the set-up pair per build: measure with the probes; 31 frames is one capture's load time.
- ROM 0x5014,2 a2/a3 and ra at the send not read; whether the ROM sends a 0x5015,6 elsewhere.
- Meaning of the 0x6140 / 0x6150 ids (inside the IOP) is open.
- Whether entry 1 (0x8070) fires at clock start in a normal boot depends on 0x1F0114 still set at the first drain; in the capture it was.
- Scout e ran no live capture (the sound-ee captures were not found on disk by that scout; scout g reports MEASURED frames 127 and 159 from `sound-ee-boot`).

(f)
- What D_002B46D0 (+0xC) is, and exactly which condition sets the flag for a stimulated write: probe the words at 0x00225A4C.
- The cdvd thread wake rate (WaitSema on `unksema_392900` + 4; who signals): decides how soon the nop patch is needed.
- Whether the mode word is 0 at the chosen write frame (read D_00370AB4 in the same capture).
- What command 2 does on the IOP: the wire pc 0x00294738 shows what is sent, not its effect.
- ROM compare table 0x2C47A0 use and the ROM writer 0x0020F740 were read from the dump and facts, not disassembled.
- Native: these sounds need a disc source (none exists) and the exit switch (step 6) ported.
- No live capture of this branch exists (scout f).

(g)
- BootOpening `6140,0`: read, not measured; a2/a3 after SleepThread unreadable statically.
- Source of a3 = 0x8000 at stage 2 (measured, not traced to an instruction).
- Start sounds have no frame relative to D_00370000 (they precede its initialisation at 0x0021ACC8).
- What the IOP does with 6140 a2/a3 and with the ids at all.
- ROM wire pc; PAL stage-2 frame (fps 50; the start pair measured in `-pal-illegal`, same as NTSC).
