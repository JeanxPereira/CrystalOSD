# End to end: one frame of the clock from its inputs (draft for `facts/`)

Written 2026-10-02 by the fork that built the model. Build: **ROM 2.30**. To be integrated into
`facts/` by the main session; nothing here was written into `facts/`.

## What was built

- `References/model/clock_frame.mjs`: `frame(snapshot, mesh)` returns, in order, every packet
  the rods, the orbs and the two extra passes send to the GS in one frame, each as a list of
  register writes. It takes nothing from later in the frame.
- `References/scripts/verify_frame.mjs`: takes a trace with two probes, builds the snapshot,
  runs the model and compares every write of every packet with what ROM 2.30 sent; then counts
  the frame's packets the model does not produce, by the function that had them sent.

The snapshot, taken before anything of the frame's clock drawing has run:

| Probe | What is read |
|---|---|
| `0x00221558`, the clock's frame function, at entry | time record, the eased hands and the eased fraction, the orbs' minute factor, the orbs' colour, the orb mode, the display buffers' two draw environments, the display buffer index, the sprites' fade ramp |
| `0x0022beb8`, rods and orbs (HDD `module_clock_22FE98`), at entry | the view and screen matrices (its arguments), the clock state block, the rod template record, the seven orb rings, the screen size, the scene record (scale, field) |

The mesh is `facts/data/rod-mesh.json`; the sine table is the formula of `clock-camera.md`.

## Result

| Capture | Frames | What happens in them | Vertex packets | State packets |
|---|---|---|---|---|
| `rom-0230A-clock-frame` | 9 | the clock alone, 5:44:04; rod 5 split at `t` 0.265; both fields, both display buffers | 1 962 of 1 962 equal | 2 736 of 2 736 equal |
| `rom-0230A-clock-frame-adjust` | 29 | Clock Adjustment, hour turned from 5 to 6 with the pad: the ring jumps (rod angle 27306 to -32768), the new rod's `t` climbs from 0.004 by 0.004 a frame, the scene scale is near 0 so the seven orbs sit together at the centre, the sprites' fade ramp is at 0, a ring's head wraps from 49 to 0 | 6 264 of 6 264 equal | 8 816 of 8 816 equal |

Every write of every packet equal: `PRIM`, `RGBAQ`, `ST`, `UV`, `XYZF2`, `CLAMP_1` of the
vertex packets, and `TEST_1`, `ALPHA_1`, `TEX0_1`, `TEX1_1`, `CLAMP_1`, `TEXA`, `FRAME_1`,
`ZBUF_1`, `XYOFFSET_1`, `SCISSOR_1` and the rest of the state packets. The packets are compared
in order, so the draw order (twelve rods and seven orbs, depth-sorted, different in every
frame) is part of what agrees.

Per frame the model produces 522 packets in the clock alone and 520 in Clock Adjustment.

## How much of a frame that is

Clock alone, 677 packets a frame: the model produces 522 (77.1%). The rest, per frame:

| Packets | Sent for |
|---|---|
| 101 | background, blur and tint (HDD `module_clock_226000`) |
| 24 | date and time |
| 13 | button hint |
| 6 | letterbox bars |
| 4 | fade overlay |
| 4 | right edge column |
| 2 | display buffer swap |
| 1 | `module_clock_232458` (HDD) |

In Clock Adjustment the menu is drawn over the clock and the model's share of the frame's
packets is 52.2%; the clock's own packets are the same 520.

## What the model had wrong at first, and what the disassembly said

Three things did not match on the first runs. None was fixed by fitting; each was read.

1. **A split rod's grain is sent one face to a packet on ROM 2.30.** The HDD OSD reading
   (`rod-offsets.md`) has piece A's and piece B's textured faces in one send. In the ROM's rod
   function the split branch opens and sends a packet inside each face loop
   (`0x002342d8` open, `0x00234314` emit, `0x0023431c` send; the same at `0x0023437c`,
   `0x00234428`, `0x002344cc`). The refracted sends of a split rod, the whole rod's sends and
   the extra passes are one packet each, as read. This is a difference between the builds in
   how the data is cut into packets, not in what is drawn.
2. **The trail's header colour is not constant.** The header packet (`PRIM 0x82`, `RGBAQ`)
   has alpha `fade(0x80)` through the sprites' ramp (`0x0023574c..0x0023575c`: `0x80` handed to
   the ramp's scale function), 0x80 only while the ramp is full. `clock-orbs.md` does not say
   so. It showed in Clock Adjustment, where the ramp is at 0.
3. **ROM 2.30's texture binder writes `TEST_1 = 0x30000 | ztst << 17`** (`0x00230f84`: the
   constant is `0x30000`, not `0x10000`), so `ztst` 1 gives `0x30000`, and 2 and 3 both give
   `0x70000`. `clock-gs-state.md` describes this as "one step stricter when `ztst` is 2";
   this is the rule. Its `CLAMP_1` is 0 and the work-buffer binder's is 5 with `TEST_1`
   `0x70000` and register `0x7F` in place of `TEXFLUSH`, as that page says.

