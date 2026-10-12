# GS state helpers of the clock (HDD OSD 1.10U), read statically

Build: HDD OSD 1.10U. Source: `D:\CodingProjects\CrystalOSD\asm\{clock,core,graph}\*.s`; data from
`hddosd.elf` (file offset = addr - 0x200000 + 0x1000). Every statement cites the address range read.
Cross-check page: `Watson/docs/findings/rom-0230A-clock-gs.md` ("measured page").

## 0. Common facts

Screen size words (outside the ELF, set at run time): `*(int*)0x001F0CB4` = W, `*(int*)0x001F0CB8` = H.
`InitDraw` 0020BD8C-0020BD98: W = 0x280 (640) always; H = 0x100 (256) if `is_pal_vmode_p9_tgt()==1`, else 0xE0 (224).
NTSC = 640 x 224 (measured page agrees: scissor 0..639 x 0..223).
`*(int*)0x001F0CA0` = double-buffer index (0/1), toggled in `SwapBuffers` 0020C058-0020C060.
`0x001F0A70` = `sceGsDBuff` made by `sceGsSetDefDBuff` (InitDraw 0020BDD0-0020BDF8: psm 0, W, H, ztest 2, zpsm 0x30, clear 1).
Layout (from `sceGsSetDefDBuff` 00289018-0028916C and `sceGsSwapDBuff` 002892B0-00289308): draw packet for index 0 has its GIF tag at db+0x50
(draw env db+0x60, clear db+0xE0), for index 1 its tag at db+0x140 (env db+0x150, clear db+0x1D0).
`D_002B2178` = int, 0 in the ELF; read as the "field" flag (0/1) used as the half-pixel Y offset (see sceGsSetHalfOffset below).

GIF header used by the packed A+D helpers: `0x1000000000008000 | NLOOP` (EOP=1, FLG=0 PACKED, NREG=1, REGS=0xE A+D). Constants seen: NLOOP 9 (00234090-00234098), NLOOP 2 (00233E98-00233EA0).
Static template `D_002B5E30` (0x2B5E30) = `0x100000000000FFFF` / `0xE`; NLOOP is patched at 00234438-00234464; every byte after the first 16 is 0 in the ELF.

### Library helpers these functions rely on (read, core/)
- `sceGsSetDefTexEnv(p, flag, TBP0, TBW, PSM, TW, TH, TFX, CBP, CPSM, CLD, tex1x)` 002896C0-002897C8. Writes 4 A+D entries (data, addr):
  - entry0: data 0, addr 0x3F (TEXFLUSH) if `flag!=0`, else addr 0x7F (undefined register).
  - entry1: TEX1_1 (0x14) = `(tex1x&1)<<5 | tex1x<<6` (tex1x=1 gives 0x60: MMAG=1, MMIN=1).
  - entry2: TEX0_1 (0x06) = TBP0 | TBW<<14 | PSM<<20 | TW<<26 | TH<<30 | TCC=1 (bit 34, constant) | TFX<<35 | CBP<<37 | CPSM<<51 | CLD<<61.
  - entry3: CLAMP_1 (0x08) = 5 (WMS=1, WMT=1 clamp).
- `sceGsSetDefAlphaEnv(p, pabe)` 002897D0-00289828: ALPHA_1 (0x42) = 0x44; PABE (0x49) = pabe (0 in all callers); TEXA (0x3B) = 0x00000081_0000807F (TA0=0x7F, AEM=1, TA1=0x81); FBA_1 (0x4A) = 0.
- `sceGsSetDefDrawEnv(p, psm, W, H, ztest, zpsm)` 00288C40-00288E20: 8 A+D entries:
  FRAME_1 (0x4C) = (psm&15)<<24 | ((W+63)>>6)<<16 | FBP 0; ZBUF_1 (0x4E) = ZBP | (zpsm&15)<<24 | (ZMSK=1 only if ztest==0);
  XYOFFSET_1 (0x18) = (0x800-W/2)<<4 | ((0x800-H/2)<<4)<<32; SCISSOR_1 (0x40) = (W-1)<<16 | (H-1)<<48;
  PRMODECONT (0x1A) = old|1; COLCLAMP (0x46) = old|1; DTHE (0x45) bit0 = (psm&2)!=0; TEST_1 (0x47) = 0x10000 | (ztest&3)<<17 (0x30000 if ztest==0).
  `sceGszbufaddr` 0028A720-0028A7E4: ZBP = ceil(W/64)*ceil(H/32), times 2 unless GParam word equals 1: 10*7*2 = 0x8C.
