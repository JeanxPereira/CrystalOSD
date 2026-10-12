# Scale target, orb mode, orb weight, ramps (HDD OSD 1.10U, static read)

Addresses are HDD OSD 1.10U. gp = 0x00377970 (D_00370294 = gp - 0x76DC, D_003702D0 = gp - 0x76A0).
Static ELF values read from hddosd.elf (single PT_LOAD, vaddr 0x200000 -> file 0x1000).
"Read" = disassembly read; "inferred" = my reading of what the code is for; "NOT DETERMINED" = no evidence.

## 0. Ramp object (needed to read everything else)

All ramps are 4-word objects {len @0, cur @4, edge @8, state @0xC}. Helpers (clock/func_00234A60..B10):

| fn | address | behaviour |
|---|---|---|
| func_00234A60 / A68 | 00234A60 / 00234A68 | return len / cur |
| func_00234A70(o, n) | 00234A70 | return cur * n / len |
| func_00234A98(o, s) | 00234A98 | return state == s |
| func_00234AA8 | 00234AA8 | return edge flag |
| func_00234AB0(o) | 00234AB0 | state = cur = edge = 0 |
| func_00234AC0(o) | 00234AC0 | if state == 0: cur = 0, state = 1, edge = 1 (start rising) |
| func_00234AE0(o) | 00234AE0 | if state == 2: edge = 1, state = 3, cur = len (start falling) |
| func_00234B10(o) (tick) | 00234B10 | edge = 0; state 1: cur++, when cur == len -> state 2, edge 1; state 3: cur--, when cur == 0 -> state 0, edge 1 |

State 0 = idle at 0, 1 = rising, 2 = hold at full, 3 = falling.

## 1. D_00370294 (scale target): every writer

Static initial value: 1.0f (ELF 0x370294 = 0x3F800000). Only the instructions below store to it (grep over all asm; the readers are func_00232640 only).
`D_0036FBC8` (source of the 0.8) is static data = 0x3F4CCCCD = 0.8f; no code writes it.

