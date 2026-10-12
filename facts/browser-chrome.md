# The Browser page chrome

Builds: **HDD OSD 1.10U** (canon) and **ROM 2.30**.
*Verified* = recomputed by `References/scripts/verify_browser_chrome.mjs` (model
`References/model/browser_chrome.mjs`) and equal write for write, in order, frame by frame.
*Measured* = seen in a capture, not recomputed. *Read* = disassembly (address range given).
Run: `CLOCK_BUILD=hdd|rom node verify_browser_chrome.mjs <trace.jsonl>` from `References/scripts`.

This page is what the Browser module's frame body sends to the GS apart from the card row (the
3D memory-card pass, excluded, see "The card row"). It covers: draw environment, texture
environment, clear, gradient, tile layers, text packets, dialog, letter-box bands, button guide,
fade rectangle.

| Capture | Build | Frames | What it shows | Page state | Verdict |
|---|---|---|---|---|---|
| `hddosd-110U-trans-return` | HDD OSD | 91 | the 90-frame leave fade (state 3) after Circle | declared | FOUND 91 frames, 31157 packets (181509 writes) |
| `rom-0230A-trans-return` | ROM 2.30 | 91 | the same | declared | FOUND 91 frames, 31157 packets (181509 writes) |
| `hddosd-110U-browser-chrome-root` | HDD OSD | 59 | the entry fade-in (state 2, counter 90 down to 32), the page-in, the error dialog opening (counter 1 to 30), guide slot 1 rising 0 to 24 | probed (exact capture) | FOUND 59 frames, 20270 packets (118313 writes) |

Results: all three give FOUND with the counts above. The verifier perturbs the fade counters by
one and must then report mismatches (440 HDD, 435 ROM, 59 root capture), and corrupts text runs
and must refuse them; both controls hold.

## 1. Functions

The same code in both builds, differing in data addresses. The ROM twin is placed by
`find_in_rom.mjs` (the head score is given, words compared with `lui`/gp offsets normalised) or,
where the table says "stack" or "callee order", by the call structure of the capture's stack
entries (*measured*). Every address in this section is in the column of its build.

| Role | HDD OSD 1.10U | ROM 2.30 | Placement |
|---|---|---|---|
| Browser thread proc | `0x0024F008` | `0x00248448` | stack |
| frame body (`module_browser_24EB90`) | `0x0024EB90` | `0x00247FD8` | 16 of 16 |
| master draw | `0x00253860` | `0x0024D500` | callee order |
| draw env via `0x0024C870`, writer | `0x0024C7D8` | `0x002461B8` | 11 of 16 |
| env via `0x0024C870` | `0x0024C870` | `0x00246250` | 15 of 16 |
| texture environment (index 3) | `0x0024C408` | `0x00245DE8` | 15 of 16 |
| clear | `0x0024C928` | `0x00246308` | 13 of 16 |
| blend and test setter (FIX from table) | `0x0024C200` | `0x00245BF0` | 15 of 16 |
| blend and test setter (FIX = a2) | `0x0024C2F0` | `0x00245BF0` (one function) | 15 of 16 |
| texture setter | `0x0024C510` | `0x00245EF0` | 14 of 16 |
| background | `0x00248A90` | `0x00242C98` | 16 of 16 |
| variant switch | `0x002488C0` | `0x00242AC8` | 15 of 16 |
| default gradient | `0x00248608` | `0x002428D0` | stack |
| tile layer | `0x00248910` | `0x00242B18` | 16 of 16 |
| letter-box bands | `0x0024D0C8` | `0x00246A80` | 16 of 16 |
| button guide | `0x002524D0` | `0x0024BFB0` | stack |
| guide pad picture | `0x00252398` | `0x0024BE78` | 16 of 16 |
| title left | `0x00250DA0` (entry `0x00250DAC`) | `0x0024A1C8` | stack |
| item title | `0x00257370` via `0x0024D740` | `0x002509A0` via `0x00247270` | stack |
| fade overlay | `0x0024D0A0` -> `0x0024CEB0` | `0x00246A58` -> `0x00246860` | 15 of 16; 4 of 16 (see below) |
| fade starts (in / out) | `0x0024CE60` / `0x0024CE88` | `0x00246810` / `0x00246838` | 12, 11 of 16 |
| box | `0x0024F6E8` | `0x00248B18` | 16 of 16 |
| sprite emit | `0x0024F180`, `0x0024F110`, `0x0024F208`, `0x0024F4F0`, `0x0024F890` | `0x002485A8`, `0x00248538`, `0x00248638`, `0x00248920`, `0x00248CC0` | 13, 15, 16, 16, 16 |
| error dialog | `0x0025BD18` | none (ROM 2.30 has no HDD pages) | - |
| text chain | `0x00213BA8`, `0x00214490` | `0x0020ACA8`, `0x0020A938` | font code differs |
| guide ramp `251DA0` / enable / disable | `0x00251DA0` / `0x00251C10` / `0x00251CA8` | `0x0020393C` (4 of 16, unconfirmed) / `0x0024B6C8` / `0x0024B798` | |
| card row root (excluded) | `0x002527A8`, back at `0x002538F0` | `0x0024C238`, back at `0x0024D58C` | root 16 of 16 |