- `sceGsSetDefClear(p, ztest, x, y, w, h, r, g, b, a, z)` 00288E28-00288F28: 6 A+D entries: TEST_1 = 0x30000 (ZTE, ALWAYS); PRIM = 6 (SPRITE, no TME/ABE); RGBAQ = r | g<<8 | b<<16 | a<<24 | Q(0x3F800000)<<32; XYZ2 (x<<4, y<<4, z); XYZ2 ((x+w)<<4, (y+h)<<4, z); TEST_1 = 0x10000 | (ztest&3)<<17.
- `sceGsSetHalfOffset(p, x0, y0, field)` 0028A368-0028A3EC: reads SCISSOR (p+0x30) for W,H; writes XYOFFSET_1 at p+0x20 = ((x0-W/2)<<4) | (((y0-H/2)<<4) + (field?8:0))<<32. With 0x800/0x800: OFX=(2048-W/2)*16, OFY=(2048-H/2)*16 (+8 if field).
- `sceGsPutDrawEnv(tag)` 00288F30-00289014: wait GIF DMA idle; D2_QWC = NLOOP+1; D2_MADR = tag; D2_CHCR = 0x101 (DIR=1, STR=1): GIF DMA channel 2 = **PATH3**.

### Send primitives
- `func_00233DD8(pkt)` 00233DD8-00233E6C: wait idle (func_00233D90), D2_QWC = NLOOP+1, D2_MADR = pkt (if pkt>>28==7 then `|0x80000000` = scratchpad), D2_CHCR = 0x141 (DIR, TTE, STR). **GIF DMA ch2 = PATH3**, source scratchpad or RAM.
- `func_002333C0` 002333C0-002333D4: returns `gp[D_003702D8] | 0x70000000` and toggles `gp[D_003702D8] ^= 0x2000` (ping-pong 0x70000000 / 0x70002000).
- Sprites: `func_00233770` (VIF1 DMA ch1 = **PATH2**, VIF1 DIRECT).

---

## 1. func_00233D90 (0x00233D90-0x00233DD0) wait for DMA idle
`void WaitDmaIdle(a0, a1)` (args ignored). Spins while `D1_CHCR(0x10009000)&0x100` (VIF1 DMA) or `D2_CHCR(0x1000A000)&0x100` (GIF DMA). No GS write.
Callers: func_00233DD8 @00233DEC; func_002341C8 @0023426C, @002342D0; func_002347D8 @00234880.

## 2. func_00233560 (0x00233560-0x002335AC) texture slot allocator
`void AllocTex(int idx)`: `e = D_002B5D00 + 12*idx; D_002B5DC0[idx] = gp[D_003702DC]; gp[D_003702DC] += 1 << e[1] << e[2]` (words = 2^(TW+TH)).
Callers: func_002347D8 @002347F4.
`D_002B5D00` entries are `{resource data pointer (written at run time by clock_load_texture 002334E0..), log2 W, log2 H}`. ELF values at 0x2B5D00:
| idx | log2 W | log2 H | size |
|---|---|---|---|
| 0 | 6 | 6 | 64x64 |
| 1 | 7 | 7 | 128x128 |
| 2-9 | 6 | 6 | 64x64 |
| 10 | 8 | 5 | 256x32 |
| 11-15 | 0 | 0 | unused |
`clock_load_texture` 002334C8-002334D4 sets `gp[D_003702DC] = W*H*5` words, so idx 0 gets TBP0 0x2BC0 (143360*5/64 = 11200), then 1 -> 0x2C00, 2 -> 0x2D00, 3 -> 0x2D40, 4 -> 0x2D80, 5 -> 0x2DC0, 6 -> 0x2E00, 7 -> 0x2E40, 8 -> 0x2E80, 9 -> 0x2EC0. Agrees with the measured texture list (0x2bc0, 0x2c00 128x128, 0x2d00, 0x2d40, 0x2e00, 0x2e40, 0x2ec0, all PSM 0) and `facts/clock-textures.md`.

## 3. func_002335B0 (0x002335B0-0x002335C4)
`void* TexEntry(int idx)` = `D_002B5D00 + 12*idx`. Callers: func_002344F8 @0023450C; func_002347D8 @002347E8; func_002349E0 @00234A10, @00234A1C.

