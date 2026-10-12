# Text: the font, a glyph, a string, and where the strings go (draft for `facts/`)

Recorded 2026-10-02. Builds: **HDD OSD 1.10U** (canon, build `hddosd-1.10U-host`) and
**ROM 2.30**. *Read* means read in `../CrystalOSD/asm/` (HDD OSD) or in the ROM's memory dump with
`disasm_rom.py`; *verified* means `References/scripts/verify_text.mjs` recomputed it from the
inputs a trace probe recorded and it was equal, byte for byte, to what the console sent.
Addresses are HDD OSD's unless "ROM" is written. Nothing in `facts/` was edited.

**The two builds have different font code and the same glyph pictures.** HDD OSD uses Sony's
`libpfont` with one font file; ROM 2.30 has its own small routine with four pages of glyphs
loaded whole. The pictures of the 96 ASCII glyphs are the same pixels in both, bar one (95 of
96 equal), and both use the same sixteen-colour table; the widths and the spacing are not the
same (section 7).

## Result

| | HDD OSD 1.10U | ROM 2.30 |
|---|---|---|
| Glyph packets, byte for byte | 7 929 of 7 929 (624 bytes each) | 3 098 of 3 098 (96 bytes each) |
| Other packets of a string (opening state, texture set-up or page binding, pictures uploaded, colour table) | 1 636 openings, 1 216 texture set-ups, 11 pictures uploaded, 1 colour table: all equal | 810 openings, 522 page bindings: all equal |
| String level: every character asked for, with pen, colour and matrix | 41 575 of 41 575 characters, in 1 636 strings drawn and 3 542 measured; 175 distinct characters | pen chain only: 2 576 of 2 576 characters that follow another start where its advance left the pen |
| Place level (date, time, menu items, hints, title and selected entry of System Configuration) | 312 of 312 strings | not done |
| Button pictures beside the hints | 157 of 157 | not done |
| Glyph pictures in GS memory against the font file | 242 loaded cells in 6 dumps, 327 426 pixels, all equal; colour table equal | four pages, 942 080 pixels, all equal to `FNTIMAGE` |

Captures (`Watson/Runtime/captures/`): `hddosd-110U-text-` `clock`, `menu`, `config` (the list of
System Configuration), `config-down` (the list moving one place), `adjust` (Clock Adjustment
entered), `version` (the version page), `boot` (power-on, from before the first string);
`rom-0230A-text-` `clock`, `menu`, `config`, `adjust`. 5 095 840 bytes of text packets compared
and equal on HDD OSD, 369 696 on ROM 2.30. `config-down` and `boot` were taken before the place
level's ranges were added to the probes, so the place level and the button pictures are from the
other five.

## 1. The font file of HDD OSD (*verified against GS memory and against every upload*)