Placement of the ROM fade overlay: the ROM state read at its head is `lbu` where the HDD OSD reads
`lw`, so the head matches 4 of 16 at `0x00246860` (`find_in_rom.mjs` scores 7 of 16 one word later,
at `0x00246864`, a shifted match); `0x00246860` is the target of the `j` at `0x00246A58` (*read*, ROM
dump).

HDD OSD functions of the master draw that put nothing on the GS: `0x002540D8` (steps animation
words), `0x00254680`, `0x00253B58`, `0x0024D378`, `0x0024C048`. `0x0024C2F0` is the twin of
`0x0024C200`, not a rectangle drawer. `0x0024C408..0x0024C7D8` are library environment writers.
`0x0025BD18`, `0x00253040` and `0x002531F8` emit packets when they run; they do not run in the
leave capture (*read* `0x00253860`: each runs only under its own flag, the dialog only when
`D_003708F0 != 0`).

Order in the master draw `0x00253860` (*read*, `core/align_054860.s`, HDD OSD):

1. the input handler of the view mode `D_003706F8` (1: `0x00254840`, 2: `0x00242228`, 3:
   `browser_cdplayer_related3`), only when `D_003706A8`, the DVD error `D_00370778`,
   `D_00370780` and `D_003708F0` are all 0;
2. `0x002540D8`, `0x00254680`, background `0x00248A90`, card row `0x002527A8`;
3. view mode 2: `0x00242F38`; view mode 3: `nullsub_10`;
4. `browser_cdplayer_player` (`0x00250DA0`, which draws the left title among other things);
5. item title `0x00257370`, unless `D_003706D0 == 2`;
6. `0x00253040` if `D_00370778`; the dialog `0x0025BD18` if `D_003708F0`; `0x002531F8` if
   `D_00370780`;
7. bands `0x0024D0C8`, button guide `0x002524D0`, `browser_device_grid_menu`,
   `browser_disc_menu`, then a tail jump to `0x00253488` (no packet).

The frame body `0x0024EB90` (*read*) calls `0x0024C048`, `0x0024C870(0, 3, 1)` (which calls
`0x0024C7D8` and tail-jumps `0x0024C408(3)`), `0x0024C928`, `0x0024D378`, `0x00253B58`, the master
draw, `0x0024C7D8(*0x1F0CA4)` and tail-jumps the fade `0x0024D0A0`.

## 2. The draw order of one frame (verified)

`chromeFrame` returns, in this order (the packets of the card row sit between the tile layers and
the titles and are excluded):

