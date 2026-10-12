# How the time becomes the clock's state

Recorded 2026-10-02. *Read* on **HDD OSD 1.10U** (`../CrystalOSD-Decomp-Legacy/asm/core/` and `clock/`):
`func_0022F1A0`, `func_0022EF20`, `func_0022EBD0`, `func_0022EE20`, `func_0022E8C0`,
`func_0022EAD0`, `func_0022EB50`, `func_0022E9C8`, `func_0022EF40`, `func_0022F078`,
`func_0022F110`, `func_002355A0`, `func_00235650`, `func_00235730`, `func_00238D00`,
`func_00234A70`, `func_00234A98`, `func_00234AB0`, `func_00234AC0`, `func_00234AE0`,
`func_00234B10`, in full. *Verified* on **ROM 2.30** with trace probes
(`References/scripts/verify_clock_state.mjs`).

**Both builds run the same code here.** `References/scripts/diff_rom.mjs` compares the
fourteen functions word by word: apart from call targets and data addresses, no instruction
differs. The colour tables and the constants hold the same values in both.

| HDD OSD 1.10U | ROM 2.30 | What it is |
|---|---|---|
| `func_0022F1A0` | `0x0022b1c0` | the per-frame update |
| `func_0022EBD0` | `0x0022abf0` | time to angles |
| `func_0022EE20` | `0x0022ae40` | the cycling colours |
| `func_0022E8C0` | `0x0022a8e0` | every colour chases its target |
| `func_0022EF40` | `0x0022af60` | reset, when the clock is set up |
| state block `0x00404F70` | `0x00370F40` | |
| time record `0x00409230` | `0x00375200` | |
| base colour `0x002B5600` | `0x002965C0` | |
| appearance ramp `0x002B5640` | `0x00296600` | |

## The time record

| Offset | Type | Holds |
|---|---|---|
| `+0x00` | float | milliseconds within the second |
| `+0x04` | int | seconds |
| `+0x08` | int | minutes |
| `+0x0C` | int | hours |
| `+0x10`, `+0x14`, `+0x18` | int | day, month, year |

Three functions turn it into fractional values (single precision, every result cut toward
zero):

```
seconds = sec + ms / 1000
minutes = min + seconds / 60
hours   = hour + minutes / 60
```

## The state block

| Offset | Type | Holds |
|---|---|---|
| `+0x00` | int | the current rod: `(int) hours % 12` |
| `+0x04` | s16 | seconds angle, eased (65536 to a turn) |
| `+0x06` | s16 | current rod's angle, eased |
| `+0x10 + 0x30 × i` | float | rod `i`: appearance, 0 to 1 |
| `+0x14 + 0x30 × i` | float | rod `i`: progress `t` |
| `+0x20 + 0x30 × i` | 4 ints | rod `i`: base colour |
| `+0x30 + 0x30 × i` | 4 ints | rod `i`: reflection colour |
| `+0x250` | 4 ints | accent colour, chased |
| `+0x260` | 4 ints | a fourth colour, chased |
| `+0x270` | float | progress target: `1 - minutes / 60` |
| `+0x280` | 4 ints | accent colour of this frame |
| `+0x290` | 4 ints | the current rod's base colour target |
| `+0x2A0` | 7 ints | one random 16-bit value per orb, drawn at reset |

Beside it, two more eased 16-bit angles (an hour hand, `hours × 65536 / 12`, and a second
hand) and a copy of the progress target live in small-data globals. *Reading: nothing in the
functions on this page reads them back.*

## Each frame: `func_0022F1A0`

1. The appearance ramp steps (below).
2. **Time to angles** (`func_0022EBD0`):

   ```
   current       = (int) hours % 12
   ease(to, old) = (int)((s16)(to - old) × 0.1 + (s16) old)        kept to 16 bits
   rod angle     = ease(current × 65536 / 12, rod angle)            when |seconds angle| > 200
                 = current × 65536 / 12                             otherwise
   seconds angle = ease((int)(seconds × 65536 / 60), seconds angle)
   target        = 1 - minutes / 60
   ```

   The difference is wrapped to 16 bits before it is scaled, so an angle always turns the
   short way round. Both easing factors are 0.1.