## 4. func_002335C8 (0x002335C8-0x002335DC)
`int TexBase(int idx)` = `D_002B5DC0[idx]` (GS word address; TBP0 = value>>6). Callers: func_002347D8 @00234808; func_002349E0 @00234A04.

## 5. func_00233E70 (0x00233E70-0x00233F44) blend mode + depth test
`void SetBlendZ(int mode, int ztst)`. 3-qword packet in scratchpad, sent with func_00233DD8 (PATH3).
```
tag   = 0x1000000000008002, REGS 0xE            ; NLOOP=2   (00233E94-00233EA8)
+0x10 : TEST_1 (0x47) = (ztst<<17) | 0x10000    (00233F10-00233F28)
+0x20 : ALPHA_1 (0x42) = f(mode)
```
TEST_1: ATE=0 (alpha test off), ZTE=1, ZTST=ztst: 1 ALWAYS = 0x30000, 2 GEQUAL = 0x50000, 3 GREATER = 0x70000, 0 NEVER = 0x10000; not masked above 3.
ALPHA_1 by `mode` (guard `sltiu mode,5`; table `jtbl_00365990` = {0x233EDC, 0x233EE4, 0x233EEC, 0x233EF4, 0x233F08}):
| mode | ALPHA_1 | A,B,C,D ; FIX | equation |
|---|---|---|---|
| 0 | 0x48 | Cs,0,As,Cd ; 0 | (Cs - 0) * As + Cd |
| 1 | 0x44 | Cs,Cd,As,Cd ; 0 | (Cs - Cd) * As + Cd |
| 2 | 0x42 | 0,Cs,As,Cd ; 0 | (0 - Cs) * As + Cd |
| 3 | 0x00000028_00000064 | Cs,Cd,FIX,Cd ; 0x28 | (Cs - Cd) * 40/128 + Cd |
| 4 | 0x68 | Cs,0,FIX,Cd ; 0 | (Cs - 0) * 0 + Cd (leaves destination) |
| >=5 | 0x44 (default left by sceGsSetDefAlphaEnv) | | as mode 1 |
Measured page agreement: its equations (off, (Cs-0)As+Cd, (0-Cs)As+Cd, (Cs-Cd)As+Cd) are modes 0, 2, 1; "no draw uses FIX" means modes 3/4 are not used in the clock frame. "Blend off" there is PRIM.ABE=0, not this register.
Sample callers (mode,ztst): module_clock_237350 @0023748C (0,2), @0023759C (1,1), @002376AC (1,1), @0023773C (0,2); 237860 @00237908 (1,1); 237A28 @00237D64 (2,2), @00237FBC (1,2); func_00236490 @002364FC (1,1), @00236550 (1,1); module_clock_22FD10 @0022FD70 (0,1); func_00236230 @00236294 (1,1); module_clock_226000 @00226130 (0,1). Further `jal func_00233E70` in module_clock_2384C8, 239078, oobe_handler, func_00226158, browser_str_related, draw_clock_menu_items, func_00226A88, func_00229080, func_0022AF60, func_0022A410, func_00234E08, func_00234D60, func_00236110/236198/236350, D_002362C8.

## 6. func_00233F48 (0x00233F48-0x0023406C) texture = display buffer
`void TexSetDisplayBuf(int idx)` (idx = `*0x1F0CA0`). Scratchpad packet, PATH3 via func_00233DD8, tag NLOOP 9:
| off | reg | data |
|---|---|---|
| +0x10 | TEST_1 (0x47) | 0x50000 (ZTE=1, ZTST=2 GEQUAL, ATE=0) |
| +0x20 | ALPHA_1 (0x42) | 0x44 |
| +0x30 | PABE (0x49) | 0 |
| +0x40 | TEXA (0x3B) | 0x00000081_0000807F |
| +0x50 | FBA_1 (0x4A) | 0 |
| +0x60 | TEXFLUSH (0x3F) | 0 |
| +0x70 | TEX1_1 (0x14) | 0x61 (LCM=1, MMAG=1, MMIN=1) |
| +0x80 | TEX0_1 (0x06) | TBP0 = idx!=0 ? 0 : W*H/64 = 0x08C0 ; TBW = W>>6 = 10 ; **PSM = 1 (CT24)** ; TW=10 ; TH=8 ; TCC=1 ; TFX=0 (MODULATE) ; no CLUT |
| +0x90 | CLAMP_1 (0x08) | 0xA \| (W-1)<<14 \| (H-1)<<34 (WMS=WMT=2 region clamp, MINU=MINV=0, MAXU=W-1, MAXV=H-1) |
Read: PSM 00233FF0; TBP0 00233F7C-00233FB0; CLAMP 00234010-00234054.
idx 1 -> TBP0 0; idx 0 -> TBP0 0x08C0. In `sceGsSetDefDBuff` the draw packet of index 0 is the one whose FBP is set to ZBP/2 = 0x46 (0028924C-0028927C), so this texture is the buffer the frame is being drawn into. Agrees with measured draws 12-14 (0x08c0 sampled with PSM 0x01) and with "0x0000 and 0x08c0 with PSM 0x01, 14 draws each".
Callers: module_clock_226000 @002260E4 (`*0x1F0CA0`); func_00235FE0 @00236008 (same arg), which func_00236490 calls @002364F0 with (1,0,0).

