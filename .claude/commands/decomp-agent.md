---
name: decomp-agent
description: Generic worker prompt for any decomp target. Edit the TARGET block at the top to point at a function or subsystem; runs the full match/iterate/promote loop via the orchestrator in agent mode.
---

# /decomp-agent

Reusable prompt for any IDE agent (Claude Code, Antigravity, Cursor) to drive the
CrystalOSD orchestrator end-to-end. Edit only the `## TARGET` block before running.

---

## TARGET
Mode: function          # function | subsystem
Name: nullsub_12        # function name OR subsystem name (graph, core, browser, ...)
Max iterations: 5       # cap per function before STUCK
Auto-promote: true      # move to src/ + flip splat + make verify on success

## ROLE
You are the WORKER for CrystalOSD. Match MIPS R5900 functions to byte-perfect C
using the orchestrator in agent mode. The orchestrator handles ASM extraction,
decomp.me submit/iterate, and scoring. You write the C.

## PROJECT
/Users/jeanxpereira/CodingProjects/CrystalOSD

## TOOLCHAIN PRELOAD (run once before anything)
```bash
export PATH=/Users/jeanxpereira/ps2dev/ee/bin:/Users/jeanxpereira/ps2dev/iop/bin:/Users/jeanxpereira/ps2dev/dvp/bin:$PATH
export PS2DEV=/Users/jeanxpereira/ps2dev
export PS2SDK=$PS2DEV/ps2sdk
```

## DISPATCH BY MODE

### Mode = function
Process a single function `$Name` from `queue.json` (or build adhoc if missing).

### Mode = subsystem
1. Run: `python3 -m tools.orchestrator queue show --top 50`
2. Filter to subsystem `$Name`; pick the lowest-score (easiest) function not yet matched
3. Process that one function via the function workflow below
4. After SOLVED+promoted, return here, pick next, repeat until 5 functions done OR
   no more candidates in subsystem OR user interrupts

## FUNCTION WORKFLOW (apply to one function `$FUNC` at a time)

### 1. BUILD BRIEF (no LLM call; pure data fetch)
```bash
python3 -m tools.orchestrator plan $FUNC --save
```
Read `.orchestrator/briefs/$FUNC.json`. Note: subsystem, asm_file, target_asm,
system_prompt, hard-flags. If hard-flags include MMI / MULT1 / COP2: warn user,
may need inline asm or unmatchable.

### 2. ENRICH CONTEXT (optional, recommended)

**2a. Ghidra decompile**
- Call `mcp__ghidra-mcp__decompile_function` with name=`$FUNC`
- Save output to `/tmp/$FUNC.ghidra.c`

**2b. Similar matched functions (RAG)**
- Call `mcp__decomp-me-mcp__decomp_search_context` with the asm or func info
- Save list as JSON: `[{"name":..., "asm":..., "c_source":...}]`
- Save to `/tmp/$FUNC.similar.json`

**2c. Re-plan with extras**
```bash
python3 -m tools.orchestrator plan $FUNC \
  --ghidra-pseudo /tmp/$FUNC.ghidra.c \
  --similar-json /tmp/$FUNC.similar.json \
  --save
```

### 3. WRITE C
Path: `src/stubs/<subsystem>/$FUNC.c` (use subsystem from brief)

Rules from `brief.system_prompt` — strict adherence:
- Compiler: `ee-gcc2.9-991111`, flags `-O2 -G0`
- PS2SDK types only (`u8`/`u16`/`u32`/`s8`/`s16`/`s32`/`u64`/`s64`); never `stdint.h`
- C99, `/* */` comments only
- Line above function definition: `/* 0x<ADDRESS> - <FUNC> */`
- Match every branch and call exactly; no invented code paths

ee-gcc 2.9 quirks:
- Negative masks: `var = ((s32)var & -7);` to force `li` not `lui+ori`
- Delay-slot hoisting: declare locals AFTER conditionals consuming the same reg
- Sub-byte bitfields: NEVER use C bitfields when target uses `lw + srl + andi`;
  use plain `u32` + bitwise math
- No `volatile` hacks; ee-gcc 2.9 does NOT cache pointers via `addiu`
- Reordering local declarations changes register allocation
- MMI / MULT1 / 128-bit `lq`/`sq` / COP2 ops are NOT C-emittable; inline asm only

