# Browser devices: the memory card scan, the root page, the card page header and the Format dialog

Builds: **HDD OSD 1.10U** (canon; every address is its unless "ROM" is written) and **ROM 2.30** (second; its addresses are given in brackets where mapped).
*Verified* means a script recomputes the statement from probed words and compares it with what the console wrote (script and capture named); *measured* means seen in a capture and not recomputed; *read* means taken from the disassembly (address range given). Readings: `References/readings/browser-devices-scout.md`, `References/readings/browser-devices-format-scout.md`. Models: `References/model/browser_devices.mjs`, `References/model/browser_format.mjs`. The card image the Format dialog writes is in `facts/memory-card-image.md`. Sounds are queued as in `facts/sound-events.md`.

Verifiers and captures (traces in the Watson captures directory; a `.png` next to each shows its pages):

| Verifier | Build | Capture | What the capture does |
|---|---|---|---|
| `verify_browser_devices.mjs` (`CLOCK_BUILD=hdd`) | HDD | `hddosd-110U-browser-devices-blank` | root page, two blank cards: Left at the first item, Right, Right, Right at the last, Left, Left |
| same | HDD | `hddosd-110U-browser-devices-formatted` | a card page is entered, the Format dialog is answered Yes, "Formatting completed." shows, back to the root |
| same | HDD | `hddosd-110U-browser-format-no` | the dialog is answered No after moving the cursor Yes/No four times; the page shows "Unformatted"; the card page is entered again and closed with Circle |
| same (`CLOCK_BUILD=rom`) | ROM | `rom-0230A-browser-devices-blank` | root page, two blank cards |
| `verify_browser_format.mjs` (`CLOCK_BUILD=hdd`) | HDD | `hddosd-110U-browser-devices-formatted`, `hddosd-110U-browser-format-no` | the Format dialog |

Results: `verify_browser_devices.mjs` ends `FOUND the device row` on all four captures. `verify_browser_format.mjs` ends `FOUND the Format dialog` on both (formatted: open 1, sound 287, step 286, job 1, rescan 1, flag 1, close 1, draw 276, alpha 276, one `sceMcFormat` call; format-no: open 1, sound 294, step 292, close 2, draw 272, alpha 272, no `sceMcFormat` call).

There is no separate device-row function. The root page is device 0 ("PS2"); the HDD tile and the cards are its items. The page input is the generic grid-page input `0x254840` (ROM `0x24E440`). *Read*: `browser-devices-scout.md`.
ROM 2.30 numbers devices differently: device 1 is the disc and there is no HDD item; page records are 0x160 bytes (HDD 0x1C0). *Read*.

## 1. Scan and per-slot words

The scan loop `0x24B940` (ROM `0x245250`) visits slot i = 0..7 over the record `0x2BCF20 + 0x10*i` (ROM `0x2AD460`) holding type, free, format and multitap. It calls `sceMcGetInfo(port = i>>2, slot = i&3)`; the port and slot split `i>>2`, `i&3` is inside `0x23C2B8` and `sceMtapGetConnection(port) == 1` is stored at +0xC by the sync wrapper `0x23C468` (a port without a multitap reports type 0 for slots 1..3). *Read*.

- **Kilobytes.** `isfirstslot` (`0x2493A8`, ROM `0x243368`) returns, for library type 2: `max(free - 2, 0)`. For type 0 with free 0 it returns 0. Types 1, 3 and the multitap +4 on a present slot, and the HDD device index `0x108` (type `0x2BC184`, free `0x2BC5A8`, format `0x2BC9CC`), are *read* only; the type 6 case and the other-type rule (`free*8 + 2` when free is nonzero) are *read* only. Model `isFirstSlot` returns null for them.
- **Arrays.** Per present slot the loop stores the type word at `0x2BBD64 + 4i` (ROM `0x29C3A0`), the kilobytes at `0x2BC188 + 4i` (ROM `0x29C3C0`) and the format word `(format != 0)` at `0x2BC5AC + 4i` (ROM `0x29C3E0`). Stores at `0x24BAE0` and `0x24BB00` (ROM `0x2453B0`, `0x2453C8`).

