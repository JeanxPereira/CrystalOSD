# module_clock_239078: orb sprites, GS state, rectangle helper, filling branch

Build: HDD OSD 1.10U. Read in full: `clock/module_clock_239078.s` (0x00239078..0x00239E58) and the helpers
`func_00233770`, `func_002335F8`, `func_00233698`, `func_002333E0`, `func_00233438`, `func_002349E0`,
`func_002348A8`, `func_002341C8`, `func_002342F0`, `func_00233E70`, `func_00233DD8`, `func_002333C0`,
`func_00234A70`, `func_00234B10`, `func_00234A98/AB0/AC0/AE0`, `func_00238F20/FB8`, `func_00239018`,
`func_002335B0/C8`, `sceGsSetDefTexEnv`, `sceGsSetDefAlphaEnv`, `sceGsSetHalfOffset`,
`sceVif1PkCloseGifTag`. Data constants read from `hddosd.elf` (initial image).
Float notation: every `mul.s/add.s/sub.s` is single precision; every `cvt.w.s` (`.word 0x460000E4` etc.) truncates toward zero.

## 0. Overall order of the function (one call = one orb)

```
0x00239078-0x002390D8  prologue; f22 = z_newest * K ; ramp update (func_00234B10)
0x002390E0-0x00239124  copy three constant/colour quads to the stack
0x00239128-0x0023916C  FIRST HALF: select target A, set TEST/ALPHA for the strip
0x00239170-0x00239550  first half trail line strip (already verified in facts; only summarised below)
0x00239550-0x002397B0  first half: sprite 1 (texture 7), sprite 2 (texture 6)
0x002397B4-0x002397DC  SECOND HALF: select target B, same TEST/ALPHA call
0x002397E0-0x00239BC0  second half trail strip (identical code to the first half)
0x00239BC0-0x00239E1C  second half: sprite 1, sprite 2
```

Stack frame after the prologue (`$sp` based):

```
sp+0x00  int*  record pointer (the a0 argument)                       0x002390C4
sp+0x10  quad  = D_002B61E0 = { 0x80, 0x80, 0x80, 0x80 }              0x002390E0-0x002390F0 (lq/sq)
sp+0x20  quad  = D_002B61F0 = { 0xFF, 0xFF, 0xFF, 0x80 }              0x002390F4-0x00239104
sp+0x30  quad  = the 4 ints at record + 0x20 + head*0x20              0x0023910C-0x00239124
                 = colour of the NEWEST ring entry: r,g,b and a 4th int w3
                 (entry layout: +0x10 + 0x20*k position x,y,z ; +0x20 + 0x20*k colour r,g,b,w3)
```

`head` = `*(int*)record` (index of newest entry). Normal orb colour is `(48, 98, 128, 60)` (clock-camera.md), so w3 = 60.
Both ints at 0x001F0CB4 (W) and 0x001F0CB8 (H) are the screen size; `W2 = (W + (W >>> 31)) >> 1` (signed halve, toward zero), `H2` likewise.

### Constants (bits / value / where loaded)

| Name | bits | value | where |
|---|---|---|---|
| K (`D_0036FC98`) | `0x36DA1A93` | 6.499999926745659e-06 | `lwc1 $f1,%gp_rel(D_0036FC98)($gp)` 0x002390BC. The ELF's initial word at 0x0036FC98. Nothing else in the whole asm tree references the symbol (grep), so it is a constant in this build. |
| 30.0 | `0x41F00000` | 30.0 | `lui $at,0x41F0; mtc1` 0x002395AC (first half), 0x00239C18 (second half) |
| 4.5 | `0x40900000` | 4.5 | 0x002396C8 / 0x00239D34 |
| 0.5 | `0x3F000000` | 0.5 | 0x00239564 (f20 first half) / 0x00239BD8 (f21 second half) |
| 16.0 | `0x41800000` | 16.0 | 0x00239554 (f21 first half) / 0x00239BC8 (f20 second half) |
| 2048.0 | `0x45000000` | 2048.0 | trail only |
| 3.0 | `0x40400000` | 3.0 | trail only |
| 128.0 | `0x43000000` | 128.0 | trail only |

