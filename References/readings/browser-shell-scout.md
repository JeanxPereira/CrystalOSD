# Browser shell: entry, fade, dialog, leave (reading notes)

Build ids: HDD = HDD OSD 1.10U (NTSC canon, PAL when said), ROM = ROM 2.30. gp: HDD 0x377970, ROM 0x2CFEF0 (from `verify_scale` ROM words). Marks: **V** verified by `verify_browser_enter.mjs` / `verify_browser_logic.mjs` on captures, **R** read only.

## One pass (thread loop HDD 0x24F070, ROM 0x248498)
pad words `0x253B58` (edge `D_003707A4 = held & ~previous`, ROM edge 0x2C8D34) -> master `0x253860` (ROM 0x24D500) -> overlay fade tail `0x24D0A0` -> `0x24CEB0` (ROM 0x246A58 -> 0x246860) -> `0x24EE80` -> wait next frame -> check at `0x24F0A0` (ROM 0x2484C8). **V**

## Fade overlay `func_0024CEB0` (ROM 0x246860), words state/count/colour/length
HDD 0x370660/66C/670/674 (word state), ROM 0x2C8BB4 (byte) /BBC/BC0/BC4.
- state 1: alpha 0x80. state 2: alpha = (count<<7)/length (signed div). state 3: alpha = 0x80 - (count<<7)/length. **V** (alpha read from `s3` at 0x24CF54 / ROM 0x24690C)
- count != 0: count -= 1. count == 0: state 2 -> state 0 and no draw (0x24D07C..0x24D094, ROM 0x246A34); state 3 -> state 1, count -1; draw. **V**
- `0x24CE60(len)` (ROM 0x246810) starts state 2 unless already 2; `0x24CE88(len)` (ROM 0x246838) state 3 likewise; both store count = length = arg. **V**
- thread start calls 24CE60 with 0x5A NTSC / 0x4B PAL (`movn a0, s1, D_003706B0`); request calls 24CE88 with the same two. **V** (90 / 75 frames, NTSC and PAL)
- A request during the fade-in replaces state 2 by state 3 with count = length (alpha steps from partial to 0, then rises): **V** on `rom-0230A-browser-enter-circle1` (Circle at capture frame 200, fade-in running; the fade-in end, state 2 -> 0, is **V** on the other three captures). The HDD request flavour from state 0 is **V** on `circle2` (NTSC, PAL) and `direct`.

## Entry
Thread start (0x24F038): init `0x24EB38`: leave counter 0, `D_003706B0` = PAL flag; then 24CE60. Scan `0x24B940`: `D_003708E8/EC` = 0, `do_check_hdd` 0x25B218: status call fails -> both 1; command result nonzero -> `E8` = 1 only (what the emulator shows: E8 = 1, EC = 0). Back in 0x24B96C: `E8 != 2` -> dialog kind 0; `EC == 0` -> kind 0; `EC != E8` -> kind 1; else none. The dialog open `0x25BC08(kind)` (HDD only): when `D_003708F0 <= 0`: `BE8 = kind`, `BE4 = F0 = 1`. **V** for kind 0 (probe at 0x25BC08: a0 = 0); kinds 1 and none are read, not seen (the emulator has no HDD).

