# The state helpers: what each send's GS state is

Recorded 2026-10-02. *Read* on **HDD OSD 1.10U**: the full reading, with address ranges, is
`References/readings/gs-state-helpers.md`. *Measured* on **ROM 2.30**
(`References/scripts/verify_gs_state.mjs`, capture `rom-0230A-clock-gs-state`, 4 frames of the
clock): a probe at each helper's entry records its arguments, the HDD OSD formula gives the
register writes, and they are compared with the packet the ROM sent next.

**Several of these helpers are different code in the two builds**, so this page states the HDD
OSD reading, how far ROM 2.30 agrees with it, and where it does not.

With `W`, `H` the screen size ints (640 and 224 in NTSC; 256 high in PAL):

## Blend and depth test: `func_00233E70(mode, ztst)` — ROM `0x00230518`

```
TEST_1  = 0x10000 | ztst << 17          depth test on; 1 always, 2 greater or equal, 3 greater
ALPHA_1 = 0x48  (Cs - 0)  × As + Cd     mode 0
          0x44  (Cs - Cd) × As + Cd     mode 1
          0x42  (0 - Cs)  × As + Cd     mode 2
          (Cs - Cd) × 40/128 + Cd       mode 3
          0x68  destination unchanged   mode 4
```

*ROM 2.30: 1 440 calls, both registers equal in all.* Modes 0, 1, 2 and tests 1, 2, 3 occurred.

## A loaded texture: `func_002349E0(n, blend, ztst)` → `func_002348A8` — ROM `0x00230fe8` → `0x00230ee0`

Nine registers: `TEST_1`, `ALPHA_1` (`0x48` when `blend`, else `0x44`), `PABE` 0, `TEXA`
`0x81_0000807F`, `FBA_1` 0, `TEXFLUSH`, `TEX1_1` `0x61` (bilinear), `TEX0_1` (the texture's
place and size from the table in `clock-textures.md`, 32-bit, modulate, with alpha), `CLAMP_1`.

*ROM 2.30: 900 calls. `ALPHA_1`, `PABE`, `TEXA`, `FBA_1`, `TEXFLUSH`, `TEX1_1`, `TEX0_1` equal
in all.* Two registers differ:

| Register | HDD OSD, read | ROM 2.30, sent |
|---|---|---|
| `CLAMP_1` | 5: clamp in both directions | 0: repeat in both directions, in all 900 |
| `TEST_1` | `0x10000 \| ztst << 17` | `0x30000 \| ztst << 17` (read at ROM `0x00230f84`): `ztst` 2 becomes 3, greater instead of greater or equal (610 of 900) |

The rod code sets blend and depth test again right after binding, so the second difference is
overwritten there. The first is also overwritten for the rods' grain textures, on both builds
(see the end of this page), so the grain repeats on both.

## A work buffer as texture: `func_00234070(which)` — ROM `0x002306e8`

The same nine registers with `TEST_1` `0x50000`, `ALPHA_1` `0x44`, and `TEX0_1` = the buffer at
`W × H / 16` words (`0x2300`) when `which & 1`, else `3 × W × H / 64` (`0x1A40`), 640 wide,
1024 × 256, 32-bit.

*ROM 2.30: 440 calls. `ALPHA_1`, `PABE`, `TEXA`, `FBA_1`, `TEX1_1`, `TEX0_1` equal in all.*
Three differ:

| Register | HDD OSD, read | ROM 2.30, sent |
|---|---|---|
| `CLAMP_1` | region clamp to `0..W-1`, `0..H-1` | 5: plain clamp |
| `TEST_1` | `0x50000` | `0x70000` |
| sixth write | `TEXFLUSH` | register `0x7F`, which is not a GS register |

This is the build difference already sized in `clock-rod-draw.md`: without the region clamp
ROM 2.30 samples a few rows past the picture.

## Drawing into a work buffer: `func_002342F0(target, clear colour, field)` — ROM `0x00230920`

