# Browser shell on ROM 2.30 (NTSC dump) against HDD OSD 1.10U

Every statement is **read** (disassembly of `References/dumps/rom-0230A-clock-ee-00100000.bin`, base 0x100000, and `D:/CodingProjects/CrystalOSD/asm/browser/`), unless it says otherwise. Nothing here is measured or verified. ROM gp = 0x002CFEF0 (positive control: the clock screen-code word gp-0x6FD4 = 0x2C8F1C is read at ROM 0x2210D0, `facts/clock-transitions.md:48`). HDD gp = 0x377970. The PAL dump `rom-0230E-pal-clock-ee-00100000.bin` has 0 differing words over the same ranges: PAL is a runtime flag.

## Functions

| Item | HDD OSD 1.10U | ROM 2.30 | Same code |
|---|---|---|---|
| module prepare | 0x24E7D0 | 0x247C48 | same intent, other layout |
| thread proc | 0x24F008 | 0x248448 | same structure; ROM has no `AddDmacHandler2(1, vVif1Finish, -1)` and loads `0x680000` where HDD loads `0x600000` at the `StartFrame`-side call |
| loop top | 0x24F070 | 0x248498 | |
| leave-counter test | 0x24F0A0..0x24F0D8 | 0x2484C8..0x248500 | identical logic |
| exit call | 0x24F0E0 | 0x248508 | |
| init reset (VIF/VU/GIF/DMA) | 0x24E890 | 0x247D08 | ROM lacks the HDD-only extras |
| init chain | 0x24EB38 | 0x247FA8 | no: ROM has no S/PDIF store `0x1F0114 = 0x14/0x15` |
| per frame | 0x24EB90 | 0x247FD8 | 1 word of 23 differs (a data offset) |
| master frame | 0x253860 | 0x24D500 | no |
| scan | 0x24B940 | 0x245250 | no, ROM has no HDD stage |
| leave request | 0x24EBF0 | 0x248038 | 1 word: first call argument `3` (HDD, 0x250768) vs `2` (ROM, 0x249B58) |
| exit | 0x24ED20 | 0x248160 | no (below) |
| fade start in / out | 0x24CE60 / 0x24CE88 | 0x246810 / 0x246838 | state is a word on HDD, a byte on ROM |
| fade overlay | 0x24CEB0 | 0x246860 | same algorithm, byte state |
| fade wrapper | 0x24D0A0 | 0x246A58 | |
| soft-reset overlay | 0x24EE80 | 0x2482E8 | |
| Circle branch | 0x254840 (test 0x2548F4, transition call 0x254910) | 0x24E440 (test 0x24E5D4..0x24E5DC, call 0x24E5F0) | no |
| HDD error dialog | 0x25BD18 / 0x25BC08 / 0x25C0F4 | none | HDD only |

## Thread loop (both builds)

Per pass: per-frame function, soft-reset overlay, frame counter, wait for the next frame; then the leave counter L (HDD 0x3706A8, ROM 0x2C8C00): L = 0 loops; else the counter is stored as L+1 and the thread exits when `L >= 0x5B` (NTSC) or `L >= 0x4C` (PAL) and the IO job word (HDD 0x3705FC, ROM 0x2C8B34) is 0.

## Exit stores

| Word | HDD | ROM |
|---|---|---|
| module (dest) | 0x1F0648 | 0x1F05E8 |
| previous module (= 3) | 0x1F064C | 0x1F05EC |
| execute type | 0x1F0010 | 0x1F0014 |
| flag set to 1 | 0x1F0644 | 0x1F05E4 |
| word cleared | 0x1F0014 | 0x1F0018 |

HDD additionally calls `sceUsbKbEnd` and `func_0025B518` before the stores.

## Data words

| Role | HDD | ROM (gp offset) |
|---|---|---|
| leave counter | 0x3706A8 | 0x2C8C00 (-0x72F0) |
| PAL flag | 0x3706B0 | 0x2C8C08 (-0x72E8) |
| IO job word | 0x3705FC | 0x2C8B34 (-0x73BC) |
| fade state (ROM byte) | 0x370660 | 0x2C8BB4 (-0x733C) |
| fade counter | 0x37066C | 0x2C8BBC (-0x7334) |
| fade colour | 0x370670 | 0x2C8BC0 (-0x7330) |
| fade length | 0x370674 | 0x2C8BC4 (-0x732C) |
| leave destination | 0x3706B4 | 0x2C8C0C (-0x72E4) |
| execute type | 0x3706B8 | 0x2C8C10 (-0x72E0) |
| pad edge | 0x3707A4 | 0x2C8D34 (-0x71BC) |
| previous-was-CD-player flag | 0x3706A4 (0xA) | 0x2C8BFC (0/1) |

## Fade overlay (read)

State 1: alpha 0x80. State 2: alpha = (counter << 7) / length. State 3: alpha = 0x80 - (counter << 7) / length. The counter decrements while non-zero; at 0, state 2 becomes 0 and state 3 becomes 1. Length 0x5A (NTSC) / 0x4B (PAL), loaded by the thread start and by the leave request.

## Circle at the root page

ROM: one Circle at the root (page kind word +0x124 = 0) calls `0x248038(2)`, the leave request. No dialog is involved. HDD: same call at 0x254910, reached only when no dialog is open. Non-root pages: ROM tests flag `& 2` and sends `0x5200, 1, 0xA` with no kind-0xA skip; HDD tests `& 4` and sends `0x6300, 1, 0xA`. Page record stride ROM 0x160 (base 0x2AFA20), HDD 0x1C0 (base 0x2BD420).

## Dialog

ROM has no dialog: the immediate scan finds ids 0x154..0x157 and 0x15A..0x15F only in the HDD (0x25BE80..0x25BFB0); the ROM master frame has two overlay calls (DVD error 0x24CCC8, disc error 0x24CE98) against HDD's three; the ROM scan has no counterpart of 0x25BC08. ROM word -0x7394 (0x2C8B5C) is a modal state 1..4 (read as a confirmation dialog), not the HDD error dialog.

## Probes for a verifier

| What | HDD pc | ROM pc |
|---|---|---|
| per frame | 0x24EB90 | 0x247FD8 |
| leave-counter read | 0x24F0A0 | 0x2484C8 |
| leave request | 0x24EBF0 | 0x248038 |
| Circle call | 0x254910 | 0x24E5F0 |
| exit | 0x24ED20 | 0x248160 |
| fade overlay | 0x24CEB0 | 0x246860 |

## Open

- The ROM equivalent of the HDD gate word `D_00370820` in the Circle branch is not identified.
- ROM word -0x7394 could block Circle at the root; probe at 0x24E5D4.
- What `0x250768(3)` (HDD) against `0x249B58(2)` (ROM) does is unread.
- The ROM leave counter has a third writer at 0x248150, not read.
- Frame numbers of the ROM return are in `facts/clock-transitions.md` (measured); this reading derives none.