The only difference between the halves in the sprite arithmetic is which register holds 16.0 and 0.5 (f21/f20 swapped); the operations are the same.

## 1. The two sprites (identical arithmetic in both halves)

### 1.1 Scale

```
f22 = z_newest * K                                  mul.s f22,f0,f1        0x002390DC (delay slot of jal func_00234B10)
   z_newest = float at record + 0x10 + 0x20*head + 0x08                    0x002390C0-0x002390D4  (lwc1 f0,0x18(v1), v1 = record + head*32)
```

### 1.2 Sprite 1 (texture index 7 = TEXCBLUR, the round glow)   0x00239574-0x00239694 (first half), 0x00239BE0-0x00239CFC (second half)

```
func_002349E0(7, 1, 1)                                   0x0023956C-0x00239578       (see section 2.3)
alpha_w = ramp(w)  -> see 1.4
x  = float [entry_head + 0], y = float [entry_head + 4]   (entry_head = record + head*32 + 0x10)  0x002395D0, 0x002395E0
f3 = f22 * 30.0f                       half width  hw     0x002395C4
f6 = (float)W2                                            0x002395D4-0x002395D8
f5 = f3 * 0.5f                         half height hh     0x002395DC
f0 = x - f3                                               0x002395E4
f1 = x + f3                                               0x002395E8
f2 = y - f5                                               0x002395EC
f0 = f0 + f6                                              0x002395F0
f4 = y + f5                                               0x002395F4
f0 = f0 * 16.0f ; X0 = (int)f0   -> rec+0x10              0x002395F8-0x00239600
f0 = (float)H2 ; f2 = f2 + f0 ; f2 = f2 * 16.0f ; Y0 = (int)f2  -> rec+0x14        0x00239604-0x0023962C
f0 = (float)W2 ; f1 = f1 + f0 ; f1 = f1 * 16.0f ; X1 = (int)f1  -> rec+0x20        0x00239630-0x00239658
f0 = (float)H2 ; f4 = f4 + f0 ; f4 = f4 * 16.0f ; Y1 = (int)f4  -> rec+0x24        0x0023965C-0x00239684
rec[0x00..0x0F] = quad at sp+0x30 (r, g, b, A1)           0x00239688-0x00239690
func_00233770(rec)                                        0x00239694
```

Corner order: (X0,Y0) = top-left, (X1,Y1) = bottom-right (smaller coordinates first). The sprite is twice as wide as tall in screen units
(hw = 30 s, hh = 15 s, s = z*K); with the 640x224 field that is a square on screen.

### 1.3 Sprite 2 (texture index 6 = TEXCNAVI, the hard disc)   0x00239698-0x002397B0 (first), 0x00239D04-0x00239E18 (second)

Same as 1.2 with:

```
func_002349E0(6, 1, 1)
f3 = f22 * 4.5f                        hw                 0x002396E0 / 0x00239D4C
f20' = f3 * 0.5f                       hh                 0x002396F8 / 0x00239D64   (the 0.5 register is overwritten with hh)
(same sub/add/add W2,H2/mul 16.0/cvt chain, results to rec+0x10, +0x14, +0x20, +0x24)
rec[0x00..0x0F] = quad at sp+0x10 (first half)  or  sp+0x20 (second half)
func_00233770(rec)
```

Both sprites use the same newest entry x,y (re-read from memory each time) and the same f22.

### 1.4 Colours (ints), including the ramp scaling

The fade ramp `D_002B61B0` = `{max, counter, doneflag, state}`:

