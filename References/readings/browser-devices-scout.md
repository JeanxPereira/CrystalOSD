# Browser device row: scout reading (HDD OSD 1.10U base 0x200000; ROM 2.30 where mapped)

Everything here was read in disassembly (`D:/CodingProjects/CrystalOSD/asm/browser`, ROM through `disasm_rom.py` on `rom-0230A-clock-ee-00100000.bin`). It is a reading: what `facts/browser-devices.md` states is what `verify_browser_devices.mjs` recomputes. Function names in the module are unreliable; addresses are cited.

## Corrections to the inventory

- There is no separate "device row" function. The root page is device 0 ("PS2"); the HDD tile and the cards are its items. `0x254840` is the generic grid-page input; items are built at `0x249AB8` (ROM `0x24F410`), laid out by `0x2551B0` (ROM `0x24F2E8`) and `0x257860` (ROM `0x252558`), drawn by the loop at `0x2599C8` (ROM `0x252E48`).
- `0x243558`, `0x243700` and `0x243AD0` draw the copy and delete "select location" list, not the row.
- `0x250DA0` is the page header (name line and free-space line); the free string call is at `0x251358`.
- ROM 2.30 numbers devices differently: device 1 is the disc and there is no HDD item. Page records are 0x160 bytes (HDD 0x1C0), fields shifted by -0x60 from 0x198 on; ROM gp is 0x2CFEF0 (HDD 0x377970).

## Scan (HDD `0x24B940`, ROM `0x245250`)

- Loops slot i = 0..7, record 0x2BCF20 + 0x10 i (ROM 0x2AD460): type, free, format, multitap. `sceMcGetInfo(port = i>>2, slot = i&3)`; `sceMtapGetConnection(port) == 1` is stored at +0xC.
- Per present slot: type word array 0x2BBD64 + 4 i (type, +4 when multitap == 1 and type != 0), free KB array 0x2BC188 + 4 i = `isfirstslot(type, free)`, format array 0x2BC5AC + 4 i = (format != 0). HDD device 1 uses index 0x108 (type 0x2BC184, free 0x2BC5A8, format 0x2BC9CC).
- `isfirstslot` 0x2493A8 (ROM 0x243368): type 2 or 6: max(free - 2, 0); otherwise free*8 + 2 when free != 0. Raw type is 1, 2 or 3 from the library.
- Rescan at runtime: the job pump `0x24B388` cycles slots and calls `0x249498`; after Format the pump sets the format flag to 1 and the free word to 0 until the rescan.

## Title text (HDD `0x253D38`, ROM `0x24D8B0`)

`(device, type)`: device 0 id 6 "PS2"; device 1 id 0x1A1 "HDD" (ROM: disc table); devices 2..9: first id 0x8A (types 2, 6), 0x88 (3, 7), 0x89 otherwise (ROM 0x95, 0x93, 0x94), then the suffix id 7 + ((dev-2)>>2) for type < 5 or dev+5 / dev+7 (multitap names) for type >= 5; device 0xB id 0x16 "Unknown"; 0xC and up read a table.

## Free-space text (HDD `0x253FA0`)

KB < 1000: id 0x2E with KB; 1000..9999: id 0x2F with KB/1000 and KB%1000; 10000 and up: MB = (KB + 0x3FF) >> 10, ids 0x1C0 / 0x1C1. The header reads it only when the format flag of the slot is set; else id 0x2D "Unformatted" (header code at HDD `0x25132C..0x251360`, slot = dev-2, dev-4 above 0xB, 0x108 below 2).

## Page layout and items

- `0x2551B0` (ROM `0x24F2E8`): n = count - first; with a scroll top: 5 columns, 4 rows; else cols = 1 (n < 2), 2 (n < 5), 3 (n < 9), 4 (n < 16), 5; rows = clamp(ceil(n/cols), 1, 4). Stores cols, rows, f0 = (cols*24 + 6)/2, f4 = (rows*24 + 4)/2, d8 = (rows-1)*40 + 160.
- `0x257860` (ROM `0x252558`): item index i: x = ((-f0 + 3) + 12) + (i % cols)*24, y = ((-f4 + 2) + 12) + (i / cols)*24, stored at item +0x98 / +0x9C.
- Item order (`0x249AB8`): the HDD item (HDD OSD only), then the slots 0..7 with type != 0 as device slot+2, then the disc.
- Selection phase: `0x259AB8..0x259B34`: phase += 0.013 (word 0x36FF14, ROM 0x2C8518), wrap at 2^20; previous phase kept at 0x370880 (ROM 0x2C8DE4); sin and cos terms feed the icon matrices.

## Input (HDD `0x254840`, ROM `0x24E440`)

Runs only when the page-in counter 0x37072C equals 0x1A (ROM word 0x2C8CCC, 0x1A NTSC / 0x15 PAL), no hold byte, no slide (0x370858/5C). Bits: Left 0x8000, Right 0x2000, Up 0x1000, Down 0x4000 from the repeat word 0x3707AC; Cross 0x20, Circle 0x40, Triangle 0x10 from the edge word 0x3707A4. Availability of Left (0 none, 1 simple, 2 scroll, 3 leave): cursor > first: 1 (2 at the scroll top); cursor == first: 3 when the page is not the root and no mode 2, else 0. Right: cursor < count-1: 1 (2 at scroll top + 0x13), else 0. A move stores cursor +-1 (0x254D28 / 0x254DC0) and sends `(0x6300, 1, 6)` from `0x254F4C` (ROM `0x5200` from `0x24EB60`).

## Sound gate

`0x24E090` calls the enqueue `0x200C00` unless device 0xA is current (and not the CD player view); ROM wrapper `0x247BC8`, enqueue `0x200BE8`, command 0x5200.

## Not read or not exercised

Scroll slides, the multitap names, the glow radius words, Up and Down on 3 items, the ROM remote-key gate `0x201D90`.
