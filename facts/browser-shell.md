# The Browser module's shell: start, fade, dialog, leave, hand-off, sounds

Builds: **HDD OSD 1.10U** (canon; every address is its unless "ROM" is written) and **ROM 2.30**. gp: HDD `0x377970`, ROM `0x002CFEF0`.
*Verified* = a script recomputes the statement from probed words and the result is equal bit for bit (script and capture named); *measured* = seen in a capture, not recomputed;
*read* = disassembly (addresses given). Reading notes: `References/readings/browser-shell-scout.md`, `browser-rom-scout.md`, `browser-dialog-kind.md`, `browser-sounds-scout.md`, `browser-sounds-verify.md`.

Scripts: `verify_browser_enter.mjs` (start, scan, fade overlay), `verify_browser_logic.mjs` (dialog, leave request, leave counter, exit stores, hand-off), `verify_browser_sounds.mjs`
(sound commands). All three run on the model `References/model/browser_shell.mjs` and take a trace path without `.gz` (`CLOCK_BUILD=hdd|rom`, `CLOCK_VIDEO=pal` for PAL).
The shell is the part of the Browser that wraps the device pages: the page contents (device row, cards, Format dialog interior) are outside this page except for their sounds (section 7).
The clock side of the round trip is `clock-transitions.md` (sections 2 and 5) and `sound-events.md`.

Captures (traces in `Watson/Runtime/captures`):

| Capture | Build | What it holds |
|---|---|---|
| `hddosd-110U-browser-enter-dialog-circle2` | HDD, NTSC | menu Cross, the dialog, Circle during its fade-in (ignored), Circle (closes), root Circle (leave), clock restart; 305 passes |
| `hddosd-110U-pal-browser-enter-dialog-circle2` | HDD, PAL (`CLOCK_VIDEO=pal`) | the same pad script; 290 passes |
| `hddosd-110U-browser-enter-direct` | HDD, NTSC | cold `BootBrowser` start (no menu); memory writes as stimuli (section 8); 216 passes |
| `rom-0230A-browser-enter-circle1` | ROM | menu Cross, one Circle during the fade-in; 162 passes |
| `hddosd-110U-browser-sounds-enter` | HDD, NTSC | the enter script of `dialog-circle2` with the sound probes; 297 passes |
| `hddosd-110U-browser-sounds-row` | HDD, NTSC | device row, Format dialog, Triangle; 1520 frames (section 7) |

## 1. Module life cycle

A pass is one trip of the thread loop (HDD `0x24F070`, ROM `0x248498`): pad words (`0x253B58`; edge `D_003707A4` = held & ~previous, ROM `0x2C8D34`) -> master `0x253860` (ROM `0x24D500`)
-> fade wrapper `0x24D0A0` -> fade overlay `0x24CEB0` (ROM `0x246A58` -> `0x246860`) -> soft-reset overlay `0x24EE80` -> wait for the next frame -> leave-counter test `0x24F0A0` (ROM `0x2484C8`).
Order: probes (*verified* by `verify_browser_enter.mjs` / `verify_browser_logic.mjs`) sit at the master `0x253860`, the fade overlay, the leave request, the thread check and the exit. The pad words `0x253B58` (edge `D_003707A4` = held & ~`D_00370BB0`, `0x253BF8..0x253C18`), the wrapper `0x24D0A0`, the soft-reset overlay `0x24EE80` and the wait are *read*. The ROM order is *read* with the same structure.

| Item | HDD OSD 1.10U | ROM 2.30 |
|---|---|---|
| module prepare | `0x24E7D0` | `0x247C48` |
| thread proc / loop top | `0x24F008` / `0x24F070` | `0x248448` / `0x248498` |
| init chain (leave counter 0, PAL flag) | `0x24EB38` | `0x247FA8` |
| per frame | `0x24EB90` | `0x247FD8` |
| scan | `0x24B940` | `0x245250` (no HDD stage) |
| leave request | `0x24EBF0` | `0x248038` |
| exit | `0x24ED20` | `0x248160` |
| fade start in / out | `0x24CE60` / `0x24CE88` (state is a word) | `0x246810` / `0x246838` (state is a byte) |

