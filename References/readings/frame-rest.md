# Rest of the clock frame - HDD OSD 1.10U, read from CrystalOSD/asm

Build: HDD OSD 1.10U (addresses are HDD addresses unless "ROM" is written). Method: read in full
the functions named in the task, plus the helpers they call (one level, small ones fully).
Checks against measured draws use `Watson/Runtime/captures/rom-0230A-clock.jsonl`, frame 1
(global draw index 181 = frame draw 0). "read" = from disassembly, "measured" = jsonl.
No emulator, no file outside this report touched.

Floats/ints are listed as: bits -> value (where loaded). Globals: `[0x1F0CB4]` = screen width (640),
`[0x1F0CB8]` = field height (224), `[0x1F0CA0]` = double-buffer index, `0x1F0A70` = the draw-env
block (sceGsDBuff), `D_002B2178` = field flag passed to sceGsSetHalfOffset, `D_003702D4` = frame
counter, `D_00370AA4` = blur level, `D_00370AB4` = overlay mode, `g_clock_should_render_orbs`
(gp) = overlay level g (0..128).

## 0. Frame order and what each call draws (read, with measured match)

Master `0x00225E80` order, with the measured draw each one produces (frame 1, draw numbers per
`rom-0230A-clock-gs.md`):

| Master call | Draws | Measured match |
|---|---|---|
| `module_clock_226000` | clear, background ribbons, blur round trips (pre-rod), 3 copies, tint copy | draws 0-14 (exact match, section 1) |
| `module_clock_22FE98` | rods, orbs, extra passes | draws 15-169 (not in this task) |
| `module_clock_234E70` | black/white fade overlay sprite (+ optional startup vignette) | draw 170 (colour 0,0,0,0, `(Cs-Cd)*As+Cd`) |
| `module_clock_232458` | `module_clock_232438` = post-rod blur trips (0 in the measured frames), then menu/OOBE pages | no draw in the measured frames |
| `func_002262C8` | calls `func_00226158`: two black letterbox bars | draw 171 (2 sprites in one draw, y 0..27.375 and 196.5625..224) |
| `func_00226300` | date (left) and time (right) text | draw 172 (19 sprites, rgba 96,96,96,128) |
| `func_002269E0` | button hint panel (icon + text) | draws 173 (icon 0x2ec0) and 174 (7 glyphs) |
| `func_00226A88` | black 2 px column at the right edge | draw 175 (x 637.5..639.5) |
| `func_0022F1A0`, `func_00232640` | state only (clock logic; scale easing + blur level) | none |
| `func_00232878` | frame counter++ | none |
| `func_00234EA8` | overlay fade state machine | none |
| `func_00235B10` | time keeping | none |
| `func_00235518` | config save/reload housekeeping | none |
| `func_00235EB0` | pad edge detection | none |

The order of draws 170-175 in the capture is exactly the order of master calls 234E70, 262C8, 26300, 269E0, 26A88.

## 1. `module_clock_226000(view, screen)` @0x00226000

What it does: draws everything before the rods: clears the frame, draws the textured background
ribbons, blurs the result with shrink/stretch round trips, copies the frame into the two work
buffers and then re-draws the frame from work buffer 0x0d2 with a colour tint. Every draw it
makes matches measured draws 0-14 (checked field by field: FBP, TBP, PSM, uv, colour, ALPHA, ZTST).
Not one of them is conditional on menu state except the round-trip count and the ribbons.

Names for the sprite structure used by `func_00233770` (read from `func_002335F8`, `func_00233698`,
base = `D_xxxxxxxx | 0x20000000`, ints):
`+0x00..0x0C` R,G,B,A; `+0x10,+0x14` x0,y0 (1/16 px, relative to the top left, the code adds
`(0x800 - w/2)<<4`, `(0x800 - h/2)<<4`); `+0x18,+0x1C` u0,v0 (1/16 texel); `+0x20,+0x24` x1,y1;
`+0x28,+0x2C` u1,v1; `+0x30` Z; `+0x34` ABE; `+0x38` TME. PRIM written = `6 | ABE<<6 | TME<<4 | 0x100`
(sprite, FST). RGBAQ Q = 1.0. `func_00233770` = PATH2 (VIF1 DIRECT) packet: tag `D_00365978`
(PRIM, RGBAQ) + tag `D_002B5E00` (UV, XYZ2, UV, XYZ2), sent by `func_00233438`.