Verified (`verify_browser_devices.mjs`, sections `scan.kb`, `scan.store`, `scan.arrays`; `isfirstslot` calls printed as `scanCalls` = type,free->returned):

| Slot state | `sceMcGetInfo` type, free | `isfirstslot` returns | Captures |
|---|---|---|---|
| blank card (type 2, no format) | 2, 0 | 0 KB | `hddosd-110U-browser-devices-blank`, `hddosd-110U-browser-format-no`, `hddosd-110U-browser-devices-formatted` (before the format); ROM: `rom-0230A-browser-devices-blank` |
| formatted empty card | 2, 8000 | 7998 KB | `hddosd-110U-browser-devices-formatted` (ninth call) |
| no card | 0, 0 | 0 KB | all four captures (6 slots of 8) |

Counts: blank HDD `scan.kb` 8, `scan.store` 8, `scan.arrays` 8; formatted `scan.kb` 9, `scan.store` 8, `scan.arrays` 8; format-no 8, 8, 8; ROM blank 8, 8, 8. The value stored per slot equals the `isfirstslot` return (`scan.store`) and the arrays hold type, kilobytes and `format != 0` as the model's `scanStore` states.

The job pump `0x24B388` (ROM `0x244DB8`) rescans slots at run time through `0x249498`; after a Format it sets the slot's format flag to 1 and its free word to 0 until the rescan (*read*). How the library arrives at free 8000 from the image is open (below).

## 2. Title text

`0x253D38` (ROM `0x24D8B0`) concatenates string ids for device `dev` (0 the root, 1 the HDD, 2..9 the card slots) of type `type`. Verified (`verify_browser_devices.mjs`, section `title`: ids read at the string call `0x2081B8`, ROM `0x204FD0`, inside the function), model `titleIds`:

| Device | Ids | Text | Build |
|---|---|---|---|
| 0 | `[6]` | "PS2" | HDD and ROM |
| 1 | `[0x1A1]` | "HDD" | HDD only |
| 2..9, type 2 | `[0x8A, 7 + ((dev-2)>>2)]` (ROM `[0x95, ...]`) | "Memory Card (PS2)/1" for device 2, "/2" for device 6 | HDD and ROM |

Counts: HDD blank 5, formatted 12, format-no 14; ROM blank 4. Read only: first id 0x8A for types 2 and 6 (type 2 verified), 0x88 for types 3 and 7, 0x89 otherwise (ROM 0x95, 0x93, 0x94); the strings ("PS2", "HDD", "Memory Card (PS2)/1") are *measured* in the screenshots next to the captures, not recomputed (the verifier compares ids); for type 5 and above the suffix is dev+5 or dev+7 (multitap names); device 0xB id 0x16 "Unknown"; devices 0xC and up read a table. ROM device 1 is the disc table (read).

## 3. Header and free text

The header code `0x251330..0x251360` (slot = dev-2, dev-4 above 0xB, `0x108` below 2) reads the slot's format word. *Verified* (`verify_browser_devices.mjs`, section `header`; `hddosd-110U-browser-devices-formatted` 410 headers, `hddosd-110U-browser-format-no` 509): format zero draws string id 0x2D "Unformatted"; else it calls the free text `0x253FA0` with the slot's kilobytes. The slot offset register equals `4*slot` for device 2 (verified); the HDD offset `0x108*4` and `dev-4` above 0xB are *read*, device 2 is the only one seen.

Free text `0x253FA0`, *verified* by section `free` (201 calls on `hddosd-110U-browser-devices-formatted`), model `freeText`:

| Kilobytes | Id and numbers | Exit |
|---|---|---|
| under 1000 | 0x2E (kb) | `0x2540B8` |
| 1000..9999 | 0x2F (kb/1000, kb%1000) | `0x254090` |

7998 gives 0x2F with 7 and 998: "7,998 KB Free" (`.png` of the capture). For 10000 and above the rule is MB = `(KB + 0x3FF) >> 10` with ids 0x1C0 / 0x1C1 (exits `0x254044`, `0x25401C`): *read* only; no capture reaches it.

## 4. Status line

The centred line of a card page, drawn by `0x2516F0` (call at `0x251890`, flags at `0x251880`). *Verified* (`verify_browser_devices.mjs`, section `status`: 115 on `hddosd-110U-browser-devices-formatted`, 208 on `hddosd-110U-browser-format-no`), model `statusLine`, NTSC:

