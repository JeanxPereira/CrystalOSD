# Browser Format dialog: scout reading (HDD OSD 1.10U base 0x200000; ROM 2.30 structure)

Read in disassembly; `facts/browser-devices.md` states what `verify_browser_format.mjs` recomputes. `0x255868` is only the render; the logic is `0x255C18`.

| Role | HDD | ROM 2.30 |
|---|---|---|
| render | `0x255868` | `0x24AD30` (ids shifted by +1) |
| logic per frame | `0x255C18` via dispatcher `0x255BE8` (D_00370820 == 1) | `0x24CA90` (one state word) |
| render caller (draw gate, alpha) | `0x2516F0` (`j 0x255868` at `0x251864`) | `0x24AED8` |
| open | `0x255838` (from the card page builder `0x2499E8`) | inline at `0x243610` |
| format job start | `0x2496F0` | `0x2436A8` |
| sceMcFormat wrapper | `0x23C370` (async RPC 0x10) | `0x239AE8` |
| job poll | `0x24B388` jump table at `0x3663C0`, type 0xB | `0x244DB8`, type 9 |

## Logic, HDD `0x255C18` (states 1..5 in D_00370BC0, cursor byte D_00370BBC, dialog flag D_00370820)

- State 1: cursor = 0, state = 2, then the state-2 code in the same call.
- State 2, edge word D_003707A4: Left (0x8000) with cursor 0: effect 6, cursor 1. Right (0x2000) with cursor 1: effect 6, cursor 0. Cross (0x20): effect 4; cursor 1 (Yes): `0x2496F0(D_00370824)` starts the format job, state 3; cursor 0 (No): state 0, D_00370820 = 0. Circle (0x40): effect 0xA, state 0, D_00370820 = 0. (The register that holds the cursor in the Left test is reloaded with the Right bit in the branch delay slot: Left on Yes does not toggle.)
- State 3: returns while D_00370604 (busy) != 0; then rescan flag D_002BC9D8[slot] = 1; result byte D_0037061C == 0: effect 9, state 4, clear bit 3 of the page flags at D_002BD420 + depth*0x1C0 + 0xF8; else effect 0xB, state 5.
- States 4 and 5: Circle only (no sound): state 0, D_00370820 = 0.

## Render, HDD `0x255868`

States 1 and 2: ids 0x4A, 0x4B (two lines, y 0x59 and 0x6A through `0x24D550`), then ids 0x31 (Yes) and 0x32 (No) in the format `\x07c%1d%s    \x07c%1d%s` at `0x366490`, y 0x80; colour 2 on the selected one (cursor 1: Yes, cursor 0: No), 4 on the other. State 3: ids 0x4C (y 0x5F), 0x4D (y 0x70). State 4: 0x4E (y 0x68). State 5: 0x4F (y 0x68). `func_002128C8(0, alpha)` first: alpha from the caller.

## Format job

`0x2496F0` (a0 = slot): D_00370604 = 2, D_00370628 = 0xB, D_00370634 = card address, D_00370824 = D_0037062C = slot, D_0037061C = 0. The pump calls `0x23C370(slot)` (port = slot>>2, slot - 4*port; `sceMcFormat`), then polls `sceMcSync` once per pass at `0x24B844`: success clears the busy word, sets the slot's format flag to 1 and its free word to 0. The wait is event-timed, not frame-timed.

## Opening condition

`0x2499E8` on entering a card page: card present (word +0x42C) and format flag (+0xC74) zero: page flags |= 8, D_00370820 = 1, D_00370824 = slot, D_00370BC0 = 1. The dialog is drawn by `0x2516F0` when the empty-text fade D_00370764 != 0, the page-in counter D_0037072C >= 10 and no error overlay is active.

## Open

Failed format path (state 5), ROM McSync result address, text id to string mapping beyond what the capture shows, Up and Down in the dialog.