```
00226004-00226078  s2 = &D_002B21E0 | 0x20000000        ; sprite: rgba (55,40,60,128) from data,
                                                       ; x0=y0=0, u0=v0=8 (=0.5 texel), Z=0, ABE=0, TME=1
                   [s2+0x20] = [0x1F0CB4]<<4            ; x1 = 640
                   [s2+0x24] = [0x1F0CB8]<<4            ; y1 = 224
                   [s2+0x28] = ([0x1F0CB4]<<4) + 8      ; u1 = 640.5
                   [s2+0x2C] = ([0x1F0CB8]<<4) + 8      ; v1 = 224.5
00226080  func_002341C8(0x1F0A70, [0x1F0CA0], &D_002B21D0, [D_002B2178])
              ; draw env of the field buffer, clear colour D_002B21D0 = (0,0,0,128), sends the packet
              ; incl. the clear sprite  -> DRAW 0 (full-buffer untextured sprite, PATH3)
0022608C  module_clock_233338(view, screen)             ; background ribbons -> DRAW 1 (see 1.2)
00226094  v = module_clock_22FEF0()                     ; = D_00370AA4 (blur level)
          n = (v < 6) ? v : 10 - v                      ; 0x2260A0-0x2260BC
002260C8  func_00236490(n)                              ; n round trips -> DRAWS 2..(1+2n)   (see 1.3)
002260D0  func_002342F0(0,0,0)                          ; target := buffer 0x0d2 (FBP 210), no clear
002260E0  func_00233F48([0x1F0CA0])                     ; texture := current frame buffer (PSM 24-bit)
002260EC  func_00236230(0)                              ; full sprite, opaque -> DRAW 12: 0x0d2 <- frame
002260F4  func_002342F0(1,0,0)                          ; target := buffer 0x118 (FBP 280)
00226104  func_00236230(0)                              ; DRAW 13: 0x118 <- frame
0022610C  func_002341C8(0x1F0A70,[0x1F0CA0],0,0)        ; target := frame buffer, no clear
00226124  func_00234070(0)                              ; texture := buffer 0x0d2 (TBP 0x1a40, PSM 32)
00226130  func_00233E70(0,1)                            ; ALPHA mode 0 (Cs-0)*As+Cd, ZTST 1 (ALWAYS)
0022614C  tail call func_00233770(D_002B21E0)           ; DRAW 14: frame <- 0x0d2, colour (55,40,60,128),
                                                       ; TME=1, ABE=0 -> modulate: x (0.43, 0.31, 0.47)
```

Verification (measured, frame 1): draw 0 rgba (0,0,0,0) ... see NOTE below; draw 12
`FBP 210, TBP 2240 PSM 1, uv 0.5..640.5 x 0.5..224.5`; draw 13 `FBP 280` same; draw 14
`FBP 70, TBP 6720 (=0x1a40) PSM 0, rgba (55,40,60,128), ALPHA A=0,B=2,C=0,D=1, TFX 0 (modulate)`.
All equal to the code.

NOTE (clear colour): `func_002341C8` stores the colour only into the clear packet of
draw-env 1 (`env+0x1F0`). For double-buffer index 0 (the case in measured frame 1, FBP 0x046,
TBP 0x08c0) the clear keeps whatever the draw-env had, measured (0,0,0,0). So the measured clear
is colour (0,0,0,0); the code's (0,0,0,128) applies to index != 0 only. Alpha of the frame is
not visible, so for a recreation black is correct either way.

Index/buffer relation (read + measured agree): `func_00233F48(idx)` picks the texture base
`idx == 0 ? 0x8c0 : 0x000` = the current frame buffer; measured frame 1 draws into FBP 0x046 and
samples 0x08c0, so index 0 = FBP 0x046, index != 0 = FBP 0x000.

### 1.1 State helpers used here (read)

- `func_002341C8(env, idx, colourPtr, field)` @0x002341C8: `colourPtr != 0` -> clear RGBAQ at
  `env+0x1F0` = `R | G<<8 | B<<16 | A<<24 | (0x7F<<55 = Q 1.0)`; then `sceGsSetHalfOffset(env.draw[idx != 0],
  0x800, 0x800, field)`; sets the packet's GIF tag NLOOP: 14 regs (with clear) or 8 (no clear)
  (`env+0x140`/`env+0x50`); `func_00233D90` waits for DMA idle; `sceGsPutDrawEnv`. Used with colourPtr = 0 as
  "retarget the draw buffer to the frame buffer".
- `func_002342F0(which, colourPtr, field)` @0x002342F0: packet `D_002B5E30`: `sceGsSetDefDrawEnv`
  640 x 224 PSM32 and `sceGsSetDefClear` (z test GEQUAL, colour 0); FBP =
  `which ? (w*h)>>9 : (w*h*3)>>11` = 280 (0x118) or 210 (0x0d2); NLOOP 14 if colourPtr (clear included,
  colour written at +0xB0) else 8 (draw env only, so no clear sprite); sent with `func_00233DD8` (PATH3).
  All callers in this task pass colourPtr = 0: pure retargeting, no draw.
- `func_00233F48(idx)` @0x00233F48 (A+D packet, 9 regs, SPR ring `D_003702D8 ^ 0x2000`):
  `sceGsSetDefTexEnv(ctx 1, tbp = idx==0 ? w*h/64 : 0, tbw = w/64 = 10, psm 1 (24-bit), tw 10, th 8, tcc 0,
  tfx 0 modulate)`, ALPHA = 0x44, TEST = 0x50000 (ZTE, ZTST 2), CLAMP data `(h-1)<<34|(w-1)<<14|0xA` at +0x90.
- `func_00234070(which)` @0x00234070: same, `tbp = which ? w*h/16 : w*h*3/64` = 0x2300 or 0x1a40,
  psm 0, TEST 0x50000, +0x50 = 0.