Words (HDD, ROM): leave counter `D_003706A8`, `0x2C8C00`; PAL flag `D_003706B0`, `0x2C8C08`; IO job word `D_003705FC`, `0x2C8B34`; fade state/counter/colour/length
`0x370660`/`66C`/`670`/`674`, ROM `0x2C8BB4`/`BBC`/`BC0`/`BC4`; leave destination `D_003706B4`, `0x2C8C0C`; execute type `D_003706B8`, `0x2C8C10`. *Read* (`browser-rom-scout.md`).
*Measured* by `cmp` of `$CRYSTALOSD_DATA/dumps/rom-0230A-clock-ee-00100000.bin` and `$CRYSTALOSD_DATA/dumps/rom-0230E-pal-clock-ee-00100000.bin` (base `0x100000`; no verifier): no differing bytes in `0x200000..0x279FFF` (all the Browser code) and none in `0x2C8B00..0x2C8DFF` (the Browser words above). PAL is the runtime flag (*read*).
Differences on ROM (*read*): no `AddDmacHandler2(1, vVif1Finish, -1)` in the thread proc (`0x248448`), `lui 0x68` at ROM `0x248494` where HDD has `lui 0x60` at `0x24F05C` (`0x680000` against `0x600000`, the `StartFrame`-side call), no S/PDIF store `0x1F0114 = 0x14/0x15`,
no HDD error dialog, no HDD stage in the scan.

**Thread start** (HDD `0x24F038`). Init (callee `0x24E890`, stores at `0x24E8FC` and `0x24E914`, *read*) zeroes the leave counter and the PAL-flag word, and `D_003706B0` holds the PAL flag afterwards; the fade-in starts (section 3) with the length of the video mode; the scan runs (section 2).
*Verified* on the first pass of every capture of section 1's table: `verify_browser_enter.mjs` compares leave counter, PAL flag, fade state, counter, length, dialog counter and direction, dialog kind, and the two scan words
(`hddosd-110U-browser-enter-dialog-circle2`: 2315 of 2315 equal; `-direct`: 2226 of 2226; `hddosd-110U-pal-browser-enter-dialog-circle2`: 1970 of 1970; `rom-0230A-browser-enter-circle1`: 1948 of 1948).

## 2. Scan and dialog kind

The scan `0x24B940` calls `browser_do_entry_into_hdd` first, which zeroes `D_003708E8` and `D_003708EC` (`0x25B1A0`, `0x25B1A4`), then `do_check_hdd` (`0x25B218`): when the status call fails both words become 1 (result (1,1)); when the command result is nonzero `D_003708E8` becomes 1 only (result (1,0)) (*read*).
On the emulator the scan leaves **`D_003708E8 = 1`, `D_003708EC = 0`** (*verified*: the first-pass items of `verify_browser_enter.mjs` on the HDD captures above). That is the command-result-nonzero branch of `do_check_hdd`; that no HDD is attached is an inference, not measured.

The scan's request (`0x24B96C`, *read*): `D_003708E8 != 2` -> dialog kind 0; else `D_003708EC == 0` -> kind 0; else `D_003708EC != D_003708E8` -> kind 1; else no dialog.
The open call `0x25BC08(kind)` (HDD only): when `D_003708F0 <= 0` it stores `D_00370BE8 = kind`, `D_00370BE4 = D_003708F0 = 1`.
*Verified* for kind 0 only: the probe at `0x25BC08` sees `a0 = 0`, and `D_00370BE8` is 0 afterwards (`verify_browser_enter.mjs`, `scanKind` in `browser_shell.mjs`, on the three HDD NTSC/PAL captures). Kind 1 and the no-dialog outcome are *read*; the emulator cannot produce them.

The native port can set the two words to the emulator's observed values (1, 0). Kind 0 then opens, because `D_003708E8 != 2` gives kind 0 whichever pair the scan leaves, (1,0) or (1,1) (*read*). That a host without an HDD yields (1,0) rather than (1,1) is an inference (it depends on which `do_check_hdd` branch the host's status call takes); nothing measured covers it.

*Measured* once, not reproduced by any verifier (a scratch capture, `GetOSDString` `0x002081B8` probed; the capture is not kept): the dialog draws `GetOSDString` ids `0x15C`, `0x15D`, `0x15E`, `0x15F` on every frame, from the Browser's first frame; the frame before the dialog,
the scan's outcome frame, shows ids 6, 6, `0x1A1`, `0x8A`, 7, `0x8A`, 8 (6 = "PS2", `0x1A1` = "HDD"). *Measured once, not verified.*