## 7. func_00234070 (0x00234070-0x002341C4) texture = off-screen work buffer
`void TexSetWork(int sel)`; only bit 0 of `sel`. PATH3, scratchpad, NLOOP 9. Same entries as 6 except:
| field | value |
|---|---|
| TEX0 TBP0 | sel&1 ? (W*H)<<12>>16 = W*H/16 = **0x2300** : (3*W*H)<<10>>16 = 3*W*H/64 = **0x1A40** (00234098-00234104) |
| TEX0 TBW / TW / TH / TCC / TFX | 10 / 10 / 8 / 1 / 0 |
| TEX0 PSM | **0** (CT32) (t0=0 at 00234144) |
| TEX1_1 | 0x61 |
| CLAMP_1 | 0xA \| (W-1)<<14 \| (H-1)<<34 |
| TEST_1 / ALPHA_1 / PABE / TEXA / FBA / TEXFLUSH | 0x50000 / 0x44 / 0 / 0x81_0000807F / 0 / 0 |
Agrees with measured: buffers 0x1a40 and 0x2300 sampled with PSM 0x00 (TBP0 = FBP*32: 0x118*32 = 0x2300, 0xD2*32 = 0x1A40).
Callers: func_00236058 @00236070, func_002360A8 @002360BC (own argument); module_clock_226000 @00226124 (sel=0).

## 8. func_002348A8 (0x002348A8-0x002349DC) texture environment for a loaded texture
`void TexSetTex(int base, int logW, int logH, int blendSel, int ztst, int psm)`. PATH3, scratchpad, NLOOP 9, same 9-entry layout.
```
TBP0 = base>>6 ; TBW = (1<<logW)>>6
TEX0_1 = TBP0 | TBW<<14 | psm<<20 | logW<<26 | logH<<30 | 1<<34 (TCC) | 0<<35 (TFX MODULATE)
TEX1_1 = 0x61 ; CLAMP_1 = 5 (clamp/clamp) ; TEXFLUSH data 0
TEST_1 = 0x10000 | ztst<<17      (ATE=0, ZTE=1)
ALPHA_1 = blendSel ? 0x48 : 0x44 ; PABE 0 ; TEXA 0x81_0000807F ; FBA 0
```
Read: TBP0/TBW 002348F4-00234930; SetDefTexEnv 00234950-00234968; TEST 0023497C-00234990; ALPHA 00234994-002349A8; CLAMP/TEX1 stores 00234998 and 002349B4.
Only caller: func_002349E0 (tail jump @00234A54, psm=0).

## 9. func_002349E0 (0x002349E0-0x00234A58) bind clock texture idx
`void BindTex(int idx, int blendSel, int ztst)`:
```
e = TexEntry(idx); TexSetTex(TexBase(idx), e[1], e[2], blendSel, ztst, 0);
```
TEX0 = TBP0 per section 2, TBW 1 (64-wide) or 2 (idx 1), PSM 0, TW/TH from table, TCC 1, TFX 0; TEX1 0x61; CLAMP 5; TEST_1 = 0x10000|ztst<<17 (1 -> 0x30000, 2 -> 0x50000); ALPHA_1 = 0x48 (blendSel!=0) or 0x44 (0); the clock code overrides ALPHA_1/TEST_1 right after with func_00233E70.
Argument values seen (idx,blendSel,ztst): module_clock_237350 @0023747C (2,1,2), @00237728 (?,1,2); 237860 @00237918 (5,0,1); 237A28 @00237D54 (2,1,2); 2384C8 @00238714 (0,0,2), @002387F4 (3,1,?); 239078 @00239574 (7,1,1), @002396A0 (6,1,1); func_002332B0 @002332DC (1,1,?); DrawIcon @00226568 (8,0,1), @00226588 (9,0,1). idx map: `facts/clock-textures.md`.
Cross-check: measured rod draws 2 and 3 use 0x2d00 (idx 2) with (0-Cs)*As+Cd then (Cs-0)*As+Cd, depth GEQUAL = `BindTex(2,1,2)` + `SetBlendZ(0 or 2, 2)` (00237470-00237490, 00237720-0023773C). Agreement.
All callers: module_clock_237350 @0023747C, @00237728; 237860 @00237918; 237A28 @00237D54, @00238234; 2384C8 @00238714, 002387F4, 0023892C, 00238A60, 00238AF4, 00238B98, 00238C50; 239078 @00239574, 002396A0, 00239BE0, 00239D0C; func_002332B0 @002332DC; DrawIcon @00226568, 00226588.

