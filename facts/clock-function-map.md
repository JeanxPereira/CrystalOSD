# Clock functions: ROM 2.30 to HDD OSD 1.10U

Recorded 2026-10-02.

Inputs:

- ROM 2.30 code: live EE memory `0x00100000..0x00300000` read through Watson at the clock
  screen, `$CRYSTALOSD_DATA/dumps/rom-0230A-clock-ee-00100000.bin` (provenance beside it).
- HDD OSD 1.10U: `../hddosd-recomp-artifacts/hddosd.elf`.
- Names: `../CrystalOSD/symbol_addrs.txt`. A name of the form `module_clock_XXXXXX` or
  `func_XXXXXXXX` is only an address; names such as `sceDmaSend` were given by CrystalOSD and
  are taken on its word.

Method (`References/scripts/match_functions.mjs`): instructions are compared after removing
what moves between builds (jump targets, `lui` immediates, gp-relative offsets). The first 16
instructions of the ROM function are searched for in the ELF's code (13 of 16 must agree);
then the two whole functions are aligned and the instructions they have in common are
counted. "Share" is that count over the ROM function's length. Function ends are found by a
heuristic (last `jr ra` before the next stack-frame prologue) and can overshoot, which lowers
the share of the two library functions at the bottom.

The ROM entries are the function entries on the call stacks of the clock's draws, as measured
by `watson_gif_trace` (`Watson/docs/findings/rom-0230A-clock-origins.md`).

| ROM 2.30 | HDD OSD 1.10U | Name there | Share | Role on the ROM side (measured) |
|---|---|---|---|---|
| `0x00221558` | `0x00225E80` | `clock_orb_rendering_func` | 93.5% | root of every draw of the screen |
| `0x002216d8` | `0x00226000` | `module_clock_226000` | 88.5% | clear, background, blur round trips |
| `0x00221830` | `0x00226158` | (inside `module_clock_226000`'s symbol) | 90.6% | the two black bars |
| `0x002219d8` | `0x00226300` | (same) | 85.5% | text, top line |
| `0x00221408` | `0x00225D30` | `module_clock_thread_proc` | 87.1% | caller of `0x00221060` |
| `0x0022beb8` | `0x0022FE98` | `module_clock_22FE98` | 91.7% | calls the rod loop |
| `0x0022bcc8` | `0x0022FCA8` | `module_clock_22FCA8` | 96.2% | loop over the rod list |
| `0x0022b928` | `0x0022F908` | `module_clock_22F908` | 95.1% | list entries that draw orbs |
| `0x00233f60` | `0x00237A28` | `module_clock_237A28` | 80.0% | one rod: five sends |
| `0x0022bdb0` | `0x0022FD90` | `module_clock_22FD90` | 91.1% | the two extra passes |
| `0x00234a68` | `0x002384C8` | `module_clock_2384C8` | 90.9% | one rod in an extra pass |
| `0x00235630` | `0x00239078` | `module_clock_239078` | 78.4% | orbs: line strips and sprites |
| `0x0022f470` | `0x00233110` | no symbol of its own | 97.8% | background strips |
| `0x0022f610` | `0x002332B0` | no symbol of its own | 100% | caller of the above |
| `0x0022fd00` | `0x00233770` | no symbol of its own (`func_00233770` in the disassembly) | 83.7% | one textured rectangle |
| `0x00272c10` | `0x0027BEE8` | `sceDmaSend` | head 16/16 | starts every VIF1 transfer |
| `0x0026edc0` | `0x00288F30` | `sceGsPutDrawEnv` | head 16/16 | starts every GIF transfer |

Not placed: `0x002328d8`, `0x002326a8` (blur round trips and buffer copies), `0x00221e48`,
`0x00222160`, `0x0020a938`, `0x0020aca8`, `0x0020c6f8` (text), `0x00221060`. Nothing in the ELF
starts like them under this method; they may differ at the head or sit elsewhere.

What the map is and is not: a share above 90% says the two functions are the same code with
small edits. At 80% (`0x00233f60`, `0x00235630`) a fifth of the instructions differ, so
arithmetic read on the HDD side is not proven to hold on the ROM side instruction by
instruction. The structural checks in `clock-rod-draw.md` are the evidence that it does.
