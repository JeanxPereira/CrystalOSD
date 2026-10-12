# Rod texture offsets and extra-pass sends (HDD OSD 1.10U, read statically)

Notation. `rod` = a0. `phase = (float)rod[+0x00] * K` (K = 0x3DCCCCCD = 0.1f). `i` = face index.
`s = rod[+0x6C]`. `t` = f12 argument. `FLAG(face)` = int at face_record+0x150. Face records: set A at
0x00409280, set B at 0x0040BE80, 0x160 bytes each.
`emit(face, col, ds, dt)` = `func_00236A20(a0=face, a1=col, f12=ds, f13=dt)`.
Constants were read from hddosd.elf at the address of each `%gp_rel(D_xxxxxxxx)` symbol.

| Symbol | Hex | Value | Used for |
|---|---|---|---|
| D_0036FC58 | 3DCCCCCD | 0.1 | phase factor, 237A28 (0x00237A2C) |
| D_0036FC5C | 3F666666 | 0.9 | cx, cy factor, 237A28 (0x00237AC0) |
| D_0036FC60, 64, 68, 6C, 70, 74 | 3DCCCCCD | 0.1 | per-face step `c`, 237A28 (sites below) |
| D_0036FC78 | 3DCCCCCD | 0.1 | phase factor, 2384C8 (0x002384CC) |
| D_0036FC7C | 3F666666 | 0.9 | cx, cy factor, 2384C8 (0x0023855C) |
| D_0036FC80, 84, 88, 8C, 90, 94 | 3DCCCCCD | 0.1 | per-face step `c`, 2384C8 (sites below) |
| immediate | 41D00000 | 26.0 | `lui $at` at 0x00237BE8 and 0x00238694 |
| immediate | 3F800000 | 1.0 | `lui $at` at 0x00237BA8 and 0x00238644 |

Both functions: return at once if `rod[+0x6C] < 0` (0x00237A88 / 0x00238524). Split test is
`c.lt.s 0, t; bc1f` (0x00237ABC..0x00237AD4 / 0x00238558..0x00238570): split branch iff `0 < t`, else unsplit.
Before the test, both call `func_00237010(&cx,&cy,&cz, 0x409280, rod)` on the original rod and do `cx *= 0.9, cy *= 0.9`
(stack 0x1C0, 0x1C4). In the split branch these cx, cy stay the ones of the unsplit rod (later `func_00237010`
calls write their centre outputs to sp+0x1CC.., which is never read).

## 1. module_clock_237A28(rod=a0, colour=a1, t=f12, n=f13)

### 1.1 How the two pieces are built (split branch, 0x00237ADC..0x00237C48)

Frame: copy A = sp+0x000..0x0DF, copy B = sp+0x0E0..0x1BF; each is a verbatim copy of `rod[0..0xE0)`
(loops 0x00237B04..0x00237B70). Pointers (+0x04 count, +0x08.., +0x60, +0x64) are shared; only these differ:

```
A.+0x90 = n                                         0x00237B78
A.+0x6C = t * rod[+0x6C]                            0x00237B74..0x00237B80  (y scale of piece A)
A.+0x80..+0x8F = 16 bytes at *colour                0x00237B84..0x00237B88  (base colour R,G,B,.)
func_00237010(sp+0x1CC x3, 0x409280, A)             0x00237B90..0x00237BA0  -> face records set A
B.+0x6C = (1.0 - t) * rod[+0x6C]                    0x00237BA8..0x00237BC0  (y scale of piece B, sp+0x14C)
B.matrix (+0x20, sp+0x100) translated:              0x00237BBC..0x00237C28
   M = func_0023A158() = 0x0041EAB0 + D_00370344*64   (top of a matrix stack; read in align_03B154.s)
   *M = B.matrix (4 quads)
   module_clock_23A418(0, rod[+0x6C] * 26.0 * t, 0)   (args set 0x00237BE4..0x00237C00)
      -> module_clock_23A3C0: row3 of *M := sceVu0ApplyMatrix(*M, (0, y, 0, 1)), y = rod[+0x6C]*26*t
         (0x0023A3C0..0x0023A3FC), i.e. translate along the matrix's own local y by y
   B.matrix = *M (4 quads copied back)
func_00237010(sp+0x1CC x3, 0x40BE80, B)             0x00237C2C..0x00237C40  -> face records set B
```
Order: A scale, A colour, A transform, B scale, B matrix translation, B transform. B keeps the rod's own +0x80 colour
and +0x90 strength. The 26 term uses `t` only and the ORIGINAL `rod[+0x6C]`, not the scaled one.