```
func_00234B10(ramp)                          0x002390D8; once per call, before everything
   doneflag = 0; state 1: counter++ ; if counter == max { doneflag = 1; state = 2 }
                 state 3: counter-- ; if counter == 0   { doneflag = 1; state = 0 }
func_00234A70(ramp, x) = (counter * x) / max            signed int division, truncating; trap if max == 0
```
Set-up (func_00238F20): max = ((PAL ? 0x32 : 0x3C) << 8) / 60 = 256 (NTSC) or 213 (PAL), state 0 and counter 0 at init; state 1 (counting up) is started by
`func_00234AC0`; `func_00239018` starts the fade down (state 3). In steady state (state 2) counter == max, so the scale factor is exactly 1.
(Initial values of D_002B61B0 in the ELF image are 0; the ramp is written at run time. Whether the clock is in steady state at a given frame is NOT DETERMINED here.)

Only the 4th int (alpha) of each quad is scaled by the ramp; r, g, b are copied unscaled.

First half:
```
sprite 1:  A1 = ramp(sp[0x3C]) = counter*w3/max   ; sw to sp+0x3C       0x0023957C-0x00239588   (w3 = entry's 4th int; normally 60)
           colour quad = (r, g, b, A1) from sp+0x30
sprite 2:  A2 = ramp(sp[0x1C]) = counter*0x80/max ; sw to sp+0x1C       0x002396A8-0x002396B4
           colour quad = (0x80, 0x80, 0x80, A2) from sp+0x10
```
Second half (differs):
```
0x002397C4:  sw 0x80 -> sp+0x3C           (sprite 1's alpha source is RESET to the constant 0x80)
sprite 1:  A1 = counter*0x80/max          ; colour quad = (r, g, b, A1)                0x00239BE8-0x00239BF4
sprite 2:  A2 = ramp(sp[0x2C]) = counter*0x80/max ; colour quad = (0xFF, 0xFF, 0xFF, A2) from sp+0x20   0x00239D14-0x00239D20
```
In the packet these four ints become `RGBAQ = R | G<<8 | B<<16 | A<<24 | (0x3F800000 << 32)` (Q = 1.0), see section 3.

### 1.5 UV / ST / Z

No ST. Sprite uses `PRIM.FST = 1`, so UV (12.4 fixed point) from the record's static words (never written by this function; no other code in the asm tree references the record `D_002B6170`):

```
u0 = rec[0x18] = 0x000     v0 = rec[0x1C] = 0x000        (top-left corner)
u1 = rec[0x28] = 0x3F0     v1 = rec[0x2C] = 0x3F0        (bottom-right: 63.0 texels of a 64x64 texture)
z  = rec[0x30] = 0         (Z written in XYZF2 = 0, F = 0; both corners)
rec[0x34] = 1 -> PRIM.ABE ; rec[0x38] = 1 -> PRIM.TME
```
(ELF initial words of D_002B6170: 0x80 0x80 0x80 0x80 | 0x1900 0x320 0 0 | 0x2260 0x640 0x3F0 0x3F0 | 0 1 1 0.
Words +0x10,+0x14,+0x20,+0x24 are overwritten each call; +0x28 = 0x3F0 is u1, +0x2C = 0x3F0 is v1, +0x30 = 0 is z.)

## 2. GS state selected before each send

### 2.1 Sequence with integer arguments (first half)

```
FlushCache(0)                                                              0x0023912C
func_002341C8(0x001F0A70, *(int*)0x001F0CA0, 0, *(int*)0x002B2178)        0x00239138-0x00239158   target A (see 2.2)
func_00233E70(0, 3)                                                        0x0023915C-0x00239164   strip: ALPHA mode 0, ZTST 3
 ... trail strip, 2 packets (func_002333E0 .. func_00233438 twice)        0x0023916C-0x0023955C
func_002349E0(7, 1, 1)                                                     0x0023956C-0x00239578   sprite 1 state
func_00233770(rec)                                                         0x00239694
func_002349E0(6, 1, 1)                                                     0x00239698-0x002396A4   sprite 2 state
func_00233770(rec)                                                         0x002397B0
```
Second half:
```
func_002342F0(0, 0, *(int*)0x002B2178)                                     0x002397B4-0x002397CC   target B (see 2.2)
func_00233E70(0, 3)                                                        0x002397D0-0x002397D8
 ... trail strip (same code)                                               0x002397DC-0x00239BC0
func_002349E0(7, 1, 1) ; func_00233770(rec)                                0x00239BD0-0x00239D00
func_002349E0(6, 1, 1) ; func_00233770(rec)                                0x00239D04-0x00239E18
```
`*(int*)0x002B2178` = scene record (`D_002B2170`) + 8, passed as the `field` argument; its meaning is NOT DETERMINED (see list at the end).