| # | writer instruction | function | value | condition / caller | situation |
|---|---|---|---|---|---|
| 1 | 0022D818 `swc1 $f0, D_00370294` (f0 = D_0036FBC8) | func_0022D760 (0022D760-0022D820) | 0.8f (0x3F4CCCCD) | unconditional inside the function; the only caller is the tail jump `j func_0022D760` at 00232608 in func_002324C8, taken only if `enter_clock_module_208378()` != 0 (00232 5E4-00232 5EC) | clock-thread init when `should_enter_clock_module_2AD22C == 0` (see below) |
| 2 | 0022DB74 `swc1 $f0, D_00370294` (f0 = 1.0f, 0022DB5C-0022DB60) | func_0022D828 (0022D828-0022DBC4), case 5 of the jump table | 1.0f | case 5 only (D_00370264 == 5), when ramp D_002B46E0 is idle (state 0, 0022DB4C-0022DB54). In the same step D_002B2170 (scale itself) is also set to 1.0f (0022DB6C) | end of the intro state machine: scale snaps to 1, then mode 2 started and `disable_enter_clock_module_208388` called |
| 3 | 00227BAC (delay slot of `jal func_00238FB8`) `swc1 $f0, D_00370294`, f0 = 1.0f | clock_config_change_cb_clock (00227B90-00227BE4) | 1.0f | unconditional. Starts with `jal config_item_change_cb_clock_write_mechacon` (writes the edited clock to the mechacon) | callback entry 4 of the table at 0x002B2C04..0x002B2C18 (value 0x00227B90 at 0x002B2C10). Inferred: Clock Adjustment CONFIRM (it writes the clock) |
| 4 | 00227C04 (delay slot of `jal func_00238FB8`), f0 = 1.0f | D_00227BE8 (00227BE8-00227C38) | 1.0f | unconditional. Starts with `jal func_00235848` (reloads the clock/time-zone fields from 0x1F0D1C..0x1F0D30 into D_00409230, via func_002358F8) | callback entry 5 of the same table (0x002B2C14). Inferred: Clock Adjustment CANCEL/back (same tail as #3 but no mechacon write) |
| 5 | 00227008 (delay slot of `jal func_00239018`) `sw $zero, D_00370294` | D_00226FD0 (00226FD0-002270A4) | 0 (integer zero = 0.0f) | unconditional. Also calls func_00235938 (D_00370320 = 0), zeroes config item 0xB, loads items 6..0xB (year..) into func_002358F8, tail-calls func_00227488 | callback entry 1 of the same table (0x002B2C04). Inferred: ENTER Clock Adjustment |

Callback table: 0x002B2BF0 = {0x6A, 6, ...}, 0x002B2C04..0x002B2C18 = {00226FD0, 00227420, 00227AD0, 00227B90, 00227BE8, 00227CE8} (ELF read). These three are only reachable through this table (the only words in the ELF equal to those addresses are 0x002B2C04, 0x002B2C10, 0x002B2C14), so no `jal` caller exists. NOT DETERMINED: which menu event invokes entry k (the dispatcher that reads the table at 0x002B2BF0 was not found by symbol grep; it is probably addressed by a computed pointer). The enter/confirm/cancel labels are inferred from what each callback does (target 0 + fade-out ramp func_00239018 at enter; target 1 + fade-in ramp func_00238FB8 at the two exits). They fit the measured 0 in Clock Adjustment.

Companion effects in #3/#4/#5: func_00238FB8 (00238FB8) starts ramp D_002B61B0 rising (if idle) or turns it from falling to rising; func_00239018 starts it falling. func_00235928 sets D_00370320 = 1, func_00235938 sets it 0.

### How 0.8 vs 1 arises (read)

- func_002324C8 (002324C8-00232638) is the clock-module init, called once per clock thread start from module_clock_init_resources (00225E48), itself called at the top of clock_input_check_handler_p6_p7_tgt (002259DC).
- End of func_002324C8: `enter_clock_module_208378()` returns `(should_enter_clock_module_2AD22C == 0)` (00208378-00208384).
  - result != 0: (before that, `func_00234AB0` + `func_00234AE0` are applied to the ramp at 0x002B2E78, 002325DC-002325F4), then tail `j func_0022D760`: target = 0.8, D_00370264 = 0, D_00370238 = 0x80, ramps D_002B46D0 (rising, len 1 from static), D_002B46F0 / D_002B46E0 reset, D_002B46F0 len = 60 NTSC / 50 PAL, D_002B46E0 len and D_002B4A34 = 30 NTSC / 25 PAL.
  - result == 0: sound 0x6150(6,0,0xF) + 0x6140(2) only; target stays at its static 1.0.
- `should_enter_clock_module_2AD22C`: cleared by enable_enter_clock_module_208398 (002083A0), whose only caller is main at 0020DAE4: reached when `config_first()` != 0 or `oobe_forced` != 0 (0020DAD0-0020DAE0). Set to 1 by disable_enter_clock_module_208388 (00208394), only caller func_0022D828 at 0022DBAC (state 5).
  So: first boot / forced OOBE -> flag 0 -> clock thread init runs func_0022D760 (target 0.8, intro state machine). Normal boot -> flag 1 -> target remains 1.0. Also opening_transition_to_clock (0021AEF4), OpeningProcessInner (0021F140), main (0020DF54) read the same flag.
- func_0022D828 (called every frame from module_clock_232458, 002324B0, from clock_orb_rendering_func 00225EBC) runs the state machine on D_00370264 (jump table jtbl_00365710 at 0x365710: cases 0,1 -> 0022D894; 2,4 -> 0022D92C; 3 -> 0022DA30; 5 -> 0022DB3C). It only runs when ramp D_002B46D0 is in state 2 (0022D84C-0022D854) and `is_config_dirty()` == 0 (0022D85C-0022D864).
  - cases 0,1 (0022D894-0022D914): run one cycle of ramp D_002B46F0 (rise len, hold len counting cur down from len, fall len; hold/fall via AE0/B10 at 0022D8D0-0022D90C). First frame: D_00370238 = 0x80 and `func_00234C28(4)` (mode 4). When the cycle ends (state 0) D_00370264++ (0022D924, 0022DB30-0022DB38).
  - cases 2,4 (0022D92C-0022DA28): D_00370238 = D_002B46E0.cur*128/len (func_00234A70, 0022D938-0022D948), calls func_002266E0(1,1,0x56,1), func_002266D0(0), func_002266C0(1) (0022D94C-0022D96C); starts ramp D_002B46E0 rising; at hold waits for `D_00370334 & 0x20` (pad state word from func_00235EB0), then plays sound 0x6300 and starts falling; when it ends: in case 2 only, `func_00234C28(2)` + sounds 0x6150/0x6140 (0022D9F8-0022DA1C), then `func_002266C0(0)`, D_00370264++.
  - case 3 (0022DA30-0022DB30): D_00370238 = 0, uses the object returned by func_0022AAF0 (= D_003701D0, a pointer set by func_0022ABC8 / cleared by func_0022AD50) with a ramp at +0x1C; when it finishes falling and `get_clock_should_render_orbs()` == 0 it calls func_0022AD50, then either D_00370264-- (if D_002B4A30 == 3) or config_mark_dirty + func_00234F68 and D_00370264++. Also `func_00234C28(3)` at 0022DAB8 when that object's ramp is in state 3 and finished (0022DA84-0022DAC0). Meaning of this state NOT DETERMINED beyond that (OOBE-screen object, not read in full).
  - case 5 (0022DB3C-0022DBB4): D_00370238 = 0x80; waits for D_002B46E0 state 0; then D_002B2170 = 1.0, D_00370294 = 1.0, AE0(D_002B46D0); if `[0x002B2174] == 0` (word at 0x002B2170+4, zeroed by the clock thread at start, 002259E0, and set to 1 by the thread loop) -> `func_00234C28(2)` + sounds; then `disable_enter_clock_module_208388`.
- NOT DETERMINED: why ROM 2.30 shows 0.8 in the main menu after 900 frames. HDD OSD can only produce 0.8 through writer #1 (flag == 0 path), and state 5 (writer #2) changes it to 1.0 only after the intro state machine reaches case 5 (needs a pad bit in cases 2/4 and an object in case 3). A run that never completes it stays at 0.8. I did not read ROM 2.30; the HDD OSD flag path is the evidence.

Scale itself (func_00232640 00232640-002326E8, for reference): D_00370290 += 30 (16-bit); if func_00235B08() == 0: D_002B2170 = 0; else D_002B2170 += (D_00370294 - D_002B2170) * D_0036FC10 (= 0.03f, ELF read).

## 2. D_00370AB4 (the mode)

Writers (all):

| writer | address | value |
|---|---|---|
| func_00234B88 | 00234C00 | 0 (clock thread init; also orbs weight = 0, D_003702E8 = 1, D_003702E4 = len) |
| func_00234C28(a0) | 00234C40 | a0 (always, first thing) |
| func_00234EA8 | 00234EF0 | 0 (when the ramp of modes 1/2 finishes, see below) |

Callers of func_00234C28 (static `jal`; no function-pointer caller was searched for): module_clock_init_resources 00225E60 with 2; clock_input_check_handler_p6_p7_tgt 00225B80 with 3; func_0022D828 at 0022D8C0 with 4, 0022D9F8 with 2, 0022DAB8 with 3, 0022DB84 with 2. No caller passes 0 or 1.

func_00234C28 (00234C28-00234CCC): stores mode; sets D_002B5F30[+0x20] = [0x1F0CB4] << 4 and [+0x24] = [0x1F0CB8] << 4 (screen size in 1/16 px); then per mode (D_002B5F30 is the 0..255 colour / alpha packet the full-screen overlay uses, quad drawn by func_00234E08 every frame with alpha word [+0xC] = 128 - weight, 00234E4C-00234E60):

| mode | colour words [5F30],[5F34],[5F38] | weight (g_clock_should_render_orbs) | other | 
|---|---|---|---|
| 0 | not touched | not touched | |
| 1 | 0xFF, 0xFF, 0xFF (00234C90-00234C9C) | 0 | |
| 2 | 0, 0, 0 (00234CBC-00234CC8) | 0 | |
| 3 | 0, 0, 0 (00234CA4-00234CB8) | 0x80 | then `j func_00234D18` = start falling of ramp D_002B5F20 if it is in hold |
| 4 | 0, 0, 0 (00234C80, 00234CC0-00234CC8) | 0 | |

func_00234EA8 (per frame, from clock_orb_rendering_func 00225EFC; 00234EA8-00234F30):
- mode <= 0: nothing, then check below.
- mode 1 or 2 (< 3): weight += 1; if weight > 128: weight = 128, mode = 0.
- mode 3: weight -= 1, clamp at 0. Mode STAYS 3.
- mode 4 (and > 3): nothing.
- then: if mode == 2 and weight == 128 - D_003702E4 -> func_00234CD0 (00234CD0: start rising of ramp D_002B5F20 if idle). (D_003702E4 = D_002B5F20 len = 80 NTSC / 66 PAL.)

Meaning of each value (evidence):
- 0: normal, no transition. Evidence: set at init and when the 1/2 ramp ends; module_clock_234E70 (00234E88-00234E98) only draws the D_002B5F20 band (func_00234D60) when `func_00234B80() == 0`; the clock thread loop (00225AFC-00225B88) treats mode 0 as "start leaving".
- 1: weight ramps 0 -> 128 over 128 frames and the overlay colour is white (0xFF,0xFF,0xFF) with alpha 128 - weight: a fade IN from white. NOT DETERMINED who uses it: no `jal` passes 1 (reachable only through computed calls).
- 2: same ramp with a black overlay: fade IN from black, plus orb displacement/colour blend in module_clock_22F908 (section 6) and the D_002B5F20 ramp start at weight 128 - D_003702E4. Set at clock thread init (00225E60), and by func_0022D828 at the end of the intro (cases 2 and 5). 
- 3: weight set to 128 then ramps down to 0 with a black overlay of alpha 128 - weight: a fade OUT; the clock thread (00225B04-00225BA0): when mode == 0 it plays a sound chosen by `[0x00370A7C]-0x6A` (jtbl_00365530) and calls `func_00234C28(3)` (00225B80); while mode != 0 and weight > 0 it keeps drawing (00225B90-00225B9C); when mode != 0 and weight <= 0 (00225B98 -> 00225BCC) it maps the pending screen code (0x6A..0x74) to values for 0x1F0010 / 0x1F0648 / 0x1F064C and leaves the thread (00225CC4-00225D28). So 3 = leaving the clock screen. Also used by func_0022D828 (0022DAB8). Orb draw function: orb 0 moves outward (section 6).
- 4: weight 0, black overlay held opaque (alpha 128), no ramp (func_00234EA8 does nothing for mode > 3). Set only at the first frame of the intro cases 0/1 of func_0022D828 (0022D8C0). Inferred: "hold black during the intro delay".

Readers of mode (`func_00234B80`, 00234B80): module_clock_22F908, clock_input_check_handler (00225AFC), module_clock_234E70, func_002320B0 (tests 2 at 002320E8 and 3 at 00232138), module_clock_233338 (00233380, "mode == 0"), menupos_p3_p8_tgt (002323A4, "mode == 0"), func_0022D828 (0022DA40, "mode != 0 -> skip").

## 3. g_clock_should_render_orbs (weight, gp D_00370AB8 = 0x00370AB8; `lw` at gp-rel 0x9148)

Writers: func_00234B88 00234C08 (= 0); func_00234C28 (00234C90 / 00234CB0 = 0x80 in mode 3 / 00234CCC and 00234C90 = 0 otherwise, see table); func_00234EA8 (00234ED0-00234EF0 increment/clamp to 128, 00234EF4-00234F04 decrement/clamp to 0). Reader get_clock_should_render_orbs (00234B78).
Rule per frame: see func_00234EA8 above: +1 per frame in modes 1/2 (until 128, then mode becomes 0), -1 per frame in mode 3 (until 0), constant otherwise.
Gates / uses (all read):
- module_clock_22F908: position displacement and colour blend weight (section 6).
- func_00234E08 (00234E4C-00234E60): overlay alpha = 128 - weight.
- clock thread: weight <= 0 in mode != 0 triggers leaving (00225B90-00225B9C).
- func_0022D828 case 3 (0022DAE4-0022DAEC): proceeds only when weight == 0.
- func_00230008 (00230055), func_00231E78 (00231F0C), func_002320B0 (002320F4, 00232144 tests weight == 128 - D_003702D0 in mode 2, == 128 in mode 3): coordinate other UI ramps with it (not read further).
Name suggests it gates orb rendering; the code reads it as a 0..128 weight, not as a boolean gate. No code was found that skips orb drawing when it is 0 (not searched in the draw submission functions).

## 4. Ramp D_002B5640

- func_0022F078 (0022F078-0022F104): if D_002B5640 is in state 0: reset it (AB0), start rising (AC0), then for i in 0..11 zero the word at 0x10 of entry `(i + [0x00404F70]) % 12` of the 0x30-byte-stride array at D_00404F70. Only caller: StartSysConfig (0x00230F18, 00230EC0-00230F3C), called by menupos_p3_p8_tgt (002323D4): opening the System Configuration main screen. StartSysConfig also sets D_002B2E04.len = D_003702E0 + D_003702CC + D_003702D0, starts D_002B2E04 rising, calls func_00234D18 and func_002331C8, plays sound 0x6300.
- func_0022F110 (0022F110-0022F19C): if D_002B5640 is in state 2: start falling (AE0) and zero the same 12 words. Only caller: func_00230FD8 at 002310E4 (00230FD8-002311E0, called each frame from module_clock_231E48 -> module_clock_231E48 00231E5C): in the branch where D_002B2E04 is in state 3 (falling), D_002B46B8 state 0 and `D_002B2E04.cur == D_003702E8` (002310D0-002310E4), i.e. the last frame of closing the System Configuration screen.
- D_003702E8: written only by func_00234B88 at 00234BF4 with the constant 1 (addiu v0, zero, 1 at 00234BEC). D_002B5640.len is copied from it by func_0022EF40 (0022EF44/0022EF5C), called by module_clock_init_resources (00225E40). So the ramp length is 1 frame (it is effectively a trigger plus a reset of the 12 entries). NOT DETERMINED: what the 12 entries at D_00404F70 are (not read).
- func_0022EF40's remaining body (not read in full) initialises the per-orb random values at D_00405210 (lui at 0022F014-0022F01C).

## 5. Object 0x002B5780 and D_003702D0, D_00370AA4

- D_002B5780 is a ramp object (static {0,0,0,0}), initialised in func_002324C8 (002325C8): len = D_003702CC + D_003702D0 (= 50 NTSC / 41 PAL). It is ticked each frame by module_clock_230DF0 (00230DFC, then func_00230D58), driven by the System Configuration menu code (func_00231C50: states of D_002B2E04 vs D_002B5780 at 00231D1C-00231DE4; D_00227AD0 / D_00228660 / D_00229A90 only test whether it is idle). Role: the sub-ramp of the Clock Adjustment field editor (inferred; those callbacks call config item 6..0xA getters).
- func_00230C28 (00230C28-00230C7C): returns clamp(cur - D_003702CC, 0, D_003702D0) * 128 / D_003702D0.
- D_003702D0: single writer func_002324C8 at 002325D0: `D_003702D0 = fps / 6` = 10 on NTSC (60), 8 on PAL (50) (0023257C: movz s0 = 0x3C if !PAL else 0x32; div by 6). D_003702CC (002324C8 00232574) = fps*40/60 = 40 NTSC / 33 PAL; D_003702E0 (func_00234B88 00234BCC) = same formula. D_003702E4 = fps*80/60 = 80 NTSC / 66 PAL (00234C14).
- D_00370AA4: writers func_002324C8 (00232540: 0) and func_00232640 (002326AC: 0; 002326D8: `10 - cur*10/D_003702D0` when cur < D_003702D0, cur = D_002B5780.cur). Readers: module_clock_22FEF0 (getter), module_clock_2308F0 (00230B60), module_clock_232438 (00232438: if value >= 5 call func_00236490(value - 5)). So it is a 0..10 index derived from the first D_003702D0 frames of D_002B5780. NOT DETERMINED: what func_00236490 does.

## 6. module_clock_22F908 (0022F908-0022FC84): per-orb special branches

Input a0 = s2 = draw entry. k = [s2 + 0x130] (orb index). Position (x, y floats) is produced at sp+0 / sp+4 by module_clock_237300(sp, s2 + 0x10). Colour is 4 ints at sp+0x10 filled below. At the end: module_clock_239E98(k, sp) then module_clock_239078(D_002B6200 + k * 0x650) (0022FC44-0022FC60).

Constants: C1 = 1/128 = 0x3C000000. Sine helper F = func_00239FF0, cosine helper G = func_0023A040:
- F(a): a = (int16)a; idx = |a|; if idx >= 0x4000: idx = 0x8000 - idx; r = table[idx] (float table D_0040EAA0); if a < 0 then r = -r. table[i] = (float)sin(i * 1.5707963267948966 / 16385.0), i = 0..0x4000 (func_00239F48, 00239F48-00239FEC; the two doubles read from ELF 0x365A20 / 0x365A28). So angle unit: 0x10000 = full turn (approximately; divisor 16385 not 16384).
- G(a) = F((int16)(a + 0x4000)) (0023A040).
- The int `[0x00405210 + 4k]` = per-orb random value R_k (written by func_0022EF40's tail, not read).

Mode value comes from func_00234B80 (re-read each time). W = get_clock_should_render_orbs() (int 0..128). Let M = mode.

### Which orbs move (0022F93C-0022F99C)

- Branch A: M == 2 and `[0x001F064C] == 1`: ALL orbs (any k), uses R_k.
- Branch B: M == 2 and k == 0 (and [0x1F064C] != 1): only orb 0, R_0.
- Branch C: M == 3 and k == 0: only orb 0, R_0.
- Otherwise no position change (jump to 0022FACC).

### Position arithmetic (0022F9A8-0022FAC8), common part, in order

```
R   = (int32)[0x00405210 + 4*k]
a   = (int16)((int32)(W << 14) converted to float * 0.0078125, truncated to int)   // = (int16)(W * 128), exact
s   = (int16)R                                                                     // sll16/sra16
f20 = 1.0f - F(a)                                                                  // 0022F9F0-0022F9F8
c   = G(s)                                                                         // 0022F9FC
Wd  = [0x001F0CB4];  Wd2 = (Wd + (Wd >>> 31)) >> 1                                 // signed /2, toward zero
f21 = ((float)Wd2 * c) * f20                                                       // 0022FA04-0022FA28  (the last mul is in the jal delay slot, before F(s) is called)
sn  = F(s)
Hd  = [0x001F0CB8];  Hd2 = (Hd + (Hd >>> 31)) >> 1
f20 = ((float)Hd2 * sn) * f20                                                      // 0022FA2C-0022FA4C (final mul in delay slot; old f20)
```

So (f21, f20) is an ellipse offset (half width * cos(s), half height * sin(s)) times (1 - sin(a)). a = W*128 so F(a) goes from 0 to ~1 as W goes 0 -> 128.

### Mode 2 (branches A and B) (0022FA54-0022FA6C)

```
x = x + f21
y = y + f20
```
Orbs start offset by the full ellipse offset at W = 0 and converge to their true position as W -> 128 (offset factor 1 - F(W*128), about 1.8e-9 at W = 128, not exactly 0).

### Mode 3, orb 0 only (branch C) (0022FA7C-0022FAC8), float ops in order

```
f1 = (float)W
f2 = 1.5f                      // 0x3FC00000
f3 = x ; f0 = y
f4 = f20 * f2
f1 = f1 * 0.0078125f           // W / 128
f2 = f21 * f2
f0 = f0 * f1
f3 = f3 * f1
f0 = f0 + f4
f3 = f3 + f2
y = f0 ; x = f3
```
i.e. x' = x * (W/128) + 1.5 * f21, y' = y * (W/128) + 1.5 * f20. W falls 128 -> 0 in mode 3: the orb shrinks to the screen centre-offset and goes out by 1.5 times the ellipse offset.

### Colour blends (0022FACC-0022FC44). Integer, arithmetic shift, 4 components (loop runs 4 times, a1 = 3 -> -1)

Tables (ELF read, int32): B70 = D_002B5670 = {48, 98, 128, 60}. B80 = D_002B5680, 16 bytes per orb k: k0 {0,0,128,60}, k1 {0,128,0,60}, k2 {0,128,128,60}, k3 {128,0,0,60}, k4 {128,0,68,60}, k5 {128,68,0,60}, k6 {128,128,128,60}, k7 {128,128,128,0} (k >= 8 reads beyond the colour table: 0x002B5700 = {0,0,8,8}, ... not meaningful).

- M == 3 and k == 0 (00022FAD8-0022FB54): `out[i] = (B80[0][i] * (128 - W) + B70[i] * W) >> 7`. (W = 128 -> base colour, W = 0 -> {0,0,128,60}.)
- M == 2 (any k) (0022FB5C-0022FBDC): `out[i] = (B80[k][i] * (128 - W) + B70[i] * W) >> 7`, where the table pointer is B80 + (k << 4). Each orb starts with its own table colour at W = 0 and ends at the base colour at W = 128. (Note: this applies to all orbs in mode 2, not only orb 0.)
- Otherwise (0022FBE0-0022FC40): `out[i] = (B80[k][i] * 0 + B70[i] * 128) >> 7 = B70[i]` = base colour (48, 98, 128, 60).

Result is stored to sp+0x10..sp+0x1C (4 ints) and consumed by module_clock_239E98 / module_clock_239078 (not read; NOT DETERMINED whether the ints are r,g,b,a or in another order, the base colour in clock-camera.md reads as (48, 98, 128, 60)).

Float rounding details to reproduce: cvt.s.w + mul by 0x3C000000 + cvt.w.s (truncation, PS2 FPU) for `a`; all other float ops single precision in the order above; G/F table lookups use float table values from sin() (double) then dptofp.

## NOT DETERMINED

- Which menu event invokes entries of the callback table at 0x002B2C04 (labels enter/confirm/cancel are inferred).
- Why ROM 2.30 has 0.8 in the main menu (only HDD OSD flag path read, see section 1).
- Who passes mode 1 to func_00234C28 (no static `jal`).
- Meaning of D_00370264 case 3 (object D_003701D0), of func_00236490, of the 12 entries at D_00404F70, of the D_002B5F20 band (func_00234D60, quad at D_002B5F70).
- Where the per-orb random values at 0x00405210 are generated (func_0022EF40 tail not read).
- Which pad button is bit 0x20 of D_00370334 (waited on in func_0022D828 cases 2/4).