- `func_00233E70(mode, ztst)` @0x00233E70: ALPHA by jump table `jtbl_00365990`:
  0 -> 0x48 `(Cs-0)*As+Cd`; 1 -> 0x44 `(Cs-Cd)*As+Cd`; 2 -> 0x42 `(0-Cs)*As+Cd`;
  3 -> `0x64 | 0x28<<32` `(Cs-Cd)*FIX+Cd`, FIX 0x28; 4 -> 0x68 `(Cs-0)*FIX+Cd`, FIX 0; >= 5 default env;
  TEST = `(ztst<<17) | 0x10000` (ZTE on). ZTST 1 = ALWAYS, 2 = GEQUAL, 3 = GREATER.
- `func_00236230(abe)` @0x00236230: sprite `D_002B6060` rgba (128,128,128,128), x0=y0=0, u0=v0=8,
  x1 = w<<4, y1 = h<<4, u1 = (w<<4)+8, v1 = (h<<4)+8, TME 1, `[+0x34] = abe`;
  `func_00233E70(1,1)` (ALPHA 0x44, ALWAYS); `func_00233770`; `sceGsSyncPath(0,0)`.

### 1.2 Background: `module_clock_233338(view, screen)` @0x00233338 and the ribbons

```
00233338  func_00234B10(D_002B5CD0)                     ; tick the colour ramp (see 5)
          if (func_00234A98(D_002B5CD0, 0) == 0)        ; ramp state != 0
              func_00233258()  ;  D_00370AA8 = D_00370AAC = D_00370AB0 = counter * 0x28 / N   ; grey 0..40
          if (D_00370AB4 == 0)                          ; overlay mode normal  (func_00234B80)
              tail func_002332B0(view, screen)          ; ribbons
```
The grey is the base of the ribbon vertex colours (measured base 40 = ramp full). N =
`D_003702E0` = 40 (NTSC) / 33 (PAL) (`func_00234B88` @0x00234B88). The ramp starts with
`func_002331C8` (called from `StartSysConfig` @0x00230F10) and runs down with `func_00233210`
(called at 0x002310C0, in `func_00230FD8`); initial state 0 with grey 0 (`func_00232858`).

`func_002332B0(view, screen)` @0x002332B0:
```
002332DC  func_002349E0(1, 1, 2)   ; texture resource 1 (TEXCKABE, TBP 0x2c00, 128x128, tw=th=7, PSM32),
                                    ; ALPHA 0x48, TEST ZTE ZTST=2 (see NOTE below)
          s0 = 0
          do { func_00232888()                           ; PRIM data 0x1C = tristrip, IIP(Gouraud), TME, ST (not UV)
               func_00233110(view, screen, a2 = s0, a3 = s0 + 0x1000, f12 = D_0036FC30)  ; D_0036FC30 = 0x45BB8000 = 6000.0
               s0 += 0x1000 } while (s0 <= 0xFFFF)       ; 16 strips, each 1/16 turn
```
`func_00232888` @0x00232888: A+D packet, tag `D_002B5CE0`, data 0x1C to register 0 (PRIM).
`func_00233110` @0x00233110: starts a PATH2 packet, GIF tag `D_002B5CF0` = REGLIST, NREG 3, regs
{RGBAQ, ST, XYZ2} (REGS word 0x421, EOP, NLOOP fixed by `func_00233438`), then
`func_00232960(...)` (33 vertex pairs) and `func_00232EB8(...)` (1 final pair), then `func_00233438`.

NOTE ZTST: the measured draw 1 has ZTST 3 (GREATER) and TEXTURE ALPHA... the HDD code passes 2
(GEQUAL) via `func_002349E0` -> `func_002348A8` (`TEST = (2<<17)|0x10000`). Either the builds differ
or the measured page's value is for the ROM code; both draw the same result (nothing else has been drawn
at that depth). Measured: tex TBP 11264 (0x2c00), TW 7 TH 7, ALPHA 0x48 (A0,B2,C0,D1), ABE 0, IIP 1, TFX 0.