1. **Head**: three draw-environment packets (the core's flip and `0x0024C870`). In the first
   frames after the module starts, the core also clears each display buffer once, black, in the
   environment's packet: the clear form has the extra writes TEST_1 `0x30000`, PRIM 6, RGBAQ 0,
   a sprite over the screen and TEST_1 `0x50000`. The root capture has 3 such heads; the
   verifier accepts 3 plain environments, or at least 2 environments of which some carry the clear.
2. Texture environment. 3. Clear. 4. Gradient. 5. Texture setup of sheet 7 and the 8 tile layers.
6. (card row, excluded). 7. Titles. 8. Dialog, when `D_003708F0 != 0`. 9. Bands. 10. Button
guide. 11. Draw environment again (`24C7D8`). 12. Fade rectangle.

### Draw environment (`0x0024C7D8`)

| Register | Value |
|---|---|
| FRAME_1 | `fbp | (width / 64) << 16`: `0xA0000` HDD OSD, `0xA0046` ROM 2.30 (read from the first packet of the frame) |
| ZBUF_1 | `0x8C` |
| XYOFFSET_1 | x: `origin(width)`, y: `origin(height) + field` (field 0 even, 8 odd, raw sixteenths) |
| SCISSOR_1 | `(0, width-1, 0, height-1)` |
| PRMODECONT 1, COLCLAMP 1, DTHE 0, TEST_1 `0x50000` | constants |

The origin formula: `origin(size) = trunc((0x1000 - size) / 2) << 4`. For 640 x 224 it gives
`0x6C00` and `0x7900`. Width and height are the screen record (`0x001F0CB4`, `0x001F0CB8`), 640
and 224 in the probes; the verifier also checks the environment packet against the record.

### Texture environment (`0x0024C408(3)`)

NOP, TEX1_1 `0x61`, TEX0_1 = `3 * 2240 | (width/64) << 14 | 10 << 26 | 8 << 30 | 1 << 34` (tbp
`0x1A40`, 1024 x 256, TCC 1), CLAMP_1 5. No later draw uses it. The NTSC tbp is the one checked;
PAL is Open.

### Clear (`0x0024C928`)

TEST_1 `0x30000`, PRIM 6, RGBAQ `0x3F80000080000000`, a sprite from `(0x7FE - width/2,
0x800 - height/2)` over width x height (in sixteenths), z 0, TEST_1 `0x30000`.

### Gradient (`0x00248608`)

PRIM `0x10C` (triangle strip, gouraud, FST), z 4, corners (0,0), (width,0), (0,height),
(width,height) with colour words R,G,B,A = `AC,AC,AC,0`, `52,52,48,0`, `7A,7A,7A,0`, `2A,2A,20,0` (the
immediates `0x00248608` stores on the stack, alpha word 0, *read*). The `0x80` is the stack argument
that `0x00248608` passes to `0x0024F890` (*read*, HDD OSD); the vertices carry alpha `0x80`
(*verified*, `verify_browser_chrome.mjs`, three captures). Variant 0 of the background
(`D_003705D4`).

### Tile layers (`0x00248A90` -> `0x00248910`)

Drawn only while the fade counter `c` is not 0 (`c = 0`: nothing, not even the texture packet).
Texture setup of sheet 7, then layers k = 0..7:

```
n   = (c >> 2) + 4                       additive layers
k < n:  blend mode 6   (A0 B2 C2 D1, FIX 0x80:  Cs*FIX + Cd)
else:   blend mode 7   (A2 B0 C2 D1, FIX 0x80:  Cd - Cs*FIX)
offset = T[k] + 8      T = {0, 3, 9, 14, 1, 7, 12, 15}     (table HDD 0x00366148, ROM 0x0029BCD0)
```

Each layer is the blend packet (`0x0024C200(mode, 1)`) and 40 sprites, rows 0..3, columns 0..9:
corners `(col << 10) + ox + offset`, `(row << 10) + oy + offset` to the next cell, UV
(0,0)-(`0x3F0`,`0x3F0`), RGBA `0x80808080`, z 5, PRIM `0x156`. `ox, oy = origin(width),
origin(height)`. *Read* in the code: `n` is capped at 8 (no effect, only k < 8 exists) and `c < 0`
adds 3 before the shift; a negative counter is not modelled.

*Verified* on both builds: 28 800 sprites of the leave fade equal the formula
(`verify_browser_chrome.mjs` on `*-trans-return`; the additive-layer count equals `n` in all 91
frames); on the root capture the fade-in counters 90 down to 32 (all layers additive, `n >= 8`).

### Blend and test setter (`0x0024C200(m, z)`, `0x0024C2F0(m, z, fix)`)

One packet: TEST_1 = `0x10000 | z << 17` (z = 1: ALWAYS), ALPHA_1 = `A | B << 2 | C << 4 | D << 6 |
FIX << 32` from the mode table (HDD `0x002BCFC0`, ROM `0x002AD500`; `0x30` bytes per mode, a
doubleword per A, B, C, D, FIX; `24C200`: FIX from the table, `24C2F0`: `a2`), CLAMP_1 5. The
verifier reads the table from the build's own image (the ELF for HDD OSD, the EE memory dump of the ROM
`dumps/rom-0230A-clock-ee-00100000.bin` for ROM 2.30). Table (*measured*, ELF):

| Mode | A, B, C, D | FIX |
|---|---|---|
| 0 | 0,2,0,1 | 0x80 |
| 1 | 0,1,0,1 | 0x80 |
| 2 | 2,0,0,1 | 0x80 |
| 3 | 0,1,2,1 | 0x40 |
| 4 | 0,2,2,1 | 0 |
| 5 | 0,2,2,1 | 0x20 |
| 6 | 0,2,2,1 | 0x80 |
| 7 | 2,0,2,1 | 0x80 |