### 2.2 Target selection (the only GS-state difference between the halves)

First half, `func_002341C8(a0 = 0x1F0A70, a1 = *(0x1F0CA0), a2 = 0, a3 = field)` (0x002341C8..0x002342EC):
```
s1 = a0 | 0x20000000
if a1 != 0:  env = s1 + 0x140 ; else env = s1 + 0x60
sceGsSetHalfOffset(env + 0x10, 0x800, 0x800, (short)field)
NLOOP of env's giftag = 8   (a2 == 0: no clear; 0xE with a clear colour)
sceGsSyncPath(0,0) (wait for DMA1/DMA2 idle, func_00233D90); sceGsPutDrawEnv(env)
```
So the first half re-sends an already built draw environment from the block at 0x001F0A70 (selected by the int at 0x001F0CA0, a double-buffer index or field).
Which FBP that environment holds is built elsewhere at run time: NOT DETERMINED statically (callers `func_00226158`, `func_00226300`, `func_0022A410`, `browser_str_related` use the same block).

Second half, `func_002342F0(a0 = 0, a1 = 0, a2 = field)` (0x002342F0..0x002344F0) builds a fresh environment in `D_002B5E30 | 0x20000000`
(giftag at +0, db at +0x10 = 8 A+D qwords starting with FRAME_1):
```
W = (short)*(u16*)0x001F0CB4 ; H = (short)*(u16*)0x001F0CB8
sceGsSetDefDrawEnv(db, psm = 0 (PSMCT32), W, H, ztest = 2 (GREATER), zpsm = 0x30 (PSMZ32))
sceGsSetDefClear(...)                            (built but NOT sent: NLOOP = 8)
FBP = (a0 & 1) ? (W*H)/512 : (W*H*3)/2048       signed, divide toward zero, then & 0x1FF
FRAME_1.FBP (low 9 bits at db+0) = FBP
```
with `a0 = 0` the used formula is `FBP = W*H*3 / 2048`. For W=640, H=224 this is 210 = 0x0D2, the buffer Watson measured (`0x0d2`); for `a0 & 1` it would be 280 = 0x118 (the other measured buffer).
`sceGsSetHalfOffset(db, 0x800, 0x800, (short)field)`, then NLOOP = 8 and `func_00233DD8(env)` sends it by DMA2 (GIF).
(That W = 640 and H = 224 at run time is not read from the file; it follows from Watson's finding that a 640x224 buffer is 70 units and 0x0D2 = 3 x 70. ZBP/ZMSK of this env are what libgraph's sceGsSetDefDrawEnv leaves: not read.)

Both: `sceGsSetHalfOffset(db, 0x800, 0x800, field)` gives `OFX = (0x800 - (SCAX1+1)/2) * 16 = (0x800 - W/2) * 16` and `OFY = (0x800 - H/2) * 16`, plus 8 added to OFY when `field != 0` (as the low 16 bits). Same code and same `field` in both halves, so no coordinate scaling or offset differs between halves.

### 2.3 What each helper sends