`func_00232960(view, screen, ang0, ang1, R, cursor)` @0x00232960 - the strip (read in full,
verified against measured vertices, see "Verification" below). Notation: `sin(a)`/`cos(a)` =
`func_00239FF0` / `func_0023A040` on a 16-bit angle (table `D_0040EAA0`, 65536 = turn).
```
a = (s16)ang0, b = (s16)ang1
P0 = ( R*sin a, R*cos a, 0, 1 )          ; 0x232994-0x232A28    R = 6000.0
P1 = ( R*sin b, R*cos b, 0, 1 )
u0 = ang0 / 65535.0 (f28)   u1 = ang1 / 65535.0 (f27)           ; D_0036FC18 = 0x477FFF00 = 65535.0
offA = (int)((cos a + 1.0) * 10.0)   offB = (int)((cos b + 1.0) * 10.0)   ; 0x41200000 = 10.0
for i = 0..32 (s4):                                              ; 0x232B08-0x232E5C
    v      = i * 0.03125 + (D_003702D4 % 5000) * D_0036FC1C     ; 0x3D000000 = 1/32 ; 0x3951B717 = 0.0002
    wob    = 1.0 + sin( (s16)(D_003702D4 * 100 + i * 0x1400) ) * D_0036FC20   ; 0x3D4CCCCD = 0.05
    s      = ((32 - i)^3) >> 10                                  ; 32 at i=0, 0 at i=32
    c1 = D_00370AA8 + ((230 * s) >> 5)        ; 0xE6
    c2 = D_00370AAC + ((260 * s) >> 5)        ; 0x104
    c3 = D_00370AB0 + ((260 * s) >> 5)
    V0 = P0 * wob (xyz), V1 = P1 * wob, V0.z = V1.z = i * 1250 - 2500       ; 0x4E2, 0x9C4
    V0 = M_view * V0 ; V1 = M_view * V1                          ; sceVu0ApplyMatrix(arg a0)
    if (V0.z < 2050.0 || V1.z < 2050.0) continue                 ; D_0036FC14 = 0x45002000
    q0 = func_002328D8(screen, V0, V0) ; q1 = ... V1             ; V = Screen*V, V *= 1/w ; returns 1/w
    if (|V0.x - 2000| > 1000 || |V1.x - 2000| > 1000 ||
        |V0.y - 2000| > 1000 || |V1.y - 2000| > 1000) continue   ; 0x44FA0000 = 2000.0, 0x447A0000 = 1000.0
    ST0 = ( u0 * 3.0 * q0, v * 3.0 * q0 )  ; func_00232938: 0x40400000 = 3.0 ; ST1 = ( u1*3*q1, v*3*q1 )
    emit: RGBAQ(c1+offA, c2+offA, c3+offA, 0x40, Q=q0), ST0, XYZ2(V0*16 as ints incl. z),
          RGBAQ(c1+offB, c2+offB, c3+offB, 0x40, Q=q1), ST1, XYZ2(V1*16)
```
`func_00232EB8(view, screen, ang0, ang1, cursor)` @0x00232EB8: the closing pair:
```
v   = (D_003702D4 % 5000) * D_0036FC24 + 1.0                     ; 0x3951B717 = 0.0002
A = B = ( 0, 0, 38750.0, 1.0 )                                   ; D_0036FC2C = 0x47175E00 (the axis, far end)
A = M_view*A ; B = M_view*B ; q0 = func_002328D8(...A) ; q1 = ...B
ST0 = ( (ang0/65535) * 3 * q0 , v * 3 * q0 ) ; ST1 = ( (ang1/65535) * 3 * q1, v * 3 * q1 )
emit RGBAQ(D_00370AA8, D_00370AAC, D_00370AB0, 0x40, Q=q0), ST0, XYZ2(A), same for B  ; no angle/gradient offsets
```
Meaning: a tube (radius 6000 with a 5 % travelling ripple, ripple phase = frame*100 + 5120*i
sixty-five-thousandths of a turn) seen from inside, 16 wedge strips of 33 rings each, ring spacing 1250
along the axis starting at -2500, closed by a point at the axis (z = 38750). Rings with view z < 2050
(near plane) are skipped (measured: first emitted ring is i = 4). Texture TEXCKABE repeats 3 times
around and 3 times along the tube (S, T multiplied by 3, perspective-correct through Q = 1/w), scrolling
along T by `(frame % 5000)/5000` of the 3-repeat period per frame step, i.e. one full tile cycle in 5000 frames;
colour = base grey (0..40) + a brightness gradient that falls with the ring index + `(cos(angle)+1)*10`
(0..20 per wedge side) with A = 0x40; texture function modulate.

Verification (measured draw 1 first vertices): `rgba (210,230,230,64)` then `(209,229,229,64)`.
Code: i = 4 -> s = 21: c1 = 40 + (230*21>>5 = 150) + 20 = 210; c2 = 40 + (260*21>>5 = 170) + 20 = 230;
offA = 20 at angle 0, offB = 19 at b = 0x1000 (cos 22.5 deg = 0.924 -> 19). Exact. Totals: 16 strips,
944 vertices and 912 triangles measured; the code emits 34 pairs per strip minus culled ones.
Overflow note: at i = 0..3, `c2` can exceed 255 (260 + 40 + 20); those rings are always behind the near
plane in this camera, so never emitted. A recreation should clamp or skip them the same way.

`D_003702D4` frame counter: reset to 0 by `func_00232858` (init), incremented by `func_00232878`
@0x00232878 (`D_003702D4 += 1`, called once per frame at the END of the master function).

### 1.3 Blur: `func_00236490(n)` @0x00236490 (called with n = `D_00370AA4` mapped as above)