Mode 1 is the common alpha blend (ALPHA_1 `0x8000000044`).

### Texture setup (`0x0024C510(i)`)

`TEX0_1 = tbp | tbw << 14 | psm << 20 | tw << 26 | th << 30 | TCC << 34 | cbp << 37` with CPSM 2
(bit 52), CSM 1 (bit 55) and CLD 1 (bit 61) added, CLAMP_1 5, TEX1_1 `1` for index 7 and `0x61`
for the others. The sheet entry (table `0x002BD910`, `0x1C` bytes: tbp, blocks, psm, tbw, tw, th,
cbp) comes from the probe in an exact capture; a trace capture uses the allocation chain of
section 3. A sheet with PSM 1 is not modelled. Sheets 3 and 7 read: tbw 1, tw 6, th 6, CT32, cbp
`0x3E80`.

### Bands (`0x0024D0C8`)

Blend mode 1 (z test 1), then two sprites PRIM `0x106` (no blend), RGBAQ `0x80000000`, z `0xFFFFE`:
`(0,0)-(width, 28)` and `(0, height-28)-(width, height)`, height 28 (`0x1C`) in lines.
*Verified* by `verify_browser_chrome.mjs` on all three captures (28 lines). The aspect word
`D_00370668` = 0, the PAL flag `D_003706B0` = 0 and the screen 640 x 224 are probed only on the
HDD OSD root capture; the leave captures of both builds do not probe them. *Read*: skipped when
the aspect word is 1; 0x20 lines when the PAL flag is set. Neither is exercised (Open).

### Fade rectangle (`0x0024CEB0`, started by `0x0024CE60(n)` in, `0x0024CE88(n)` out)

State `s` (0 idle, 1 hold, 2 in, 3 out), counter `c`, length `L`, colour `k`.

```
s = 1:  alpha = 0x80
s = 2:  alpha = trunc(c * 128 / L)
s = 3:  alpha = 0x80 - trunc(c * 128 / L)
```

Packet: blend mode 1, PRIM `0x146`, RGBAQ = `alpha << 24 | k * 0x010101`, XYZ2 (0,0) z `0xFFFFF`
and (width, height) z `0xFFFFD`. After the draw `c` falls by one when non-zero; at `c = 0` state 2
becomes 0 with no draw (`0x0024D07C`), state 3 sets `c = -1`, `s = 1` (*read*). `0x0024D0A0` calls
it only when `s != 0`. Starts: `0x0024CE60(n)` sets `s = 2`, `c = L = n` (n = 0x5A NTSC, 0x4B PAL,
*read*); `0x0024CE88(n)` sets `s = 3`. *Verified*: leave fade, `alpha(f) = 0x80 - trunc((90 - f) *
128 / 90)` in 91 of 91 frames on both builds, with the fade inputs declared by the verifier
(Open); entry fade-in, `trunc(c * 128 / 90)` for c = 90..32 on the HDD OSD root capture (59
frames, inputs probed).

### Titles

Top left (HDD OSD `0x00250DA0`, `browser_cdplayer_player`; the master draw calls it at
`0x00253920`, and it draws the left title among other things). Colour `0x606060` (Q = 1.0), alpha
from the page fade counter `c` (`D_0037072C`, 0 to `0x1A` NTSC) by the rule below. The text depends
on the view mode `D_003706F8` (*read*, `0x00250F90..0x00251188`):

- modes 1 and 2 (mode 2 under a condition on `D_00370730`): the main path copies the record
  string at `0x002BD420 + D_00370728 * 0x1C0 + 0x12C` through `0x002433C8` and `0x0024D630`;
- mode 3: English id `0x87` through `GetOSDString`;
- the same function also draws ids `0x2D`, `0x108` and `0xAD` by view mode and `D_003706D0`
  (not examined).

The verifier does not model the record string: it checks the packet count of a three-glyph string
(`osdString(lang, 6)`, "PS2") and the colour and alpha, so "PS2" is a glyph-count match, not the
read text.

```
alpha = trunc(((c - 0xA) * 0x80 - (c - 0xA)) / (0x1A - 0xA))     c >= 0xB
alpha = 0                                                       c <  0xB
```

(*read*, `0x00250E20..0x00250E70`.) At `c = 0x1A` it gives `0x7F`, *verified* on the root capture
(probed counter 26 in all 59 frames) and on the leave captures (declared 0x1A). The page fade steps
in `0x00253488` by `0x0024DFA8(c + D_00370734, 0, max)`. PAL (`c - 8`, `/(0x15 - 8)`, from `c >= 9`)
is *read*, not exercised.