ROM has no dialog (*read*): the ids `0x154..0x157` and `0x15A..0x15F` occur only in the HDD code (`0x25BE80..0x25BFB0`), the ROM master frame has two overlay calls (DVD error `0x24CCC8`, disc error `0x24CE98`) against the HDD's three,
and the scan has no counterpart of `0x25BC08`. ROM word `0x2C8B5C` (gp-0x7394) is a modal state 1..4 (read as a confirmation dialog), not the HDD error dialog.

## 3. Fade overlay

`func_0024CEB0` (ROM `0x246860`), words state / counter / colour / length. *Verified* by `verify_browser_enter.mjs` (alpha read from `s3` at `0x24CF54`, ROM `0x24690C`):
- state 1: alpha `0x80`. State 2: alpha = `(count << 7) / length` (signed MIPS divide). State 3: alpha = `0x80 - (count << 7) / length`.
- `count != 0`: `count -= 1`. `count == 0`: state 2 becomes 0 and nothing is drawn; state 3 becomes 1 (count -1) and it draws.
- `0x24CE60(len)` starts state 2 unless state 2 is running; `0x24CE88(len)` starts state 3 likewise; both store `count = length = arg`.
- Length: **`0x5A` = 90 on NTSC, `0x4B` = 75 on PAL**, loaded by the thread start (`0x24CE60`, `movn a0, s1, D_003706B0`) and by the leave request (`0x24CE88`). Verified: draws are 90 fade-in + 91 fade-out on NTSC
  (`hddosd-110U-browser-enter-dialog-circle2`, `-direct`, `-sounds-enter`: "fade draws: 181 (fade-in 90, black hold 0, fade-out 91)") and 75 + 76 on PAL (`hddosd-110U-pal-browser-enter-dialog-circle2`: "151 (fade-in 75, black hold 0, fade-out 76)").
  The control (the other mode's length) misses 117 alphas on NTSC and 103 on PAL.
- A request during the fade-in replaces state 2 by state 3 with count = length (alpha steps from its partial value to 0, then rises). *Verified* on `rom-0230A-browser-enter-circle1` (Circle at capture frame 200: 71 fade-in draws, 91 fade-out; "fade-in ended 0").
  The request from state 0 is verified on the HDD captures above. The fade-in end (state 2 -> 0) is verified on the HDD captures ("fade-in ended 1"); on ROM it is not exercised by the final trace (pc `0x246A4C`, Open).

## 4. Dialog

`func_0025BD18` (HDD only; called by the master `0x253860` while `D_003708F0 != 0`). Length (**the dialog fade length**): **`0x1E` = 30 on NTSC, `0x19` = 25 on PAL** (`movz a2, a3, D_003706B0`). *Verified* by `verify_browser_logic.mjs`
on `hddosd-110U-browser-enter-dialog-circle2` (NTSC) and `hddosd-110U-pal-browser-enter-dialog-circle2` (PAL); the control with the other mode's limits misses 132 and 114 passes.

- Cut: when the leave counter is nonzero, or `D_00370778` (DVD error) or `D_00370780` (disc error) is nonzero: `D_003708F0 = 0`, `D_00370BE4 = -1`.
  Verified in `hddosd-110U-browser-enter-direct` (stimulus `D_00370778 = 1`, section 8): "dialog cut by an error or a leave 1".
- Otherwise `D_003708F0 = clamp(D_003708F0 + D_00370BE4, 0, length)` (`func_0024DFA8`); kind 0 stores `D_003708E8 = 1`, kind 1 stores `D_003708EC = 1`.
- **Circle closes the dialog only when `D_003708F0 == length`** and the pad edge has bit `0x40`: `D_00370BE4 = -1` (`0x25C0F4`). A Circle while `D_003708F0 < length` does nothing and the direction stays 1.
  Verified: `verify_browser_logic.mjs`, "Circle ignored while fading in 1, Circle closing the dialog 1" on `circle2` NTSC and PAL (Circle at capture frame 140 ignored, 262 closes).
- `D_003708F0` then counts down by 1 per pass to 0; the master draws no dialog afterwards and its input runs again (verified, same run).
- The block at `D_003708F0 == length - 1 && D_00370BE4 == 1` or `D_003708F0 == length` (`func_00251CA8(2)`, `func_00251CA8(3)`, `func_00251C10(1,1)`: button guide state) is *read*, not modeled, and queues no sound (section 7).

## 5. Leave request, leave counter, exit

**Request.** The master gate at `0x253860`: leave counter 0, `D_00370778 == 0`, `D_00370780 == 0`, `D_003708F0 == 0`, view mode `D_003706F8 == 1` -> `func_00254840`. There (HDD): `D_00370820 == 0`, `D_0037072C == 0x1A` (PAL `0x15`),
byte `D_00370678 != 1`, `D_00370858 == 0`, `D_0037085C == 0`, byte `D_00370771 != 0`, edge & `0x40`, page record (`0x2BD420 + 0x1C0 * D_00370728`) `+0x124 == 0` (the root page) -> `browser_transition_to_other_module(2)` (`0x24EBF0`; call `0x254910`).
*Verified* in both directions by `verify_browser_logic.mjs` on the HDD captures (Circle edges that asked nothing: dialog open or gate word set; the edge at root asked).
Effects (*verified*): `0x250768(3)` (mode word `D_003706D0 = 3`), `D_0037068C = 0`, `D_00370625 = 0` with `0x249680(0)`, fade-out `0x24CE88`, `D_003706B4 = 2`, `D_003706B8 = -1`, `D_003706A8 = 1`.
ROM: one root Circle (page kind `+0x124 = 0`, records `0x2ADA20 + 0x160 * depth`) calls `0x248038(2)` (Circle test `0x24E5D4..0x24E5DC`, call `0x24E5F0`). The ROM predicate is *read* only in part: `verify_browser_logic.mjs` on
`rom-0230A-browser-enter-circle1` checks that the request met the conditions that are read (necessary), not that they suffice (Open). The non-root Circle (pop) differs: ROM tests flag `& 2` with no kind-0xA skip and sends `0x5200`; HDD tests `& 4` (section 7).

**Counter.** `L = D_003706A8` (ROM `0x2C8C00`) is read at `0x24F0A0` (ROM `0x2484C8`). `L == 0`: loop. `L != 0`: `L + 1` is stored, and the thread exits when the **old** `L >= 0x5B` (NTSC) / `0x4C` (PAL) and `D_003705FC == 0`.
The request pass stores 1; the last pass reads `0x5B`. So **91 passes on NTSC** (R .. R+90) and **76 on PAL** (R .. R+75), where the request pass R is the pass after the pad is applied (pad applied at P, edge seen in pass P+1 = R).
*Verified*, `verify_browser_logic.mjs`: "thread checks 91, exits 1" on the NTSC captures, "thread checks 76" on PAL, 91 on `rom-0230A-browser-enter-circle1`.
`D_003705FC` is written by the IO pump (read as input at the check); a ROM third writer of the counter at `0x248150` is not read (Open).

**Exit.** `0x24ED20` (ROM `0x248160`) stores (*verified*, same run): HDD `1F0648 = dest (2)`, `1F064C = 3`, `1F0010 = -1`, `1F0644 = 1`, `1F0014 = 0`; ROM `1F05E8`, `1F05EC`, `1F0014`, `1F05E4`, `1F0018` in that order of role.
HDD also calls `sceUsbKbEnd` and `func_0025B518` before the stores (`0x24ED28..0x24ED34`, *read*).

## 6. Hand-off to the clock

The clock thread's first frame is `clock_orb_rendering_func` `0x225E80` (ROM `0x221558`). One request pass R, then 91 passes counted from R (R .. R+90 on NTSC), then the hand-off frames in which neither module draws.
*Verified* by `verify_browser_logic.mjs` (last lines of the runs):

| Capture | request R | last Browser pass | first clock frame | frames between |
|---|---|---|---|---|
| `hddosd-110U-browser-enter-dialog-circle2` (HDD, NTSC) | 341 | 431 = R+90 | 437 = R+96 | 5 |
| `hddosd-110U-browser-sounds-enter` (HDD, NTSC) | 341 | 431 = R+90 | 437 = R+96 | 5 |
| `hddosd-110U-pal-browser-enter-dialog-circle2` (HDD, PAL) | 341 | 416 = R+75 | 421 = R+80 | 4 |
| `rom-0230A-browser-enter-circle1` (ROM, NTSC) | 201 | 291 = R+90 | 293 = R+92 | 1 |
| `hddosd-110U-browser-enter-direct` (HDD, cold `BootBrowser`) | 241 | 331 = R+90 | 367 = R+126 | 35 |

So from the pad applied at P on HDD NTSC: 1 pass to the edge pass + 91 passes + 5 frames of hand-off = 97 frames to the first clock frame (counted from the pad command). ROM: 1 + 91 + 1 = 93, equal to the figure in `clock-transitions.md` (section 2, "93 frames after the press"). PAL HDD: 1 + 76 + 4 = 81.
`clock-transitions.md` gives 99 frames "after the second press" for the HDD clock start of its trans-return capture; that number and the 97 here are not reconciled (Open).
The 35 frames of the cold-start capture (`-direct`) were seen once; their cause is unread (Open).
The 5 frames on HDD and 1 on ROM are measured intervals of the captures; the code that spends them is not traced.

## 7. Sounds

*Verified* by `verify_browser_sounds.mjs` (`CLOCK_BUILD=hdd`) with `browser_shell.mjs` and `sound_senders.mjs`, on `hddosd-110U-browser-sounds-enter` and `hddosd-110U-browser-sounds-row`:
"compared 1578 items, 0 differ / verdict: FOUND 1578 items equal" on `-sounds-enter` and "compared 4463 items, 0 differ / verdict: FOUND 4463 items equal" on `-sounds-row` (one run per capture). Every enqueue at `0x00200C00` of the captures is explained by a Browser sender, a clock-side sender or the 0x8070 push; an unexplained one fails the verdict.

**Gate.** `sound_handle_queue_cmd_auto` `0x0024E090`: the command is enqueued when `D_00370740 != 0xA`, or `D_003706F8 == 3`, or (`D_003706F8 == 2` and `D_00370460 == 2`); otherwise nothing is queued.
`a0..a3` and `ra` are untouched (tail `j` to `0x200C00`). `D_00370740` is `D_003706A4` when that is `0xA` (set when `[0x1F0648] == 5`, `0x24E97C..0x24E98C`), else 0 (`0x2537FC`, `0x253814`), later the page switch (`0x253470`); a normal entry from the clock leaves it 0.
Verified: the pass side on all 23 Browser commands of the row capture ("gated commands enqueued 23, dropped by the gate 0"). The drop is *read* only (Open). Every Browser command is `0x6300, 1, a2`.
ROM (*read*): the wrapper `0x247BC8` (`lw [0x1F0CE0]; bnez return; j 0x200BE8`) gates on the drain-suspend word, not on the Browser state; commands are `0x5200` (menu) and `0x5015` (clock).

**`a3`.** Never loaded at the Browser sites: *free* (recorded; the native port sends 0), except the second call of the 7/8 pair, *ring*: `0x1F0658 + 8 * (head & 127)`, low 16 bits (`ringTemporary` in `sound_senders.mjs`; section 1 of `sound-events.md`).

**Device-row sites** (`func_00254840`, view mode 1, no site fires while the dialog is open). Common gate: `D_00370820 == 0`, `D_0037072C == 0x1A` (PAL `0x15`), byte `D_00370678 != 1`, `D_00370858 == 0`, `D_0037085C == 0`; the master also needs the leave counter 0.
Test order: gates, Circle, the Triangle special case, the count gate, Left / Right / Up / Down on the repeat word `D_003707AC`, `D_003707A0 & 0xF040` (a held direction or Circle stops Cross and Triangle), Cross, Triangle.

| jal (ra) | a2 | condition | a3 seen |
|---|---|---|---|
| `0x254948` (`0x254950`) | `0xA` | Circle, page `+0x124 != 0`, page `+0xF8` bit 2 clear, `func_00252C48` pops it, popped `+0x124 != 0xA` | free (`0xdfc`) |
| `0x254F4C` (`0x254F54`) | 6 | repeat has Left, else Right, else Up, and that move flag != 0; also Down with down flag 2, and Down when `D_003706D0 == 2` (`0x254F28` `bne` falls to `0x254F3C` / `0x254F44`) (*read*) | free (0) |
| `0x254F74` (`0x254F7C`) | 6 | Down, down flag not 0 and not 2, `D_003706D0 != 2` | free (0) |
| `0x254FE4` (`0x254FEC`) | 7 | edge Cross, byte `D_00370772 != 0`, no held direction/Circle, item `+0x90` bit 1, `func_002547C0() != 0`, item `+0xB0 != 0` | free (4) |
| `0x254FF4` (`0x254FFC`) | 8 | directly after the 7 | ring (`0x728`, `0x768`) |
| `0x2550D4` (`0x2550DC`) | 4 | edge Triangle, byte `D_00370773 != 0`, then item `+0xB0 == 0` or item `+0x690 == 1` or item `+0x90 & 0x10020` or `+0xB0 == 0xE` | free (`0xffff`) |

Verified counts on the row capture (the `0x254F4C` Down cases with flag 2 or `D_003706D0 == 2` are not among them): pop 2, Right 3 / Left 4 / Up 1 (6), Down 2 (6), Cross pair 2, Triangle on slot 1 (`+0xB0 = 13`, `+0x690 = 1`; the module then leaves). Flag-0 cases (Left at the left end, Up on the top row) send nothing (verified).
The four move flags are the words left on the stack at `0x00254C90` (left sp+8, right sp+0xC, up sp+0, down sp+4), probed there; their derivation (`0x254A00..0x254C8C`) is *read*. The row is a grid of 3 items.
Gate words verified by a pad press after each memory write (`D_00370858 = 8`, `D_0037085C = 8`, byte `D_00370678 = 1`: the Right sends nothing; count 0 on the pushed page; `D_00370600 = 0` with count 3); a held Up stops the Cross (verified).
The root-page Circle sends nothing (verified: it is the leave request); the root page has `+0xF8` bit 2 set, a pushed page does not. The dialog's button-guide block (`0x25C048..0x25C0C8`) sends nothing (*read*).

**Format dialog** (`func_00255C18`, `D_00370820 == 1`, state `D_00370BC0`, answer byte `D_00370BBC`; opened by `func_00255838` from `func_002499E8` at `0x249A6C`, *read*):

| jal (ra) | a2 | condition | a3 seen |
|---|---|---|---|
| `0x255CB8` (`0x255CC0`) | 6 | Left, answer 0 (becomes 1) | free (2) |
| `0x255CEC` (`0x255CF4`) | 6 | Right, answer 1 (becomes 0) | free (2) |
| `0x255D0C` (`0x255D14`) | 4 | Cross; answer 0 closes (`D_00370820 = 0`) | free (2) |
| `0x255D64` (`0x255D6C`) | `0xA` | Circle (closes) | free (2) |

State 1 stores answer 0 and state 2, then runs the same call (verified on both openings). Answer Yes (Cross with answer 1, `func_002496F0`) leads to state 3; sounds 9 and `0xB` are sent by the state-3 handler (`0x255D80`, `0x255E1C`) at `0x255DB4` and `0x255DF8` (*read*): 9 when byte `D_0037061C == 0`, `0xB` when it is nonzero, only when `D_00370604 == 0`; they are not sent at the Yes press itself. Not reached by any capture.
`func_00255868` (`browser_format_memcard_menu`) contains no sound call.

**Row capture, commands in order** (capture frame: a2 ra; verified): 2: 4 `0x2323BC` (menu); 4: `0x6150,2,0,0` `0x225B80`; 241, 253, 301: 6 `0x254F54`; 361: 6 `0x254F7C`; 391: 6 `0x254F54`; 421: 6 `0x254F7C`;
451: 7 `0x254FEC` + 8 `0x254FFC`; 501, 531, 561, 591: 6 `0x255CC0` / `CF4` / `CC0` / `CF4`; 621: 4 `0x255D14`; 671: `0xA` `0x254950`; 761: 7 + 8; 821: `0xA` `0x255D6C`; 891: `0xA` `0x254950`;
981, 1004, 1271, 1392: 6 `0x254F54`; 1451: 4 `0x2550DC`. The presses that send nothing (Left 270, Up 330, Right 690 / 860 / 1070 / 1110 / 1150 / 1190, Cross 1340) are each explained by the model.

**0x8070.** `module_browser_24EB38` stores `D_001F0114` once per thread start at `0x0024EB7C`, before the fade start: `0x14` when `config_get_spdif_mode` (`var_mechacon_config_param_1` `0x371818` `& 1`) is 0, else `0x15`.
`pad_sound_handler_thread_proc` `0x0020CD20`, on a wake with `D_001F0D40 == 0`: drain, then when `D_001F0114 != 0` `sceSdRemote(1, 0x8070, 0xA, a3)` (jal `0x0020CE2C`; `a2 = 0xA` is the delay-slot `addiu`), then clears the word. `a3`: `0x14` -> 0, `0x15` -> 2 (verified);
`0x12` -> 1, `0x13` -> `0xF`, and a stack word for any other value, are *read*.
Timing (verified): store at capture frame 134, first drain pass after it frame 135, the send in that pass: "config 0x7000010 read at frame 134, drain pass 135, send 135: word 0x14 a3 0x0" (`-sounds-enter`) and
"config 0x7000011 ... word 0x15 a3 0x2" (`-sounds-row`). **Stimulus caveat:** the `0x15` case was reached by writing `0x07000011` to `0x371818` at capture frame 50 of the row capture; the `0x14` case is the unwritten config `0x07000010`.
The Browser's writers of the word (*read*; this page lists the Browser's only): `0x24EB7C` (above), `0x2549C4` (Triangle on a kind-0xA page), `0x255324` (`func_002552E8`: `0x13` when the S/PDIF mode is 0, else `0x15`, only when `D_003706F8 != 3`; the only writer of `0x13`, as in `sound-events.md`), `0x255384`. HDD writers outside the Browser exist: `main` `0x20DCC4` (0) and `0x20DD5C`, `clock_config_change_cb_spdif_mode` `0x227DD8`, `func_00218318` (0). ROM (*read*): no `0x1F0114` word, no `sceSdRemote` path in the drain (`0x208BC8`), no 0x8070 constant.

