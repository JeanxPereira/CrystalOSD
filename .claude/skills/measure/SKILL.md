---
name: measure
description: Use when a value, formula or behaviour of the PS2 OSD (HDD OSD 1.10U, ROM 2.30) has to become a verified fact — from the function that computes it to a verifier that recomputes its output bit for bit from probed inputs, proven sensitive by mutation, registered in the regression suite, on both builds.
---
# measure — one function, one verifier, one fact

A fact is closed when a script recomputes what the console computed and compares bit for bit,
on both builds, and survives mutation. Everything else is a reading.

0. **Look before measuring.** `facts/verification.md` lists every verifier; `References/scripts/run_all.manifest.json` every verifier × capture. Grep them for the function address before writing anything new: extending a verifier is cheaper than a new one.
1. **One question in one line**, with the function that answers it (HDD OSD address first; the ROM 2.30 address from `find_in_rom.mjs` / `diff_rom.mjs`). The HDD OSD code is read with `node References/scripts/asm.mjs <func> [--callers] [--writers <sym>] [--rom]`; ROM code is read from a dump with `disasm_rom.py`. Read the function whole before probing it.
2. **Rule, not number.** Record the expression and its writer. A value seen in one capture is not a constant until the code that writes it has been read (it may be eased, depend on PAL, differ by build).
3. **Probe the entry, recompute, compare.** `export const PROBES = [{ pc, ranges }]` with `pick({rom, hdd})` from `builds.mjs`; import `readTraceFor, f, add, sub, mul, div, sqrt, toInt, REG` from `../lib/index.mjs`. EE floats: every single-precision op is cut toward zero (`add`/`sub`/`mul`/`div`, never `f(a + b)`), no denormals, `cvt.w.s` truncates. VU0 macro ops are FPU-like but check rounding per op. A verifier prints `verdict: FOUND ...` or `verdict: PARTIAL ...` as its last line.
4. **Capture fast.** `node References/scripts/with_emulator.mjs node References/scripts/capture.mjs --mode exact --verifiers verify_x.mjs --build hdd --state clock --frames 30 --name hddosd-110U-x` (skill `capture`). `--mode trace` only when you need which function sent a packet.
5. **Positive control.** Before trusting a "not found" or an empty comparison, show the verifier finding something already known. A verifier that compares 0 items must not say FOUND.
6. **Both builds, both video modes.** Run with `CLOCK_BUILD=hdd` and `rom`; for anything that can depend on the video mode also `CLOCK_VIDEO=pal` (BIOS `ps2-0230e-20080220.bin`). A difference between builds is a fact too: record it measured on both.
7. **Mutation.** `node References/scripts/mutate.mjs verify_x.mjs`. Every surviving mutant is either a branch no capture exercises (capture it, or stimulate it with memory writes and say so) or a comparison the verifier does not make (fix the verifier). Never leave a survivor unexplained.
8. **Register.** `node References/scripts/run_all.mjs --discover --only verify_x.mjs`, then `run_all.mjs --changed` must pass.
9. **Write the fact** by the `facts-page` skill: present tense, the rule, the addresses on both builds, the verifier and capture that reproduce it.

Never: fit a constant to make a verdict pass; take a value from the capture into the model where the model diverges (that is reading the answer); call a branch verified that no capture reached.