Top right (HDD OSD `0x00257370` via `0x0024D740`, called at `0x00253938` unless `D_003706D0 == 2`;
*read*): it returns without drawing when `D_00370761 != 0`, when the selected record's type
(`+0xB0`) is `0x13`, or when `+0x90 & 4 == 0`. The name is the record string at `+0xBC` (copied
with `strncpy`, 0x30 bytes), followed by a second string from `+0xBC + (+0x12C)` when `+0x128 == 2`;
types `0x11` and `0x12` go through `0x0024D7A8` instead. Colour `(0x6E, 0x6E, 0)` (RGBAQ colour
`0x006E6E`). The alpha is chosen by view mode and counters; the branch for view mode other than 2
with `D_00370728 == 0` and no page ramp is `(record + 0xAC) * 8` (`0x80` at 16); the others are not
modelled.

The verifier uses the string id `0x1A1` ("HDD") only for the glyph count of this slot. On the
declared leave captures it requires alpha `0x80`; on the root capture it accepts one uniform colour
with Q = 1.0 and alpha up to `0x80` and does not recompute the alpha (a mutant of that bound
survives, section 6). A second, empty string follows. Item names for other devices
(`0x00253D38`, *read*): id 6 "PS2"; id `0x1A1` "HDD"; memory cards ids `0x89`, `0x8A`, `0x88` with
digit strings; disc ids `0x11..0x15`. The ROM capture shows "Memory Card (PS2)/1" in this slot; the
ROM function `0x0023C5E8` is unconfirmed (4 of 16).

### Text packet shape (verified, shape only)

What `verify_browser_chrome.mjs` checks of a string of `m` characters (spaces included) known from
the build's language table: the run is `1 + (m > 0 ? 1 + m : 0)` packets, and

1. the head packet is TEST_1 `0x30000` and ALPHA_1 `0x44`;
2. when `m > 0`, the next packet is TEX1_1 `0x60` and TEX0_1 whose low 14 bits are the font tbp
   `0x2A40` (`FONT_TBP`, derived: the allocation chain of section 3 puts the font cache after the
   eight sheets);
3. each following glyph packet is CLAMP_1 then PRIM `0x5D` (fan); a space has its own packet like
   any glyph;
4. every vertex RGBAQ is `(0x3F800000 << 32) | colour | alpha << 24` (Q = 1.0), by the rule of the
   item.

It does not check the font size, the glyph content or the glyph coordinates. A glyph the font
cache loads in the middle of a string (a BITBLTBUF packet) is skipped as cache state (29 such in
the root capture). On ROM 2.30 the text is not looked up (`text: null`): only the vertex colours
are checked, not the shape. The font cache identity (`0x2A40` here; `text.md` places the HDD OSD
cache at `0x2F04` and the ROM glyph pages at `0x2F05..0x3805`) is Open.

### Button guide (`0x002524D0`, picture `0x00252398`)

Slots `s4` = 0..3 whose counter `D_004DA340[s4]` is non-zero, in order; per slot a label, then
the picture.

```
picture index s2 = s4, except with vidmode != 0:  s4 = 1 -> 2,  s4 = 2 -> 1
alpha            = min(counter * 8, 0x80)
x (slots 0..2)   = table 0x002BD2E0[lang * 16 + s2 * 4]    HDD OSD (ROM 0x002AD860); English 0x18, 0xD5, 0x14F
x (slot 3)       = width - width(label) - 0x34          stored when the label is measured
y                = 0xC9 - 2 (HDD OSD), 0xC9 - 1 (ROM 2.30), + 0.5 for the top edge
```

Label (*read*, HDD OSD `0x002524D0..0x002526D8`), by `func_00264538()`:

- `func_00264538() == 0`: slots 0..2 use `GetOSDString(0x54 + s2)`. Slot 3 (`s2 == 3`) uses, by the
  device `D_00370740` and the selected record's type at `+0xB0`: id `0x1B5` when the device is
  non-zero or the type is `0xD` or 0; id `0x54` when the type is 5 with
  `[0x002BB938 + 0x1098] == 0x6B` or 6 with it `== 0x6D`; otherwise the cached string
  `D_00370B9C`. Ids `0x57` and `0x1B5` both read "Options" in English.
- `func_00264538() != 0` (and `func_00264580() == 0`): ids `0x20C` (`s2 = 0`), `0x55` (1), `0x56`
  (2), `0x20B` (3).