`func_00233E70(a0, a1)`, from the Dma packet at the scratchpad buffer (alternating via gp `D_003702D8`), then `func_00233DD8` DMA2:
```
giftag: NLOOP = 2, EOP, NREG = 1, REGS = A+D
TEST_1 (0x47) = 0x10000 | (a1 << 17)       -> ATE = 0, ZTE = 1, ZTST = a1       (a1 = 3: GREATER)
ALPHA_1 (0x42) = table[a0]  jtbl_00365990: 0 -> 0x48, 1 -> 0x44, 2 -> 0x42, 3 -> 0x28<<32|0x64, 4 -> 0x68   (a0 > 4: default alpha env)
```
For `(0, 3)`: ALPHA = 0x48 = `A=0 (Cs), B=2 (0), C=0 (As), D=1 (Cd)` = `(Cs - 0) * As >> 7 + Cd`; ZTST GREATER with ZTE on. Used for the strip (both halves).

`func_002349E0(idx, alphaSel, ztst)` (0x002349E0), forwards to `func_002348A8(tbp, tw, th, alphaSel, ztst, 0)`:
```
tbp  = D_002B5DC0[idx]           (word table, filled at run time by func_00233560; zero in the ELF image) -> TBP0 = tbp >> 6  (as 16-bit)
tw   = D_002B5D00[idx*3 + 1] , th = D_002B5D00[idx*3 + 2]      idx 6 and 7: both 6 (64x64)
packet (NLOOP = 9, A+D) via func_00233DD8:
   TEST_1  = 0x10000 | (ztst << 17)           = ZTE 1, ZTST 1 (ALWAYS) for both sprites; ATE 0
   ALPHA_1 = alphaSel ? 0x48 : 0x44           = 0x48 for both sprites (additive: (Cs - 0)*As >> 7 + Cd)
   FBA_1 (0x49), TEXA (0x3B) = 0x81_0000807F, PABE (0x4A)   (sceGsSetDefAlphaEnv, ctxt 0: context 1)
   TEXFLUSH (0x3F) = 0
   TEX1_1 (0x14) = 0x61   (LCM = 1, MMAG = 1 linear, MMIN = 1 linear)           (overwritten by code at 0x002349B4)
   TEX0_1 (0x06) = TBP0 | 1<<14 (TBW) | 0<<20 (PSMCT32) | 6<<26 (TW) | 6<<30 (TH) | 1<<34 (TCC = RGBA) | 0<<35 (TFX = MODULATE) | CLUT fields 0
   CLAMP_1 (0x08) = 5     (WMS = 1, WMT = 1: clamp)
```
(TEX0 packing decoded from `sceGsSetDefTexEnv` 0x002896C0: TBW = (1<<tw)/64 = 1.)
The texture index 7 = TEXCBLUR (sprite 1) and 6 = TEXCNAVI (sprite 2), by facts/clock-textures.md; the actual TBP of each (0x2E40 and 0x2E00 on ROM 2.30) is a run-time table: NOT DETERMINED from this file.
Because TFX = MODULATE and TCC = 1, the sprite shows `Ct * Cv / 128` for colour and `At * Av / 128` for alpha with `Cv`, `Av` the vertex RGBA ints above.

## 3. The rectangle helper `func_00233770(rec)`   0x00233770-0x002337BC

```
pk = local 0x20-byte packet struct on the stack
func_002333E0(pk)           // sceDmaPkInit(pk, spr buffer | 0x70000000, alternating +/-0x2000) ; sceVif1PkEnd ; sceVif1PkOpenDirectCode (PATH2 DIRECT)
func_002335F8(pk, rec)      // tag 1
sceVif1PkCloseGifTag(pk)    // NLOOP := ceil(data dwords / NREG) = 1
func_00233698(pk, rec)      // tag 2 (closed by func_00233438)
func_00233438(pk)           // close tag, close DIRECT, terminate, sceGsSyncPath(0,0), start DMA1 chain from the scratchpad (D1_TADR, D1_CHCR = 0x145)
```
Everything goes through VIF1 DIRECT (PATH2). The state packets of 2.3 go through DMA2 / GIF directly; `sceGsSyncPath(0,0)` (func_00233D90) spins until both DMA1 and DMA2 have STR = 0 before each send.