```
for k = 0 .. n-1:                                     ; s6 = 0x954, s1 = 0x13F4, s5 = 0x95C at start
    func_00235FE0(1,0,0)      ; = func_00233F48(idx) [tex := frame] + func_002342F0(1,0,0) [target := 0x118]
    func_00233E70(1,1)        ; ALPHA 0x44, ZTST ALWAYS
    D_002B6120 sprite (rgba 128,128,128,128, TME 1, ABE 0, u0=v0=8, x0=y0=0, Z 0):
        x1 = s1 (=0x13F4 - 0x20 k)       y1 = s6 (=0x954 - 0x10 k)
        u1 = (w<<4)+8                    v1 = ((h-1)<<4)+8
    func_00233770               ; DRAW A: frame (full) -> 0x118 rect 319.25 x 149.25  (k=0)
    func_002360A8(1,0,0)        ; = func_00234070(1) [tex := 0x118, TBP 0x2300] + func_002341C8(env, idx, 0, 0) [target := frame]
    func_00233E70(1,1)
    sprite: x1 = w<<4, y1 = (h-1)<<4, u1 = s1_old + 8, v1 = s5     ; s5 = 0x95C - 0x10 k
    func_00233770               ; DRAW B: 0x118 corner (0.5..319.75 x 0.5..149.75) -> frame 640 x 223, linear filter
    sceGsSyncPath(0,0)
    s1 -= 0x20 ; s5 -= 0x10 ; s6 -= 0x10
```
Per trip the sampled/drawn rectangle shrinks by 2 px in x and 1 px in y; filter is bilinear (TEX1 0x61).
No blending (ABE 0), no z test effect (ALWAYS), Z written = 0 (the sprites reset the depth to 0 inside the
rectangle). Verified: measured draws 2-11 (frame 1) have exactly these rectangles: 319.25x149.25 / 640x223 with
uv 0.5..319.75 x 0.5..149.75, then 317.25x148.25, 315.25x147.25, 313.25x146.25, 311.25x145.25.

There is no temporal feedback: every frame starts from the clear, the "soft glow" of the background is only
this intra-frame down/up-sampling plus the fixed tint copy.

Blur level `D_00370AA4` (written by the second half of `func_00232640` @0x00232640, read at 0x0022FEF0):
```
c = counter of ramp D_002B5780 (N = D_003702CC + D_003702D0 = 40 + 10 = 50 on NTSC; D_003702D0 = 60/6 = 10, 50/6 = 8 PAL; set in func_002324C8)
D_00370AA4 = (c < D_003702D0) ? 10 - c*10/D_003702D0 : 0          ; 0x002326B0-0x002326D8
pre-rod trips  n_pre  = (v < 6) ? v : 10 - v                       ; module_clock_226000
post-rod trips n_post = (v >= 5) ? v - 5 : 0                       ; module_clock_232438 @0x00232438, called first by module_clock_232458
```
The post trips use the same `func_00236490` and blur the whole composed scene (rods, orbs, extra passes) but not bars/text,
because 232458 runs before 262C8/26300. Measured: 5 pre trips in all four captured frames (v = 5), 0 post trips.
Why v is 5 and constant in a clock-only capture, while this rule gives 0 for c >= 10: NOT DETERMINED
(see list at the end).

## 2. `module_clock_234E70` @0x00234E70 (fade overlay; startup vignette)

```
00234E7C  func_00234B10(D_002B5F20)                 ; tick ramp R2 (N = D_003702E4 = 80 NTSC / 66 PAL; func_00234B88)
00234E84  if (func_00234B80() == 0)                 ; D_00370AB4 == 0 (normal mode)
              func_00234D60()                       ; vignette, only while ramp R2 state != 0
00234EA0  tail func_00234E08()                      ; the overlay sprite
```
`func_00234E08` @0x00234E08: `func_002341C8(0x1F0A70,[0x1F0CA0],0,0)`; `func_00233E70(1,1)`;
sprite `D_002B5F30` (x1 = w<<4, y1 = h<<4 set by `func_00234C28`; ABE 1, TME 0; RGB = (0,0,0) or white
(255,255,255) set by `func_00234C28`); `[+0xC] (alpha) = 0x80 - g` (g = `g_clock_should_render_orbs`); `func_00233770`.
Blend `(Cs - Cd)*As + Cd` with As = 128 - g: g = 128 -> alpha 0, no change; g = 0 -> the frame is replaced by
the sprite colour. Measured draw 170: rgba (0,0,0,0), ABE 1, ALPHA A0 B1 C0 D1, TBP irrelevant: exact.
It is a full-screen fade, executed after rods/orbs and before bars/text (so bars and text are not faded).

Overlay modes (`D_00370AB4`, set by `func_00234C28(mode)` @0x00234C28, init `module_clock_init_resources` calls mode 2 at 0x00225E60):
1 = white sprite, g := 0; 2 = black, g := 0; 3 = black, g := 128 and `func_00234D18` (ramp R2 down); 4 = black, g := 0;
others no-op. `func_00234EA8` @0x00234EA8 each frame: mode 1 or 2: `g += 1`, at g > 128 g := 128 and mode := 0; mode 2
also calls `func_00234CD0` (starts ramp R2) when `g == 0x80 - D_003702E4` (= 48); mode 3: `g -= 1`, clamped at 0 (mode
stays 3). So a startup fade-in lasts 128 frames; in mode != 0 the background ribbons are NOT drawn (233338 checks
`D_00370AB4 == 0`). Steady state: mode 0, g = 128, overlay alpha 0.

`func_00234D60` @0x00234D60 (only if ramp R2 state != 0 and mode 0): `D_002B5F70 = { alpha = counter*128/N, cx = 0x10A0 (266 px),
cy = (h/2)<<4, rx = 0x4A0 (74 px), ry = 0x250 (37 px), ... }`; `func_00233E70(1,2)`; `func_00233D00(D_002B5F70)`.
`func_00233D00` @0x00233D00: 16 sectors (angle step 0x1000) of `func_00233A40` = triangle strips (PRIM 0x4C: strip, Gouraud,
ABE) between ellipse radii 1.0 and 1.5 (x `cx + sin*rx*r`, y `cy + cos*ry*r`, then a ring clamped to the screen edge at r = 10, via
`func_00233970/002339D8/00233818`); vertices black with alpha 0 inside and `alpha` outside: an elliptical black vignette.
Not drawn in the measured frames (R2 state 0 there); radii/colour details NOT DETERMINED.