Label text: colour `0x606060`, Q 1.0, the alpha above. Picture: texture setup of sheet 3
(TEX1_1 `0x61`), blend mode 1, sprite PRIM `0x156`, RGBAQ `0x808080 | alpha << 24`, z 8, 24 x 12
(`x1 = x0 + 24`, `y0 = y + 0.5`, `y1 = y + 12.5`), UV0 by picture index 0 (0.5, 0.5), 1 (0.5, 32.5), 2
(32.5, 32.5), 3 (32.5, 0.5), UV1 = UV0 `| 0x1F0` (+31 texels). English strings (ELF, *read*):
`0x54` "CD Playback", `0x55` "Back", `0x56` "Enter", `0x57` "Options".

Slot counters: `counter = clamp(counter + step, 0, 0x18)` per frame (`0x00251DA0`, clamp
`0x0024DFA8`; the step is doubled when `func_00264538() != 0`, `0x00251DE0..0x00251DE8`). `0x00251C10`
sets the slot's step word `D_004DA350[slot]` to 1 and the byte `D_00370770[slot]` to 1 (its second
argument is not read); `0x00251CA8` is the disable. The error dialog drives the guide: at
`n == 0x1D` (PAL `0x18`) with `D_00370BE4 == 1`, `0x0025C07C..0x0025C0C0` calls `0x00251CA8(2)`,
`0x00251CA8(3)` and `0x00251C10(1, 1)` (*read*, not modelled).

*Verified*: HDD OSD probes on the root capture (language word `0x003706AC` = 1, slot 1 counter
rising 0 to 24, vidmode word from `0x00252574`, slot 3 width from `0x002526E4`); declared on the
leave captures: HDD OSD slots 1 ("Back", picture 2 at x 335) and 3 ("Options", `x = 640 - 83 -
52 = 505`), ROM 2.30 slots 1 and 2 (pictures at x 213 and 335, y 200.5, "Enter" at x 213 uv (0,32),
"Back" at x 335 uv (32,32)). The vidmode is non-zero in the captures (the swap is seen); 1 and 2
are not told apart.

### Error dialog, kind 0 (`0x0025BD18`)

*Verified* on the HDD OSD root capture (counter 1..30, step +1, kind `D_00370BE8` = 0, no abort).

```
n = clamp(n + step, 0, 0x1E)          NTSC maximum 0x1E
panel   : 0x0024C2F0(3, 1, fix)       fix = trunc(n * 0x54 / 0x1E)    mode 3: (Cs - Cd) * FIX + Cd
box     : 0x0024F6E8(0, 0, W, H, black, alpha 0x80, z 4, abe 1)       PRIM 0x146, RGBAQ 0x80000000
lines   : ids 0x15C, 0x15D, 0x15E, 0x15F up to the first empty one, y = 16*i + 0x68 - 8*(count-1)
text    : colour 0x606060, Q 1.0, alpha trunc((n << 7) / 0x1E)
```

Kind 0 also sets `D_003708E8` to 1 (*read*). When the leave counter `D_003706A8`, the DVD error
`D_00370778` or the disc error `D_00370780` is set, it draws nothing, clears `D_003708F0` and sets
`D_00370BE4 = -1` (*read*, the abort path, not exercised); the model returns no packets in that
case and does not model the state writes. English text (ELF, *read*):
`0x15C` "There is an error in the content of the", `0x15D` "HDD. Insert the HDD Utility Disc and ",
`0x15E` "start the Install HDD Software utility.", `0x15F` empty. Kinds 1 to 4 and the close
(`n == 0x1E`, PAL `0x19`, and pad bit `0x40` of `D_003707A4` set `D_00370BE4 = -1` and call
`0x00251CF8`) are *read*, not modelled (Open).

## 3. Textures used

`browser_texture_indices` (`0x002BD160`) maps page indices 0..7 to resources 53..60 of
`osdsys_resource_info` (`0x002AD240`), the TEXIMAGE members (*read*, ELF). Each decodes to type word
4, 64 wide CT32 (TEXBCDPB 64 x 128), pixels at +0x14 (*measured*, decoded with the lab's
`decryptImage` and `expand`). `0x00257068(i)` allocates in order from `D_00370BD0` = `0x2800`: 64
blocks per 64 x 64 sheet, 128 for CDPB (*derived* from the sheet sizes, not read from the
allocator). The font cache follows at `0x2A40` (*derived* by this chain; the verifier matches it
in the text runs).

