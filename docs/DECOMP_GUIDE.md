# CrystalOSD — Decomp Binary Matching Guide

> Everything you need to take a function from raw assembly to 100% binary parity on [decomp.me](https://decomp.me).
> This guide consolidates all compiler quirks, tooling, workflow, and hard-won tricks discovered during the project.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Toolchain & Compiler](#2-toolchain--compiler)
3. [Workflow: Step by Step](#3-workflow-step-by-step)
4. [decomp_match.py — The Extraction Tool](#4-decomp_matchpy--the-extraction-tool)
5. [decomp.me — Scratch Setup](#5-decompme--scratch-setup)
6. [EE GCC 2.9 Compiler Quirks](#6-ee-gcc-29-compiler-quirks)
7. [Pattern Cookbook (Proven Matches)](#7-pattern-cookbook-proven-matches)
8. [Score Interpretation](#8-score-interpretation)
9. [After 100% — Applying to the Project](#9-after-100--applying-to-the-project)
10. [Function Status Tracker](#10-function-status-tracker)
11. [Known Bugs & Pitfalls](#11-known-bugs--pitfalls)

---

## 1. Project Overview

**CrystalOSD** is a clean-room reconstruction of the PlayStation 2 **OSDSYS** (system menu / HDDOSD 1.10U).

- **Binary**: `hddosd.elf` — MIPS R5900, base address `0x200000`
- **Goal**: 100% byte-identical C source that compiles to the exact same binary
- **Verification**: [decomp.me](https://decomp.me) for remote matching, `objdiff` for local

### Project Structure

```
CrystalOSD/
├── asm/                    # Extracted assembly per subsystem
│   ├── graph/graph.s       # Graph subsystem (GS, framebuffer)
│   ├── config/config.s     # Config functions
│   ├── core/core.s         # Core/main functions
│   ├── sound/sound.s       # Sound subsystem
│   └── ...
├── src/                    # Reconstructed C source
│   ├── graph/
│   │   ├── graph_funcs.inc # Graph reset, IMR syscalls
│   │   └── gs_util.inc     # GS allocation, tex exponent
│   ├── config/
│   ├── sound/
│   └── ...
├── tools/
│   ├── decomp_match.py     # Main extraction & submission tool
│   └── decomp_results.json # Persistent score tracking
├── reference/
│   └── COMPILER_QUIRKS.md  # EE GCC quirks reference
└── CLAUDE.md               # Project-wide agent instructions
```

### Assembly File Format

Functions in `asm/*.s` are delimited by `glabel` / `endlabel`:

```asm
/* === FunctionName === */
glabel FunctionName
    /* ADDR HEX_BYTES */  instruction    operands
    ...
endlabel FunctionName
```

---

## 2. Toolchain & Compiler

| Property | Value |
|----------|-------|
| **Compiler** | `ee-gcc2.9-991111` (Sony EE GCC for R5900) |
| **Optimization** | `-O2` |
| **Small Data** | `-G0` (no GP-relative access) |
| **Platform** | `ps2` (MIPS R5900, Emotion Engine) |
| **decomp.me preset** | Search for "ps2" or "ee-gcc" |

> **IMPORTANT**: Do NOT use GCC 2.96 or 2.95.2 — they have different register allocation, pointer caching, and optimization strategies. The binary was compiled with the exact `2.9-991111` version.

### When to Use `-G8` Instead of `-G0`

If the **target assembly** contains `%gp_rel(...)($gp)` accesses (GP-relative loads/stores), the function was compiled with `-G8` (or higher). This tells the compiler to use the Global Pointer for variables ≤ 8 bytes.

- **`-G0`**: All globals accessed via `lui` + `lw`/`sw` (two instructions)
- **`-G8`**: Small globals accessed via `lw %gp_rel(var)($gp)` (one instruction)

**How to tell**: Look at the target ASM. If you see `%gp_rel`, use `-G8`. If you see `%hi`/`%lo`, use `-G0`.

---

## 3. Workflow: Step by Step

### Step 1: Pick a Function

Choose from the ASM files in `asm/<subsystem>/`. Start with small, leaf functions (no calls to other functions) — they're easier to match.

```bash
# List all functions in an asm file
grep -E 'glabel ' asm/graph/graph.s
```

### Step 2: Extract Target Assembly

```bash
python3 tools/decomp_match.py extract <func_name> asm/<subsystem>/<file>.s
```

This outputs clean assembly ready for decomp.me (strips address comments, keeps labels).

### Step 3: Prepare Context

The **context** is a set of type definitions and extern declarations that the compiler needs. The tool has a built-in default context, but you may need to add function-specific externs.

Minimal context template:
```c
typedef unsigned char u8;
typedef unsigned short u16;
typedef unsigned int u32;
typedef signed char s8;
typedef signed short s16;
typedef signed int s32;
typedef unsigned long u64;
typedef signed long s64;

typedef unsigned int size_t;

// Add function-specific externs here:
// extern int psmToBppGS(int psm);
// extern int g_gs_vram_ptr;
```

### Step 4: Write Initial C Source

Write your best guess at the C code. Use the decompiled output from Ghidra as a starting point. Key rules:

- Use PS2SDK types (`u32`, `s16`, etc.), not `stdint.h`
- Comment the original address: `/* 0x001F72D8 - FuncName */`
- Preserve original control flow — don't "clean up" the logic
- Mark uncertain code with `/* TODO: verify */`

### Step 5: Submit to decomp.me

Create a new scratch on [decomp.me](https://decomp.me/new):

1. **Platform**: ps2
2. **Compiler**: ee-gcc2.9-991111
3. **Compiler flags**: `-O2 -G0` (or `-G8` if target uses `%gp_rel`)
4. **Target assembly**: Paste the extracted ASM
5. **Context**: Paste your context header
6. **Source code**: Paste your C code

Or use the CLI tool:
```bash
python3 tools/decomp_match.py submit <func_name> asm/graph/graph.s src/graph/gs_util.inc
```

### Step 6: Iterate Until 100%

Compare **Target** (left) vs **Current** (right) in the objdiff view. Fix mismatches by applying the compiler quirks documented below.

### Step 7: Apply to Project

Once matched, update the corresponding `.inc` or `.c` file in `src/` and track in `PS2_PROJECT_STATE.md`.

---

## 4. decomp_match.py — The Extraction Tool

Located at `tools/decomp_match.py`. Main commands:

| Command | Description |
|---------|-------------|
| `extract <func> <asm_file>` | Extract target assembly from `.s` file |
| `submit <func> <asm_file> <src_file>` | Submit to decomp.me API |
| `submit_inline <func> --asm "..." --source "..."` | Submit with inline code |
| `batch <manifest.json>` | Batch submit from JSON manifest |
| `results [--min-match N]` | Show tracked results |

### Example Workflow

```bash
# 1. Extract the target
python3 tools/decomp_match.py extract GetTexExponent asm/graph/graph.s

# 2. Submit with source file
python3 tools/decomp_match.py submit GetTexExponent asm/graph/graph.s src/graph/gs_util.inc

# 3. Check all results
python3 tools/decomp_match.py results
```

### Known Tool Bug (FIXED)

The extraction regex was previously **greedy** when stripping comments, which would eat instructions like `syscall` if they appeared on the same line as `/* ... */` comments. This was fixed by making the regex non-greedy:

```python
# OLD (BROKEN): m = re.match(r'\s*/\*.*\*/\s*(.*)', stripped)
# NEW (FIXED):  m = re.match(r'\s*/\*.*?\*/\s*(.*)', stripped)
```

If you suspect the extraction is stripping instructions, check line 91 of `decomp_match.py`.

---

## 5. decomp.me — Scratch Setup

### Creating a Scratch Manually

1. Go to [decomp.me/new](https://decomp.me/new)
2. Select platform: **ps2**
3. Select compiler: **ee-gcc2.9-991111**
4. Set flags: **`-O2 -G0`**
5. Toggle **objdiff** view (top right of the diff panel) for side-by-side comparison
6. Paste: Target ASM, Context, and Source Code

### Target ASM Format

The target must start with:
```asm
.set noat
.set noreorder

FunctionName:
    instruction    operands
    ...
```

The `.set noat` and `.set noreorder` directives are **required** — they tell the assembler not to reorder instructions or insert implicit `$at` usage.

---

## 6. EE GCC 2.9 Compiler Quirks

These are the hard-won rules for getting `ee-gcc2.9-991111` to emit specific instruction patterns. **This section is the most important part of this guide.**

### 6.1 Bitwise Masks with Negative Constants

When masking with a negative constant like `& ~63` (which is `& -64`), the compiler can generate either:
- `lui` + `ori` (two instructions for the 32-bit constant `0xFFFFFFC0`)
- `addiu` (single instruction: `addiu reg, $zero, -64`)

**Rule**: Cast to `(s32)` before the AND to force the single-instruction form:

```c
// BAD — generates lui + ori
var = var & ~63;

// GOOD — generates addiu + and
var = ((s32)var & -64);
```

### 6.2 Pointer Re-Use (No Caching)

Unlike GCC 2.96, this compiler does **NOT** cache global struct pointers into registers using `addiu`. Instead it reuses the `%hi` portion and continuously applies `%lo` offsets.

**Rule**: Write standard C code. Don't use `volatile` hacks to force reloads — the compiler naturally generates the correct pattern.

### 6.3 `goto` for Exact Branch Patterns

When the target uses specific branch sequences (`beql`, `bnel`, `bgezl` — the "likely" variants), structured `for`/`while` loops may not generate matching code because the compiler optimizes them differently.

**Rule**: Use `goto` with explicit labels when the target has unusual branch patterns:

```c
// Forces exact branch-likely sequence
int i = 0;
loop:
    if (condition) {
        // body
        i++;
        goto loop;
    }
```

### 6.4 `bnel` (Branch Not Equal Likely) in Loops

The compiler uses `bnel` for loop back-edges. The critical behavior: **the delay slot instruction is only executed if the branch is taken**.

This means `bnel` + `addiu` in the delay slot = "increment ONLY if continuing the loop". This is the signature of:

```c
// This pattern generates bnel with exp++ in the delay slot
while (exp < 11) {
    if (!(condition)) {
        result = exp;
        break;
    }
    exp++;
}
```

The `for` loop version (`for (; exp < 11; exp++)`) may cause the compiler to "peel" (unroll) the first iteration, which changes the instruction count and order.

### 6.5 Loop First-Iteration Peeling

The compiler sometimes optimizes the first iteration of a loop by evaluating it at compile time and pulling it out of the loop body.

**Example**: If `exp` starts at 0, the compiler may evaluate `(1 << 0) < dimension` as `1 < dimension` and hoist that check before the loop.

**Rule**: If you see a setup block before the loop in the target that looks like it evaluates the first iteration's condition, the original code was a simple `while` starting from 0 — the compiler peeled it automatically.

### 6.6 Tail Calls (`j` vs `jal`+`jr`)

When the last thing a function does is call another function, the compiler may optimize it into a direct `j` (jump) instead of `jal` (jump-and-link) + `jr $ra`. This is a **tail call optimization**.

**Rule**: To force a tail call, the function call must be the very last statement with no cleanup needed (no saved registers to restore, no stack to deallocate beyond what the prologue set up):

```c
void foo(int x) {
    if (x == 1) return bar();  // Tail call: generates j bar
    baz();                      // Not a tail call: generates jal baz; jr ra
}
```

### 6.7 Register Allocation and Variable Order

The order you declare variables can affect which registers the compiler assigns them to. While not always deterministic, these patterns help:

| Register | Typical Use |
|----------|-------------|
| `$a0-$a3` | Function arguments (params 1-4) |
| `$v0-$v1` | Return values / temporaries |
| `$s0-$s7` | Callee-saved (local variables across function calls) |
| `$t0-$t9` | Caller-saved (temporaries) |
| `$ra` | Return address |

**Rule**: If the target uses `$s0` for one variable and `$s1` for another, try reordering your local variable declarations to match. The first callee-saved variable typically goes into `$s0`.

### 6.8 `daddu` as Move

On the R5900 (64-bit MIPS), `daddu $dst, $src, $zero` is the canonical "move" instruction. This is normal — it's not an add, it's a register copy.

### 6.9 `mult` (3-Operand) and `mult1`

The R5900 has two multiply pipelines. The compiler uses:
- `mult $dst, $src1, $src2` — 3-operand multiply (pipeline 0)
- `mult1 $dst, $src1, $src2` — 3-operand multiply (pipeline 1)

These replace the standard MIPS `mult` + `mflo` sequence. If the target uses 3-operand `mult`, the compiler must be targeting R5900 with `-march=r5900` (which is the default for the ee-gcc preset).

### 6.10 Division Patterns (Signed vs Unsigned)

Integer division by powers of 2 generates different code for signed vs unsigned:

- **Unsigned** `/ 32` → simple `srl $v, $v, 5` (shift right logical)
- **Signed** `/ 32` → `addiu` + `slt` + `movn` + `sra` (handles negative rounding)

The target's use of `slt`/`movn`/`sra` for division means the variable is **signed** (`int`, not `unsigned int`).

### 6.11 `int one = 1;` vs Literal `1`

Creating a variable `int one = 1;` forces the compiler to allocate a register for the constant. Using the literal `1` directly lets the compiler decide whether to use a register or an immediate.

**Rule**: If the target loads `1` into a register early and reuses it (e.g., for `sllv`), you might need a variable. If it uses `addiu $v0, $zero, 1` inline, use the literal. Check the target carefully.

### 6.12 Handwritten / Syscall Functions

Some functions are pure inline assembly (syscall wrappers). These don't need C logic — just `__asm__ volatile`:

```c
int GsGetIMR(void)
{
    __asm__ volatile("addiu $3, $0, 0x70\n\tsyscall");
}

void GsPutIMR(int imr)
{
    __asm__ volatile("addiu $3, $0, 0x71\n\tsyscall");
}
```

**Rule**: Use register numbers (`$3`, `$0`) not names (`$v1`, `$zero`) in inline asm to avoid the compiler inserting `.set noat` directives or extra moves. Do NOT use input/output constraints (`: "=r"(ret)`) unless the target has corresponding `move` instructions.

---

## 7. Pattern Cookbook (Proven Matches)

### 7.1 Simple While Loop with Break (GetTexExponent — 100%)

**Target pattern**: `bnel` back-edge with increment in delay slot

```c
u32 GetTexExponent(int dimension)
{
    u32 result = 0;
    int exp = 0;

    while (exp < 11) {
        if (!((1 << exp) < dimension)) {
            result = exp;
            break;
        }
        exp++;
    }
    return result;
}
```

### 7.2 Goto + Switch-like Branches (graph_reset_related3 — 100%)

**Target pattern**: Multiple `beql`/`bnel` with tail calls

```c
void graph_reset_related3(int mode)
{
    if (mode == 0) goto case0;
    if (mode == 1) goto case1;
    if (mode == 2) goto case2;
    return;
case0:
    funcA(); return;
case1:
    funcB(); return;
case2:
    funcC(); funcD(); return;
}
```

### 7.3 Syscall Wrappers (GsGetIMR, GsPutIMR — 100%)

```c
int GsGetIMR(void)
{
    __asm__ volatile("addiu $3, $0, 0x70\n\tsyscall");
}

void GsPutIMR(int imr)
{
    __asm__ volatile("addiu $3, $0, 0x71\n\tsyscall");
}
```

### 7.4 GP-Relative Global Access (gsAllocBuffer)

When globals use `%gp_rel`, you need `-G8` flag and `static` globals:

```c
static int g_gs_vram_ptr;
static u32 g_gs_current_psm;

int gsAllocBuffer(u32 psm, int *params)
{
    int start_page = g_gs_vram_ptr;
    int bpp = psmToBppGS(psm);
    g_gs_current_psm = psm;

    int total_bytes = ((params[2] + 63) & ~63) * params[3] * bpp;
    int pages = (total_bytes + 31) / 32;
    pages = (pages + 63) / 64;
    g_gs_vram_ptr += pages;

    return start_page;
}
```

---

## 8. Score Interpretation

| Score | Status | Meaning |
|-------|--------|---------|
| **0** | ✅ Perfect | Binary-identical. Commit it! |
| **10-15** | 🟡 Symbol-only | Address diff from global variable relocation. Perfect match locally. |
| **< 100** | 🔶 Close | Usually instruction scheduling or condition order. Try reordering expressions or flipping comparisons. |
| **100-500** | 🔸 Structural | Wrong loop/branch pattern. Try `goto`, `while` vs `for`, or different variable types. |
| **> 500** | 🔴 Major diff | Fundamentally wrong approach. Re-analyze the target assembly from scratch. |

### Common Fixes by Score Range

| Symptom | Fix |
|---------|-----|
| `beq` vs `bne` flipped | Invert the C comparison (`==` ↔ `!=`, `<` ↔ `>=`) |
| `beq $v0, $v1` vs `beq $v1, $v0` | Swap operand order in C: `if (a == b)` → `if (b == a)` |
| Extra `nop` in delay slot | The compiler couldn't find an instruction to hoist — may need to restructure code |
| `lui`+`ori` vs `addiu` for mask | Add `(s32)` cast before bitwise AND |
| `slti` vs `slt` | `slti` = comparing against immediate; `slt` = comparing two registers. If target uses `slt`, put the constant in a variable |
| `for` generates extra setup | Switch to `while` with explicit increment at end of body |
| Missing `mult1` | Compiler flag issue — ensure `-march=r5900` or the correct preset |

---

## 9. After 100% — Applying to the Project

1. **Update source file** in `src/<subsystem>/`:
   - `src/graph/gs_util.inc` for GS utility functions
   - `src/graph/graph_funcs.inc` for graph reset, IMR, etc.
   - Follow existing code style in the file

2. **Track in PS2_PROJECT_STATE.md** — update the progress table

3. **Git commit** (user handles all git operations):
   ```bash
   git add src/graph/gs_util.inc
   git commit -m "graph: Match GetTexExponent (100% parity)"
   git push
   ```

> ⚠️ **IMPORTANT**: Never auto-execute git commands. The user (project contributor) must run them manually.

---

## 10. Function Status Tracker

### graph.s Functions

| Function | Status | Score | File |
|----------|--------|-------|------|
| `graph_reset_related3` | ✅ 100% | 0 | `src/graph/graph_funcs.inc` |
| `graph_reset_related1` | 🔶 WIP | — | `src/graph/graph_funcs.inc` |
| `graph_swap_frame_thread_proc` | 🟡 Symbol-only | ~15 | `src/graph/graph_funcs.inc` |
| `gsAllocExtraBuffers` | ⬜ TODO | — | — |
| `GetTexExponent` | ✅ 100% | 0 | `src/graph/gs_util.inc` |
| `gsAllocBuffer` | 🔶 WIP | ~97% | `src/graph/gs_util.inc` |
| `gsInitAlloc` | ⬜ TODO | — | `src/graph/gs_util.inc` |
| `draw_button_panel_hkdosd_p4_tgt` | ⬜ TODO | — | — |
| `draw_menu_item` | ✅ 100% | 0 | — |
| `draw_clock_menu_items_hkdosd_p4_tgt` | ⬜ TODO | — | — |
| `GsGetIMR` | ✅ 100% | 0 | `src/graph/graph_funcs.inc` |
| `GsPutIMR` | ✅ 100% | 0 | `src/graph/graph_funcs.inc` |

---

## 11. Known Bugs & Pitfalls

### 11.1 decomp_match.py Greedy Regex (FIXED)

The extraction regex was greedy (`/\*.*\*/`) which stripped instructions appearing after comments on the same line. Fixed to non-greedy (`/\*.*?\*/`).

### 11.2 decomp.me Cannot Match GP-Relative

Functions using `%gp_rel` (compiled with `-G8`) will **never** show 0/0 on decomp.me because the remote compiler doesn't have the GP context. You'll see a small constant diff (10-15 points). This is expected — verify locally with `objdiff` instead.

### 11.3 Local Build Requires PS2 Toolchain

The local `make` build requires `mips64r5900el-ps2-elf-as` which must be installed separately via the PS2SDK toolchain. If you get "Error 127", the assembler is not in your PATH.

### 11.4 Comparison Operand Order Matters

`beq $v0, $v1` is NOT the same as `beq $v1, $v0` to the binary matcher. If your generated code has the operands swapped, try flipping the comparison in C:

```c
// Generates beq $v0, $v1
if (a == b) { ... }

// Generates beq $v1, $v0
if (b == a) { ... }
```

### 11.5 `for` vs `while` Loop Peeling

`for` loops are more aggressively optimized by this GCC version. The compiler may "peel" (unroll) the first iteration, inserting an extra copy of the loop body before the loop. If you see duplicated setup code in the target, the original was likely a `while` loop (which the compiler peeled on its own). If you write a `for` loop, the compiler peels AGAIN, creating a double-peeled mess.

### 11.6 `int` Return Type on Void-like Functions

Some functions like `GsGetIMR` have an `int` return type but don't explicitly return a value — the return value comes from the inline assembly (`$v0` after `syscall`). The compiler generates identical code for `int` and `void` return types in this case, but the caller may expect `int`, so preserve the correct prototype.

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────┐
│  COMPILER: ee-gcc2.9-991111                     │
│  FLAGS:    -O2 -G0  (or -G8 for %gp_rel)       │
│  PLATFORM: ps2                                  │
│                                                 │
│  EXTRACT:  python3 tools/decomp_match.py        │
│            extract <func> <asm_file>            │
│                                                 │
│  SUBMIT:   python3 tools/decomp_match.py        │
│            submit <func> <asm> <src>            │
│                                                 │
│  KEY QUIRKS:                                    │
│  • (s32) cast for mask constants                │
│  • goto for branch-likely patterns              │
│  • while > for (avoids double-peeling)          │
│  • Flip comparisons for operand order           │
│  • __asm__ volatile for syscall wrappers        │
│  • Register $3 not $v1 in inline asm            │
│  • -G8 when target uses %gp_rel                 │
└─────────────────────────────────────────────────┘
```
