# Agent kit

Read this first. It is the same for every agent and every task; your brief adds only the task.

## Paths

| Variable | Default | Holds |
|---|---|---|
| `CRYSTALOSD_DATA` | `D:/CodingProjects/CrystalOSD-Data` | dumps, BIOS, fixtures, textures (Sony data, never committed) |
| `CRYSTALOSD_ASM` | `D:/CodingProjects/CrystalOSD-Decomp-Legacy/asm` | the HDD OSD 1.10U disassembly, one `.s` per function |
| `CRYSTALOSD_CAPTURES` | `D:/CodingProjects/Watson/Runtime/captures` | Watson captures (`.trace.jsonl.gz`, `.gs`, `.png`) |

Scripts locate them through `References/lib/data.mjs` (`DATA_HOME`, `ASM_HOME`, `CAPTURES`, `dataPath`, `asmPath`). Scratch output goes to `lab/` (git-ignored).

## Reading code

- `node References/scripts/asm.mjs <name|0xADDR>` prints one HDD OSD function, address and instruction per line.
- `--callers` adds every `jal`/`j` to it; `--writers <symbol>` lists every store that names a symbol; `--rom` adds the ROM 2.30 address of the same code.
- Never `cat`, `sed` or `grep` through the asm folder: one `asm.mjs` call per function.
- `disasm_rom.py` only for ROM 2.30 code with no HDD OSD counterpart.
- `facts/` is the trusted store: grep a page for an address, never read a whole page to find one.

## Verifier API

`import { ... } from '../lib/index.mjs'`:

- Floats (`ee-float.mjs`): `f add sub mul div sqrt madd toInt toUnsigned floatBits asFloat down flushIn s16 u16 MAX MIN_NORMAL`.
- Traces (`trace.mjs`): `readTraceFor readTrace loadTrace traceExists writesOf probesOf only mergeProbes`.
- GS (`gif.mjs`): `REG REG_NAME big rgba`. Memory (`memory.mjs`): `vector matrix ints bytesOf`.
- Builds (`builds.mjs`): `BUILD BUILD_NAME PAL FPS ROWS pick range pc`; `CLOCK_BUILD=hdd|rom`, `CLOCK_VIDEO=pal`.

EE float rule: every single-precision operation is cut toward zero (`add`, `sub`, `mul`, `div`; never `f(a + b)`); no denormals; `cvt.w.s` truncates (`toInt`). VU0 macro ops are FPU-like; check the rounding per op.

A verifier exports `PROBES = [{ pc, ranges }]` (with `pick({ rom, hdd })`) and prints `verdict: FOUND ...` or `verdict: PARTIAL ...` as its last line. A verifier that compared nothing never says FOUND.

## Capture

```
node References/scripts/with_emulator.mjs node References/scripts/capture.mjs --mode exact --verifiers verify_x.mjs --build hdd --state clock --frames 30 --name hddosd-110U-x
```

`--mode exact` for bit-for-bit checks, `trace` only to learn which function sent a packet; `--state menu|config|clock`; `--presses '[["cross",6,60]]'` (hold 6 frames); `--hold up`; `--video pal`. Names: `<build>-<topic>-<what>` (`hddosd-110U-…`, `rom-0230A-…`, `rom-0230E-pal-…`). Keep captures to 30–120 frames.

## Waiting

Captures, `mutate.mjs`, `run_all.mjs` and builds run in the background (`run_in_background`); you are notified when they end. Never poll: a hook refuses `sleep` and `Start-Sleep`.

## Rigor

- **EE/VU arithmetic** (the clock, the cubes, the 3D icons, anything computed in floats): both builds, PAL where the value can depend on the video mode, mutation with no unexplained survivor, two refuters.
- **UI layout, strings, sound senders**: HDD OSD 1.10U, the golden gate (`bin/CrystalOSD.exe --golden check`), one refuter.

A difference with no known cause is a failure, never a tolerance. Never fit a constant to a capture.

## Output

Return the report shape your agent file names. Paste command output trimmed to the lines that prove the claim; never paste history.
