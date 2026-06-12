---
name: decomp-agent
description: Generic worker prompt for any decomp target. Edit the TARGET block at the top to point at a function or subsystem; runs the full objdiff match/iterate/promote loop.
---

# /decomp-agent

Reusable prompt for any IDE agent (Claude Code, Antigravity, Cursor) to drive the
CrystalOSD decomp workflow end-to-end via the **objdiff golden path**.
Edit only the `## TARGET` block before running.

> The former orchestrator (`python3 -m tools.orchestrator`) is archived in `tools/attic/`.
> Do not invoke it. The workflow below replaces it entirely.

---

## TARGET
Mode: function          # function | subsystem
Name: nullsub_12        # function name OR subsystem name (graph, core, browser, ...)
Max iterations: 5       # cap per function before STUCK
Auto-promote: true      # move to src/ + flip splat + make verify on success

## ROLE
You are the WORKER for CrystalOSD. Match MIPS R5900 functions to byte-perfect C
using the objdiff golden path. You write the C; `make all` builds the comparison objects.

## PROJECT
Repo root: infer from cwd or `git rev-parse --show-toplevel`.

## TOOLCHAIN PRELOAD (run once before anything)
```bash
export PATH=$PS2DEV/ee/bin:$PS2DEV/iop/bin:$PS2DEV/dvp/bin:$PATH
export PS2DEV=/path/to/ps2dev          # set to your actual ps2dev prefix
export PS2SDK=$PS2DEV/ps2sdk
export MATCH_CC=/path/to/ee-gcc2.9-991111/bin/ee-gcc
```

## DISPATCH BY MODE

### Mode = function
Process a single function `$Name`.

### Mode = subsystem
1. Run: `python3 tools/progress.py --markdown`
2. Filter to subsystem `$Name`; pick the easiest unmatched function (smallest, fewest callees)
3. Process that one function via the function workflow below
4. After PROMOTED, return here, pick next, repeat until 5 functions done OR
   no more unmatched candidates in subsystem OR user interrupts

## FUNCTION WORKFLOW (apply to one function `$FUNC` at a time)

### 1. LOCATE TARGET
- Confirm `asm/<subsystem>/$FUNC.s` exists (unmatched splat output)
- Identify subsystem from `symbol_addrs.txt`: `grep "^$FUNC " symbol_addrs.txt`

### 2. ANALYZE IN GHIDRA
- Call `mcp__ghidra__decompile_function` with `name=$FUNC`
- Note: address, subsystem, control flow, callees, data types, MMI/COP2 instructions
- If hard-flags include MMI / MULT1 / COP2: warn user — may need inline asm or be unmatchable

### 3. ENRICH CONTEXT (optional, recommended)
- Cross-reference with PS2SDK via `/crossref $FUNC`
- Check `reference/COMPILER_QUIRKS.md` for known ee-gcc 2.9 patterns relevant to this function

### 4. WRITE C
Path: `src/<subsystem>/$FUNC.c`

Rules — strict adherence:
- Compiler: `ee-gcc2.9-991111`, flags `-O2 -G0`
- PS2SDK types only (`u8`/`u16`/`u32`/`s8`/`s16`/`s32`/`u64`/`s64`); never `stdint.h`
- C99, `/* */` comments only
- Line above function definition: `/* 0x<ADDRESS> - $FUNC */`
- Match every branch and call exactly; no invented code paths

ee-gcc 2.9 quirks (see `reference/COMPILER_QUIRKS.md` for full list):
- Negative masks: `var = ((s32)var & -7);` to force `li` not `lui+ori`
- Delay-slot hoisting: declare locals AFTER conditionals consuming the same reg
- Sub-byte bitfields: NEVER use C bitfields when target uses `lw + srl + andi`;
  use plain `u32` + bitwise math
- Reordering local declarations changes register allocation
- MMI / MULT1 / 128-bit `lq`/`sq` / COP2 ops: inline asm only

### 5. BUILD COMPARISON OBJECTS
```bash
make all
```
Builds:
- `build/target/<sub>/$FUNC.o` from `asm/<sub>/$FUNC.s`
- `build/base/<sub>/$FUNC.o` from `src/<sub>/$FUNC.c` via `$MATCH_CC`