- id: 0x51 "Unformatted" when the device is not 0 and the page flags have the mask 8 (bit 3) set; else 0x50 "No data." (a formatted empty card). The ids are *verified* with device 2 only (0x50 with flags 0, 0x51 with flags 8); the `device != 0` condition (the root page is device 0) is *read*.
- alpha: `ramp = trunc(100*empty/60)` with `empty` the fade word `0x370764`; alpha `= trunc(ramp * (pageIn - 10) / 16)` (page-in counter `0x37072C`, 0x1A at rest).

After the dialog is answered No the idle line is id 0x51 (`hddosd-110U-browser-format-no`). "Loading...", PAL and the alpha of a slide in mode 2 (slide word above 0: `trunc(ramp * (30 - slide) / 30)`, *read* at `0x2517B0..0x251824`) are *read* only; the model returns null for them and the verifier fails on a captured frame in those cases.

## 5. Page layout and item positions

`0x2551B0` (ROM `0x24F2E8`) with n = count - first. *Read*: with a scroll top, 5 columns and 4 rows; otherwise cols = 1 (n < 2), 2 (n < 5), 3 (n < 9), 4 (n < 16), else 5; rows = clamp(ceil(n/cols), 1, 4). *Verified* only for the item counts the captures reach (n = 0 and 3 on HDD, n = 2 on ROM; no scrolling; the model returns null for n >= 5) (section `layout`; model `pageLayout`, the probe after the stores at `0x2552E0`, ROM `0x24F400`): cols = 2 if n >= 2 else 1; rows = max(ceil(n/cols), 1); `f0 = (cols*24 + 6)/2`; `f4 = (rows*24 + 4)/2`; `d8 = (rows-1)*40 + 160`, in EE single precision. Layout counts: HDD blank 1, formatted 3, format-no 4; ROM blank 1.

`0x257860` (ROM `0x252558`) places item i: `x = ((-f0 + 3) + 12) + (i % cols)*24`, `y = ((-f4 + 2) + 12) + (i / cols)*24` (integer division). *Verified* (section `item`, model `itemPosition`, probe `0x2579A8`, ROM `0x252670`): 1953 items blank, 1683 formatted, 1623 format-no, 696 ROM blank.

The item order is the HDD item (HDD OSD only), then the slots 0..7 with type != 0 as device slot+2, then the disc (*read*, `0x249AB8`, ROM `0x24F410`). The root page values, computed from the rule:

| Build | Items | cols, rows, f0, f4, d8 | Positions (x, y) |
|---|---|---|---|
| HDD | HDD, card 1, card 2 (n = 3) | 2, 2, 27, 26, 200 | (-12, -12), (12, -12), (-12, 12) |
| ROM | card 1, card 2 (n = 2) | 2, 1, 27, 14, 160 | (-12, 0), (12, 0) |

## 6. Selection phase

`0x259AB8..0x259B34` (ROM `0x252F38`) adds the word at `0x36FF14` (ROM `0x2C8518`; the capture reads 0.013) to the phase at `0x37086C` (ROM `0x2C8DD0`) in EE single precision; the previous phase stays at `0x370880` (ROM `0x2C8DE4`). Sine and cosine terms of the phase feed the icon matrices (*read*). *Verified* (section `phase`, model `nextPhase`: each call's phase equals the previous phase plus the step and the stored previous phase equals the previous call's phase): 650 comparisons blank, 970 formatted, 1049 format-no, 347 ROM blank. The wrap at 2^20 and the sine and cosine terms are not verified (Open).

## 7. Cursor and sounds

`0x254840` (ROM `0x24E440`) runs the grid page's input. Gates (*verified* only for the page-in counter and for the dialog word being 1 during a Left or Right press; the other gates are *read*: hold byte, slide words, counts and busy are never nonzero while a direction is pressed in the captures): nothing moves unless the page-in counter `0x37072C` (ROM `0x2C8CCC`) is 0x1A, the dialog word `0x370820` is 0, the hold byte is not 1, the slide words `0x370858`/`0x37085C` are 0, the record count and the list count are nonzero and the busy word is 0. Bits (*read*): Left 0x8000, Right 0x2000, Up 0x1000, Down 0x4000 from the repeat word `0x3707AC`; Cross 0x20, Circle 0x40, Triangle 0x10 from the edge word `0x3707A4`.

