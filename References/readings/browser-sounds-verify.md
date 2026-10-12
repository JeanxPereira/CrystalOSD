# Browser sound senders, verified (HDD OSD 1.10U)

Verifier `References/scripts/verify_browser_sounds.mjs`, model `References/model/browser_shell.mjs` (section "The Browser's sound commands").
Captures: `hddosd-110U-browser-sounds-enter` (menu Cross, dialog Circles, root Circle, leave, clock restart; recipe in the verifier's header) and
`hddosd-110U-browser-sounds-row` (device row on blank cards, Format dialog, Triangle). Marks: **V** compared with the enqueue 0x00200C00 on a capture,
**R** read in the disassembly, not reached by a capture (the model throws if a capture reaches it).

## What a command is
`sound_handle_queue_cmd_auto` 0x0024E090 (gate): enqueue when `D_00370740 != 0xA || D_003706F8 == 3 || (D_003706F8 == 2 && D_00370460 == 2)`, else nothing;
a0..a3 and `ra` untouched (tail `j`). **V** the pass side on all 23 Browser commands of the row capture; the drop is **R** (see Open). Every Browser command is `0x6300, 1, a2`.
a3 is never loaded at the Browser sites: **free** (recorded, the native port sends 0) except the second call of the 7/8 pair (**ring**:
`0x1F0658 + 8 * (head & 127)`, low 16 bits, the same rule as `sound_senders.ringTemporary`).

## Senders (ra = the return address the enqueue sees)
`func_00254840` (device row, view mode 1, called from the master 0x253860 when no dialog is open). Order of the tests: G gates (D_00370820 == 0,
D_0037072C == 0x1A (PAL 0x15), byte D_00370678 != 1, D_00370858 == 0, D_0037085C == 0), Circle (byte D_00370771 != 0 and edge Circle), the Triangle
special case, the count gate, Left / Right / Up / Down on the repeat word D_003707AC (each returns even when its flag is 0), `D_003707A0 & 0xF040`
(a held direction or Circle), Cross, Triangle.

| jal | ra | a2 | condition | a3 (seen) |
|---|---|---|---|---|
| 0x254948 | 0x254950 | 0xA | Circle, page +0x124 != 0 (a pushed page), page +0xF8 bit 2 clear, `func_00252C48` pops it, popped +0x124 != 0xA. **V** x2 | free (0xdfc) |
| 0x254F4C | 0x254F54 | 6 | repeat has Left, else Right, else Up, and that move flag != 0. **V** Right x3, Left x4 (one of them the repeat), Up x1; the flag 0 cases (Left at the left end, Up on the top row) send nothing **V** | free (0) |
| 0x254F74 | 0x254F7C | 6 | Down, down flag not 0 and not 2, D_003706D0 != 2. **V** x2 (the row's down flag is 1 on the top row) | free (0) |
| 0x254FE4 | 0x254FEC | 7 | edge Cross, byte D_00370772 != 0, no held direction/Circle, item +0x90 bit 1, `func_002547C0() != 0`, item +0xB0 != 0. **V** x2 | free (4) |
| 0x254FF4 | 0x254FFC | 8 | directly after the 7 | ring (0x728, 0x768) |
| 0x2550D4 | 0x2550DC | 4 | edge Triangle, byte D_00370773 != 0, then item +0xB0 == 0 or item +0x690 == 1 or item +0x90 & 0x10020 or +0xB0 == 0xE (else `func_002547C0`/`func_00252B68`, no sound). **V** on slot 1 (+0xB0 = 13, +0x690 = 1); the Triangle leaves the Browser | free (0xffff) |

The move flags are the four words the code leaves on the stack at 0x00254C90 (left sp+8, right sp+0xC, up sp+0, down sp+4); they are probed there, their
derivation (0x254A00..0x254C8C: cursor against D_003709A0, scroll +0x198, visible count) is **R** (the emulator's cards never scroll: the flags are only 0 or 1 here).
The row is a grid of 3 items (count 3): Right / Left move along it, Down from the top row sets up = 1 and down = 0. The G gates are **V** by the pad
press that follows each memory write in the row capture (D_00370858 = 8, D_0037085C = 8, byte D_00370678 = 1: the Right sends nothing; D_00370820 = 1 is the open
dialog, D_0037072C below 0x1A is the page fading in after a pop). The count gate: count == 0 (the pushed page) **V**; D_00370600 = 0 with count 3 **V** (write; the sender runs before
`func_00253488` restores the word); D_00370604 != 0 was not producible (a write at the frame start was overwritten before the sender ran). A held Up (D_003707A0 & 0x1000)
stops the Cross (no 7/8) **V**. Root-page Circle (page +0x124 == 0) sends nothing (**V**, the leave request); the root page has +0xF8 bit 2 set, a pushed page does not.

`func_00255C18` (Format dialog; D_00370820 == 1; state D_00370BC0, answer byte D_00370BBC; called by `func_00255BE8` at 0x253718 from `func_00253488`;
opened by `func_00255838` from `func_002499E8` 0x249A6C, 24 frames after the Cross that asked for it):

| jal | ra | a2 | condition | a3 (seen) |
|---|---|---|---|---|
| 0x255CB8 | 0x255CC0 | 6 | Left, answer 0 (becomes 1). **V** x2 | free (2) |
| 0x255CEC | 0x255CF4 | 6 | Right, answer 1 (becomes 0). **V** x2 | free (2) |
| 0x255D0C | 0x255D14 | 4 | Cross; answer 0 closes (D_00370820 = 0, state 0, **V** at the next row call); answer 1: `func_002496F0` and state 3 (**R**) | free (2) |
| 0x255D64 | 0x255D6C | 0xA | Circle (closes). **V** | free (2) |

State 1 stores answer 0 and state 2, then runs the same call (**V**: state 1 then 2 on both openings). Read, not reached (the Yes answer formats the card): state 3 (0x255D80):
`D_00370604 == 0` then 9 (jal 0x255DB4, ra 0x255DBC) or, when byte D_0037061C != 0, 0xB (jal 0x255DF8, ra 0x255E00); states 4 and 5 (0x255E1C): Circle only, no sound.
`func_00255868` (`browser_format_memcard_menu`) contains no sound call; the scout's "0x255868 family" is `func_00255C18`.
Triangle on slot 2 (+0xB0 = 3, +0x690 = 2) sent nothing and the Browser left, in a short exploration capture that was deleted (not a verified row).

## 0x8070 and the clock side
- `module_browser_24EB38` (thread start, once): `config_get_spdif_mode` = `var_mechacon_config_param_1 & 1`; `D_001F0114 = 0x14` (0) or `0x15` (store 0x0024EB7C). **V** 0x14 (config 0x07000010)
  and 0x15 (config 0x07000011, set by a memory write at capture frame 50).
- `pad_sound_handler_thread_proc` 0x0020CD20, each wake-up with `D_001F0D40 == 0`: drain (0x200A80), then `D_001F0114 != 0` -> `sceSdRemote(1, 0x8070, 0xA, a3)` (jal 0x0020CE2C), a3 by the word:
  0x14 -> 0, 0x15 -> 2 (**V**; 0x12 -> 1, 0x13 -> 0xF and the stack word for any other value, **R**, not the Browser's stores), then the word is cleared. a2 = 0xA is the delay-slot
  `addiu` (the probe at the jal sees a2 before it). Timing **V**: store at capture frame 134, the first drain pass after it is frame 135, the send is in that pass (the next frame).
- Menu Cross on item 0 (`menupos_p3_p8_tgt`): `0x6300, 1, 4` ra 0x2323BC a3 0xF (carried, free) at capture frame 2, and `0x6150, 2, 0, 0` (`discSound`, jal 0x00225B78, ra 0x00225B80) at frame 4: both **V**
  with `sound_senders.mainMenu` / `discLoop` on both captures. The clock restart after the leave (`clockStart`, `clockSetup`) is **V** on the enter capture.

## Row capture, commands in order (capture frame: a2 ra)
2: 4 0x2323BC (menu); 4: 0x6150,2,0,0 0x225B80; 241, 253, 301: 6 0x254F54 (Right, Left, Right); 361: 6 0x254F7C (Down); 391: 6 0x254F54 (Up); 421: 6 0x254F7C (Down);
451: 7 0x254FEC + 8 0x254FFC (Cross); 501, 531, 561, 591: 6 0x255CC0 / CF4 / CC0 / CF4; 621: 4 0x255D14 (answer 0); 671: A 0x254950 (pop); 761: 7 + 8 (Cross); 821: A 0x255D6C (dialog Circle);
891: A 0x254950 (pop); 981 and 1004: 6 0x254F54 (Left held: edge, then the repeat); 1271: 6 0x254F54; 1392: 6 0x254F54 (Left); 1451: 4 0x2550DC (Triangle).
The Left at 270, Up at 330, Right at 690 / 860 / 1070 / 1110 / 1150 / 1190 and the Cross at 1340 send nothing and the model says why in each case.

## ROM 2.30 (not verified)
The ROM Browser has the device row (0x24E440) and the same sends through the wrapper 0x247BC8 with a0 = 0x5200, but a different compile (extra `jal 0x201d90` button tests, a flag-3 path through `0x24E128`, no HDD, no Format dialog read).
Another lane's capture `rom-0230A-browser-devices-blank` (pad Cross at 0, Left 300, Right 330, Right 360, Left 390) shows at the enqueue 0x200BE8: frame 2 `0x5200,1,4,0` ra 0x22E69C (menu Cross), frame 4 `0x5015,2,0,0` ra 0x221200,
frame 331 and 391 `0x5200,1,6,a3=2` ra 0x24EB68 (Right, Left; the Left at 300 and the Right at 360 sent nothing: the cursor was at an end). No model, no ROM verifier.

## Open
- The gate's drop (`D_00370740 == 0xA`, view modes 2 and 3) is never observed: writing `D_00370740 = 0xA` starts the page fade-out (D_0037072C falls 1 per pass, the input bytes D_00370771..3 read 0, the Format dialog is not called), so no sender runs with the word set. `D_003706A4 == 0xA` entries (Browser launched to a page) are not captured.
- Not reached: Triangle with D_003706D0 == 2 and the +0xB0 == 0 / 0xE / +0x90 bit branches, Triangle on a kind-0xA page (stores `D_001F0114`), the Cross on an item without +0x90 bit 1, Format answer Yes (states 3..5: sounds 9 and 0xB), a pop of a kind-0xA page, a page with +0xF8 bit 2 set that is not the root, `down` flag 2 and
  `D_003706D0 == 2` in the Down path, D_00370604 != 0, the disc, CD player and file-list senders, the flag derivation, scrolling rows.
- PAL: the only video-dependent word is D_0037072C's 0x1A / 0x15 (`PAGE_FADE_IN`, verified by `verify_browser_logic` on the PAL entry capture); no PAL sound capture.
- ROM 2.30: see above.