## 10. func_002342F0 (0x002342F0-0x002344F0) draw environment (+ optional clear) on a work buffer
`void SetDrawEnv(int target, const int rgba[4]* clear, int field)`. Static packet `D_002B5E30|0x20000000` (uncached RAM): +0x00 tag; +0x10 DefDrawEnv (8 A+D); +0x90 DefClear (6 A+D).
```
sceGsSetDefDrawEnv(+0x10, psm 0, W, H, ztest 2, zpsm 0x30)
sceGsSetDefClear (+0x90, ztest 2, x=0x800-W/2, y=0x800-H/2, w=W, h=H, rgba 0, z 0)
FBP = (target&1) ? W*H/512 (=0x118) : 3*W*H/2048 (=0xD2)       ; FRAME_1.FBP replaced (00234428-00234444)
clear != NULL : tag.NLOOP = 14 ; RGBAQ(+0xB0) = c[0] | c[1]<<8 | c[2]<<16 | c[3]<<24 | 0x3F800000<<32   (00234448-00234498)
clear == NULL : tag.NLOOP = 8  (clear sprite not sent)
sceGsSetHalfOffset(+0x10, 0x800, 0x800, field)                ; OFY += 8 iff field != 0
func_00233DD8(packet)                                          ; PATH3, QWC = NLOOP+1
```
Values (NTSC, target 1): FRAME_1 = FBP 0x118 | FBW 10<<16 | PSM 0 | FBMSK 0 (0x000A0118); ZBUF_1 = ZBP 0x8C, PSM 0, ZMSK 0; XYOFFSET_1 = OFX 0x6C00, OFY 0x7900 (+8 if field); SCISSOR_1 = x 0..639, y 0..223 (0x00DF0000_027F0000); PRMODECONT 1; COLCLAMP 1; DTHE 0; TEST_1 0x50000. Clear, if present: TEST_1 0x30000; PRIM 6; RGBAQ; XYZ2 (0x6C00, 0x7900, 0) and (0x6C00+W*16, 0x7900+H*16, 0); TEST_1 0x50000. target 0 -> FBP 0xD2.
Measured agreement: four targets with FBW 10, PSM 0, scissor 0..639 x 0..223, ZBUF.ZBP 0x08c with depth writes, and "each pass starts with an untextured full-buffer sprite".
Callers: module_clock_226000 @002260D8 (0,0,0), @002260FC (1,0,0); module_clock_22FD90 @0022FDC4 and @0022FE28 (1, D_002B5730, `D_002B2170[2]`); module_clock_2308F0 @00230A90 (1, D_002B5CC0, `D_002B2170[2]`); module_clock_239078 @002397C8; func_00235FE0 @0023604C (tail); func_00236058 @002360A0 (tail, clear NULL).
ELF colour structs: `D_002B5730` = {0,0,0,0x80} (R,G,B=0, A=0x80); `D_002B5FC0`, `D_002B5FD0` all zero.

