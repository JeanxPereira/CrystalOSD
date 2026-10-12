# How a frame of the crystal clock is put together

*Read* on **HDD OSD 1.10U** (`../CrystalOSD-Decomp-Legacy/asm/clock/`):
`module_clock_22FE98`, `module_clock_22F298`, `module_clock_22F2C0`, `module_clock_22F2E8`,
`module_clock_22F380`, `module_clock_22F478`, `module_clock_22F528`, `module_clock_22F5D0`, in
full. *Measured* on **ROM 2.30** with trace probes at the counterparts of three of them
(capture `Watson/Runtime/captures/rom-0230A-clock-scene.*`, 9 frames).

| HDD OSD 1.10U | ROM 2.30 | What it does |
|---|---|---|
| `module_clock_22FE98` | `0x0022beb8` | one frame of rods and orbs |
| `module_clock_22F298` | `0x0022b2b8` | empties the draw list |
| `module_clock_22F5D0` | `0x0022b5f0` | submits the twelve rods |
| `module_clock_22F528` | `0x0022b548` | builds one rod's matrix |
| `module_clock_22F380` | `0x0022b3a0` | adds a rod to the draw list |
| `module_clock_22F760` | `0x0022b780` | submits the orbs (`clock-camera.md`) |
| `module_clock_22F478` | `0x0022b498` | adds an orb to the draw list |
| `module_clock_22F2C0` | `0x0022b2e0` | the depth a list entry is sorted by |
| `module_clock_22F2E8` | `0x0022b308` | sorted insertion |

ROM addresses were found by the first 16 instructions (14 to 16 of 16 equal).

## One frame: `module_clock_22FE98(view, screen)`

1. Stores its two arguments in the rod template (static record at `0x002B5490`, 0xE0 bytes) as
   the matrix pointers `+0x64` and `+0x60`.
2. Empties the draw list.
3. If the float at `0x00404F80` is above a threshold, submits the twelve rods.
4. Submits the orbs.
5. Walks the list and draws each entry (`module_clock_22FCA8`; see `clock-rod-draw.md`).
6. Runs the two extra passes (`clock-extra-passes.md`).

## The draw list

An array of 0x140-byte nodes at `0x00405230`, node 0 being the head, linked through `+0x00`.
An entry holds a copy of the 0xE0-byte record at `+0x10`, a kind at `+0xF0` (0 rod, 1 orb), and
is inserted in order of its key at `+0x04`: element `[3][2]` of `view × local matrix`, the
depth of the rod's origin in view space. The list is in descending order of the key, farthest
first; a new node goes in front of the first node that is not deeper than it, so of two equal
keys the one added later is drawn first. Rods are added first (0 to 11), then orbs 0 to 6, and
the rods only when the appearance of rod 0 is above 0.05; the orbs always. *Verified by `verify_frame.mjs` (14 frames on HDD OSD 1.10U, 9 + 29 on ROM 2.30; see `verification.md`, `clock-frame.md`): the
order of every packet follows from this.* *Read: the list is rebuilt and depth-sorted every
frame, and rods and orbs are drawn interleaved in that order. Measured: orb draws do fall
between rod groups.*

A rod entry also holds `t` at `+0xF4`, a colour at `+0x100`, an int `n` at `+0x110`, and a
second 16-byte value at `+0x120`.

## Submitting the rods: `module_clock_22F5D0`

The clock's state block is at `0x00404F70`: an int at `+0x00` (the current rod), two 16-bit
angles at `+0x04` and `+0x06`, and twelve 0x30-byte entries from `+0x00`, each with a length
at `+0x10`, a progress `t` at `+0x14`, a base colour at `+0x20` and a reflection colour at
`+0x30`.

For `i` from 0 to 11, with `index = (i + current) % 12`:

- the matrix (`module_clock_22F528(i, angle at +0x06, angle at +0x04)`): see
  `clock-camera.md`, where `verify_placement.mjs` verifies it (rod and orb matrices, both builds);
- the template gets `[+0x00] = index`, `[+0x6C] =` that rod's length, its two colours, and the
  matrix just built;
- `i = 0`, the current rod: highlight strength 200, `t` from the state, `n = 100`;
- every other: highlight strength 160, `t = -1`, `n = 0`.

So the "counter" that scrolls a rod's textures (`phase = index × 0.1`) is the rod's number, not
time, and the one rod drawn in two pieces is always the current one.

## Measured, one frame of ROM 2.30 (frame 2493 of the capture)

| | Current rod (`i = 0`) | The other eleven |
|---|---|---|
| index | 5 | 6, 7, …, 11, 0, …, 4 |
| faces | 16 | 16 |
| scale x, y, z | 1, 1, 1 | 1, 1, 1 |
| `t` | 0.2654 | -1 |
| `n` | 100 | 0 |
| highlight strength `+0x90` | 200 | 160 |
| refraction strength `+0xB8` | 1 | 1 |
| base colour `+0x80` | 109, 145, 182 | 51, 73, 111 |
| textured-pass colour `+0xA0` | 8, 8, 8, 128 | 8, 8, 8, 128 |
| texture offset pair `+0xB0` | -0.008, -0.008 | -0.008, -0.008 |
| reflection colour `+0xC0` | 128, 128, 128, 30 | 60, 60, 60, 128 |
| colour argument | 168, 218, 254, 1 | same |
| second 16-byte argument | 60, 60, 60, 128 | same |

*Measured* (capture above; the matrices the angles produce are recomputed by `verify_placement.mjs`). Angles passed to the matrix builder in that frame: 27306 and 4799 (65536 to a turn; 27306 is
150°). Seven orbs are submitted per frame, numbered 0 to 6.

## Open

- The sorted insertion and the depth key are not recomputed on their own; `verify_frame.mjs`
  reproduces the packet order they produce.
- `clock-state.md` covers who writes the state block; `clock-camera.md` the matrices and the
  orbs.