## 3. `module_clock_232458` @0x00232458 (menu / first-run pages)

Calls in order: `module_clock_232438` (post-rod blur trips, section 1.3), `module_clock_230C00`, `module_clock_230DF0`,
`module_clock_229828`, `module_clock_22A990`, `module_clock_231E48`, `func_00232408`, `oobe_handler`, `func_0022AF60`,
`func_0022B3A8`, `func_0022D828`, tail `func_0022D5D8`. Read one level down (not in full):
each begins with `func_00234B10(ramp)` (animation ramp tick) and then updates/draws one menu page.
`230C00` (ramp D_002B5740, N 40) -> `module_clock_230550`, `module_clock_2308F0` (menu transition; reads `D_00370AA4`
at 0x00230B60 and runs a third blur chain `func_00236350(5 - v)` for v < 5, plus `func_00236058/00236110`);
`230DF0` (ramp D_002B5780 = the clock<->menu ramp that drives the blur level) -> `func_00230D58` (state 1: at counter == D_003702D0 calls
`func_002303C8`; state 2: pad bit 0x80 in `D_00370334` -> `func_00230CE8` ramp down + sound 0x6300);
`229828` -> `func_00229028/00229080`; `22A990` -> `func_0022A360/22A410`; `231E48` (ramp D_002B2E04) -> `func_00230FD8`,
`browser_str_related`; `func_00232408` (ramp D_002B2E78) -> `func_002320B0`, `draw_clock_menu_items_hkdosd_p4_tgt`, `menupos`;
`oobe_handler` (462 lines, first-run intro with `oobe_load_image`, text, language); `func_0022AF60/0022B3A8/0022D828/0022D5D8`:
menu item rendering, config-dirty check, intro state machine (`func_00234C28` mode changes, sounds).
In the measured clock-only frames none of them issues a draw. For a clock-only recreation they can all be left out
except `module_clock_232438`'s post-rod blur if the blur transition is wanted (section 1.3).

## 4. `func_002262C8` @0x002262C8 and `func_00226158` @0x00226158 (letterbox bars)

```
002262D0  v = *module_clock_get_config_item(0)          ; item 0, int at D_00409130 (bss, no initial value)
          if (v == 0 || v == 2) tail func_00226158()    ; otherwise nothing
```
`func_00226158` (bars; constants 0x3D800000 = 0.0625 (f23), 0x41100000 = 9.0 (f22), 0x3F000000 = 0.5 (f21), 0x41800000 = 16.0 (f20)):
```
sprite D_002B2220 | 0x20000000: rgba (0,0,0,128), x0 = 0, ABE 0, TME 0 (black, untextured, opaque), x1 = [0x1F0CB4]<<4
func_002341C8(0x1F0A70, [0x1F0CA0], 0, 0) ; func_00233E70(1,1)
B  = ( w / D_002B217C ) * 0.0625 * 9.0 * D_002B2180        ; D_002B217C = 1 (ax), D_002B2180 = 0.47 (ay NTSC) / 0.5405 (PAL)  -> 169.2
m  = (h - B) * 0.5                                          ; 27.4
bar 1: y0 = 0 ,            y1 = (int)(m * 16)         = 438  (27.375)       -> func_00233770
bar 2: y0 = (int)((h - m) * 16) = 3145 (196.5625), y1 = h<<4 -> func_00233770 (tail call)
```
Verified: measured draw 171: two sprites, y 0..27.375 and 196.5625..224, x 0..640, rgba (0,0,0,128), ABE 0, TME 0.
Meaning: 16:9 letterbox of the 640 x 224 field (`ax`, `ay` are the screen matrix proportions of `clock-camera.md`).
Config item 0 meaning: NOT DETERMINED (values 0, 1, 2 appear; 0 and 2 draw the bars; 2 also moves the text, see 6, 7).

## 5. Ramp objects (helpers for 234E70 / 233338 / 230D58 etc.) (read)

Struct `{ +0 N, +4 counter, +8 changed, +C state }`. `func_00234B10` (tick, called once per frame per ramp):
`changed := 0`; state 1: `counter++`, at `counter == N` -> state 2, changed := 1; state 3: `counter--`, at 0 -> state 0, changed := 1.
`func_00234A98(r, s)` = (state == s); `func_00234A68(r)` = counter; `func_00234A70(r, k)` = counter * k / N;
`func_00234AB0` reset; `func_00234AC0` state 0 -> state 1, counter 0; `func_00234AE0` state 2 -> state 3, counter N.
Ramps seen: `D_002B5CD0` (background grey, N 40), `D_002B5F20` (vignette, N 80), `D_002B5740` (N 40), `D_002B5780` (clock<->menu, N 50).

## 6. `func_00226300` @0x00226300 (date and time text, top line)

