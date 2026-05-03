---
name: decomp-workflow
description: Standard decomp workflow for reconstructing OSDSYS functions. Covers Ghidra analysis, decomp.me matching, and source code verification.
---

# CrystalOSD Decomp Workflow

## Compiler & Flags
- **Compiler**: `ee-gcc2.9-991111` (Sony EE GCC for R5900)
- **Flags**: `-O2 -G0`
- **Platform**: `ps2`
- **Confirmed** via `do_read_cdvd_config_entry` and `graph_reset_related1` perfect matches on decomp.me

## Step-by-Step Process

### 1. Identify Target
- Use `ghidra-mcp` to find the function (by name or address)
- Check asm files in `asm/<subsystem>/` for extracted assembly
- Get function metrics (complexity, basic blocks, call count)

### 2. Extract ASM
```bash
python3 tools/decomp_match.py extract <func_name> asm/<subsystem>/<file>.s
```
This extracts the function between `glabel`/`endlabel` markers and formats for decomp.me.

### 3. Write C Reconstruction
Place in `src/<subsystem>/` directory. Follow these rules:

**Compiler quirks (CRITICAL for matching):**
- `(s32)var & -N` → forces single `addiu` instruction for mask (not `lui+ori`)
- `int one = 1;` then `one << exp` → forces constant into separate register for `sllv`
- `bnel` (branch not equal likely) is used for loop back-edges by this GCC version
- Goto structures often match better than structured `for`/`while` loops
- Declaration order may affect register allocation (but not always)
- `u32` vs `int` controls `sltiu` vs `slti` — match the target instruction

**Global variables accessed via `%hi`/`%lo` (config getters/setters):**
- These produce `lui+lw`/`lui+sw` — score 10-15 off on decomp.me is symbol-only diff (perfect match locally)

**GP-relative accesses (`%gp_rel`):**
- Cannot match on decomp.me (no GP context) — requires local toolchain

### 4. Submit to decomp.me
```bash
# Single function from file
python3 tools/decomp_match.py submit <func_name> asm/<sub>/<file>.s src/<sub>/<file>.c

# Inline (for quick iteration)
python3 tools/decomp_match.py submit_inline <func_name> --asm "..." --source "..."

# Batch from manifest
python3 tools/decomp_match.py batch tools/graph_manifest.json
```

### 5. Interpret Scores
| Score | Meaning |
|-------|---------|
| 0 | ✅ Perfect match |
| 10-15 | 🟡 Symbol address diff only — matching with local toolchain |
| < 100 | 🔶 Very close — instruction scheduling or condition order |
| > 100 | 🔸 Structural difference — wrong loop/branch pattern |

### 6. Track Results
```bash
python3 tools/decomp_match.py results
```
All results persist in `tools/decomp_results.json`.

## Batch Manifest Format
```json
{
  "default_asm_file": "asm/graph/graph.s",
  "default_flags": "-O2 -G0",
  "functions": [
    {
      "name": "GetTexExponent",
      "source": "int GetTexExponent(int d) { ... }"
    }
  ]
}
```

## Common MIPS/Ghidra Patterns
- `$a0-$a3` = function arguments (param_1 through param_4)
- `$v0-$v1` = return values
- `$s0-$s7` = callee-saved (local variables across calls)
- `$t0-$t9` = caller-saved (temporaries)
- `$ra` = return address
- `daddu` = 64-bit add (used as `move` on R5900)
- `mult` (3-operand) = R5900 3-register multiply
- `mult1`/`mflo1`/`mfhi1` = R5900 second multiply pipeline