`FNTOSD` (1 489 358 bytes on the disk, read through `host:`), expanded with the OSDSYS scheme to
2 958 240 bytes. `extract_font.mjs` walks it exactly as `scePFontGetGlyph` (`0x002905A0`) does
and writes `References/model/font-osd.json` (layout, ranges, metrics, colour table) and one PNG
per block in `References/textures/` (git-ignored: the pictures are Sony's).

```
+0x00  two zero words (scePFontAttachData 0x00292510 refuses anything else)
+0x10  "OSD font ver0.1"
+0x50  s16 ascent 33, +0x52 s16 descent -7, +0x54 s16 56 (the program's width of a blank, escape s)
+0x58  number of blocks: 6        +0x5C  their offsets
block:
+0x10  flags: low 3 bits pixel format (0 = 4 bits), bit 3 = one metrics record per glyph
+0x14, +0x18  floats: scale of x and of y (1, 1 in every block)
+0x1C, +0x1E  s16 width and height of a glyph picture
+0x20, +0x22  s16 ascent, descent      +0x28 glyphs
+0x2C  pictures: ((w x h x bits + 7) / 8 + 15) & ~15 bytes each, pixels low bits first, rows not padded
+0x30  ranges, +0x34 their offset: (first code, last code, first index entry, added to the entry)
+0x3C  index: one u16 per code of every range, 0xFFFF = no glyph
+0x44  metrics: seven s16 and a pad per glyph (one record for the whole block when bit 3 is clear)
+0x54  colour table: 16 colours of 32 bits
```

| Block | Glyphs | Picture | Codes |
|---|---|---|---|
| 0 | 529 | 32 x 40 | `0x20..0x45F` (Latin, Greek, Cyrillic), `0x20AC..0x2122`, `0x3000`, `0xD803..0xD818` (button and arrow marks) |
| 1 | 157 | 26 x 26 | `0x21..0x7E`, `0xFF61..0xFF9F` (never reached for ASCII: block 0 has those codes) |
| 2, 3 | 2 965, 3 390 | 26 x 26 | kanji, two sets |
| 4 | 635 | 26 x 26 | symbols, kana, full-width forms |
| 5 | 1 | 64 x 40 | `0xD81B` |

A code is looked for in the blocks in order: the block's ranges are searched by bisection, the
index entry gives the glyph (`added + entry`), the first block that has it wins. The program asks
for `0xD818` when a code has no glyph.

**Metrics** (seven s16): `originX`, `baseline` (where the pen is inside the picture),
`left`, `right`, `top`, `bottom` (the ink's box about the pen; top and bottom positive upward),
`advance`.

**Colour table** (the same in all six blocks), as R, G, B, A: index 0 clear; 1 to 4 black with
alpha 0x19, 0x32, 0x4B, 0x64; then grey `0x33` with alpha 0x32..0x7D, `0x66` with 0x4B..0x7D,
`0x99` with 0x64, 0x7D, `0xCC` and `0xFF` with 0x7D. The glyphs are a white core with a dark
outline; the outline is in the pictures, not drawn.

## 2. The glyph cache in GS memory (*verified*)

The program gives the library `0x4800` words at `0xBC100` and a colour table at `0xBC000`
(TBP0 `0x2F04`, CBP `0x2F00`). `_scePFontSetupTexCache` (`0x00290B10`) lays it out when a glyph of
a block is first uploaded:

```
cell width  = (picture width  + 2 + 7) & ~7       40 for block 0
cell height = (picture height + 2 + 3) & ~3       44
pages       = (0x4800 + 0x7FF) >> 11 = 9;  across = largest divisor of pages not above sqrt(pages) = 3
texture     = across x 128 by (pages / across) x 128 = 384 x 384, 4 bits, TW = TH = 9
cells       = (384 / 40) x (384 / 44) = 9 x 8 = 72, numbered row by row
```

and sends the block's colour table: `BITBLTBUF` to `0x2F00`, 8 x 2 pixels of 32 bits, the 64
bytes taken from the file by reference.

The cache has 99 entries (`(0x1000 - 0x3A0) / 0x20`) in a list, most recently used first; the
first 72 hold a cell. `_scePFont_Putc` (`0x00291858`) walks the list for the code and stops at
the code, at an entry never used, or at the end; the entry found moves to the head; if it holds
no cell it takes the cell of the last entry passed that held one (the least recently used) and
both are marked not loaded.

A glyph not loaded is uploaded by `_scePFontUpdateTex` (`0x00290EE8`): `BITBLTBUF`, `TRXPOS` =
the cell's corner, `TRXREG` = the whole cell, `TRXDIR`, then the cell's pixels and `TEXFLUSH`.
The picture sits **one pixel in from the left and the top**; the top row, the left column, the
rest of each row and the row under the picture are cleared. **The code does not write the last
two rows of a 44-row cell**: they go out as whatever the packet buffer held (40 bytes per
upload, the only bytes of the text packets not compared).

`_scePFontSetupTexEnv` (`0x002915C0`), once per string that draws: `TEX1_1 = 0x60` (bilinear
both when magnified and when reduced), `TEX0_1` = the cache, 4 bits, modulate, with alpha, its
colour table loaded.

*Verified:* the layout and the colour table at power-on (`boot`: 1 table, 10 pictures), one
more picture when the list moved (`config-down`); 440 bytes of unwritten rows left out. *GS memory:* at the start of every capture's dump each loaded
cell holds its glyph's picture one pixel in, with a clear top row and left column, and the
colour table is the block's.

## 3. One glyph: a fan of twelve vertices (*verified*)

`_scePFont_Putc`, with the metrics `(originX, baseline, left, right, top, bottom, advance)`:

```
x0 = left - 1    x1 = right + 1    yT = -(top + 1)    yB = -(bottom - 1)

vertex   position            what it is
0        (0, 0)              the pen, on the baseline: the fan's centre
1        (0, yT)             the pen's column at the top
2        (x0, yT)            top left
3        (x0, 0)             the baseline at the left
4        (x0, yB)            bottom left
5        (0, yB)             the pen's column at the bottom
6        (advance, yB)       the next pen's column at the bottom
7        (x1, yB)            bottom right
8        (x1, 0)             the baseline at the right
9        (x1, yT)            top right
10       (advance, yT)       the next pen's column at the top
11       = vertex 1
```

It is the ink's box with a pixel of margin, cut into a fan about the pen; the six extra points
are where the pen's column, the next pen's column and the baseline cross the box. The library
uses them: the pen's column (1, 5) to start the first glyph of a line exactly on the pen, the
next pen's column (6, 10) to find where the pen goes. With a matrix that only scales, as here,
the fan covers the same rectangle with the same texture mapping as one sprite would.

Texel of a vertex = its position with `(originX + cellX + 1, baseline + cellY + 1)` added (y
downward), then `S = s / 2^TW x Q`, `T = t / 2^TH x Q`.

```
M      = the font matrix, x column scaled by the block's x scale and y column by its y scale
M[3]  += pen                                          (the pen: x, y, 0, 0)
p      = M[0]·x + M[1]·y + M[2]·0 + M[3]·1            each product and sum cut toward zero
first glyph after the pen was set:  every p.x -= (p1.x - pen.x)        (the font matrix's own shift is taken back)
new pen.x = p6.x                                      (general form: where the line 6-10 crosses pen.y)
q      = screen matrix · p;  Q = 1 / q.w
XYZ2   = ((int)(q.x·Q·16), (int)(q.y·Q·16), (int)(q.z·Q))
RGBAQ  = (int)(colour × 128) for each of r, g, b, a;  Q
```

The screen matrix is the unit matrix moved by `(2048 - W/2, 2048 - H/2)`. The packet of a glyph
is 624 bytes: `CLAMP_1` = region clamp to the cell's picture plus its margin
(`MINU = cellX`, `MAXU = cellX + 1 + width`, `MINV = cellY`, `MAXV = cellY + 1 + height`), then
`PRIM 0x5D` (triangle fan, Gouraud, textured, blended, `ST`) and twelve times `ST`, `RGBAQ`,
`XYZ2`. A glyph needs 40 quadwords of the 511 the program's packet has; when they are not there
the character is given up, the packet is sent, and the character is asked for again.

## 4. A string (*verified*)

The program's own font state is at `0x003979B0` (the library's context, `0x1000` bytes, is at
`0x003969B0`):

| Offset | Set by | What |
|---|---|---|
| `+0x00` | `Font_SetRetHeight` | line height for a line break |
| `+0x04` | escape `p` | fixed width, 0 = proportional |
| `+0x08` | escape `r` | width in percent, 0 = 100 |
| `+0x0C` | `Font_SetPitch` | extra pitch |
| `+0x1C`, `+0x20` | | decoration flags; clip to the screen |
| `+0x24` | `Font_SetTvFontRatio` | half the ratio given: 0.5 (PAL: 1.15 / 2) |
| `+0x28` | `Font_SetRatio` | size |
| `+0x30` | `Font_SetLocate` | pen (ints made floats) |
| `+0x40` | `Font_SetColor` | r, g, b, a, each / 128 |
| `+0x110` | `updateTransMatrix` `0x00213380` | the font matrix |

```
x scale = size × (percent / 100 when percent is not 0)         func_002132B8
font matrix = diag(x scale, x scale × 0.5, 1, 1), moved by (pitch × x scale, 33 × 0.7 × 0.5 × size)
```

So a glyph is `x scale` wide and half that high (a field is half a frame), and the baseline is
`33 × 0.7 × 0.5 × size` under the pen's y: the pen is the top of the line.

`Font_PutsPackets` (`0x00213BA8`): matrix, pen and colour into the library, one packet opening
the string (`TEST_1 = 0x30000` depth test always, `ALPHA_1 = 0x44` `(Cs - Cd) × As + Cd`), the
string through `fontFilter` (`0x00212D78`), the packet sent; the pen and the colour are read back,
so they carry to the next string.

The filter reads UTF-8 and these controls:

| Bytes | Effect |
|---|---|
| `0x0A` | pen x back to the string's start, pen y + line height |
| `0x09` | pen x to the next multiple of 63 |
| `07 c N` | colour N of the table at `0x00348B20` (0 grey 96, 1 yellow 110 110 0, 2 blue 47 87 127, 3 pink, 4 dark 44, 5 teal, 6 red-brown, 7 grey 60, 8 grey 90, 9 green); alpha kept |
| `07 a NNN` | alpha = NNN / 255 |
| `07 p @ C` | fixed width = the advance of character C; `07 p N N` = NN; `07 p 0 0` = proportional again |
| `07 r N . N N` | width in percent (`r0.80`); `r0.00` = back to 100 |
| `07 y ± H H` | pen y = the string's start y + HH / 16 |
| `07 s` | pen x + 56 |
| `07 o NNN` | the mark `0xD800 + NNN` (018 = up and down arrows, 020 = the summer-time mark) |

With a fixed width a character is centred in it (`(width - advance) / 2`, toward zero, × x
scale) and the pen moves by `pitch × x scale + width × x scale`. The clock's hours and the
fields of Clock Adjustment use it with the width of `0`, so digits do not shift as they change.

`calcDrawArea` (`0x00213D38`) runs a string through the same filter with drawing off and the pen
at (0, 0), and returns how far the pen went; `func_00213EE8` gives the caller
`(int)((int)reach + pitch × x scale)`. Every string that is centred or right-aligned is measured
this way first, every frame.

*Verified:* all 41 575 characters of the seven captures: the code asked for, the pen (both
coordinates), the colour and the sixteen floats of the matrix, bit for bit, and whether it is the
first of its line. `boot` alone measures 2 085 strings (the program measures its whole string
table at start-up), with 175 distinct characters, so the filter was run over every English
string of the menu, including the escapes `c`, `p`, `r` and `o`. 119 characters were given up
for want of room in the packet and asked for again, as modelled.

Not exercised, so only read: the decorations (a background rectangle per character,
`func_00213448`, and two more, `func_002136F8`, `func_00213878`; flags at `+0x1C`), the clip,
the escapes `y`, `s` and `a` while drawing, a line break, blocks other than 0.

## 5. Where the strings go (*verified for the callers below; NTSC*)

Positions are whole pixels of the 640 x 224 field. `width` is the measured width.

| Caller | String | x | y | Colour | Size |
|---|---|---|---|---|---|
| `func_00226300` | date: `%04d/%02d/%02d` year, month, day for date format 0; `%02d/%02d/%04d` month, day, year for 1 and day, month, year for 2; dashes in fixed widths while the year is negative | 22 | 14; 32 when clock item 0 is 2 | 96, 96, 96 | 0.83 (`D_0036FB94`) |
| `func_00226300` | time: `"%s %s"` of (the summer-time mark `\ar0.88\ao020\ar0.00`, or nothing) and `\ap@0%2d\ap00:%02d:%02d` (12 h: hour mod 12, 12 for 0, then ` %s` = `\ar0.80\ap@AA\ap00M\ar0.00` or the same with P) | `W - width - 22` | same | same | 0.83 |
| `draw_clock_menu_items` `0x00232170` | menu item `n` | `430 - width / 2` | `H/2 - 14 + 16 n` | chosen 30, 110, 156 (`D_002B2540`); other 44, 44, 44 (`D_002B2550`) | 1 |
| `draw_button_panel` `0x00226770` | hint of slot 0..2 | slot's x for the language + 28 | 201 (183 when item 0 is 2) | 96, 96, 96 (`D_002B2460`) | 0.8 (`D_0036FB98`) |
| `draw_button_panel` | hint of slot 3 | `W - (width + 24)` | same | same | 0.8 |
| list of System Configuration `0x00231388` | title | `430 - width / 2` | 88 | 110, 110, 0 (`D_002B2570`) | 1 |
| `func_002311E8` | selected entry | `c - width / 2`, `c` = 430, or less by what `430 + width/2 + arrows + 16` exceeds `W - 24` | 112 | 30, 110, 156 | 1 |

Slots' x per language (`D_002B2470`, four per language; English is row 1): 24, 213, 335, 441.
The button picture of a slot is at the slot's x (slot 3: `W - (width + 24) - 28`), one line
above the text: `DrawIcon` (`0x00226508`) draws picture `D_002B24F0[slot]` = 2, 4, 5, 3 as a
sprite 25 wide and 12 high from texture 9 (`0x2EC0`), 32 x 32 texels each
(`D_002B22A0`: 0,0 / 32,0 / 0,32 / 32,32); pictures 0 and 1 are 28 wide from texture 8.

*Verified:* 312 strings in five captures (position, colour and size equal), and 157
button pictures (corners, texture corners and alpha equal). Not recomputed: 9 arrows, the
fields of the clock's value (0x2272C8.. 0x2273CC), the selected entry while it is edited
(0x2312D0), and the version page's lines (0x22A5C0.. 0x22A74C).

**Alpha** is not in the table: it is the product of the transition ramps and belongs to the
transitions (`func_00230008` for date and time: 128 on the clock and in System Configuration, 0
in the main menu, where the text is sent and invisible; `func_00231E78` for the menu items;
`func_00230E10` for the list). Measured values are in the captures; the ramps were not
recomputed here.

Measured, with the rule read and not recomputed:

- **The value under the selected entry** (y 130). A plain value (`"4:3"`) is centred on 430.
  The clock's value is drawn field by field by `clock_str_related` (`0x002270A8`): the whole
  line's width is that of `"0000/00/00  00:00:00"`, it starts at `430 - width / 2`, and each
  field is `\ap@0`, the digits, `\ap00`, then the separator (`/`, two blanks, `:`); the pen
  moves by `func_00213E90` after each piece. While a field is edited it is drawn in the chosen
  colour and the others in 44, 44, 44.
- **The arrows** `\ao018` at the right of the selected entry: x = centre + (widest entry) / 2 +
  16, y 112, 96, 96, 96, alpha `|(int)(sin(phase) × 128)|`, pulsing.
- **Strings come from a table per language** (`D_002AD220` points at it; id × 4):
  `get_lang_string` `0x002081B8`; ids 0x55 and 0x56 (Back, Enter) are swapped by the video
  mode. English: 0x55 Back, 0x56 Enter, 0x57 Options, 0x5E Display, 0x5F Version.

## 6. ROM 2.30 (*verified at the glyph level*)

Its own code, about a tenth of the size. Four pages are in GS memory from start-up, from the
ROM file `FNTIMAGE` (a directory of files expanded on load):

| Page | File | Size | Cells across | Where | Table of (left, width) |
|---|---|---|---|---|---|
| 0 | `FNTASCII` | 256 x 480 | 8 | `0x2F05` | pointer at `0x002800CC` (`0x0027E6B0`), 97 glyphs from `0x20` |
| 1 | `FNTEX000` | 512 x 760 | 16 | `0x3005` | `0x0027ECB0`, 304 |
| 2 | `FNTEX001` | 512 x 760 | 16 | `0x3405` | `0x0027F630`, 304 |
| 3 | `FNTEXOSD` | 512 x 80 | 16 | `0x3805` | `0x0027FFB0`, the marks |

Cells are 32 x 40; colour tables at `0x2F00..0x2F03`, all four the HDD OSD file's sixteen
colours. `extract_font.mjs --rom` writes `References/model/font-rom.json` and the pages as PNG.

The character function `0x0020ACA8(set, bound, index)` sends one sprite:

```
cell = index (minus 0x20 for set 0);  column = cell % across;  row = cell / across
x0 = pen.x + (2048 - W/2) × 16   [+ (int)(sx × (fixed - width) × times × 0.5 × 16) with a fixed width]
y0 = pen.y + (2048 - H/2) × 16 + (int)(sy × lead) + drop + lower
x1 = x0 + (int)(sx × width × times) × 16          y1 = y0 + height
U0 = (column × 32 + left) × 16 + 8                 U1 = (column × 32 + left + width) × 16 - 8
V0 = row × 40 × 16 + 8                             V1 = row × 40 × 16 + 0x278
PRIM 0x156 (sprite, textured, blended, UV); RGBAQ = the colour's four ints; UV, XYZ, UV, XYZ, z = 1
advance = (int)(sx × pitch) + (int)(sx × (fixed or width) × times)
```

Pen in sixteenths at `0x002803A8`, `0x002803AC`; `sx`, `sy` at `0x00300EC4`, `0x00300EC8`;
`height` at `0x00300ED0`; colour at `0x00300EA0`; fixed width `0x002800B0`, `lower`
`0x002800B8`, `times` `0x002800BC`. The page is bound (`TEX0_1`, `CLAMP_1 = 5`, `TEX1_1 = 0x61`)
once per string for set 0 and before every glyph of the other sets. A string opens with
`TEST_1 = 0x3000D` (depth test always, and pixels of alpha 0 dropped) and `ALPHA_1 =
0x80_00000044`: the same blend `(Cs - Cd) × As + Cd`, with a FIX of 0x80 that this blend does
not use. The string function `0x0020C6F8` reads Shift-JIS, not UTF-8, and its control function
`0x0020C380` takes the same escapes (`c`, `a`, `p`, `r`, `y`, `s`, `o`, tab, line break); it
moves the pen by `advance × 16` after each character.

*Verified:* 3 098 sprites, 522 page bindings and 810 openings in four captures, every byte
equal; the pen of 2 576 characters equal to the pen before plus the advance computed; the four
pages in GS memory equal to `FNTIMAGE` expanded (942 080 pixels) in every dump.

Not done on ROM 2.30: the string level (the control function is read, not modelled), the place
level, and the pages' load at start-up (GS memory holds them equal to the file; the upload was
not traced).