### Argument record `rec` (uncached 0x202B6170, 0x3C bytes used; ints unless noted)

```
+0x00 R   +0x04 G   +0x08 B   +0x0C A          colour (quad; 32-bit ints)
+0x10 X0  +0x14 Y0                              top-left, 12.4 fixed, in "screen centre = W/2,H/2" space (before the offset below)
+0x18 U0  +0x1C V0                              12.4
+0x20 X1  +0x24 Y1                              bottom-right
+0x28 U1  +0x2C V1
+0x30 Z
+0x34 ABE flag  +0x38 TME flag
```

### Packet 1 (func_002335F8, 0x002335F8)

```
giftag  = D_00365978 = { 0x00008000, 0x24000000, 0x10, 0 } = EOP, NLOOP = 0 (patched to 1), FLG = REGLIST, NREG = 2, REGS = {PRIM, RGBAQ}
PRIM    = 6 | (rec.TME << 4) | (rec.ABE << 6) | 0x100        = SPRITE, TME, ABE, FST = 1; FGE 0, AA1 0, CTXT 0 (context 1), FIX 0
RGBAQ   = R | (G << 8) | (B << 16) | (A << 24) | (0x3F800000 << 32)       R, G, B, A taken unmasked from rec; Q = 1.0
```
Pointer advances 0x20 bytes (tag + one quad).

### Packet 2 (func_00233698, 0x00233698)

```
giftag  = D_002B5E00 = { 0x00008000, 0x24000000, 0x43, 0 } = EOP, NLOOP = 0 (patched to 2), FLG = REGLIST, NREG = 2, REGS = {UV (3), XYZF2 (4)}
W2 = (W + (W>>>31)) >> 1 ; H2 likewise            (W = *(int*)0x1F0CB4, H = *(int*)0x1F0CB8)
ox = (0x800 - W2) << 4 ; oy = (0x800 - H2) << 4
loop 1:  UV    = U0 | (V0 << 16)
         XYZF2 = (X0 + ox) | ((Y0 + oy) << 16) | (Z << 32)          ADC = 0: kick
loop 2:  UV    = U1 | (V1 << 16)
         XYZF2 = (X1 + ox) | ((Y1 + oy) << 16) | (Z << 32)          kick: sprite drawn
```
Register order emitted: PRIM, RGBAQ, UV, XYZF2, UV, XYZF2.

Resulting GS coordinate for a sprite corner: `X_gs = (int)((x +/- hw + W2) * 16.0f) + (0x800 - W2) * 16` (float rounding only in the first term); with the draw environment's `OFX = (0x800 - W/2)*16` the on-screen x is `x +/- hw + W2` in pixels, same for y with H2 (the strip does `(pos + 2048) * 16` directly, the same result).

## 4. The trail while the ring is filling (record+0x08 == 0)   0x0023939C-0x0023954C and 0x00239A0C-0x00239BBC

Branch taken when `*(int*)(record + 8) == 0` (0x002391FC-0x00239200, beqz). The trail loop of the full ring is 0x00239208-0x00239394.

```
n = head - 1                                             0x0023939C-0x002393A0   (head = *(int*)record)
if n <= 0: no points                                     0x002393A4 (blez)
for i = 0; i < head - 1; i++:                            loop end test 0x00239538-0x00239548
    entry = record + 0x10 + 0x20 * (head - i)            0x002393D4, 0x002393E0-0x002393F4
    j     = (i * 50) / (head - 1)                        signed int div (div $zero,a0,v1 ; mflo)  0x002393BC, 0x002393EC, 0x0023946C
    fade  = (int)(128.0f - (float)j * 3.0f)              0x00239470-0x00239484 : cvt.s.w, mul.s 3.0, sub.s from 128.0, cvt.w.s
    fade  = max(fade, 0)                                  0x00239488-0x0023948C (slt/movz)
    X = (int)((x + 2048.0f) * 16.0f) ; Y = (int)((y + 2048.0f) * 16.0f) ; Z = (int)(z * 16.0f)    0x00239400-0x00239458
    colour as in the full-ring branch, with fade (same stepwise integer operations, section 5)
    RGBAQ packet quad, then XYZF2 = X | Y<<16 | Z<<32
```
Entries drawn: `head, head-1, ..., 2` (i = 0 .. head-2): entries 0 and 1 are never drawn in this branch. Number of points = head - 1.