**Clock side of the round trip** (verified on both captures with `sound_senders.mjs`; senders in `sound-events.md` sections 2.1 and 3): menu Cross on item 0 `0x6300,1,4` ra `0x2323BC` with carried `a3 = 0xF`; the disc loop `0x6150,2,0,0` ra `0x225B80` (jal `0x00225B78`);
after the leave, `clockStart` and `clockSetup` (`0x6140,2` ring `a3 = 0x6F8` ra `0x225E50`; `0x6150,6,0,0xF` ra `0x232620`) on `-sounds-enter`. ROM: menu Cross `0x5200,1,4,0` ra `0x22E69C` and `0x5015,2,0,0` ra `0x221200` on `rom-0230A-browser-devices-blank` (*measured*, not recomputed; that capture belongs to another lane's verifier and no verifier of this page runs on it).

ROM Browser sounds (*read*, no verifier): sites through the wrapper `0x247BC8` with `a0 = 0x5200`: `0x24E61C` a2 `0xA` (no kind-0xA skip, flag & 2), `0x24EB60` a2 6 (one funnel; measured at frames 331 and 391 of `rom-0230A-browser-devices-blank` with `a3 = 2`, ra `0x24EB68`),
`0x24F014` a2 7 and 8, `0x24F164`, `0x24EBE8`, `0x24ECB8`, `0x24ED60`, `0x24ED84` a2 4, `0x24EC08`, `0x24ED40`, `0x24EE08` a2 `0xA` (paths gated by `jal 0x201d90`, unread).

## 8. Stimuli

Memory writes were used to reach states the emulator does not produce. In `hddosd-110U-browser-enter-direct` (`SkipSearchLater BootBrowser`, no menu): `D_00370BE8 = 1` (the render stores `D_003708EC = 1`), `D_00370778 = 1` (dialog cut; Circle asks nothing),
`D_00370780 = 1` (self-clears in 2 passes; Circle asks nothing), `D_00370820 = 1`, `D_00370858 = 8`, `D_0037085C = 8` (decay by 1 per pass), byte `D_00370678 = 1`, `D_0037072C = 5` (the page fade-in recovers 1 per pass); each with a Circle asks nothing, and the Circle with all words clear asks.
L2 (edge `0x01`) and R1 (`0x08`) ask nothing. `verify_browser_logic.mjs`: "Circle edges that asked nothing 8, leave requests 1". `D_003705FC` cannot be held (the IO pump rewrites it every pass), so `io != 0` at the check is not reached.
The row capture's writes are listed in its header in `verify_browser_sounds.mjs`.

## Open

- **HDD paths, dialog kinds 1..4**: the kind-1 branch (`D_003708EC` stores, scan outcome `ec != e8`), disc-state requests (`0x24C1D0`: `transition(4)` on disc type `0x74`; execute-app request `0x24EC50`), the Circle on a non-root page's shell effects, `D_003706A4 == 0xA` entry. Reason: the emulator has no HDD. Script that would settle it: `verify_browser_logic.mjs` on a capture with an HDD image attached.
- **Black-hold fade branch** (fade state 1 in a pass) and `D_003705FC != 0` at the check: never reached ("black hold 0" in every run of `verify_browser_enter.mjs`); `D_003705FC` is rewritten each pass.
- **GetOSDString ids** `0x15C..0x15F` (dialog) and 6, 6, `0x1A1`, `0x8A`, 7, `0x8A`, 8 (scan frame): seen once in a scratch capture, no verifier. Script that would settle it: a probe at `0x002081B8` added to `verify_browser_enter.mjs`.
- **ROM request sufficiency**: the ROM Circle predicate (`0x24E440..0x24E5F0`; busy words `0x2C8D5C`, `0x2C8D54`; the ROM equivalent of `D_00370820` is not identified; word `0x2C8B5C` could block the root Circle, probe `0x24E5D4`) is checked as necessary only. The ROM leave-counter third writer `0x248150` is unread.
- **ROM fade-end** (pc `0x246A4C`, state 2 -> 0): "fade-in ended 0" on `rom-0230A-browser-enter-circle1`, whose Circle interrupts the fade-in. A ROM capture without a Circle before frame 71 of the module would settle it.
- **`0x250768(3)` (HDD) against `0x249B58(2)` (ROM)**: the first call argument of the leave request differs by one word; what each does is unread.
- **Sounds**: the gate's drop (`D_00370740 == 0xA`, view modes 2 and 3) is never observed: writing `D_00370740 = 0xA` starts the page fade-out, so no sender runs with it set. Not reached: Triangle with `D_003706D0 == 2` and the `+0xB0 == 0` / `0xE` / `+0x90` branches, Triangle on a kind-0xA page,
  the Cross on an item without `+0x90` bit 1, Format answer Yes (sounds 9 and `0xB`), a pop of a kind-0xA page, a non-root page with `+0xF8` bit 2 set, down flag 2, `D_00370604 != 0`, disc / CD player / file-list senders, scrolling rows. ROM Browser sounds are unverified; the paths gated by `jal 0x201d90` and the mode-2 family of senders are unread; no verifier of this page runs on `rom-0230A-browser-devices-blank`.
- **Pop flag and held mask**: the pop flag test value (`& 4` on HDD) and the Circle half of the `0xF040` held mask are not discriminated by any capture.
- **Move flags**: their derivation (`0x254A00..0x254C8C`) is *read* only.
- **`func_00218318` store address**: this lane's reading gives `0x2183BC`, `sound-events.md` gives `0x2183B8`. Script that would settle it: a probe at both addresses (`verify_sound_clock_senders.mjs`).
- **Triangle on slot 2** (`+0xB0 = 3`, `+0x690 = 2`): seen once in an exploration capture that is not kept; no verified row.
- **PAL sounds**: the only video-dependent word on the sound path is `D_0037072C`'s `0x1A` / `0x15` (verified by `verify_browser_logic.mjs` on the PAL entry capture); no PAL sound capture.
- **Cold-start hand-off**: the 35 frames of `hddosd-110U-browser-enter-direct` have no traced cause; the wake of the clock thread by `main` is unread (no address range). Script that would settle it: a probe on the clock thread's wake added to `verify_browser_logic.mjs`.
- **HDD hand-off number against `clock-transitions.md`**: that page counts the HDD clock start (T0 2105, trans-return capture) as 99 frames after the second press; this page counts 97 from the pad applied at P to the first clock frame. The two definitions of "press" are not shown to be the same (`browser-shell-scout.md` reads the 99 as counted from a pad command two frames before that capture's first frame, 2105 - 2008 = 97; not recomputed). Script that would settle it: `verify_browser_logic.mjs` on the trans-return capture.
- **`verify_frame.mjs --carry`** does not hold across a Browser round trip (the carried state is not the module's); the shell's frames are compared by the three verifiers above, not by the frame carry.
