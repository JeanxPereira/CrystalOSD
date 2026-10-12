# The two extra passes over the rods

Recorded 2026-10-02. Build: **HDD OSD 1.10U**, *read* from `../CrystalOSD-Decomp-Legacy/asm/`:
`module_clock_22FD90` and `func_00236E20` in full; `module_clock_2384C8` from its head through
its first two sends (`0x002384C8..0x00238920`), the rest by its calls only. *Measured* refers
to the ROM 2.30 captures in `Watson/docs/findings/`. The reflection emitter is verified by
recomputation (below); the rest of the page is read.

## Order

`module_clock_22FD90` runs twice the same sequence, with `pass` 0 and then 1:

1. `func_002342F0(1, 0x002B5730, …)`. *Measured: an untextured full-buffer sprite into the
   work buffer `0x118`, on PATH3.*
2. For every node of the rod list (`0x00405230`) whose `+0xF0` is not 1:
   `module_clock_2384C8(rod = node + 0x10, pass, node + 0x120)`, `t` = float at `node + 0xF4`.
3. `func_002360A8(1, 0, 0)`, then `module_clock_22FD10(0x1E)`. *Measured: one full-buffer
   sprite into the frame sampling `0x118`, `(Cs - 0) * As + Cd`, vertex alpha 30 (`0x1E`).*

*Reading: each pass draws a layer of highlights for all rods into the cleared work buffer and
adds the whole buffer to the picture at 30/128 strength.*

## One rod in an extra pass: `module_clock_2384C8(rod, pass, colour, t)`

Same beginning as the main rod function: `phase = (float) rod[+0x00] × 0.1`, nothing is drawn
when `rod[+0x6C] < 0`, the transform fills the face records, and when `t > 0` the rod is made
into the same two pieces (`clock-rod-draw.md`), both pieces' reflection colour `+0xC0` being
replaced by the `colour` argument. Then exactly two sends, each over the faces whose side flag
is not 0 (for a split rod, piece A's faces 8 and up, then piece B's all but 8 and 9):

| Send | Emitter | Arguments |
|---|---|---|
| 1 | `func_00236E20(face, rod, 0)`, the reflection | |
| 2 | `func_00236A20(face, rod + 0xD0, ds, dt)`, textured | pass 0: `phase + i × 0.1`; pass 1: the same plus the rod's pair `+0xB0`, `+0xB4`; piece B's `dt` gets `2 × t × s` more |

*Verified on ROM 2.30 (`verify_rod_pieces.mjs`): 1 944 textured faces of the extra passes, the
offsets, the colour pointer `rod + 0xD0` and the side of every face as stated.*

State selected before each send (*read; the helpers are in `clock-gs-state.md`*):

| | Whole rod | Split rod |
|---|---|---|
| send 1 | `func_002349E0(0, 0, 2)`, `func_00233E70(1, 1)` | `func_00233E70(0, 1)`, `func_002349E0(0, 0, 2)` |
| send 2, pass 1 | `func_002349E0(2, 1, 2)`, `func_00233E70(2, 1)` | `func_002349E0(3, 1, 2)`, `func_00233E70(2, 1)` |
| send 2, pass 0 | `func_002349E0(3, 1, 2)`, `func_00233E70(2, 1)` | `func_002349E0(2, 1, 2)`, `func_00233E70(2, 1)` |

So the whole rods and the split rod use the two grain textures the other way round, and a
different first argument of `func_00233E70` in the first send.

## The reflection emitter: `func_00236E20(face, rod, aa)`

```
PRIM  = aa ? 0x194 : 0x114                      triangle strip, textured, UV; 0x194 adds AA1
RGBAQ = rod[+0xC0] | rod[+0xC4] << 8 | rod[+0xC8] << 16 | rod[+0xCC] << 24
```

Per vertex, with `P` its view-space position and `N` the face's view normal:

```
E = normalize(P)
r = E + N * | 2 * dot(E, N) |
U = (unsigned)((r.x + 1) * 512)                 12.4 fixed point: 0..64 texels
V = (unsigned)((r.y + 1) * 256)                 12.4 fixed point: 0..32 texels
```

then the integer `XYZ` of the face record. *Reading: the view direction reflected about the face
normal looks up a 64 × 64 picture of the surroundings — a reflection map. Only its top half is
addressed vertically.* *Measured: these draws use the 64 × 64 texture `0x2bc0`.*

*Verified on ROM 2.30* (emitter at `0x002333b8`; capture
`Watson/Runtime/captures/rom-0230A-clock-reflection.*`, script
`References/scripts/verify_reflection.mjs`): 1 626 faces, `PRIM`, colour and all 6 504 `UV` and
`XYZ` equal to what was sent. `normalize` is `x² + y² + z²` in that order, a square root, a
reciprocal, three products. The coordinates met run from 0.31 to 63.81 texels in U and 0.81
to 31.00 in V, so what the float-to-unsigned conversion does below zero was never exercised.

## Not settled

- The state selected before each send, by measurement (`clock-gs-state.md`).
- What the float-to-unsigned conversion of the reflection coordinates does below zero.