## 7. Where the builds differ (*measured on both*)

| | HDD OSD 1.10U | ROM 2.30 |
|---|---|---|
| Font code | `libpfont`, file `FNTOSD`, glyphs by Unicode | own code, `FNTIMAGE`, glyphs by page and index, Shift-JIS |
| Glyphs in GS memory | a cache of 72 cells of 40 x 44 at `0x2F04`, filled as characters are first drawn | four whole pages at `0x2F05`, `0x3005`, `0x3405`, `0x3805` |
| A glyph | fan of 12 vertices, `ST`, the ink's box plus a pixel | sprite, `UV`, the cell from `left` to `left + width` |
| Width of a glyph | the pen moves by `advance × x scale` | the pen moves by `(int)(sx × width) + (int)(sx × -3)`; the table's `width` is HDD's `advance` + 4 and its `left` HDD's `originX` - 2 for 94 of the 96 ASCII glyphs (not the blank, 13 against 6, nor `~`): one pixel more per glyph at size 1 |
| Blend | `(Cs - Cd) × As + Cd`; `TEST_1 0x30000` | the same blend; `TEST_1 0x3000D`: pixels of alpha 0 are dropped as well |
| Sampling | `TEX1 0x60`, region clamp to the glyph's cell | `TEX1 0x61` (the same filter, level of detail fixed), clamp to the page |
| Hours | `%2d` in a fixed width | the same |
| Pictures | the same 4-bit pictures and colour table: 95 of the 96 ASCII glyphs equal pixel for pixel; `~` differs in 209 pixels | |