## Dialog `0x25BD18` (called from 0x253860 only while `D_003708F0 != 0`)
length = 0x1E NTSC, 0x19 PAL (`movz a2, a3, D_003706B0`: the scout's table had them reversed). **V** both.
- `leave != 0 || D_00370778 || D_00370780`: `F0 = 0`, `BE4 = -1`. Else `F0 = clamp(F0 + BE4, 0, length)` (func_0024DFA8); kind 0 stores `E8 = 1`, kind 1 `EC = 1`.
- `F0 == length` and pad edge & 0x40: `BE4 = -1` (0x25C0F4). Not before: a Circle while `F0 < length` does nothing. **V** (Circle at capture frame 140, edge seen with F0 below the length, direction stays 1).
- `F0` counts down 1 per pass to 0, after which the master draws no dialog and its input runs again. **V**
- the block at `F0 == length - 1 && BE4 == 1` or `F0 == length` (calls 0x251CA8(2), 0x251CA8(3), 0x251C10(1,1): button guide state) is not modeled (sounds, Task 3). **R**

## Leave request, root Circle
Master gate (0x253860): `leave == 0`, `D_00370778 == 0`, `D_00370780 == 0`, `D_003708F0 == 0`, view mode `D_003706F8 == 1` -> `0x254840`. There (HDD): `D_00370820 == 0`, `D_0037072C == 0x1A` (PAL 0x15), `D_00370678 != 1`, `D_00370858 == 0`, `D_0037085C == 0`, `D_00370771 != 0`, edge & 0x40, page record (`0x2BD420 + 0x1C0 * D_00370728`) `+0x124 == 0` -> `browser_transition_to_other_module(2)` (0x24EBF0, ROM 0x248038). Kind != 0: flags & 4 returns, else `0x252C48` + sound `0x6300` (not modeled). **V** HDD both predicate directions (Circle edges at 140/262 asked nothing: dialog open; edge at 340 asked). ROM 2.30: the predicate (0x24E440..0x24E5F0, list view value 0, kind at +0x124 of records `0x2ADA20 + 0x160 * depth`, busy words 0x2C8D5C/0x2C8D54, pad debounce word 0x2C8D... via 0x24B320/0x24B330) is read only in part: the verifier checks that every request met the conditions that are read (necessary), not sufficiency. **V** necessary / **R** sufficient.
Effects of the request (HDD): `0x250768(3)` (mode word `D_003706D0 = 3`), `D_0037068C = 0`, `D_00370625 = 0` + `0x249680(0)`, fade-out 24CE88, `D_003706B4 = 2`, `D_003706B8 = -1`, `D_003706A8 = 1`. **V**

## Leave counter, exit
`L = D_003706A8` is read at the check; `L != 0`: `L + 1` is stored and the module exits when the OLD value `>= 0x5B` (NTSC) / `0x4C` (PAL) and `D_003705FC == 0`. So the request pass is counter 1, the last pass reads 0x5B: 91 passes NTSC (R .. R+90), 76 PAL (R .. R+75). **V**
Exit `0x24ED20` (ROM 0x248160): `1F0648 = dest`, `1F064C = 3`, `1F0010 = exec`, `1F0644 = 1`, `1F0014 = 0` (ROM 0x1F05E8/5EC/0014/05E4/0018). **V**

## The 99-frame return, as measured
Capture frames: pad applied at P; the edge is in the pass of P+1 (R); last Browser pass R+90; first clock frame (0x225E80 / ROM 0x221558) R+96 on HDD (5 frames with neither module drawing), R+92 on ROM (1 frame). Press to clock: 97 HDD, 93 ROM (matches `clock-transitions.md` ROM "93 after the press"; the HDD "99 after the second press" counts from the pad command two frames before the capture's first frame: T0 2105 - header 2008 = 97). The "8 + 91" guess is wrong: it is 1 (press to edge pass) + 91 (leave passes, request pass included) + 5 (hand-off, HDD) = 97. Cold `BootBrowser` start instead of the warm module switch: 35 frames of hand-off before the clock draws (measured once, `direct`). **V** (numbers), the hand-off causes are **R** (main's wake of the clock thread).

## Not covered
Disc-state requests (`0x24C1D0`: transition(4) on disc type 0x74; execute-app request 0x24EC50), the soft-reset overlay 0x24EE80, `D_003705FC` writers (IO pump; read as input at the check), dialog kinds 1..4, the Circle on a non-root page, `D_003706A4 == 0xA` entry.

## Stimuli (memory writes, said where used)
`hddosd-110U-browser-enter-direct` (`SkipSearchLater BootBrowser`, no menu) writes: `D_00370BE8 = 1` (dialog kind 1: the render stores `EC = 1`), `D_00370778 = 1` (the dialog is cut: `F0 = 0`, `BE4 = -1`; Circle asks nothing), `D_00370780 = 1` (self-clears in 2 passes; Circle asks nothing), `D_00370820 = 1`, `D_00370858 = 8`, `D_0037085C = 8` (decay by 1 per pass), `D_00370678 = 1` (byte), `D_0037072C = 5` (the page fade-in recovers 1 per pass). Each with a Circle: no request; the last Circle (all words clear) asks. Also L2 (edge 0x01) and R1 (0x08): no request. `D_003705FC` cannot be held (the IO pump rewrites it every pass), so the black-hold branch (fade state 1 in a pass) and `io != 0` at the check are not reached.