```
00226324  v = *get_config_item(0)
          y = (v == 2) ? 32 : 14                       ; v < 0, 0, 1, > 2 -> 14 ; (s3)
00226350  if (is_pal_vmode() == 1) y = (int)((float)y * D_00365570 / D_00365578)   ; 0.5405 / 0.47 (doubles)
          func_002341C8(0x1F0A70, [0x1F0CA0], 0, [D_002B2178])
          Font_SetRatio(D_0036FB94)                    ; 0x3F547AE1 = 0.83
          a = func_00230008()                          ; text alpha 0..128 = (menu fade) * g / 128; 128 in steady clock (measured 128)
          Font_SetColor(0x60, 0x60, 0x60, a)           ; measured rgba (96,96,96,128)
          date = do_format_date(item6, item7, item8, item14)       ; items read via get_config_item(6,7,8,14)
          Font_SetLocate(0x16, y) ; Font_PutsPackets(date)                              ; x = 22
          s = sprintf(buf, "%s %s", dst ? "r0.88o020r0.00" : "", do_format_time(item9, item10, item11, item13))
                                                       ; "%s %s" at 0x370130; strings at 0x365558 (font markup) / D_00370138 ("")
          Font_SetLocate( [0x1F0CB4] - func_00213EE8(buf) - 0x16 , y ) ; right aligned, 22 px margin
          Font_PutsPackets(buf)
```
Measured: one draw, 19 sprites, x 22..620, y 11.125..27.375, rgba (96,96,96,128), texture 0x2f05 4-bit font: matches
(date glyphs + time glyphs batched into one draw). The y values: 14 is the pen position; glyph box 11.125..27.375 measured.
The font and its texture/atlas are outside this task. Text alpha function `func_00230008` @0x00230008: base 128; if the
fade struct reached by `func_0022D6A8` is not in state 0 and the one by `func_0022E300` is in state 0 the alpha is 0, else
`clamp(counter(D_002B2E04) - (D_003702E0 + D_003702CC), 0, D_003702D0) * 128 / D_003702D0`; result `* g / 128`.
The meaning of the "r0.88o020r0.00" markup (daylight saving flag, `config_get_daylight_saving`): NOT DETERMINED.

## 7. `func_002269E0` @0x002269E0 and `func_00226958` (button hint panel)

```
y = func_00226958()    ; 0x00226958: y = (item0 == 2) ? 182 : 200 ; PAL: y * 0.5405 / 0.47 (D_00365590 / D_00365598)
a = func_0022FFF0()    ; = (D_002B2E00 == 1)
if (a)  { draw_button_panel(7, 0x80, y); return }
if (func_002266B8() /* D_00370140 */) draw_button_panel(8, D_0037013C /*128*/, y)
for p = 0..6: al = func_002326F0(p)                      ; per-page fade 0..128, jump table jtbl_00365960 for p=1..6:
        p1 func_00231E78, p2 func_00230E10, p3 func_0022A238(1), p4 func_0022A238(0), p5 func_00228F40, p6 func_00230C28
        if (al > 0) { draw_button_panel(p, al, y); return }
```
`func_00230C28`: `clamp(counter(D_002B5780) - 40, 0, 10) * 128 / 10` = fade-in during the last 10 frames of the 50 frame clock
ramp: this is the clock screen panel (p = 6). `draw_button_panel` @0x00226770: `func_002341C8(...)`, `Font_SetRatio(D_0036FB98 = 0.8)`, then for 4 slots
reads string id `D_002B2318 + p*0x14 + 4*slot` (+0xA0 if the video mode flag; panel 8 uses `D_002B2300`, all ids 1 = skip) and, per
non-skipped slot, `DrawIcon(D_002B24F0[slot] = {2,4,5,3}, x = D_002B2470[lang*4 + slot], y, alpha)` and
`DrawNonSelectableItem(x + 0x1C, y + 1, D_002B2460 = (96,96,96,128), alpha, text)`; slot 3 is right aligned.
Panel 6 row = `{0x5e, 1, 1, 1}`: one slot, text id 0x5e; icon x = 24 for languages 1..5 (20 for language 0), text x = 52.
Measured: icon sprite (texture 0x2ec0) 24..49 x 200..212, rgba (128,128,128,128); 7 text sprites x 52..137, y 197.25..212.25: match
(draw 173/174). The text of id 0x5e is "Display" per the measured page; the string table is not read here.

## 8. `func_00226A88` @0x00226A88 (right edge column)

```
D_002B2500 | 0x20000000: rgba (0,0,0,128), ABE 0, TME 0
x0 = ([0x1F0CB4] << 4) - 0x28 ; x1 = ([0x1F0CB4] << 4) - 8 ; y0 = 0 ; y1 = [0x1F0CB8] << 4
func_002341C8(0x1F0A70, [0x1F0CA0], 0, 0) ; func_00233E70(1,1) ; tail func_00233770
```
Measured draw 175: x 637.5..639.5, y 0..224, rgba (0,0,0,128): exact. Opaque black 2 px column on the right edge (overscan mask).

## 9. `func_00232878` @0x00232878, `func_00234EA8` @0x00234EA8, `func_00235518` @0x00235518, `func_00235EB0` @0x00235EB0