Left and Right on a page without scrolling, NTSC:

- Left moves the cursor to `cursor - 1` unless `cursor == first`; at the first item of the root page (device 0) it stays. Right moves to `cursor + 1` unless `cursor >= min(recCount, listCount) - 1`; at the last item it stays.
- A move sends `(0x6300, 1, 6)` with return address `0x254F54` (ROM `0x5200` with `0x24EB68`); the move is stored at `0x254D28` / `0x254DC0` and the send is at `0x254F4C` (ROM `0x24EB60`, *read*). A blocked move sends nothing.

Compared frames (`verify_browser_devices.mjs`, sections `cursor` and `sound`; each compared frame checks cursor and sound together; the real moves are 4 on the blank capture, 1 on formatted, 1 on format-no, 2 on ROM): `hddosd-110U-browser-devices-blank` 353 (the Left at the first item and the Right at the last item are blocked and send nothing; the three-item root page gives the cursor path 0, 1, 2), `hddosd-110U-browser-devices-formatted` 669, `hddosd-110U-browser-format-no` 746, `rom-0230A-browser-devices-blank` 347.

Not modelled: frames with a Cross, Circle or Triangle edge (`0x70`), Up, Down, scrolling, mode 2 and PAL (the verifier counts them as `unmodelledFrames`, each with an edge key present: 2 on formatted, 3 on format-no, 0 on the blank captures), and Left at the first item of a non-root page (the page-leave availability 3, *read*).

Left availability (*read*): cursor above first gives 1 (2 at the scroll top); cursor equal to first gives 3 when the page is not the root and not in mode 2, else 0. Right: cursor below count-1 gives 1 (2 at scroll top + 0x13), else 0 (1 in mode 2). The sound gate `0x24E090` calls the enqueue `0x200C00` unless device 0xA is current, except when the view mode word `0x3706F8` is 3 or is 2 with `0x370460` equal to 2; the ROM wrapper `0x247BC8` has another condition (it returns when `[0x1F0CE0]` is nonzero, else jumps to the enqueue `0x200BE8`). A Left that leaves the page (availability 3) and Up also reach the same sound call. *Read*.

## 8. The Format dialog

Roles (*read*, `browser-devices-format-scout.md`):

| Role | HDD | ROM 2.30 |
|---|---|---|
| logic per frame | `0x255C18` via dispatcher `0x255BE8` (dialog word `0x370820` == 1) | `0x24CA90` |
| render | `0x255868` | `0x24AD30` |
| render caller (draw gate, alpha) | `0x2516F0` (`j 0x255868` at `0x251864`) | `0x24AED8` |
| open | `0x255838`, from the card page builder `0x2499E8` | inline at `0x243610` |
| format job start | `0x2496F0` | `0x2436A8` |
| `sceMcFormat` wrapper | `0x23C370` (asynchronous RPC 0x10) | `0x239AE8` |
| job poll | `0x24B388`, jump table `0x3663C0`, type 0xB | `0x244DB8`, type 9 |

The ROM dialog is not captured; only its structure is read.

**Opening.** On entering a card page whose card is present and whose format flag is zero, `0x2499E8` sets page flag bit 3 (value 8), the dialog word to 1, the slot word `0x370824` and the state `0x370BC0` to 1 (*read*). *Verified* (`verify_browser_format.mjs`, section `open`, both captures): the first logic call has state 1 and dialog flag 1. The dialog draws (NTSC) when the empty-text fade `0x370764` is nonzero, the page-in counter is at least 10, no error overlay is active, the dialog word is 1 and `0x370734` is not negative (*read*, `0x2516F0`).

**Logic `0x255C18`.** State word `0x370BC0`, cursor byte `0x370BBC` (0 No, 1 Yes), edge word `0x3707A4`. Effects are the argument `a2` of `(0x6300, 1, a2)`. *Verified* (sections `sound`, `step`, `job`, `rescan`, `flag`, `close`; model `formatStep`):

