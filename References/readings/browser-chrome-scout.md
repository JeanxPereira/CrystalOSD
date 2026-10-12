# Browser page chrome (scout, 2026-10-08)

Labels: READ = instructions read in `D:\CodingProjects\CrystalOSD\asm\browser\` (HDD OSD 1.10U) or by `disasm_rom.py` (ROM 2.30). MEASURED = recomputed from a capture by a scratch script in `lab/scout/browser_chrome_*.mjs` (not registered verifiers). INFER = reasoning, not checked. Nothing here is a fact yet: no `facts/` page, no registered verifier. A grep of `facts/`, `References/readings/` and `run_all.manifest.json` for the chrome addresses finds nothing (only the sound capture `hddosd-110U-sound-menu-cross-browser`).

## Question

What does the Browser page chrome draw per frame (HDD OSD 1.10U; ROM 2.30 where cheap): which functions, GS packets, order and inputs; which TEXB* texture is used where; which draws are the 3D-card pass (to exclude); which dialog kind the existing captures show; what is missing for a verifier.

## Addresses

Build map by call structure of the two captures (stack entries of `Origin`, MEASURED) plus `find_in_rom.mjs` heads (16/16 = same code; run it from `D:\CodingProjects\CrystalClockVK`, it uses relative paths).

| Role | HDD OSD | ROM 2.30 | Same code |
|---|---|---|---|
| Browser thread proc (frame loop, fade sprite tail) | 0x24F008 | 0x248448 | structure same (stack) |
| per-frame body (`module_browser_24EB90`) | 0x24EB90 | 0x247FD8 | 16/16 |
| GS env 0x24C870 / C408 / C6D8 / C7D8 / C928 | same | 0x246250 / 245DE8 / 2460B8 / 2461B8 / 246308 | 15, 15, 15, 11, 13 of 16 |
| blend+test setter 0x24C200 (FIX from table) and 0x24C2F0 (FIX = a2) | both | 0x245BF0 (one function) | 15/16 |
| texture setter 0x24C510(index) | 0x24C510 | 0x245EF0 | 14/16 |
| master draw | 0x253860 | 0x24D500 | structure same (callee order, ROM jal list 0x24D534..0x24D5DC) |
| background 0x248A90 / variant switch 0x2488C0 / default gradient 0x248608 / tile layer 0x248910 | same | 0x242C98 / 0x242AC8 / 0x2428D0 / 0x242B18 | 16, 15, by stack, 16 |
| letter-box bands 0x24D0C8 | 0x24D0C8 | 0x246A80 | 16/16 |
| button guide 0x2524D0 / pad picture 0x252398 | same | 0x24BFB0 / 0x24BE78 | picture 16/16, guide by stack |
| title left 0x250DA0 (stack entry 0x250DAC) / item title 0x257370 via 0x24D740 | same | 0x24A1C8 / 0x2509A0 via 0x247270 | by stack |
| fade overlay 0x24D0A0 -> 0x24CEB0; starts 0x24CE60 (in), 0x24CE88 (out) | same | 0x246A58 -> 0x246860; 0x246810, 0x246838 | 15, 7, 12, 11 of 16 |
| box 0x24F6E8 | 0x24F6E8 | 0x248B18 | 16/16 |
| sprite emit 0x24F180 / 24F110 / 24F208 / 24F4F0 / 24F890 | same | 0x2485A8 / 248538 / 248638 / 248920 / 248CC0 | 13, 15, 16, 16, 16 |
| title string 0x253D38 (`browser_get_device_name_string`) | 0x253D38 | 0x23C5E8 | 4/16, unconfirmed |
| text chain 0x213BA8 / 0x214490 | same | 0x20ACA8 / 0x20A938 | font code differs |
| guide ramp 0x251DA0, enable 0x251C10, disable 0x251CA8 | same | 0x20393C (4/16), 0x24B6C8, 0x24B798 | 251DA0 unconfirmed |
| error dialog 0x25BD18 | 0x25BD18 | none read (ROM has no HDD pages, inventory 1.3) | - |
| card pass: root 0x2527A8, per card 0x2599C8, flare 0x250B00, T&L 0x2567D0 | same | 0x24C238, 0x252E48, 0x249F20, 0x22C0D8 (2/16, unconfirmed) | 16, 16, 14 |

Functions of the list that draw nothing: `0x2540D8`, `0x254680` (MEASURED 0 origins in all 92 Browser frames; READ: `2540D8` steps animation words with the `24DFA8` clamp and the `24DFC8` float wrap, words `D_003707CC/D0/D4/D8`, `D_003707B4 += D_0036FE70`; `254680` stores `D_003707EC = 0` and tail-calls the matrix stack `0x254578`). `0x2527A8` is the card row, not chrome. `0x24C2F0` is not a rect drawer: it is the twin of `0x24C200`. `0x24F6E8` is the box. `0x24C408..0x24C7D8` are libgs env writers (no geometry). `0x253B58`, `0x24D378`, `0x24C048` have 0 origins (no packet).

ROM gp = 0x002CFEF0 (`verify_text2.mjs:435`); HDD gp = 0x377970. ROM variables by `lw/lbu ..($gp)` in the same functions (READ): fade state byte gp-0x733C, aspect word gp-0x7338, fade counter gp-0x7334, fade length gp-0x732C, PAL flag gp-0x72E8, background variant gp-0x73DC (absolute = gp + offset). HDD: state 0x370660, colour 0x370670, counter 0x37066C, length 0x370674, aspect 0x370668, PAL 0x3706B0, variant 0x3705D4.

## What it computes


### Packet order of one captured frame (MEASURED; HDD `hddosd-110U-trans-return` idx 50 = frame 2058, ROM `rom-0230A-trans-return` idx 50 = frame 2357; same order on both builds)

Neither capture is the Browser at rest. Both start at the frame of the Circle that leaves the Browser and run the 90-frame fade-out: HDD frames 2008..2098 (idx 0..90), ROM 2307..2397. One vsync = 402 packets HDD (30 are the card pass), 408 ROM (23 card).

Chrome packets of one HDD frame, offsets from the frame's first packet (every raw write is in `lab/scout/browser_chrome_hdd_even_frame_chrome_packets.txt`; ROM in the `_rom_` file):

| Off | Function (stack) | Writes |
|---|---|---|
| +0..+2 | core 0x20BFD8/0x20C010, then 0x24C7D8 via 0x24C870 | draw env x3: FRAME_1 0xA0000, ZBUF_1 0x8C, XYOFFSET_1 (0x6C00, 0x7900 even / 0x7908 odd), SCISSOR_1 (0..639, 0..223), PRMODECONT 1, COLCLAMP 1, DTHE 0, TEST_1 0x50000 |
| +3 | 0x24C408(3) | TEX1_1 0x61, TEX0_1 0x628029A40 (tbp 0x1A40, tbw 10, CT32), CLAMP_1 5; no later draw uses it |
| +4 | 0x24C928 | clear: TEST_1 0x30000, PRIM 6, RGBAQ 0x3F80000080000000, sprite (-2,0)-(638,224) z 0, TEST_1 0x30000 |
| +5 | 0x248608 | PRIM 0x10C tristrip gouraud, z 4, (0,0) (640,0) (0,224) (640,224), colours R,G,B,A = AC,AC,AC,80 / 52,52,48,80 / 7A,7A,7A,80 / 2A,2A,20,80 |
| +6 | 0x24C510(7) from 0x248A90 | TEX0_1 0x2097D00598006A00 (tbp 0x2A00, 64x64 CT32, tcc 1, cbp 0x3E80), CLAMP 5, TEX1_1 1 |
| +7..+334 | 0x248910 x8 layers | per layer: 0x24C200 packet (TEST_1 0x30000, ALPHA_1 0x8000000068 or 0x8000000062, CLAMP 5) then 40 sprites |
| +335..+364 | card pass (exclude) | flares 0x250B00, meshes 0x2567D0 |
| +365..+369 | 0x213BA8 from 0x250DAC | "PS2": ALPHA 0x44, TEX1_1 0x60 + TEX0_1 0x2007D0066541AA40 (font cache tbp 0x2A40, 512x512 T4), 3 glyph packets (PRIM 0x5D fans), RGBAQ 0x7F606060 |
| +370..+375 | 0x213BA8 via 0x24D740 from 0x257370 | "HDD": same, RGBAQ 0x80006E6E (yellow) |
| +376 | 0x24C200(1,1) from 0x24D0C8 | TEST_1 0x30000, ALPHA_1 0x8000000044, CLAMP 5 |
| +377 | 0x24D0C8 (tail jump to 0x24F180) | bands: 2 x (PRIM 0x106, RGBAQ 0x80000000), (0,0)-(640,28) and (0,196)-(640,224), z 0xFFFFE |
| +378..+398 | 0x2524D0 | per active slot: label glyph packets (RGBAQ 0x80606060), 0x24C510(3) (TEX0 0x2097D005980068C0, TEX1 0x61), 0x24C200(1,1), picture sprite PRIM 0x156 RGBAQ 0x80808080 |
| +399 | 0x24C7D8 | draw env again |
| +400, +401 | 0x24C200(1,1) from 0x24CEB4, then the fade sprite | PRIM 0x146, RGBAQ alpha shl 24, (0,0)-(640,224), z 0xFFFFF / 0xFFFFD |

ROM: same order and same raw words for clear, gradient, tile layers, bands, fade, guide picture packets. Differences MEASURED: FRAME_1 0xA0046 (HDD 0xA0000); picture y 200.5..212.5 (HDD 199.5..211.5); the text is drawn as PRIM sprites from another font cache (tbp 0x2A40, 256x512 T4, TEST_1 0x3000D), so the HDD text model does not apply; the guide has Enter (x 213, picture uv (0,32)) and Back (x 335, uv (32,32)), no Options.

### Per-draw rules

1. **Fade overlay** (`0x24CEB0`, READ; ROM 0x246860 same shape). State `s` (0 idle, 1 hold, 2 in, 3 out), counter `c`, length `L`, colour `k`. Alpha: s=1: 0x80; s=2: trunc(c*128/L); s=3: 0x80 - trunc(c*128/L). Then `c != 0`: `c = c-1`; `c == 0` and s=2: `s = 0`, no draw (0x24D07C); `c == 0` and s=3: `c = -1`, `s = 1`. Packet: `24C200(1,1)`, PRIM 0x146, RGBAQ = alpha << 24 | k*0x010101, XYZ2 (0,0, z 0xFFFFF) and (W,H, z 0xFFFFD). `0x24D0A0` calls it only when `s != 0`; it is the tail of `24EB90`. Starts: `24CE60(n)` s=2, c=L=n (thread start; n = 0x5A NTSC / 0x4B PAL, inventory 1.2); `24CE88(n)` s=3 (leave). MEASURED on both builds: alpha(f) = 0x80 - trunc((90-f)*128/90), f = 0..90, 91 of 91 frames (`browser_chrome_layers.mjs`, `_layers_rom.mjs`). Mutation length 91: 59 of 91 mismatches.
2. **Background** (`0x248A90`, READ). `2488C0(D_003705D4, 0)`: jump table 0x366130 = {248908, 2488F0, 2488F8, 2488E8, 248900}: variant 0 -> `0x248908` -> default gradient `0x248608`; variants 1, 2, 3, 4 -> 0x248760, 0x248810, 0x2486B8, 0x248560 (never reached in the captures). `D_003705D4` = 0 at init, 3 when the previous module is 5 (`2484B8`), recomputed by `248540` -> `2484D8(device, mode)`. Gradient colours as in the table above (immediates in 0x248608: 0xAC; 0x52, 0x48; 0x7A; 0x2A, 0x20). Then, only if the fade counter `D_0037066C != 0`: `24C510(7)`, and for layer k = 0..7 `248910(k, k < n)` with `n = ((c<0 ? c+3 : c) >> 2) + 4` capped at 8 (c = counter). `248910`: `24C200(6,1)` if the flag else `24C200(7,1)`; offset `T[k] + 8` (12.4 units) with `T = {0,3,9,14,1,7,12,15}` (0x366148); for row r = 0..3, column q = 0..9: sprite from (q << 10 + Ox + off, r << 10 + Oy + off) to ((q+1) << 10 + Ox + off, (r+1) << 10 + Oy + off), O = ((0x1000 - W)/2, (0x1000 - H)/2) << 4, UV (0,0)-(0x3F0,0x3F0), RGBA 0x80 each, z 5, PRIM 0x156 (via `24F208`: abe 1, tme 1, FST). Blend 6 = A0 B2 C2 D1 FIX 0x80 (Cs*FIX + Cd); 7 = A2 B0 C2 D1 FIX 0x80 (Cd - Cs*FIX). MEASURED on both builds: all 28 800 sprites of frames 0..89 equal this formula word for word (`browser_chrome_tiles.mjs`); additive-layer count equals `n` on 91 of 91 frames (mutation `+3`: 19 of 91 mismatches); the last frame (c = 0) draws no layer.
3. **Bands** (`0x24D0C8`, READ): skipped if `D_00370668 == 1`; else `24C200(1,1)`; two sprites PRIM 0x106 (abe 0), RGBAQ 0x80000000, z 0xFFFFE: (0,0)-(W,h) and (0,H-h)-(W,H), h = 0x1C (0x20 if `D_003706B0` PAL), W = `*0x1F0CB4` (640), H = `*0x1F0CB8` (224). MEASURED on both builds h = 28.
4. **Button guide** (`0x2524D0`, `0x252398`, READ). Slots `s4` = 0..3 with `D_004DA340[s4] != 0`: picture index `s2 = s4`, except for `s4` in {1,2}: if `get_vidmode_with_fallback() != 0` then `s2` = 2 for s4=1 and 1 for s4=2 (swap). `vidmode` = ROMVER region byte (READ 0x208238: J 0, A/H 1, E 2). Label `GetOSDString(0x54 + s2)`; `0x2081B8` swaps ids 0x55 and 0x56 when `vidmode != 0`. English table (ELF, READ): 0x54 "CD Playback", 0x55 "Back", 0x56 "Enter", 0x57 "Options". So for vidmode != 0 slot 1 shows "Back" with picture 2 and slot 2 "Enter" with picture 1. Slot 3 id by device/item (0x1B5 "Options", or 0x54 for disc 0x6B/0x6D); its x is stored at draw: `x[lang][3] = W - width(label) - 0x34`. x of slots 0..2 = `D_002BD2E0[lang*16 + s2*4]` (English 0x18, 0xD5, 0x14F). Baseline y = `D_00370BA0` = 0xB7 if `D_00370668 == 2` else 0xC9. Alpha `a = counter > 15 ? 0x80 : counter*8` (text colour via `2128C8(0, a)`, grey 0x60; picture RGBAQ 0x808080 with A = a). Text origin `24D810(x + 0x1C, y)`. Picture `252398`: `24C510(3)`, `24C200(1,1)`, then `24F4F0`: x0 = x, y0 = (y-2) + 0.5, x1 = x0 + 24, y1 = y0 + 12.5 (0xC8 raw), UV0 = (0.5,0.5) / (0.5,32.5) / (32.5,32.5) / (32.5,0.5) for picture 0 / 1 / 2 / 3, UV1 = UV0 | 0x1F0 (+31 texels). TEXBBTTN quadrants: Cross (0,32), Circle (32,32), Triangle (32,0) (MEASURED against both PNGs); picture 0 (0,0) = Square is INFER. MEASURED HDD: "Back" glyphs from x 363 (= 335 + 28), picture x 335, y 199.5, uv (32,32)-(63,63); "Options" picture x 505 (= 640 - 83 - 52), uv (32,0)-(63,31); constant over 91 frames. ROM: pictures at x 213 and 335, y 200.5. Slot counter (`251DA0`, READ): `D_004DA340[i] = clamp(D_004DA340[i] + D_004DA350[i], 0, 0x18)` each frame (`24DFA8(v, lo, hi)` is the clamp); `251C10(slot,1)` sets step +1, `251CA8` (not read) sets -1. Which slot is on is decided in `251DA0` (device `D_00370740`, view mode `D_003706F8`, item type at offset 0xB0 of the item record, `D_0037072C == 0x15/0x1A`, ...): read in part, not reduced.
5. **Titles** (READ). Top left `0x250DA0`: alpha `((c-0xA)*0x80 - (c-0xA)) / (0x1A - 0xA)` with `c = D_0037072C` (page fade counter 0..0x1A NTSC / 0..0x15 PAL, stepped in `253488` by `24DFA8(c + D_00370734, 0, max)`), 0 for `c < 0xB` (PAL: `c-8`, `/(0x15-8)`, from `c >= 9`); MEASURED 0x7F at c = 0x1A (16*127/16); colour 0x606060. Top right `0x257370`: the selected item's name (record +0xBC, strncpy 0x30) through `24D740`, alpha `(record +0xAC) * 8` (0x80 at 16; MEASURED 0x80), colour (0x6E,0x6E,0). Device-row item name (`browser_get_device_name_string 0x253D38`, READ): device 0 id 6 "PS2"; 1 id 0x1A1 "HDD"; 2..9 memory cards: strcpy id 0x89 "Memory Card/" (types 1, 5), 0x8A "Memory Card (PS2)/" (types 2, 6, 7), 0x88 "PocketStation/" (3), then strcat id 7/8 ("1"/"2", types below 5) or 9..0x10 ("1-A".."2-D", types 5 and up); 0xA disc: ids 0x11..0x15 by type 0x6A..0x73 (table 0x366460); 0xC and up: name struct at 0x2FED44 + D_00310928[dev-0xC] * 0x11C. The ROM capture shows "Memory Card (PS2)/1" in that slot. Glyph fans, metrics and cache are the existing `verify_text_frame.mjs` model (HDD only); the chrome verifier owns which string, where, which colour.
6. **Texture table** (READ + MEASURED). `browser_texture_indices` 0x2BD160 = resources 53..60 (`osdsys_resource_info` 0x2AD240 names, ELF, READ): TEXBNAV1, TEXBNAV2, TEXBARRW, TEXBBTTN, TEXBCPAR, TEXBCDPB, TEXBOVAL, TEXBICHI. Members decoded with the lab's `decryptImage` + `expand` (MEASURED, `browser_chrome_tex.mjs`): type word 4, 64 wide CT32 (TEXBCDPB 64x128), pixels at +0x14 (`256B40` case 0x256B9C, READ). `257068(i)` (i = 0..7) allocates in order from `D_00370BD0` = 0x2800 (64 blocks per 64x64, 128 for CDPB). TBPs: 0 NAV1 0x2800, 1 NAV2 0x2840, 2 ARRW 0x2880, 3 BTTN 0x28C0, 4 CPAR 0x2900, 5 CDPB 0x2940, 6 OVAL 0x29C0, 7 ICHI 0x2A00; the font cache follows at 0x2A40. MEASURED TBPs in the captures: 0x2800 (flare), 0x28C0 (guide pictures), 0x2A00 (background layers), 0x2A40 (font); the others are derived only. `24C510(i)` builds TEX0 = TBP(entry+0) | TBW(entry+0xC) << 14 | PSM(entry+8, 1 becomes 0) << 20 | TW(entry+0x10) << 26 | TH(entry+0x14) << 30 | TCC << 34 | CBP(entry+0x18) << 37 | CPSM 2 | CSM/CLD constants; TEX1_1 = 1 for index 7, else 0x61. `24C510` call sites (READ, literal index): 0 and 1 in `0x250B00` (flare; card pass), 3 in `0x252398` (guide), 5 in `browser_cdplayer_related2` 0x247F00 (CD player), 7 in `0x248A90` and `0x242F38` (operations page), 8 in `0x24C3D8` (beyond the eight TEXB; INFER the font cache). TEXBNAV2 only via 250B00; ARRW, CPAR, OVAL have no call with a literal index (a register-index caller is not excluded): not drawn in the captures, their use is INFER from names.
7. **Blend/test setters** (READ): `24C200(m, z)` and `24C2F0(m, z, fix)` write one packet: TEST_1 = 0x10000 | z << 17 (z=1 ALWAYS), ALPHA_1 from `D_002BCFC0[m]` = A | B << 2 | C << 4 | D << 6 | FIX << 32 (`24C200`: FIX from the table; `24C2F0`: `a2`), CLAMP_1 5. Table (MEASURED from the ELF, 0x30 bytes per mode: A,B,C,D,FIX): 0 (0,2,0,1,0x80), 1 (0,1,0,1,0x80), 2 (2,0,0,1,0x80), 3 (0,1,2,1,0x40), 4 (0,2,2,1,0), 5 (0,2,2,1,0x20), 6 (0,2,2,1,0x80), 7 (2,0,2,1,0x80). Mode 1 is the common alpha blend (ALPHA_1 0x8000000044).
8. **Error dialog `0x25BD18`** (READ; never executed in either capture). Cancels (`D_003708F0 = 0`, `D_00370BE4 = -1`) if the leave counter `D_003706A8`, DVD error `0x370778` or disc error `0x370780` is set. `n = D_003708F0 = clamp(n + D_00370BE4, 0, 0x19 NTSC / 0x1E PAL)`. Panel: `24C2F0(3, 1, fix)`, fix = `n*0x54 / 0x19` (0x1E PAL): mode 3 (Cs-Cd)*FIX+Cd, FIX up to 84; then `24F6E8(0,0,W,H, rgba 0,0,0,0x80, z 4, abe 1)`: a full-screen black box (PRIM 0x106 | abe << 6). Text: `Font_SetRatio(1.0)`, colour alpha `n*128/0x19`; lines by kind `D_00370BE8` (jump table 0x366630): 0: ids 0x15C, 0x15D, 0x15E, 0x15F (sets `D_003708E8 = 1`); 1: 0x154..0x157 (sets `D_003708EC = 1`); 2: 0x15A, 0x15B; 3: a name from 0x4DBE00 then 0x16C..0x16F; 4: 0x170, 0x171; line count = leading non-empty of up to 6; each line `24D900(0, y, str)`, y = 16*i + 0x68 - 8*(count-1). Guide while shown: at `n == 0x18` (0x1D PAL) with step +1, slots 2 and 3 off, slot 1 on. Close: `n == 0x19` (0x1E PAL) and pad bit 0x40 (`D_003707A4`) -> `D_00370BE4 = -1`, `251CF8`. English strings (ELF, READ): 0x15C "There is an error in the content of the", 0x15D "HDD. Insert the HDD Utility Disc and ", 0x15E "start the Install HDD Software utility.", 0x15F empty, 0x154 same as 0x15C, 0x155 "HDD. ", 0x156 "Insert the HDD Utility Disc and start ", 0x157 "the Diagnose and Repair utility.", 0x15A "A serious error has occurred on the HDD.", 0x16C "contains an error.", 0x16D "This data must be deleted", 0x16E "before folder copying can be", 0x16F "completed.", 0x170 "This data contains an error", 0x171 "and should be deleted.".

### Card pass (to exclude)

Everything with `0x2527A8` (HDD; ROM 0x24C238) in the call stack: per card `0x2599C8` (ROM 0x252E48) -> flare sprites `0x250B00` (ROM 0x249F20; screen position by `sceVu0ApplyMatrix`, sizes `D_003706F0/E8`, TEXBNAV1/NAV2, colours vary per frame) and mesh draws `0x259240/0x259770` -> `0x2567D0` with the texture upload `0x23A710/0x23A7F8` (BITBLTBUF/TRXREG, 32 784-byte image packet, CT16 128x128 at tbp 0x3A98) and GIF path-1 triangle packets. HDD: 30 packets per frame at offsets +335..+364 (MEASURED: exactly the packets whose stack has 0x2527A8); ROM: 23. A probe-based verifier (an `exact` capture has no `Origin` stack) delimits the pass with probes at `0x2527A8` and at the return address `0x2538F0` (HDD; ROM `0x24C238` and `0x24D58C`, both MEASURED from stack pcs): `Probe.at` gives the packet index at each.

### Constancy (MEASURED)

`browser_chrome_const.mjs`: with the card pass, the 8 tile layers and the fade sprite removed, the remaining chrome packets of frames 0..88 hash to two values per build, one for even and one for odd frames: HDD 43 packets (395B029F1E4D / 752C2557B60F), ROM 56 (C1F9C0499267 / 192255ABAAC3). So in these captures the chrome is a static scene (frame parity changes XYOFFSET_1 y by +8 raw), plus fade alpha and layer count. `perframe.mjs`: titles and guide rows are one distinct set over 91 frames.

## Writers and callers

- Frame loop (READ): thread proc 0x24F008 -> `24EB90`: `24C048` (disc watch), `24C870(0,3,1)` (-> `24C7D8` or `24C6D8`, then `24C408(3)`), `24C928` clear, `24D378` (text area 0x18..W-0x18 via `func_00214200`), `253B58`, `253860`, `24C7D8(*0x1F0CA4)`, tail `24D0A0`.
- `253860` (READ, file `core/align_054860.s`): without leave/overlay it runs input by view mode (`254840` / `242228` / `browser_cdplayer_related3`); then always `2540D8`, `254680`, `248A90` (background), `2527A8` (card pass), mode 2 `242F38` / mode 3 `nullsub_10`, `250DA0` (title), `257370` (item title, unless `D_003706D0 == 2`), `253040` (DVD error), `25BD18` (if `D_003708F0`), `2531F8` (disc error), `24D0C8` (bands), `2524D0` (guide), `browser_device_grid_menu`, `browser_disc_menu`, tail `253488` (counters, no packet). The packet order in the capture agrees.
- Writers of inputs: fade `24CE60/24CE88/24CEB0`; page fade `D_0037072C` and `D_00370730` in `253488` (clamp 0x1A/0x15 and 0x1E/0x19; the direction `D_00370734` not traced to its writers); guide counters `D_004DA340/50` in `251DA0`, `251C10`, `251CA8`, `module_browser_options 0x251B70` (zeroes them, refetches `GetOSDString(0x1B5)` into `D_00370B9C`); aspect word `D_00370668` by `24D0C0` from `config_get_aspect_ratio` (call at 0x24EA48; value 1 = no bands and value 2 = y 0xB7 are the only uses read); `D_003705D4` by `2484B8`, `248540`.

## Probes a verifier needs

The existing captures are `--mode trace`. A registered verifier needs `exact` captures (measure skill rule 3), pc before the instruction:

| Subject | HDD pc and ranges | ROM pc and ranges |
|---|---|---|
| fade | 0x24CEB0: state 0x370660, colour 0x370670, counter 0x37066C, length 0x370674 | 0x246860: state byte 0x2C8BB4, counter 0x2C8BBC, length 0x2C8BC4 (gp-derived; colour word not located) |
| background | 0x248A90: counter 0x37066C, variant 0x3705D4, W/H 0x1F0CB4, 0x1F0CB8 | 0x242C98: counter 0x2C8BBC, variant 0x2C8B14 |
| bands | 0x24D0C8: aspect 0x370668, PAL 0x3706B0, W/H | 0x246A80: aspect 0x2C8BB8, PAL 0x2C8C08 |
| guide | 0x2524D0: 0x4DA340 (16 bytes), 0x4DA350, osd language 0x3706AC, W, aspect, 0x370740, 0x370728, 0x3707C8, item pointers 0x370838, var_curvidmode | 0x24BFB0: words not read |
| card boundary | 0x2527A8 and 0x2538F0 (`Probe.at`) | 0x24C238 and 0x24D58C |
| page fade (titles) | 0x250DA0: 0x37072C, 0x3706B0, 0x370740, 0x3706F8 | 0x24A1C8: words not read |
| dialog | 0x25BD18: 0x3708F0, 0x370BE4, 0x370BE8, 0x3708E8, 0x3708EC, 0x3707A4, 0x3706A8, 0x370778, 0x370780; 0x24C2F0 entry (a0, a1, a2) | none |
| text | 0x213BA8, 0x213D38, PutC as in the PROBES of `verify_text2.mjs` | none (font code differs) |

Model inputs for slice 2 (`References/model/browser_chrome.mjs`): alpha table 0x2BCFC0 (8 x 6 dwords), tile offsets 0x366148, gradient immediates of 0x248608, guide x table 0x2BD2E0 and the language table ids, TEXB TBPs (TEXIMAGE members + allocation order), draw-env words as per-build inputs (library output; FRAME_1 differs: HDD 0xA0000, ROM 0xA0046, measured not read).

## Positive control

- Same search, same capture: the origin search for the clock frame function `0x225E80` (covered by `verify_frame.mjs`, facts) finds 81 663 origins in frames 2105..2464 and none in the Browser part; `0x2524D0` finds 736, `0x248A90` 29 702, `0x2527A8` 1 656 in frames 2008..2099 (`browser_chrome_fn.mjs`). Against that, `0x25BD18`, `0x24F6E8`, `0x24C2F0`, `0x253D38`, `0x2540D8`, `0x254680`, `0x2531F8`, `0x253040`, `0x251A28`, `0x24D0A0`, `0x24D378`, `0x253B58` have 0 origins (READ: `25BD18`, `2531F8`, `253040` emit packets when they run, so they did not run; the others draw nothing or are tail-called).
- Formula checks that find the known and are sensitive: fade alpha 91/91 per build; layer count 91/91 per build; tile geometry 28 800/28 800 per build; mutations: layer count `+3` gives 19/91 mismatches, fade length 91 gives 59/91.
- Stack mapping HDD to ROM cross-checked by `find_in_rom.mjs` heads (16/16: 0x24EB90, 0x248910, 0x248A90, 0x24D0C8, 0x24F6E8, 0x252398, 0x2527A8, 0x2599C8).

## Open

- **Dialog kind**: neither capture shows any dialog. MEASURED: `0x25BD18` has 0 origins in all 92 Browser frames and its first draws (the `24C2F0` packet, the box) would be packets; READ: `253860` calls it only if `D_003708F0 != 0`. The capture is the 90-frame fade-out after the Circle (alpha 0 at idx 0, 0x80 at idx 90), so the dialog was already closed before the capture began (savestate `hddosd-1.10U-host-trans-browser` is 92 bytes, content not read). Kind 0 stays the READ expectation for an emulator with no HDD (inventory 1.3), unconfirmed. Gap, **new capture** (HDD OSD, trace and exact, from the Browser entry: `BootBrowser` or the clock Cross) of about 130 frames: entry fade-in (state 2, 90 frames), page fade `D_0037072C` 0..26, guide slot ramps, dialog open (25 frames), Circle, close, root page, second Circle (leave); probes above. It also tells `D_003708E8/EC` and `D_00370BE8`.
- **Not captured, needed by the same verifier**: entry fade-in (alpha `c*128/L`; layer count rising to 8; state 2 ending with no draw at c = 0); page-in ramps (titles, guide); PAL on both builds (bands 0x20, fade length 0x4B, text scaling by `D_0036FD98/FDA4/FDAC`, `24F4F0` PAL remap, `24C408` tbp 0x1E00); aspect 1 (no bands) and 2 (y 0xB7); background variants 1..4; the guide with Enter (slot 2) and the conditions of `251DA0`.
- **Unconfirmed ROM**: `251DA0`, `253D38`, `22C0D8`; the ROM guide function found by stack (0x24BFB0), not read; ROM variable addresses gp-derived, not probed.
- **Open reads**: second half of `0x250DA0` (device and CD player title paths), slot conditions in `251DA0`, `251CA8`, `24D0C0` values, `24DD68` (visibility test in the flare), `24C048`, `253B58`, writers of `D_00370734`.
- TEX0 of idx 1, 2, 4, 5, 6 derived from the allocation chain (order 0..7 in `24EA80`, inventory 1.2, not reread); only idx 0, 3, 7 seen.
- `vidmode` of the capture is nonzero (swap seen) but 1 or 2 not distinguished. Picture 0 (Square) and slot 0 ("CD Playback") are INFER.
- ROM text excluded from the model (font library differs).

Reproduction (scratch; they import `lib/trace.mjs` by absolute path): `node lab/scout/browser_chrome_layers.mjs D:/CodingProjects/Watson/Runtime/captures/hddosd-110U-trans-return.trace.jsonl 90`; `browser_chrome_layers_rom.mjs` with the ROM trace; `browser_chrome_tiles.mjs <trace> 0x00248910` (ROM `0x00242b18`); `browser_chrome_const.mjs <trace> <card regex> <fade entry> <layer entry>`; `browser_chrome_list43.mjs`, `browser_chrome_pk2.mjs`, `browser_chrome_perframe.mjs`, `browser_chrome_fn.mjs <trace> <hex entries>`.