## 11. func_002341C8 (0x002341C8-0x002342EC) draw environment of the display double buffer
`void SetDispDrawEnv(sceGsDBuff* db, int idx, const int rgba[4]* clear, int field)` (db made uncached: `|0x20000000`).
```
if (clear) *(u64*)(db+0x1F0) = c[0] | c[1]<<8 | c[2]<<16 | c[3]<<24 | 0x3F800000<<32   (00234220; always at db+0x1F0 = clear RGBAQ of index 1)
env = idx ? db+0x140 : db+0x50
sceGsSetHalfOffset(env+0x10, 0x800, 0x800, field)
env.tag.NLOOP = clear ? 14 : 8      (00234244-00234264 and 002342A4-002342C8)
WaitDmaIdle(); sceGsPutDrawEnv(env)    ; PATH3, QWC = NLOOP+1, CHCR 0x101
```
The draw environment content comes from sceGsSetDefDBuff: FRAME_1 FBW 10, PSM 0, FBP per index; ZBUF ZBP 0x8C; SCISSOR 0..W-1 x 0..H-1; TEST_1 0x50000; clear sprite as in section 10.
Callers: module_clock_226000 @00226080 (colour path `D_002B21E0`+0x20.. rect), @0022611C (`*0x1F0CA0`, 0, 0); func_002360A8 @00236108 (tail); oobe_handler @0022DC28; func_00226158 @002261CC; func_00226300 @002263B8; func_0022A410 @0022A528; module_clock_239078 @00239154; func_00229080 @00229168; func_0022AF60 @0022B0A4; func_00234E08 @00234E38; draw_button_panel @002267C8; draw_clock_menu_items @002321F8; func_00226A88 @00226AE4; browser_str_related @002314AC.

## 12. func_00236058 (0x00236058-0x002360A4)
`void WorkTexAndDraw(int target, int texSel, int fieldSel)`:
```
func_00234070(texSel);                                        ; TEX0 = 0x1A40 (texSel&1==0) / 0x2300 (1), PSM 0
func_002342F0(target, NULL, fieldSel==1 ? D_002B2178 : 0)     ; draw env FBP 0x118 (target&1) / 0xD2, no clear
```
Callers: module_clock_2308F0 @00230B50 (0,1,0); module_clock_237350 @00237588 (?,1,1), @00237684 (?,?,0), @0023769C (0,1,1); 237860 @002378FC; 237A28 @00237C58, 002380A0, 00238198, 00238400; func_00236350 @002363B0, 00236404.
Measured per-rod draws 4/5 (target 0x046 / 0x0D2, texture 0x2300 = buffer 0x118): consistent with this pair.

## 13. func_002360A8 (0x002360A8-0x0023610C)
`void WorkTexAndDispEnv(int texSel, int clearBlack, int fieldSel)`:
```
func_00234070(texSel);
func_002341C8(0x1F0A70, *0x1F0CA0, clearBlack==1 ? D_002B5FD0 : NULL, fieldSel==1 ? D_002B2178 : 0)
```
`D_002B5FD0` = {0,0,0,0}: black, alpha 0. Draw env goes to the display buffer in use (index `*0x1F0CA0`).
Callers: module_clock_22FD90 @0022FE0C, @0022FE6C (1,0,0); module_clock_2308F0 @00230B8C (0,0,0); 237A28 @00237FAC (1,0,1), @00238370; func_00236490 @00236544 (1,0,0).

## 14. func_00233770 (0x00233770-0x002337BC) sprite, PATH2
`void DrawSprite(struct Rect* r)`; struct (from func_002335F8 and func_00233698):
```
+0x00 R +0x04 G +0x08 B +0x0C A        (ints)
+0x10 X0 +0x14 Y0 (x16 fixed)   +0x18 U0 +0x1C V0 (x16 fixed texels)
+0x20 X1 +0x24 Y1               +0x28 U1 +0x2C V1
+0x30 Z  +0x34 ABE  +0x38 TME
```
Sequence: func_002333E0 (sceDmaPkInit on scratchpad `gp[D_003702D8]|0x70000000`, ping-pong toggled; sceVif1PkEnd; sceVif1PkOpenDirectCode(0) = VIF DIRECT 0x50000000|count) -> func_002335F8 (tag 1) -> sceVif1PkCloseGifTag -> func_00233698 (tag 2) -> func_00233438: CloseGifTag, CloseDirectCode, DmaPkTerminate, `sceGsSyncPath(0,0)`, D1_TADR = pk|0x80000000 (scratchpad), D1_CHCR = 0x145 (chain, DIR, TTE, STR). **PATH2 (VIF1 DIRECT), from scratchpad**; it first waits all paths idle, so earlier PATH3 state packets have finished.
Packet:
- tag 1 (template D_00365978 = `0x2400000000008000` / `0x10`): EOP=1, FLG=1 (REGLIST), NREG=2, REGS={PRIM 0, RGBAQ 1}, NLOOP closed to 1. Data: **PRIM = 6 | TME<<4 | ABE<<6 | 1<<8** (SPRITE, FST=1 so UV; IIP=0, FGE=0, AA1=0, CTXT=0 context 1 registers) at 0023663C-00233680; **RGBAQ = R | G<<8 | B<<16 | A<<24 | 0x3F800000<<32**.
- tag 2 (template D_002B5E00 = `0x2400000000008000` / `0x43`): EOP=1, REGLIST, NREG=2, REGS={UV 3, XYZF2 4}, NLOOP closed to 2. Data: UV = U0 | V0<<16; XYZF2 = (X0+OX) | (Y0+OY)<<16 | Z<<32; UV = U1 | V1<<16; XYZF2 = (X1+OX) | (Y1+OY)<<16 | Z<<32, with OX=(0x800-W/2)<<4, OY=(0x800-H/2)<<4 (00233698-00233768). XYZF2 (0x04), not XYZ2.
OX/OY equal the XYOFFSET of the draw environments minus the field half-pixel, so rectangle coordinates are window pixels x16.
Callers (selection): module_clock_226000 @0022614C (tail, D_002B21E0); module_clock_22FD10 @0022FD84; func_00236230 @002362A0; func_00236490 @00236534, @00236588; func_00226158 @00226238, @002262C0; DrawIcon @002266AC; func_00236110 @00236174; func_00236198 @00236210; func_00236350 @002363F4, @00236448; D_002362C8 @0023632C; oobe_handler @0022DC8C; oobe_load_image @0022E880; module_clock_239078 @00239690, 002397AC, 00239CFC, 00239E18; func_00234E08 @00234E68; func_00226A88 @00226B04.