## 8. Not verified, plainly

- Alpha of every string (the ramps), and the animated positions while a list moves or opens:
  measured in the captures, rule read where section 5 says so.
- The Clock Adjustment page's fields and the version page as places (their glyphs and strings
  pass like the rest).
- Decorations, clip, line break, escapes `y`, `s`, `a` in a drawn string; blocks 1 to 5 of the
  font (kana, kanji, the wide mark): the model takes only 4-bit blocks and was run on block 0.
- PAL: the y positions scaled by `0.5405 / 0.47`, the TV ratio 1.15; nothing was run in PAL.
- ROM 2.30 beyond the glyph level.
- Languages other than English.

## 9. Files

- `References/scripts/verify_text.mjs` (`CLOCK_BUILD=hdd|rom`, exports `PROBES`; reads
  `References/dumps/hddosd-host/FNTOSD` or the BIOS file for the pictures, and the capture's
  `.gs` beside the trace for the GS memory check).
- `References/scripts/extract_font.mjs` (HDD OSD's file; `--rom` for the ROM's pages).
- `References/model/font-osd.json`, `References/model/font-rom.json`.
- `References/textures/font-osd-block*.png`, `font-rom-*.png` (git-ignored).

## Notes for Watson

- **`watson_kill` from a server that launched nothing ends instance 0's emulator.** With
  several instances, a session whose `watson_launch` failed ("all 5 emulator instances are in
  use") and that then calls `watson_kill` kills whoever holds instance 0: the server's instance
  number is still its initial 0. Three of this work's sessions did that before the capture
  script stopped calling kill after a failed launch; other workers' sessions died with
  `ECONNRESET` at the same time.
- A probe takes at most eight ranges; the string probe of this script uses all eight.
- Under five interpreters at once `watson_pause` right after a launch from a state sometimes
  fails ("the CPU thread did not run pause in time"); a few seconds' wait before the pause and a
  retry got every capture.