| Index | Member | tbp | Used by | Status |
|---|---|---|---|---|
| 0 | TEXBNAV1 | `0x2800` | flare `0x00250B00` (card row) | tbp *measured* in the flare; excluded from the verifier |
| 1 | TEXBNAV2 | `0x2840` | flare `0x00250B00` | derived (*read*), not drawn in the verified chrome |
| 2 | TEXBARRW | `0x2880` | no literal-index caller | derived, not drawn |
| 3 | TEXBBTTN | `0x28C0` | button guide pictures (`0x00252398`) | *verified*: tbp and tex words probed on the root capture; quadrants Cross (0,32), Circle (32,32), Triangle (32,0) *measured* against both PNGs; Square (0,0) not drawn |
| 4 | TEXBCPAR | `0x2900` | no literal-index caller | derived, not drawn |
| 5 | TEXBCDPB | `0x2940` | CD player `0x00247F00` | derived, not drawn |
| 6 | TEXBOVAL | `0x29C0` | no literal-index caller | derived, not drawn |
| 7 | TEXBICHI | `0x2A00` | the 8 background tile layers (`0x00248A90`) | *verified*: probed on the root capture; TEX0_1 `0x2097D00598006A00` |

Literal-index call sites of `0x0024C510` (*read*): 0 and 1 in `0x00250B00`, 3 in `0x00252398`, 5
in `0x00247F00`, 7 in `0x00248A90` and `0x00242F38` (HDD OSD addresses; `0x00242F38` is the view-mode 2 page), 8 in `0x0024C3D8` (the font
cache tbp is inferred, not read). A caller with a register index is not excluded for indices 2, 4
and 6.

## 4. The card row (excluded)

Everything under the root `0x002527A8` (ROM `0x0024C238`): per card `0x002599C8` (ROM
`0x00252E48`) -> flare sprites `0x00250B00` (ROM `0x00249F20`; position by `sceVu0ApplyMatrix`,
TEXBNAV1/NAV2) and mesh draws `0x00259240`/`0x00259770` -> `0x002567D0` (ROM `0x0022C0D8`,
unconfirmed 2 of 16), with the texture upload `0x0023A710`/`0x0023A7F8` (CT16 128 x 128 at tbp
`0x3A98`) and GIF path-1 triangle packets. The verifier cuts it by an explicit list: in a trace
capture the packets whose origin stack holds the root; in an exact capture the packets between
the probes at the root (`0x002527A8`, ROM `0x0024C238`) and at its return (`0x002538F0`, ROM
`0x0024D58C`). Excluded packets: 2730 (HDD OSD) and 2093 (ROM 2.30) over the 91 frames, 1768 over
the 59 root frames (HDD OSD); per frame 30 (HDD OSD) and 23 (ROM 2.30) in the leave capture
(*measured*). **Its content is not verified**; the draws, flare positions and colours wait until the
icon math is verified.

## 5. Build differences seen in the chrome

| | HDD OSD 1.10U | ROM 2.30 |
|---|---|---|
| FRAME_1 | `0xA0000` | `0xA0046` |
| guide picture y | 199.5 (`0xC9 - 2`) | 200.5 (`0xC9 - 1`) |
| guide slots in the leave capture | 1 ("Back") and 3 ("Options") | 1 ("Back") and 2 ("Enter"); no Options |
| text | glyph fans, TEX0 tbp `0x2A40`, shape *verified* | sprites, TEX0 tbp `0x2A40` and TEST_1 `0x3000D` seen in the capture, not verified; checked for colour only |
| title and guide labels | string from the build's language table, shape checked | not looked up, vertex colours checked |
| error dialog | `0x0025BD18` | none |

Everything else (clear, gradient, tile layers, bands, fade, picture packets) is the same raw words
on both builds.

## 6. Mutation

- `mutate.mjs verify_browser_chrome.mjs` (HDD OSD, 9 candidates): `--capture
  hddosd-110U-browser-chrome-root` kills 7 (survivors on lines 106 and 107, the declared titles);
  `--capture hddosd-110U-trans-return` kills 6 (survivors on lines 132 and 137, the probed-state
  title rule). Each survivor is a line the other capture kills, so the two captures together kill
  9 of 9.
- `mutate_model.mjs` over the verifier and model (668 mutants; counts not re-run for this page): HDD OSD 530 killed, ROM 2.30 312 killed; 118 survive in both. The survivors fall in
  the classes listed under "Open edges".

## 7. Open