### 4. SUBMIT TO DECOMP.ME
```bash
python3 -m tools.orchestrator submit $FUNC src/stubs/<subsystem>/$FUNC.c
```
Capture JSON: `{slug, url, score, max_score, match}`. Save the slug. Print URL.

### 5. EVALUATE
- IF `match=true` (score == 0): jump to step 8 (PROMOTE)
- IF `score <= 15` (symbol-only): jump to step 8 (PROMOTE)
- IF `score > 15`: proceed to step 6

### 6. ITERATE (max 4 more attempts; total 5)

**6a.** Fetch diff: call `mcp__decomp-me-mcp__decomp_get_scratch` with `slug`.
Read diff. Identify: instruction order? register allocation? mask form? branch
direction? type signedness? loop vs goto?

**6b.** Edit `src/stubs/<subsystem>/$FUNC.c` with one targeted change.

**6c.** Re-iterate:
```bash
python3 -m tools.orchestrator iterate <slug> src/stubs/<subsystem>/$FUNC.c
```

**6d.** Track score history. If 3 iterations in a row at the same score:
declare STUCK, jump to step 7.

**6e.** If `score == 0` or `<= 15`: jump to step 8.

**6f.** Else: repeat 6a–6e until iteration cap reached.

### 7. STUCK / EXHAUSTED

IF stuck (3 same-score iters):
```bash
./tools/permuter_import.sh $FUNC src/stubs/<subsystem>/$FUNC.c
```
Print: `STUCK at score N — imported into decomp-permuter; user should run
cd tools/decomp-permuter && python3 ./permuter.py nonmatchings/$FUNC -j8`

Move to next function (subsystem mode) or stop (function mode).

IF iteration cap hit without improvement:
Print: `EXHAUSTED at score N — best-effort C left at src/stubs/<subsystem>/$FUNC.c`

Move to next function or stop.

### 8. PROMOTE (only if `Auto-promote == true`)
```bash
python3 -m tools.orchestrator promote --func $FUNC --apply --build
```

This:
- moves `src/stubs/<sub>/$FUNC.c` → `src/<sub>/$FUNC.c`
- flips `splat_config.yml` subsegment from `asm` to `c`
- runs `make verify` (must report byte-perfect match)

IF `make verify` fails:
```bash
git checkout -- splat_config.yml
git clean -f src/<sub>/$FUNC.c include/$FUNC.ctx.h 2>/dev/null
```
Print: `PROMOTE FAILED: make verify broke. Stub kept; splat reverted.` Stop.

IF promote succeeds:
Print: `PROMOTED $FUNC at score N. Build still byte-perfect.`

### 9. NEXT (subsystem mode only)
Return to MODE DISPATCH. Pick next easiest in `$Name`. Cap at 5 total functions
per session unless user says continue.

## OUTPUT REQUIREMENTS
- After every shell command, print stdout/stderr verbatim.
- After SOLVED: print `{func, score, decomp.me URL, file path}`
- After STUCK or EXHAUSTED: print state + recovery hint.
- Do not invent function names. Use `FUN_XXXXXXXX` for unknown callees.
- Do not modify files outside `src/stubs/<sub>/`, `src/<sub>/`, `splat_config.yml`,
  `/tmp/`, `.orchestrator/briefs/`, `include/`.

## STOP CONDITIONS (always)
- User interrupts with new instruction
- 5 functions completed (subsystem mode)
- Network error on decomp.me API after 3 consecutive retries
- `make verify` breaks (revert + stop)

## QUICK REFERENCE
```bash
python3 -m tools.orchestrator queue show --top 20      # next targets
python3 -m tools.orchestrator plan <FUNC> --save       # build brief
python3 -m tools.orchestrator submit <FUNC> <c>        # new scratch
python3 -m tools.orchestrator iterate <slug> <c>       # recompile
python3 -m tools.orchestrator promote --func <FUNC> --apply --build
python3 tools/commit_organizer.py --commit \
    --co-author "Claude Opus 4.7 <noreply@anthropic.com>"
```

## TARGET cheat sheet
| Want | Edit TARGET block |
|---|---|
| Match one specific function | `Mode: function` + `Name: <func>` |
| Match easiest 5 in graph | `Mode: subsystem` + `Name: graph` |
| Don't auto-promote (manual review first) | `Auto-promote: false` |
| More retries per function | bump `Max iterations` |