Face ranges: piece A draws only `i >= 8` (`slti i,8 -> skip`, e.g. 0x00237CA0..0x00237CA4); piece B draws all `i`
except 8 and 9 (`sltiu (i-8),2 -> skip`, e.g. 0x00237CF8..0x00237D00). Loops run `i = 0..count-1`; count A = `sp[+0x04]`,
count B = `sp[+0xE4]` (both = rod[+4]). Piece A reads records at 0x409280 and passes rod copy A (`sp`); piece B reads
0x40BE80 and passes copy B (`sp+0xE0`). `func_00236988` gets f12 = [sp+0x1C0], f13 = [sp+0x1C4] (cx, cy).

### 1.2 Split branch sends (each: A loop, then B loop, then `func_00238DB0`)

`func_00233E70(mode, ztst)`; refracted = `func_00236988(face, rodcopy, add)`. In the textured loops f12/f13 are the
final ds/dt at the `jal` (f13 computed in the delay slot).

```
send1 (0x00237C4C..0x00237D40)
  func_00236058(1,0,1); func_00233E70(1,1); header quad D_003659E0+0x00
  A: i>=8 && FLAG==0            : func_00236988(face, sp,      0)   0x00237CA0..0x00237CD4
  B: i not in {8,9} && FLAG==0  : func_00236988(face, sp+0xE0, 0)   0x00237CF8..0x00237D30
send2 (0x00237D48..0x00237E6C)
  func_002349E0(2,1,2); func_00233E70(2,2); header +0x20
  A: i>=8 && FLAG==0 : c = D_0036FC60 = 0.1
       ds = phase + i*0.1 + 0.0 ; dt = ds ;           col = sp+0xA0     0x00237DA8..0x00237DE0
  B: i not in {8,9} && FLAG==0 : c = D_0036FC64 = 0.1
       ds = phase + i*0.1 + 0.0 ;
       dt = ds + 2*A.[+0x6C]  (= ds + 2*t*rod[+0x6C]) ;  col = sp+0x180 (B+0xA0)   0x00237E10..0x00237E54
send3 (0x00237E6C..0x00237F98)   no func_002349E0 call (texture left from send2)
  func_00233E70(0,2); header +0x20
  A: i>=8 && FLAG==0 : c = D_0036FC68 = 0.1
       ds = phase + i*0.1 + sp[+0xB0] ; dt = phase + i*0.1 + sp[+0xB4] ; col = sp+0xA0    0x00237EC0..0x00237F00
  B: i not in {8,9} && FLAG==0 : c = D_0036FC6C = 0.1
       ds = phase + i*0.1 + sp[0x190] (B.+0xB0)
       dt = phase + i*0.1 + sp[0x194] (B.+0xB4) + 2*A.[+0x6C] ; col = sp+0x180          0x00237F30..0x00237F84
send4 (0x00237F98..0x0023808C)
  func_002360A8(1,0,1); func_00233E70(1,2); header +0x00
  A: i>=8 && FLAG!=0            : func_00236988(face, sp,      0)   0x00237FF8..0x0023801C
  B: i not in {8,9} && FLAG!=0  : func_00236988(face, sp+0xE0, 0)   0x00238048..0x00238070
send5 (0x0023808C..0x0023817C)
  func_00236058(0,1,1); func_00233E70(1,2); header +0x00
  same loops and conditions as send4, add = 0xFF                    0x00238110, 0x00238164
```
Since copies A and B hold the rod's own `+0xA0/+0xB0/+0xB4`, those equal the rod's values. In the split branch the
T offset of piece B gets an extra `2*t*s` (A's y scale doubled) in both textured passes; S gets none.

### 1.3 Unsplit branch (t <= 0), 0x0023818C..0x0023847C. All `i = 0..rod[+4]-1`, records 0x409280, rodcopy = rod

```
send1: func_00236058(1,0,1); func_00233E70(1,1); FLAG==0 : func_00236988(face, rod, 0)   0x002381E8..0x00238208
send2: func_002349E0(2,1,2); func_00233E70(2,2); FLAG==0 : c = D_0036FC70 = 0.1
         ds = dt = phase + i*0.1 ; col = rod+0xA0                                      0x00238280..0x002382A4
send3: func_00233E70(0,2); FLAG==0 : c = D_0036FC74 = 0.1
         ds = phase + i*0.1 + rod[+0xB0] ; dt = phase + i*0.1 + rod[+0xB4] ; col = rod+0xA0   0x00238310..0x00238344
send4: func_002360A8(1,0,1); func_00233E70(1,2); FLAG!=0 : func_00236988(face, rod, 0)  0x002383B8..0x002383D4
send5: func_00236058(0,1,1); func_00233E70(1,2); FLAG!=0 : func_00236988(face, rod, 0xFF) 0x00238448..0x00238464
```
In the unsplit branch `n` and `colour` are not used.

## 2. module_clock_2384C8(rod=a0, pass=a1, colour=a2, t=f12)

`phase = (float)rod[+0] * D_0036FC78 (0.1)`; `colour` saved at sp+0x1D0. `pass` is kept in $fp. Emitters used:
`func_00236E20(face, rodcopy, 0)` (reflection; reads colour from `rodcopy[+0xC0..+0xCF]`) and `func_00236A20`
with colour pointer `rodcopy + 0xD0` (resolves the "rod + 0xD0?" of clock-extra-passes.md: it is +0xD0 in all
four sites, `sp+0xD0` for piece A, `sp+0x1B0` for piece B, `rod+0xD0` unsplit). No refracted emitter is called;
cx, cy are computed but never used afterwards. Every send here uses faces with FLAG != 0 only.

### 2.1 Split branch construction (t > 0, 0x00238578..0x002386F0)

Same frame layout and same ordering as 1.1:
```
A.+0x6C = t * rod[+0x6C]                          0x00238610..0x0023861C
A.+0xC0..+0xCF = 16 bytes at *colour              0x00238614..0x00238624  (sp+0xC0)
func_00237010(.., 0x409280, A)                    0x0023862C..0x00238640
B.+0x6C = (1.0 - t) * rod[+0x6C]                  0x00238644..0x0023865C  (sp+0x14C)
B.+0xC0..+0xCF = 16 bytes at *colour              0x00238660..0x00238664  (sp+0x1A0)
B.matrix += translate (0, rod[+0x6C]*26.0*t, 0)   0x00238668..0x002386D4  (same helper sequence as 1.1)
func_00237010(.., 0x40BE80, B)                    0x002386D8..0x002386F0
```
No `+0x90` store (no `n` argument). Textured colour `+0xD0` is the rod's own in both pieces.
Face ranges: A `i >= 8`, B `i not in {8,9}` (0x00238750..0x00238754, 0x002387A0..0x002387A8).

### 2.2 Split branch sends (0x002386F4..0x00238C28)

```
send1 (0x002386F4..0x002387DC)
  func_00233E70(0,1); func_002349E0(0,0,2); header D_003659E0+0x10
  A: i>=8 && FLAG!=0           : func_00236E20(face, sp,      0)    0x00238750..0x0023876C
  B: i not in {8,9} && FLAG!=0 : func_00236E20(face, sp+0xE0, 0)    0x002387A0..0x002387C0
  func_00238DB0 (0x002387DC)
  if pass == 0 goto send2-pass0 (0x002387E4: beqz $fp)
send2, pass != 0 (0x002387EC..0x00238918)
  func_002349E0(3,1,2); func_00233E70(2,1); header +0x20
  A: i>=8 && FLAG!=0 : c = D_0036FC80 = 0.1
       ds = phase + i*0.1 + sp[+0xB0] ; dt = phase + i*0.1 + sp[+0xB4] ; col = sp+0xD0     0x00238848..0x00238884
  B: i not in {8,9} && FLAG!=0 : c = D_0036FC84 = 0.1
       ds = phase + i*0.1 + sp[+0xB0] ; dt = phase + i*0.1 + sp[+0xB4] + 2*A.[+0x6C] ;
       col = sp+0x1B0                                                                       0x002388B8..0x00238904
send2, pass == 0 (0x00238924..0x00238A44)
  func_002349E0(2,1,2); func_00233E70(2,1); header +0x20
  A: i>=8 && FLAG!=0 : c = D_0036FC88 = 0.1 ; ds = dt = phase + i*0.1 ; col = sp+0xD0      0x00238980..0x002389B4
  B: i not in {8,9} && FLAG!=0 : c = D_0036FC8C = 0.1 ;
       ds = phase + i*0.1 ; dt = phase + i*0.1 + 2*A.[+0x6C] ; col = sp+0x1B0              0x002389E8..0x00238A28
  both: func_00238DB0 at 0x00238C28
```
(In the split branch B's offsets come from A's copy at sp+0xB0/0xB4; same values as the rod's.)

### 2.3 Unsplit branch (t <= 0), 0x00238A48..0x00238CBC. All `i = 0..rod[+4]-1`, rodcopy = rod

Entry test `slti pass,2; beqz` / `bltz pass` (0x00238A48..0x00238A54): pass outside 0..1 goes to a fallback
(0x00238C38: `func_00233E70(0,1); func_002349E0(0,0,2)`; one send of `func_00236E20(face, rod, 0)` for FLAG!=0 faces).
The caller passes only 0 or 1, so the fallback is not reached in practice. Otherwise:
```
send1 (0x00238A5C..0x00238ADC)
  func_002349E0(0,0,2); func_00233E70(1,1); header +0x10
  FLAG!=0 : func_00236E20(face, rod, 0)                                  0x00238AB0..0x00238AC4
  func_00238DB0
  if pass == 0 goto 0x00238B90 (0x00238AE4: beqz $fp)
send2, pass != 0 (0x00238AEC..0x00238B88)
  func_002349E0(2,1,2); func_00233E70(2,1); header +0x20
  FLAG!=0 : c = D_0036FC90 = 0.1
     ds = phase + i*0.1 + rod[+0xB0] ; dt = phase + i*0.1 + rod[+0xB4] ; col = rod+0xD0   0x00238B40..0x00238B70
send2, pass == 0 (0x00238B90..0x00238C24)
  func_002349E0(3,1,2); func_00233E70(2,1); header +0x20
  FLAG!=0 : c = D_0036FC94 = 0.1 ; ds = dt = phase + i*0.1 ; col = rod+0xD0              0x00238BE8..0x00238C0C
  func_00238DB0 at 0x00238C28
```

### 2.4 Differences read between split and unsplit in 2384C8
- send1 state: split calls `func_00233E70(0,1)` first and then `func_002349E0(0,0,2)`; unsplit calls `func_002349E0(0,0,2)`
  first and then `func_00233E70(1,1)`. So the ALPHA mode differs (0 vs 1) between the branches.
- send2: the mapping of `pass` to (2,1,2) vs (3,1,2) and to "with `+0xB0/+0xB4`" vs "without" is swapped.
  Split: pass!=0 -> (3,1,2) with offsets, pass==0 -> (2,1,2) without. Unsplit: pass!=0 -> (2,1,2) with offsets,
  pass==0 -> (3,1,2) without.
- Each branch has exactly two sends (reflection, then textured). There is no further send beyond these in the function;
  the split path shares one send between pieces A and B (A loop then B loop between the same header and `func_00238DB0`).
  This does not match the "five more sends" in the skeleton described in clock-extra-passes.md.

## NOT DETERMINED
- The model-space height that 26 corresponds to: needs the mesh vertex range (not read). Only the formula
  translate-along-local-y by `rod[+0x6C]*26*t` is read.
- The meaning of `func_002349E0`'s first argument (2 vs 3) and thus whether the swapped mapping in 2.4 changes the
  picture; `func_002349E0`, `func_00236058`, `func_002360A8` were not read.
- Contents of header quads `D_003659E0 + {0x00,0x10,0x20}` (presumably the GIF tags; not read).
- Whether the matrix-stack top (`D_00370344`) is the same slot used by other callers at that moment: not checked.