## 15. func_00236230 (0x00236230-0x002362C0) full-screen textured copy sprite
`void CopyFullScreen(int abe)`. Rect `D_002B6060|0x20000000` (ELF template: RGBA 0x80,0x80,0x80,0x80; X0=Y0=0; U0=V0=8; Z=0; ABE=0; TME=1):
```
X1 = W<<4 ; Y1 = H<<4 ; U1 = (W<<4)+8 ; V1 = (H<<4)+8       (00236258-00236290)
func_00233E70(1, 1)       ; ALPHA 0x44, TEST_1 0x30000 (ALWAYS)
ABE = abe ; func_00233770(&r) ; sceGsSyncPath(0,0)
```
PRIM = 0x116 (abe 0) or 0x156 (abe 1). Whole screen sprite sampling texels 0.5..W+0.5 x 0.5..H+0.5, vertex colour (128,128,128,128), Z=0, depth ALWAYS.
Callers: module_clock_226000 @002260EC (0), @00226104 (0); module_clock_2308F0 @00230BC4 (tail, 1).
Measured agreement: draws 12-14 "three full-buffer sprites 0x0d2 <- 0x08c0; 0x118 <- 0x08c0; 0x046 <- 0x1a40", opaque. module_clock_226000 00226000-0022614C does: SetDrawEnv(0) + TexSetDisplayBuf + CopyFullScreen(0) [to 0xD2]; SetDrawEnv(1) + CopyFullScreen(0) [to 0x118]; SetDispDrawEnv + TexSetWork(0) [0x1A40] + SetBlendZ(0,1) + DrawSprite(D_002B21E0) [to the display buffer]. The last sprite uses a different rect (not read here).

## 16. func_00236490 (0x00236490-0x002365CC) shrink/stretch loop
`void BlurRoundTrips(int n)` (n<=0: nothing). Rect `D_002B6120|0x20000000` (template RGBA 0x80 x4, U0=V0=8, ABE=0, TME=1). Per trip i (s6=0x954, s1=0x13F4, s5=0x95C initially):
1. `func_00235FE0(1,0,0)` = TexSetDisplayBuf(`*0x1F0CA0`) + SetDrawEnv(1, NULL, 0) (FBP 0x118)
2. `func_00233E70(1,1)`
3. X1 = s1 (0x13F4 - 0x20*i = 319.25 - 2i px), Y1 = s6 (0x954 - 0x10*i = 149.25 - i px), U1 = (W<<4)+8 (640.5), V1 = ((H-1)<<4)+8 (223.5); DrawSprite: sprite 0..X1 x 0..Y1 sampling the whole display buffer
4. `func_002360A8(1,0,0)` = TexSetWork(1) (0x2300, PSM 0) + SetDispDrawEnv(no clear)
5. `func_00233E70(1,1)`
6. X1 = W<<4 (640), Y1 = (H-1)<<4 (223), U1 = s1+8 (0x13FC: 319.75 - 2i), V1 = s5 (0x95C: 149.75 - i); DrawSprite
7. `sceGsSyncPath(0,0)`
Matches the measured draws 2-11 digit for digit (319.25 x 149.25 into 0x118 sampling 0.5..640.5 x 0.5..223.5 of 0x08c0; 640 x 223 into 0x046 sampling 0.5..319.75 x 0.5..149.75 of 0x2300; corner shrinks by 2 x 1 per trip: 317.25 x 148.25 ... 311.25 x 145.25; opaque). n: module_clock_226000 @002260BC-002260C4: `v = module_clock_22FEF0(); n = v<6 ? v : 10 - v`.
Callers: module_clock_226000 @002260C8; module_clock_232438 @00232448 (tail, n = gp[D_00370AA4] - 5 when >= 5).