- State 1: cursor := 0, state := 2, then the state 2 code runs in the same call.
- State 2: Left (0x8000) with cursor 0 gives effect 6 and cursor 1; Right (0x2000) with cursor 1 gives effect 6 and cursor 0. Left on Yes and Right on No do nothing (*read*: the delay slot at `0x255CAC` reuses the register for the Right test; no capture presses them). Cross (0x20) gives effect 4: with cursor 1 (Yes) `0x2496F0` starts the format job (busy word `0x370604` becomes 2, section `job`) and state := 3; with cursor 0 (No) state := 0 and the dialog word := 0. Otherwise Circle (0x40) gives effect 0xA, state := 0, dialog word := 0.
- State 3: returns while the busy word is nonzero. When it is zero the rescan flag `0x2BC9D8[slot]` is set to 1 (section `rescan`). Result byte `0x37061C` equal to 0: effect 9, state := 4 and bit 3 of the page flags at `0x2BD420 + depth*0x1C0 + 0xF8` cleared (section `flag`: set before, clear after). A nonzero result (effect 0xB, state 5) is *read* only.
- States 4 and 5: Circle sets state 0 and the dialog word to 0 without a sound. State 4 is *verified* (`hddosd-110U-browser-devices-formatted`); state 5 is *read* only.
- Closing is seen through the dialog word: it is 0 in the frame after a close (section `close`: 1 on formatted, 2 on format-no).

The job `0x2496F0(slot)` sets the busy word to 2, `0x370628` to 0xB, `0x370634` to the slot's type word `0x2BB938 + 4*slot + 0x42C`, `0x370824` and `0x37062C` to the slot and `0x37061C` to 0. The pump calls `0x23C370(slot)` (`sceMcFormat` with port = slot>>2 and slot - 4*port), polls `sceMcSync` once per pass at `0x24B844`, and on success clears the busy word, sets the slot's format flag to 1 and its free word to 0. The job's completion is polled once per pass of the pump, not on a frame counter of the dialog (*read*; the capture's state 3 lasts 94 frames). *Read*; one `sceMcFormat` call is *measured* on `hddosd-110U-browser-devices-formatted` (`formatCalls` 1) and none on `hddosd-110U-browser-format-no`.

**Render `0x255868`** (`func_002128C8(0, alpha)` first; alpha as in section 4). *Verified* (sections `draw` and `alpha`; model `formatDraw`; ids read at the string call, heights at `0x24D550` and `0x24D900`, colours at the format call `0x25593C`):

| State | String ids in order | Heights |
|---|---|---|
| 1, 2 | 0x4A, 0x4B, then 0x31 (Yes) and 0x32 (No) | 0x59, 0x6A, 0x80 |
| 3 | 0x4C, 0x4D | 0x5F, 0x70 |
| 4 | 0x4E | 0x68 |
| 5 | 0x4F | 0x68 |

In states 1 and 2 the Yes/No line uses the format at `0x366490` (`\x07c%1d%s    \x07c%1d%s`): colour 2 on the selected word and 4 on the other (cursor 1: Yes 2, No 4; cursor 0: Yes 4, No 2). The fade alpha passed to the render equals section 4's alpha on every render (276 on formatted, 272 on format-no). States 3 and 4 are verified on `hddosd-110U-browser-devices-formatted`; state 5 is read only.

## Open

- A failed format (state 5, effect 0xB, the `sceMcSync` result address). Settled by a capture with a card that fails Format, read through `verify_browser_format.mjs`.
- The free count: how `sceMcGetInfo` yields free 8000 for the formatted image (`facts/memory-card-image.md`, Open); the rule beyond that one image.
- Multitap (type +4, names), items with a type other than 2, the HDD index `0x108` and the type 1, 3, 6 branches of `isfirstslot`.
- Free text of 10000 KB and above (ids 0x1C0 / 0x1C1) and "Loading...".
- Up, Down and scrolling pages (5 columns, 4 rows), the page-leave Left at the first item of a non-root page, Cross, Circle and Triangle on the grid page, the disc item and saves on a card.
- PAL (page-in 0x15 on ROM, the status line and the cursor).
- The ROM Format dialog (`0x24CA90`, `0x24AD30`; not captured).
- The wrap of the selection phase at 2^20 and its sine and cosine terms.