3. **Colours** (`func_0022EE20`):
   - The base colour walks a table of five colours, forever: every ninth frame each channel
     moves one unit toward the table entry; when it gets there, the next entry is taken.
     Table: `(45, 85, 102)`, `(68, 47, 102)`, `(44, 71, 96)`, `(51, 73, 111)`,
     `(51, 111, 113)`, alpha 128.
   - The accent colour is set to `(167, 217, 255, 0)` every frame, and on every ninth frame
     moved one unit toward `(202, 246, 231, 128)`. *So it is `(167, 217, 255, 0)` on eight
     frames of nine and `(168, 218, 254, 1)` on the ninth.*
   - The current rod's target is the mean of the two, per channel, halved with a shift.
   - Then every stored colour moves one unit per channel toward its target
     (`func_0022E8C0`): the current rod's base colour toward that mean and its reflection
     colour toward `(128, 128, 128, 30)`; every other rod's base colour toward the base
     colour and its reflection colour toward `(60, 60, 60, 128)`; the accent chaser toward
     the accent colour; the fourth colour toward `(60, 60, 60, 128)`.
4. **Progress and appearance**, for every rod `i`:

   ```
   t          = 0                                   when i is not the current rod
              = min(t + 0.004, target)              when t < target
              = target                              otherwise
   appearance = (float)(ramp.value × 128 / ramp.length) / 128
   ```

   *Reading: `target` falls through the hour, so `t` simply follows it; when the hour turns, the
   new current rod starts at 0 and climbs 0.004 a frame up to the target near 1, while the rod
   ring eases round to it.*

## The appearance ramp

Four ints: length, value, changed, state. State 0 is hidden, 1 rising (value up by one a frame
until it equals the length, then state 2), 2 shown, 3 falling (value down by one a frame until
0, then state 0). `func_0022F078` starts it rising when hidden; `func_0022F110` starts it
falling when shown. Its length is set at reset from a small-data global (`D_003702E8` on HDD
OSD). *Measured on ROM 2.30 in the clock screen: `1, 1, 0, 2`, so appearance is 1.*

## Verified on ROM 2.30

Probes at the entry of the four functions and at the return of the per-frame update record the
state before and after each step; the verifier recomputes every value written.

| Capture | Frames | Stimulus | Result |
|---|---|---|---|
| `rom-0230A-clock-state` | 37 | none | every value equal |
| `rom-0230A-clock-state-poked-a` | 37 | rod angle and the current rod's `t` zeroed, ramp set to rise over 20 frames | every value equal |
| `rom-0230A-clock-state-poked-b` | 33 | seconds angle zeroed, ramp set to fall over 20 frames | every value equal |
| `rom-0230A-clock-hour` | 47 | none: the hour set from 5 to 6 in Clock Adjustment, with the pad | every value equal |

Per frame: ramp, current rod, the four angles, both progress targets, the three colours, the
cycle counters, the 24 rod colours, the two chasers, and the 12 rods' `t` and appearance.
The stimulated captures are there because an unstimulated minute never turns the hour: the
values were written into the state with the VM paused, and the ROM's own code then ran on
them. The time was 5:44:04 in all three.

They exercised the eased rod angle with a non-zero difference, the rod angle set without
easing (one frame), `t` rising, and the ramp rising and falling.

**The hour turning** was captured through the console's own Clock Adjustment screen
(System Configuration, cross, right three times, up held while tracing): the time record went
from 5:44:00 to 6:44:00, the current rod from 5 to 6, the new rod's `t` climbed from 0 by 0.004
a frame, and its colours started moving toward the current rod's targets. While that screen is
open the record's seconds and milliseconds stay at 0, so the seconds angle is 0 and the ring
jumps to the new hour without easing (47 frames of the unsmoothed branch).

## Where the time comes from: `func_00235B10` (read, not verified)

Each frame the record's milliseconds grow by one frame's duration, `1000 / 59.94`, or
`1000 / 50` in PAL, plus a correction that slews the record toward the console's clock (a
snapshot of year to second kept at `0x001F0D1C..0x001F0D30`): the drift is measured in
milliseconds whenever the console's second changes; above 3000 the record jumps to the
console's time; otherwise each frame takes `(|drift| × frame + 9999) / 10000` milliseconds
off it. When the milliseconds pass 1000 the whole seconds are added to the date and time.
*Measured: the milliseconds advance 16.7 per frame.*

The hour turning while the clock runs freely (seconds not held at 0) is *verified*: a record
written to hh:59:59.9 runs on by itself and turns the hour, and `verify_clock_state.mjs` is
FOUND on `hddosd-110U-stim-hour-free` and `rom-0230A-stim-hour-free` (86 frames each,
`verification.md`); in PAL on `hddosd-110U-flow-pal-hour-free` (97 frames) and, with the record
written to hour 5, 59 min, 59 s, on `rom-0230E-pal-clock-written` (72 frames; `pal.md`).

## Not settled

- The time keeper, by recomputation.
- Who reads the hour-hand and second-hand globals, if anyone.