## 17. module_clock_22FD10 (0x0022FD10-0x0022FD88) translucent full-screen overlay
`void FadeOverlay(int alpha)`. Rect `D_002B56F0|0x20000000` (template: RGB 0x80, A 0, X0=Y0=0, U0=V0=8, Z 0, **ABE=1**, TME=1 per 0x2B5720-0x2B5728):
```
A = alpha ; X1 = W<<4 ; Y1 = H<<4 ; U1 = (W<<4)+8 ; V1 = (H<<4)+8
func_00233E70(0, 1)    ; ALPHA_1 0x48 = (Cs - 0)*As + Cd, TEST_1 0x30000
tail func_00233770(&r) ; PRIM 0x156 (SPRITE, TME, ABE, FST)
```
Callers: module_clock_22FD90 @0022FE14 and tail @0022FE90, both alpha 0x1E (30).
Measured agreement: "each pass ends with one full-buffer sprite into 0x046 that samples 0x2300 with (Cs - 0) * As + Cd and vertex colour (128,128,128,30)". 22FD90 @0022FE64-0022FE90 does func_002360A8(1,0,0) (texture 0x2300) then FadeOverlay(30). Exact.

## 18. Sequence of module_clock_22FD90 (0022FD90-0022FE94), for the port
SetDrawEnv(1, D_002B5730 (black, A 0x80), D_002B2170[2]) -> per-object `module_clock_2384C8` loop -> WorkTexAndDispEnv(1,0,0) -> FadeOverlay(30); then SetDrawEnv(1, D_002B5730, ...) -> loop again (flag 1) -> WorkTexAndDispEnv(1,0,0) -> tail FadeOverlay(30). Matches measured item 6 (two passes: clear sprite, strips per rod, final 30-alpha copy).

## NOT DETERMINED
1. Initial value of `gp[D_003702D8]` (scratchpad ping-pong): run-time; no static initialiser found. `gp[D_003702DC]` is set by clock_load_texture to W*H*5 (read).
2. func_002341C8: the clear colour is stored only at db+0x1F0 (index 1 packet's RGBAQ); no store for index 0's clear colour (db+0x100) was found. Whether that is intended is not determined; observed callers pass zero colours.
3. Exact FBP of each double-buffer index (0x000 or 0x046): depends on a GParam test in `sceGsSetDefDBuff` 00289220-00289240 (run-time). Measured page shows both used alternately, consistent with the block being taken.
4. Source of the measured 200 writes to register 0x7F: `sceGsSetDefTexEnv` emits addr 0x7F only for flag 0; every call read here uses flag 1 (TEXFLUSH). Other callers were not searched.
5. Values of `module_clock_22FEF0` (trip count) and `D_002B2170[2]` (field argument): not read.
6. The rect used by `DrawSprite(D_002B21E0)` at module_clock_226000 @00226138-0022614C: template and per-field setup at 00226040-00226078 only partly decoded (fields +0x20..+0x2C = W<<4, H<<4, (W<<4)+8, (H<<4)+8, same pattern as 22FD10).
7. D_002B5D00 field +0 is overwritten at run time (resource pointer); ELF value 0, unused by these functions.

## Disagreements with the measured page
None. This reading adds register values the measured page does not list: TEX0 TW=10/TH=8 and TCC=1/TFX=0 for the full-screen buffers, TEX1 0x61, CLAMP region 0..W-1 x 0..H-1, TEXA 0x00000081_0000807F, FBA 0, PABE 0, PRMODECONT 1, COLCLAMP 1, DTHE 0; and blend modes 3/4 (FIX) exist in code but are not drawn in the measured frame.
