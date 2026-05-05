---
name: decomp-workflow
description: Standard decomp workflow for reconstructing OSDSYS functions. Covers Ghidra analysis, decomp.me matching via API, and source code verification.
---

# CrystalOSD Decomp Workflow

## Compiler & Flags
- **Compiler**: `ee-gcc2.9-991111` (Sony EE GCC for R5900)
- **Flags**: `-O2 -G0`
- **Platform**: `ps2`
- **Confirmed** via `do_read_cdvd_config_entry` and `graph_reset_related1` perfect matches on decomp.me

## ⚠️ Environment Constraints
- **NO DOCKER** — Hackintosh x86_64, virtualization broken. Never suggest Docker.
- **ee-gcc 2.9 is NOT installed locally** — only `gcc 15.2` at `/Users/jeanxpereira/ps2dev/ee/bin/`
- **Local GCC 15.2 is for asm linking only** (`make elf`), NOT for C matching
- **All C matching goes through decomp.me API** via `tools/decomp_match.py`

## Matching Tool: `tools/decomp_match.py`

### Architecture
The script uses the decomp.me REST API with browser-like headers (User-Agent, Origin, Referer) to bypass Cloudflare on the `/compile` endpoint. This allows:
- **ONE scratch per function** (created once via `submit`)
- **Unlimited recompilations** on the same scratch (via `iterate`)
- **No server spam** — iterate reuses the existing scratch

### Key Commands

```bash
# 1. Discover functions in a subsystem
python3 tools/decomp_match.py discover history
# → JSON list of all .s files in asm/history/

# 2. Extract raw ASM for inspection
python3 tools/decomp_match.py extract <func_name> asm/<sub>/<file>.s

# 3. Create scratch on decomp.me (ONCE per function)
python3 tools/decomp_match.py submit <func_name> asm/<sub>/<file>.s src/<sub>/<file>.c
# → Returns JSON with slug, score, URL
# → Slug is saved to tools/decomp_results.json

# 4. Iterate on existing scratch (use this for matching loop!)
python3 tools/decomp_match.py iterate <slug> src/<sub>/<file>.c
# → Returns JSON: {"score": N, "max_score": M, "match": true/false}
# → Does NOT create new scratch — reuses /compile endpoint

# 5. One-shot: submit + get score in one go
python3 tools/decomp_match.py oneshot <func_name> asm/<sub>/<file>.s src/<sub>/<file>.c

# 6. Check all tracked results
python3 tools/decomp_match.py results
```

### Matching Loop (Agent Workflow)
```
1. Decompile function in Ghidra (ghidra-mcp)
2. Write initial C in src/<sub>/<func>.c
3. `submit` → get slug + initial score
4. Loop:
   a. Analyze score / compiler output
   b. Tweak C source (apply compiler quirks below)
   c. `iterate <slug> src/<sub>/<func>.c` → new score
   d. If score == 0 → DONE (perfect match)
   e. If stuck 3 iterations at same score → try different approach
5. Save final source, update PS2_PROJECT_STATE.md
```

## Compiler Quirks (CRITICAL for matching ee-gcc 2.9)

**Instruction selection:**
- `(s32)var & -N` → forces single `addiu` instruction for mask (not `lui+ori`)
- `int one = 1;` then `one << exp` → forces constant into separate register for `sllv`
- `u32` vs `int` controls `sltiu` vs `slti` — match the target instruction

**Control flow:**
- `bnel` (branch not equal likely) is used for loop back-edges
- `goto` structures often match better than structured `for`/`while` loops
- Declaration order may affect register allocation

**Symbol diffs (expected on decomp.me):**
- `%hi`/`%lo` global accesses → score 10-15 off = symbol-only diff (counts as match)
- `%gp_rel` accesses → cannot match on decomp.me (no GP context)

## Interpret Scores
| Score | Meaning |
|-------|---------|
| 0 | ✅ Perfect match |
| 10-15 | 🟡 Symbol address diff only — effectively matching |
| < 100 | 🔶 Very close — instruction scheduling or condition order |
| > 100 | 🔸 Structural difference — wrong loop/branch pattern |

## Common MIPS/Ghidra Patterns
- `$a0-$a3` = function arguments (param_1 through param_4)
- `$v0-$v1` = return values
- `$s0-$s7` = callee-saved (local variables across calls)
- `$t0-$t9` = caller-saved (temporaries)
- `$ra` = return address
- `daddu` = 64-bit add (used as `move` on R5900)
- `mult` (3-operand) = R5900 3-register multiply
- `mult1`/`mflo1`/`mfhi1` = R5900 second multiply pipeline