- **Open edges that the mutants reach** (code that is read but whose inputs no capture varies):
  title page-in ramp for `c < 0x1A` (only 0x1A is seen: alpha `0x7F`); the slot 3 x rule (`width -
  width(label) - 0x34`) outside the one label measured; guide slot 0 and 2 on HDD OSD and
  vidmode 0 (the swap is seen, not the unswapped case); the dialog abort path (leave counter, DVD
  or disc error). Script that would settle each: `verify_browser_chrome.mjs` on an exact capture
  that varies the state.
- **Card row passes**: excluded, content not verified (section 4); waits until the icon math is
  verified.
- **PAL** on both builds: bands 0x20 lines, fade length 0x4B, page fade maximum 0x15, dialog
  maximum, text scaling by `D_0036FD98`/`FDA4`/`FDAC`, `0x0024F4F0` PAL remap, texture
  environment tbp `0x1E00`.
- **Aspect words** 1 (no bands) and 2 (guide baseline `0xB7`): read, not exercised; the guide
  baseline `0xC9` is the only one modelled.
- **Background variants 1 to 4** (`D_003705D4`; jump table `0x00366130`: `0x00248760`,
  `0x00248810`, `0x002486B8`, `0x00248560`): never reached; the value is 0 in every capture.
- **Languages**: language index 1 (English) in every capture; the guide x table and strings for
  the others are not checked.
- **ROM 2.30 exact capture**: none; the ROM page state is declared, the ROM variable addresses are
  gp-derived (gp `0x002CFEF0`; fade state byte gp-`0x733C`, aspect gp-`0x7338`, fade counter
  gp-`0x7334`, length gp-`0x732C`, PAL gp-`0x72E8`, variant gp-`0x73DC`) and unprobed. ROM
  functions unconfirmed by the heads: `0x0020393C` (guide ramp), `0x0023C5E8` (item name),
  `0x0022C0D8`; the guide function `0x0024BFB0` is placed by stack.
- **ROM title and guide text** checks are lenient: the strings are not looked up, only vertex colours
  and, for the guide, the 24-pixel picture width.
- **Dialog kinds 1 to 4 and the closing dialog** (negative step, `n` falling): not modelled
  (the model stops on them). Kind 0 text and counters are probed only on the opening.
- **Fade states 0 and 1** (idle, hold) and the end of the fade-in (state 2 at `c = 0`, no draw):
  not modelled.
- **Glyph geometry**: text is compared by shape (packet count, TEX words, PRIM, colour, alpha),
  not by glyph coordinates.
- **Declared inputs for `*-trans-return`**: the captures are traces without probes, so the leave
  fade (state 3, length 90, counter `90 - j`), the page fade 0x1A, language 1 and the guide slots
  are declared by the verifier, not read. Only the root capture probes them (HDD OSD).
- **Slot selection** in `0x00251DA0` (device `D_00370740`, view mode `D_003706F8`, item type at
  record +0xB0, `D_0037072C == 0x15/0x1A`) and the writers of `D_00370734`, `0x00251CA8` (step -1):
  read in part. Square (picture 0) and the "CD Playback" label are not drawn in any capture.
- **Font cache identity**: the verifier matches TEX0 tbp `0x2A40` in the HDD OSD text runs
  (derived by the allocation chain); `text.md` places the HDD OSD glyph cache at `0x2F04` and the
  ROM glyph pages at `0x2F05..0x3805`. Not reconciled. Script that would settle it:
  `verify_browser_chrome.mjs` plus a probe of the font library's cache setup
  (`_scePFontSetupTexCache`, `0x00290B10`) on an exact capture.
- **Left title text**: the record string path, view modes 1 to 3 and ids `0x87`, `0xAD`, `0x2D`,
  `0x108` are read, not verified; only the glyph count, colour and alpha are checked.
- **Top-right title**: the early returns, the alpha branches other than `(record + 0xAC) * 8` and
  the root-capture alpha (accepted up to `0x80`, not recomputed) are not verified.
- **Guide label variants**: slot 3 by device and record type, the `func_00264538() != 0` ids
  (`0x20B`, `0x20C`, `0x55`, `0x56`), the doubled step, and the dialog-to-guide coupling at
  `n == 0x1D` are read, not exercised.
- **Dialog abort state writes** (`D_003708F0` cleared, `D_00370BE4 = -1`) and kind 0's
  `D_003708E8`: read, not modelled.
- **Aspect and PAL probes**: bands and fade read the aspect word and the PAL flag only on the HDD
  OSD root capture; the leave captures do not probe them.
- **Registration**: `verify_browser_chrome.mjs` has no entry in `run_all.manifest.json` yet; the
  registration is pending.