## Confirmed on the way

- **Call order.** The ROM's frame function `0x00221558` calls, in order: `0x00221610`
  (matrices), `0x002216d8` (background), `0x0022beb8` (rods, orbs, extra passes), then five
  drawing functions, then `0x0022b1c0` (the clock logic), `0x0022e910` (scale). So a frame is
  drawn with the state the previous frame's logic left, which is what the snapshot holds.
- **The draw list's order** (`module_clock_22F2E8`, ROM `0x0022b308`, the same code): nodes in
  descending order of their key, the key being the depth of the node's origin in view space
  (element `[3][2]` of view × local); a new node is put in front of the first node that is not
  deeper than it, so of two equal keys the one added later is drawn first. Rods are added
  first (`i` 0 to 11), then orbs 0 to 6. `clock-scene.md` says "inserted in order of its key"
  without the direction: it is farthest first.
- **What a rod's node holds** (`module_clock_22F5D0`, `module_clock_22F380`): the template with
  its number, matrix, Y scale, base colour `+0x80`, reflection colour `+0xC0` and strength
  `+0x90` (200 for the current rod, 160 for the others) set per rod; `t` and `n` (100, or -1 and
  0); the accent chaser (state `+0x250`) as the colour of piece A; the fourth colour (state
  `+0x260`) as the reflection colour of both pieces in the extra passes. Everything else comes
  from the template as it stands: faces 16, scale x and z 1, textured colour `+0xA0`
  `(8, 8, 8, 128)`, pair `+0xB0` `(-0.008, -0.008)`, refraction strength `+0xB8` 1, and
  **`+0xD0` `(40, 40, 40, 128)`, the colour of the extra passes' grain**, which the rod record
  table in `clock-rod-draw.md` does not list.
- **An orb's node** is the template as the last rod left it with only the matrix replaced; only
  its origin is used.
- **The refracted emitter's `g`** is the cosine routine at
  `angle = (int16)((1 - F) × 32768 / 0.1)`: `bright = (int)(bright × ((1 - cos) × 0.5))`
  (`0x00232a68..0x00232ac4`). `verify_refraction.mjs` took `g` from a probe; the model computes
  it, and the two captures hold 54 refracted faces with `F` above 0.99 (sent with `PRIM 0x114`),
  all through that branch, all equal.
- **The rods are submitted only when the appearance of rod 0 is above 0.05** (HDD
  `D_0036FBE4`); the orbs always.

## Per send, as modelled (ROM 2.30)

A rod (`buffer(n)` binds a work buffer as texture, `work(target)` and `display` choose where to
draw, `blend(mode, ztst)`, `bind(texture, blended, ztst)`):

```
buffer(0), work(1, field), blend(1, 1)      refracted, far-side faces, add 0        -> 0x118
bind(2, 1, 2), blend(2, 2)                  grain, far-side faces
blend(0, 2)                                 grain with the rod's pair, far-side faces
buffer(1), display(field), blend(1, 2)      refracted, near-side faces, add 0       -> the frame
buffer(1), work(0, field), blend(1, 2)      refracted, near-side faces, add 255     -> 0x0D2
```

An orb: `display(field), blend(0, 3)`, header, trail, `bind(7, 1, 1)`, glow, `bind(6, 1, 1)`,
disc; then `work(0, field), blend(0, 3)` and the same again with the second set of colours.

An extra pass: `work(1, clear (0, 0, 0, 128), field)`; per rod, whole:
`bind(0, 0, 2), blend(1, 1)`, reflection, `bind(pass ? 2 : 3, 1, 2), blend(2, 1)`, grain; split:
`blend(0, 1), bind(0, 0, 2)`, reflection, `bind(pass ? 3 : 2, 1, 2), blend(2, 1)`, grain; then
`buffer(1), display(no field), blend(0, 1)` and the full-screen rectangle with alpha 30.

## Not covered

- The view matrix is an input (the library arithmetic that builds it is not reproduced bit for
  bit, `clock-camera.md`); the screen matrix is too, though its formula is verified.
- Each frame is modelled from its own snapshot. The model does not carry the state from one
  frame to the next (that step is `verify_clock_state.mjs`'s).
- Never met in a capture, so only as read: a ring still filling, the rods hidden (appearance at
  or below 0.05), a send with no face on one side, the orb modes 2 and 3 (the model notes them
  and does not model them), PAL.
- The sprites' fade ramp at values between 0 and full is covered by `verify_orbs.mjs`, not by
  these two captures (full in one, 0 in the other).
- HDD OSD 1.10U: nothing here was run on it. Where the page says ROM 2.30 differs (the grain's
  packets, the binders' `CLAMP_1` and `TEST_1`), the model follows the ROM.