- `func_00232878`: `D_003702D4 += 1` (frame counter used by the background ripple/scroll).
- `func_00234EA8`: overlay level state machine (section 2).
- `func_00235518`: `func_00235448` (pack config items into nibbles at 0x1F1284 and queue `write_osd_config` when
  `var_config_ps1drv_dirty`), `config_save_clock_osd`, clears `var_config_writeinprogress` when `func_00212448(1,0)` is true, and
  `config_load_clock_osd` unless `is_config_dirty`. No draw; only matters for settings persistence.
- `func_00235EB0`: pad edge detector: when `[0x1F0CDC]` is 2 or 6: `cur = ~(([0x1F0CBE] << 8) | [0x1F0CBF])` (byte-wise, active-high) else 0;
  `D_00370330 = cur`; `D_00370338 = (cur ^ prev) & ~cur` (released); `D_00370334 = (cur ^ prev) & cur` (pressed);
  `D_0037033C` = repeat bits: for 0x1000 (up) counter `D_00370AD0` (+1 while held else -1): at 0 -> bit set, at counter > 30 every
  3rd frame the bit is set; same for 0x4000 (down) with `D_00370AD4`. No draw.

## 10. Answers

(a) Background before the rods: untextured black clear (draw 0), then 16 Gouraud triangle strips (`module_clock_233338` ->
`func_002332B0` -> `func_00233110`: `func_00232960` + `func_00232EB8`), texture TEXCKABE (TBP 0x2c00, 128x128, modulate,
ABE 0), a tube of radius 6000 (+5 % ripple `1 + 0.05 sin(frame*100 + i*5120)`) around the z axis, rings i = 0..32 at z = 1250 i - 2500,
closed by the axis point z = 38750, wedges of 0x1000 (1/16 turn); ST = 3 * (angle/65535, i/32 + (frame % 5000)/5000) * (1/w); vertex
colour = grey ramp (<= 40) + (230 or 260) * ((32-i)^3 >> 10) / 32 + (cos(angle)+1)*10, A = 0x40; near plane view z >= 2050 and a +/-1000
window around (2000, 2000) cull whole rings. Only drawn when the overlay mode is 0. After the blur the frame is re-drawn from
the untinted copy with colour (55,40,60) (modulate) so the background is dark; the rods refract the untinted copy in 0x0d2.
(b) Blur/feedback chain: `func_00236490(n)`: n x { frame -> 0x118 as a 319.25 x 149.25 rect (bilinear), then 0x118 corner -> frame 640 x 223 },
rectangle shrinking 2 px / 1 px per trip, opaque, colour 128, Z = 0; then frame -> 0x0d2, frame -> 0x118 (full opaque copies), then frame <- 0x0d2
with colour (55,40,60,128). n = triangle wave of the transition level (0..5 before the rods; `module_clock_232438` adds v - 5 trips after
the rods). All intra-frame; no accumulation between frames in these functions. The two soft-glow passes after the rods are in `module_clock_22FD90` (not here).
(c) Thin wireframe sphere (line primitives): none of these functions draws lines. Line primitives in the measured frame are the orb line strips (48 segments),
sent by the orb function `module_clock_239078` (`clock-orbs.md`), not by these.
(d) Menu/text only, can be left out of a clock-only picture: `module_clock_232458` (all of it, except `module_clock_232438` when reproducing the blur transition),
`func_00235518` (config), `func_00235EB0` (pad), `func_00232878`/`func_00234EA8` (the former is needed for the background animation, the latter only for the
startup/transition fade); `func_00234D60`/`func_00233D00` (startup vignette). Needed for the picture: 226000, 234E70 (overlay), 232878 (frame counter),
262C8 + 226158 (bars), 226300 (date/time), 269E0 (hint, optional), 226A88 (right column).

## NOT DETERMINED

1. Why the measured frames have 5 pre-rod blur trips constantly: the HDD rule gives `v = 10 - counter` for counter < 10 else 0; a steady 5 would need the
   ramp D_002B5780 stuck at counter 5, or a build difference. Needs a live read of `D_00370AA4` (ROM counterpart) and `D_002B5780`.
2. ZTST of the background strips: HDD code passes 2 (GEQUAL), measured draw 1 has 3 (GREATER). Build difference not resolved.
3. Meaning of config item 0 (values 0/1/2 control bars and text y); meaning of the "r0.88o020r0.00" markup.
4. CLAMP register: the A+D packets of `func_00233F48/00234070/002348A8` write `(h-1)<<34|(w-1)<<14|0xA` at +0x90 whose address slot I could not tie;
   measured CLAMP is 0 (draws using the frame/buffer 0x118 as 24-bit texture) and 5 (WMS=WMT=1, draws using 0x0d2/0x118 as 32-bit texture) - take the measured values.
5. The startup vignette `func_00233D00` (radii, colours, exactly when ramp D_002B5F20 returns to state 0); and the three further blur/transition helpers
   `func_00236058/00236110/00236350` and `module_clock_2308F0`, `module_clock_230550`, `oobe_handler` and the other `module_clock_232458` callees (read only by their call lists).
6. The ROM 2.30 addresses of `func_00236490` and `func_00236230` (not placed in `clock-function-map.md`; arithmetic matches the measured draws).
7. Whether the background colour ramp D_002B5CD0 is started at boot: the only caller of `func_002331C8` found is `StartSysConfig` @0x00230F10; boot state is 0
   (grey 0). The measured frames have grey 40 (ramp complete).