```
FRAME_1    = FBP | 10 << 16, 32-bit      FBP = W × H / 512 (0x118) when target & 1, else 3 × W × H / 2048 (0xD2)
ZBUF_1     = 0x8C
XYOFFSET_1 = (2048 - W/2) × 16, (2048 - H/2) × 16 (+ 8 when field)
SCISSOR_1  = 0..W-1, 0..H-1
PRMODECONT 1, COLCLAMP 1, DTHE 0, TEST_1 0x50000
```

and, when a clear colour is given, an untextured sprite over the whole buffer in that colour
with the depth test set to always around it. *ROM 2.30: 400 calls, every register equal,
including 20 clears.*

## Drawing into the display buffer: `func_002341C8(buffers, index, clear colour, field)` — ROM `0x00230810`

Sends the draw environment that was built when the display buffers were set up (index 0 or 1),
with `XYOFFSET_1` set as above. *ROM 2.30: 330 calls, every register equal to the environment
in memory with that offset.*

## A rectangle: `func_00233770(rect)` — ROM `0x0022fd00`

Two packets over VIF1: `PRIM` (sprite, with the record's texture and blend flags, UV
coordinates) and `RGBAQ` with Q 1; then `UV`, `XYZF2`, `UV`, `XYZF2`, the positions being the
record's plus `(2048 - W/2) × 16` and `(2048 - H/2) × 16`. *Verified on ROM 2.30 through the
orbs' sprites (`clock-orbs.md`: 1 652 sprites). The probe at the helper itself could not read
its record, which is passed by an uncached address.*

## Measured on both builds

The call-by-call comparison of this page, repeated on HDD OSD with its own addresses
(`CLOCK_BUILD=hdd`, capture `hddosd-110U-clock-c`): 3 220 calls of the five helpers, **every
register equal to the reading**.

HDD OSD 1.10U now runs in the emulator (`hddosd-boot.md`). One frame of the clock from each
build, `CLAMP_1` and depth test per texture (the HDD OSD frame was taken on its first, partial
start; the code that sends these registers is the same in the full one):

| Texture | HDD OSD 1.10U | ROM 2.30 |
|---|---|---|
| grain on the rods (`0x2d00`, `0x2d40`) | `0x01000000`: repeat | `0x01000000`: repeat |
| reflection map (`0x2bc0`) | 5: clamp; depth always, and greater-or-equal in 2 draws | 0: repeat; depth always, and greater in 2 draws |
| background (`0x2c00`) | 0: repeat; greater or equal | 0: repeat; greater |
| orb sprites (`0x2e00`, `0x2e40`), button hint (`0x2ec0`) | 5: clamp | 0: repeat |
| work buffers refracted by the rods (`0x2300`, `0x1a40`) | region clamp to the screen | `0x01000000`: repeat, or 5 |

So the reading was right about the binders, and **the grain repeats on both builds**: its
`CLAMP_1` is not the binder's but one written afterwards, the same value in both. The
differences that remain are the ones already known: HDD OSD clamps the refracted lookups to the
screen and the other loaded textures to their edges, and tests depth with greater-or-equal
where ROM 2.30 uses greater.

## Not settled

- `CLAMP_1 = 0x01000000` for the grain is written by the textured emitter in each face's
  header, after `PRIM` (reproduced by the end-to-end model on both builds, `clock-frame.md`);
  it is a real `CLAMP_1` slot of the face's GIF tag (templates at HDD `D_003659E0`, ROM
  `0x002973A0`: textured `PRIM, CLAMP_1, (ST, RGBAQ, XYZF2)×4`), set by `lui 0x100` at HDD
  `0x00236A34`, ROM `0x00232E4C`. The value is repeat on both axes.
- The helpers that bind the display buffer as texture (`func_00233F48`), copy the screen
  (`func_00236230`), blur (`func_00236490`) and overlay (`module_clock_22FD10`): read, and in
  agreement with the measured draws, but not compared call by call.
