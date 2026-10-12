# Browser sound senders, HDD OSD 1.10U and ROM 2.30 (read, not verified)

## Gate

HDD `sound_handle_queue_cmd_auto` 0x24E090 (read): the command is passed on (`j sound_handler_queue_cmd` 0x200C00) when `D_00370740 != 0xA`, or `D_003706F8 == 3`, or (`D_003706F8 == 2` and `D_00370460 == 2`); else nothing is queued. a0..a3 untouched (a3 carried), `ra` stays the caller's. `D_00370740` = `D_003706A4` when that is 0xA (set when `[0x1F0648] == 5`, 0x24E97C..0x24E98C), else 0 (0x2537FC/0x253814), later the page switch (0x253470). A normal entry from the clock leaves it 0: the gate passes.

ROM: wrapper 0x247BC8 (`lw [0x1F0CE0]; bnez return; j 0x200BE8`); the gate is the drain-suspend word, not the Browser state (inference). ROM command ids 0x5200 (menu) and 0x5015 (clock) (`facts/clock-transitions.md:435`). Queue ROM 0x200BE8 (HDD 0x200C00).

## HDD `func_00254840` sites (a0 = 0x6300, a1 = 1)

Common gate G: `D_00370820 == 0`, `D_0037072C == 0x1A` (PAL 0x15), byte `D_00370678 != 1`, `D_00370858 == 0`, `D_0037085C == 0`; master also needs `D_003706A8 == 0`, no DVD/disc error, `D_003708F0 == 0`, `D_003706F8 == 1`. No site fires while the dialog is open.

| jal (ra) | a2 | condition |
|---|---|---|
| 0x254948 (0x254950) | 0xA | byte `D_00370771 != 0`, edge & 0x40, page kind (+0x124) != 0, doubleword at page +0xF8 & 4 clear, pop `func_00252C48`; skipped when the popped record's +0x124 is 0xA |
| 0x254F4C (0x254F54) | 6 | direction move taken (left 0x8000, right 0x2000, up 0x1000, down 0x4000 with the stack flags) |
| 0x254F74 (0x254F7C) | 6 | down with flag not 0/2 and `D_003706D0 != 2` |
| 0x254FE4 (0x254FEC) | 7 | edge & 0x20, byte `D_00370772 != 0`, item +0x90 & 2, `func_002547C0() != 0`, item +0xB0 != 0 |
| 0x254FF4 (0x254FFC) | 8 | back to back with the previous, a3 = ring temporary |
| 0x2550D4 (0x2550DC) | 4 | Triangle / Cross paths through `func_00254778` |

Root-page Circle (page +0x124 == 0): 0x254910 `browser_transition_to_other_module(2)`; sends nothing. The dialog (0x25BD18) and its button-guide block (0x25C048..0x25C0C8: `func_00251CA8(2)`, `func_00251CA8(3)`, `func_00251C10(1,1)` at F0 = len-1 / len) send nothing.

ROM sites (via 0x247BC8, a0 = 0x5200): 0x24E61C/0x24E624 a2 = 0xA (no kind-0xA skip, flag & 2), 0x24EB60/0x24EB68 a2 = 6 (one funnel), 0x24F014/0x24F024 a2 = 7, 8, 0x24F164/0x24F16C and 0x24EBE8, 0x24ECB8, 0x24ED60, 0x24ED84 a2 = 4, 0x24EC08, 0x24ED40, 0x24EE08 a2 = 0xA (paths gated by `jal 0x201d90`, unread).

## 0x8070

`module_browser_24EB38` stores `0x1F0114 = 0x14` (`config_get_spdif_mode` = `[0x371818] & 1` == 0) or 0x15 at 0x24EB7C, once per thread start, before the fade start 0x24CE60. The drain thread 0x20CD20: when `[0x1F0114] != 0` and `[0x1F0D40] == 0` it calls `sceSdRemote(1, 0x8070, 0xA, a3)` at jal 0x20CE2C and clears the word; a3 = 0 for word 0x14, 2 for 0x15, 0xF for 0x13, 1 for 0x12. Other HDD writers: 0x2549C4 (Triangle on a kind-0xA page), 0x255324, 0x255384. ROM: no 0x1F0114 word, no sceSdRemote path in the drain (0x208BC8); a scan finds no 0x8070 sound constant.

## `func_0022FF98`

A predicate (HDD 0x22FF98, ROM 0x22BFB8), no sound. The sender is `clock_input_check_handler_p6_p7_tgt`: after the clock-side Cross, the default arm of the jump table sends `0x6150, 2, 0, 0` (jal 0x225B78, a3 = 0, ra 0x225B80); ROM `0x5015, 2, 0, 0` (jal 0x2211F8, ra 0x221200). In `hddosd-110U-sound-menu-cross-browser` the pair is `0x6300,1,4,a3=0xF` (ra 0x2323BC) at capture frame 7 and `0x6150,2,0,0` at frame 9. The entry captures (no menu Cross, no queue probe) do not show them.

## Probes

HDD: queue 0x200C00 (a0..a3, ra); drain 0x200A80; gate 0x24E090 with ranges 0x370740:4, 0x3706F8:4, 0x370460:4; `func_00254840` entry 0x254840 (words listed in the table above, pad 0x3707A0:0x10, bytes 0x370770:8, page records 0x2BD420, item table 0x370838); 0x254C90 (stack flags); 0x254938 (popped kind); 0x24EB7C (store); 0x20CE2C (0x1F0114:4, 0x1F0D40:4, 0x1F127C:4); sender 0x225B78.
ROM: queue 0x200BE8, wrapper 0x247BC8 (0x1F0CE0:4), function 0x24E440, sender 0x2211F8.

## Open

- The frame of the 0x8070 send (expected within one or two frames of the store) is not covered by an existing probe.
- Carried a3 at each site is not computed.
- The mode-2 family, the ROM `0x201d90` paths and PAL are unread.
- Which of the 7+8 pair, a2 = 4 or nothing a device-row Cross gives depends on the item state (+0x90/+0xB0).