### 6. EVALUATE DIFF IN OBJDIFF
Open objdiff, navigate to `$FUNC`. Inspect the `.text` diff.

- IF diff is zero: jump to step 9 (PROMOTE)
- IF diff is small (symbol-only, NOP padding, one instruction): proceed to step 7
- IF diff is large: step back, re-read Ghidra output, adjust C structure

### 7. ITERATE (max `Max iterations` total attempts)

**7a.** Read the objdiff. Identify: instruction order? register allocation? mask form?
branch direction? type signedness? loop vs goto?

**7b.** Edit `src/<subsystem>/$FUNC.c` with one targeted change at a time.

**7c.** Re-run `make all` and re-check objdiff.

**7d.** Track diff history. If 3 iterations in a row show the same diff:
declare STUCK, jump to step 8.

**7e.** If diff is zero: jump to step 9.

**7f.** Else: repeat 7a–7e until iteration cap reached.

### 8. STUCK / EXHAUSTED

IF stuck (3 same-diff iters):
```bash
./tools/permuter_import.sh $FUNC src/<subsystem>/$FUNC.c
```
Print: `STUCK — imported into decomp-permuter. Run:`
```bash
cd tools/decomp-permuter && python3 ./permuter.py nonmatchings/$FUNC -j8
```
Move to next function (subsystem mode) or stop (function mode).

IF iteration cap hit without progress:
Print: `EXHAUSTED — best-effort C left at src/<subsystem>/$FUNC.c`
Move to next function or stop.

### 9. PROMOTE (only if `Auto-promote == true`)

1. Flip the splat subsegment in `splat_config.yml` from `asm` → `c` for `$FUNC`
2. Run:
   ```bash
   python3 configure.py -c && make -j16 elf && make verify
   ```
   Must report byte-perfect match.

IF `make verify` fails:
```bash
git checkout -- splat_config.yml
```
Print: `PROMOTE FAILED: make verify broke. Stub kept; splat reverted.` Stop.

IF promote succeeds:
Print: `PROMOTED $FUNC — build still byte-perfect.`

### 10. COMMIT
```bash
git add src/<sub>/$FUNC.c splat_config.yml
git commit -m "decomp(<sub>): match $FUNC"
```

### 11. NEXT (subsystem mode only)
Return to MODE DISPATCH. Pick next easiest in `$Name`. Cap at 5 total functions
per session unless user says continue.

---

## OUTPUT REQUIREMENTS
- After every shell command, print stdout/stderr verbatim.
- After SOLVED: print `{func, objdiff score (lines differing), file path}`
- After STUCK or EXHAUSTED: print state + recovery hint.
- Do not invent function names. Use `FUN_XXXXXXXX` for unknown callees.
- Do not modify files outside `src/<sub>/`, `splat_config.yml`, `include/`.

## STOP CONDITIONS (always)
- User interrupts with new instruction
- 5 functions completed (subsystem mode)
- `make verify` breaks (revert splat_config.yml + stop)

---

## QUICK REFERENCE
```bash
python3 tools/progress.py --markdown            # pick next targets
make all                                         # build target + base .o
python3 tools/generate_objdiff.py               # regenerate objdiff.json
./tools/permuter_import.sh <FUNC> src/<sub>/<FUNC>.c
cd tools/decomp-permuter && python3 ./permuter.py nonmatchings/<FUNC> -j8
python3 configure.py -c && make -j16 elf && make verify
python3 tools/commit_organizer.py --commit
```

## Fallback 2 — decomp.me (community sharing only)
```bash
python3 tools/decomp_match.py submit <FUNC> asm/<sub>/<FUNC>.s src/<sub>/<FUNC>.c
python3 tools/decomp_match.py iterate <slug> src/<sub>/<FUNC>.c
```
Not required for local matching. Use to share scratches with the decomp community.

## TARGET cheat sheet
| Want | Edit TARGET block |
|---|---|
| Match one specific function | `Mode: function` + `Name: <func>` |
| Match easiest 5 in graph | `Mode: subsystem` + `Name: graph` |
| Don't auto-promote (manual review first) | `Auto-promote: false` |
| More retries per function | bump `Max iterations` |
