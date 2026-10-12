# Speeding up the measurement work

Recorded 2026-10-02. Watson work is on branch `speed` (commit `7325457`), **not merged**: it was
fast-forwarded into `main` once and put back to `b82b49d` on request, and `main`'s `Server/dist` was
rebuilt from `b82b49d` again. The new emulator is built beside the official one, in
`D:/CodingProjects/pcsx2-speed/build/` (a second PCSX2 checkout at the pinned commit); the official
exe in `Watson/References/pcsx2/build/` is untouched. In CrystalClockVK nothing is committed.

## The finding that matters

A traced frame costs about 2 s because `GifTrace` walks the EE call stack at every DMA start (the
packet's origin), not because of the interpreter. A capture under the interpreters **without
origins** is about 130 times faster and keeps the interpreters' arithmetic:

| Capture, HDD OSD clock, 13 probes of `verify_frame.mjs` | Time | `verify_frame.mjs --carry` |
|---|---|---|
| `watson_gif_trace` (interpreters, origins), 10 frames | 92.3 s | FOUND 14 frames |
| `watson_frame_capture` cpu interpreter (no origins), 10 frames | 0.7 s | FOUND 16 frames |
| `watson_frame_capture` cpu recompiler, 30 frames | 0.7 s | PARTIAL: floats differ |
| a whole session, launch to kill, recompiler, 30 frames | 7.9 s | |

**The recompilers are not bit-exact against the interpreters.** Under them the library's cosine
(`_sceVu0ecossin`, VU0 macro ops), FPU sums (`progress` target) and `Q = 1/w` differ in the last
bits (up to 7 ulps in `Q`), so every verifier that recomputes floats fails on a recompiler capture.
The model and all verifiers were checked against the interpreters. Recompiler captures are good
for structure (which packets, how many, the order) and for moving fast; not for bit-for-bit checks.
PCSX2 divides under the recompiler with `FPUDiv` rounding (nearest by default) where the
interpreter rounds toward zero; `Run.ps1` now sets `FPUDiv.Roundmode = 3` (toward zero) on every
launch. That alone did not make the recompiler exact.

## What each item delivers

1. **Captures** (Watson `speed`):
   - `watson_frame_capture {frames, path, cpu, probes, hold}`: the trace format of
     `watson_gif_trace`, plus the GS dump and the parity check, without origins. `cpu: interpreter`
     (default) is the exact one; `cpu: recompiler` fires probes from breakpoint checks the
     recompiler compiles at their addresses (hook in `isBreakpointNeeded` and
     `dynarecCheckBreakpoint`; the recompiled blocks are thrown away when the capture starts and
     stops).
   - `watson_set_cpu_mode {mode}`: interpreters or recompilers, switched while the VM runs (PCSX2
     swaps the CPUs at the next execution slice; the machine state is kept). Boot and navigate
     fast, then switch for the capture. Tested live: 2 frames each way.
   - Packet origins are only needed for: coverage labels in `verify_frame.mjs` ("not modelled:
     background, …"), `watson_gsdump_parse` sources, and finding which function sent a packet.
     Nothing that verifies arithmetic needs them.
2. **Probe limits**: 1024 probes per capture (was 32), 64 ranges per probe (was 8), 0x10000 bytes
   per range (was 0x4000). Several probes may share a program counter; each keeps its own ranges,
   each record carries `"probe": <index>`, and the header lists the probes as asked. Older captures
   read as before (`readTrace` returns `probeSpec: ''`, no index).
3. **Library** `References/lib/`:
   - `ee-float.mjs`: `f` (cut toward zero, no denormals, no infinities), `add`, `sub`, `mul`,
     `div`, `sqrt`, `madd`, `toInt`, `s16`, … — exact. `ee-float.test.mjs` checks them against a
     BigInt oracle (40 000 sums, 20 000 products, quotients and roots) and against the EE's own
     results in three boot captures (the camera approach, both builds, PAL included). It also pins
     the weakness of the old helper: `f(1 + -2^-60)` is 1, `add` gives `0x3F7FFFFF`.
   - `trace.mjs`: `readTrace`, `loadTrace`, `readTraceFor(file, PROBES)`, `probesOf`, `only`,
     `mergeProbes`, `writesOf`; `gif.mjs` (`REG`), `memory.mjs`, `index.mjs` (re-exports
     `builds.mjs` too). `WATSON_DIST` points the reader at another Watson build.
   - **Migration applied** (`migrate_to_lib.mjs`, 49 verifiers): each reads its captures through
     `readTraceFor(file, PROBES)`, so it reads a shared capture as if it were its own. Their own
     float helpers were not replaced: that changes arithmetic and is to be done verifier by
     verifier with `run_all.mjs` as the guard.
4. **Regression suite** `References/scripts/run_all.mjs` + `run_all.manifest.json`: 502 entries
   (verifier × capture × build × video mode, found by `--discover`: 947 runs over 239 captures in
   16 min at 3 at once). Before the migration 502 of 502 pass (24 min at 6 at once); after it,
   502 of 502 (21.5 min). `--filter <regex>`, `--changed` (only entries whose verifier or anything
   it imports changed since its last pass), `--jobs`, `--discover --only verify_x.mjs` (adds a
   verifier's entries to the manifest). Memory is the limit on this machine (16 GB; the largest
   traces are 400 MB): keep `--jobs` at 6 or below.
5. **Emulator count**: `measure_concurrency.mjs [frames] [1,3,5]` is ready; not run (set aside on
   request: with captures 130 times cheaper, few interpreter sessions are needed at once).

Also, from the workers' limits:

- **`with_emulator.mjs`**: slots are lock files created whole (written aside, then hard-linked into
  place), an unreadable or vanished owner is tolerated, and waiters are served in arrival order
  (a ticket queue). It still counts slots held by the earlier wrapper's directories. Test:
  `with_emulator.test.mjs`, 16 waiters at once on 3 slots: never more than 3, all run, no lock left.
- **Pause timeouts and stops at `0x81FC0`**: a `pause` that the CPU thread did not take within 5 s
  was reported as failed but could still land later, and then stopped the next `frame_advance`
  (at the BIOS idle loop `0x81FC0`) — the "spurious stop". Now `pause`, `resume`, `gs_read` and
  `set_cpu_mode` wait up to 60 s (the client 70 s), and `frame_advance` runs on past a pause that
  is not a breakpoint's (up to 8 times). `capture.mjs` asks for the first pause again if needed.
- **GS memory between sends**: `watson_gs_read {path, offset, length}` drains the GS thread and
  writes raw GS local memory (swizzled as the GS stores it; the software renderer, which Watson's
  launch selects, keeps it current). Tested live: paused at a breakpoint at the HDD rod function
  `0x00237A28` under the recompilers, 4 MB read; a frame later, 971 844 bytes differ. Breakpoints
  fire only under the recompilers; switch with `watson_set_cpu_mode` around them. Decoding into
  buffers is the same as for the GS memory at the start of a dump (`extract_buffers.mjs`).
- **Ports and paths for a second checkout**: `WATSON_INSTANCE_BASE` (ports 21512+base+k,
  28011+base+k), `WATSON_PCSX2_EXE`, `WATSON_REFERENCES`; `Build.ps1 -Tree -BuildDir -Deps`.

Watson offline suite on `speed`: 172 of 172 (new tests: probe index and list, recompiler mode
asked, instance base, the new tools).

## How to use (for the workers)

Until the cut-over, use the new build through environment variables:

```
WATSON_SERVER=D:/CodingProjects/Watson-speed/Server/dist/index.js
WATSON_PCSX2_EXE=D:/CodingProjects/pcsx2-speed/build/pcsx2-qt/Release/pcsx2-qt.exe
WATSON_REFERENCES=D:/CodingProjects/Watson/References
WATSON_INSTANCE_BASE=10
WATSON_DIST=D:/CodingProjects/Watson-speed/Server/dist     (for the verifiers' reader)
WATSON_CAPTURES=<captures directory>                       (optional; default Watson/Runtime/captures)
```

After the cut-over none of them are needed.

- **Capture**: one command per session, through the wrapper:
  `node References/scripts/with_emulator.mjs node References/scripts/capture.mjs --mode exact --verifiers verify_frame.mjs,verify_cubes.mjs --build hdd --state config --frames 60 --name hddosd-110U-x`
  - `--mode exact` (default): interpreters, no origins — use for every bit-for-bit check.
  - `--mode trace`: `watson_gif_trace` with origins — only to label or locate packets.
  - `--mode fast`: recompilers — structure only.
  - `--navigate fast`: launch and press under the recompilers, switch to the interpreters for the
    capture. Also `--presses '[["cross",6,60]]'`, `--hold up`, `--video pal`, `--args`, `--bios`,
    `--elf`, `--state-file`.
  - All verifiers of a screen can share one capture now: list them in `--verifiers`.
- **New verifier**: `import { readTraceFor, writesOf, f, add, sub, mul, div, sqrt, toInt, REG, pick, BUILD } from '../lib/index.mjs';`
  and `const readTrace = (file) => readTraceFor(file, PROBES);`. Use `add`/`sub` for sums, not
  `f(a + b)`.
- **Check**: `node References/scripts/run_all.mjs --changed` after changing a verifier or the model;
  `--filter cubes` for one area; add a new verifier's passing captures with
  `node References/scripts/run_all.mjs --discover --only verify_x.mjs`.
- **GS memory**: pause at a breakpoint (recompilers), `watson_gs_read`, decode as GS memory.

## Cut-over (when Jean confirms)

1. `git -C D:/CodingProjects/Watson merge --ff-only speed`, then `npm run build` in `Server`.
2. With no `pcsx2-qt.exe` running (or the running one renamed aside), run `Emulator/Build.ps1` in
   the main checkout: it copies `DebugServer.cpp`/`GifTrace.cpp` into `References/pcsx2`, swaps
   in the new `hooks.patch` (it now also touches `R5900.cpp` and `iR5900.cpp`) and rebuilds
   `build/` incrementally.
3. Live check: `capture.mjs --mode exact` on the HDD clock, then `verify_frame.mjs --carry`.
4. Remove the second checkout when no longer wanted: `git -C Watson/References/pcsx2 worktree
   remove D:/CodingProjects/pcsx2-speed`, `git -C Watson worktree remove ../Watson-speed`.

## Left

- The 3-versus-5 measurement (script ready).
- The verifiers' own float helpers onto `lib/ee-float.mjs` (one at a time, `run_all.mjs` as guard).
- Asked by the workers, not built: holding a button for only the first N frames of a capture,
  arming probes or writing memory at a given frame inside a capture (`opening3`'s disc state).
- Why the recompilers' VU0 and FPU results differ from the interpreters' (only measured, not read).

## Stuck git commands

No `index.lock` exists in `Watson/.git` or in the `Watson-speed` worktree. The one long-lived
git process on the machine is `git.exe commit -F lab/msg9.txt` (pid 32580, started 20:37), which is
neither this work's nor Watson's (Watson has no `lab/`); it was left alone. The hangs coincide with
the regression runs (six verifiers reading traces of up to 400 MB, 2.4 GB of memory free): the
machine was paging.