Compared with facts/clock-orbs.md: "the strip has `head - 1` points, entry `head - i`" is CONFIRMED. "`i` is stretched to the same 0..49 range before the fade is taken" is CONFIRMED with the exact formula `j = trunc(i * 50 / (head - 1))` (integer division, last i = head-2 gives j <= 49 but not always exactly 49).
(The fade expression in the full-ring branch is `fade = max(0, (int)(128.0f - (float)i * 3.0f))`, i = 0..48, as the facts page says.)

## 5. Colour arithmetic of the strip (exact integer steps; useful for bit-exact recomputation)

The facts page writes `red = r * fade^4 / 2^28` (each division toward zero). The code does the divisions step by step, each truncating toward zero, so it is not one division:

```
red   = trunc( trunc( trunc( r * fade * fade / 128 ) * fade / 128 ) * fade / 16384 )        0x002392A0-0x00239364 (full), 0x0023944C-0x0023950C (filling)
green = trunc( g * fade * fade / 16384 )
blue  = trunc( b * fade / 128 )
alpha = fade >> 1  (arithmetic)
RGBAQ = red | green << 8 | blue << 16 | alpha << 24 | (0xFE00 << 42)     (Q hi dword 0x03F80000)
```
`trunc(x / 2^k)` is `(x + (2^k - 1)) >> k` when x <= -1 and `x >> k` otherwise (the slt/movn pair). The three parts are ORed with no masking. Note: the facts text agrees on the 128-multiple only if these intermediate truncations are equal to the single division for all inputs, which has not been checked (it was "verified" against Watson, so they agreed on the samples).

## NOT DETERMINED

1. Which FBP the first-half target (draw environment at `0x001F0A70 + 0x140` or `+0x60`, chosen by the int at `0x001F0CA0`) holds: built at run time elsewhere; not read here. Watson measures the frame, whose number I did not confirm statically.
2. Run-time values W, H at 0x001F0CB4/0x001F0CB8 (the 0x0D2 = W*H*3/2048 match assumes 640x224).
3. The meaning of `*(int*)0x002B2178` (D_002B2170 + 8), passed as the `field` argument (only seen: nonzero adds 8 to OFY via `sceGsSetHalfOffset`); other users (`browser_str_related`) read it as well; its writer was not searched.
4. `D_002B5DC0` (the per-texture TBP table, word addresses; filled at run time by `func_00233560`/`clock_load_texture`): TBP0 per texture index (0x2E40 / 0x2E00 are Watson's ROM 2.30 numbers, not HDD OSD's).
5. The ramp `D_002B61B0` counter/max at a given frame (written at run time; only the update rule and set-up were read). In steady state the factor is 1.
6. The ZBP and ZMSK of the second half's draw environment (set inside libgraph's `sceGsSetDefDrawEnv`, not read) and whether sprite Z = 0 with ZTST = ALWAYS actually writes depth (depends on ZBUF.ZMSK).
7. The alpha w3 of other orb colour modes (modes 2 and 3 of `func_00234B80`): only the normal-mode value 60 is known from clock-camera.md.
8. Whether any code writes into the static record `D_002B6170` (U/V/Z/ABE/TME words) at run time: a search of the whole asm tree for the symbol and for 0x2B6170..0x2B61AF found no write outside this function, but writes through computed pointers cannot be excluded.
