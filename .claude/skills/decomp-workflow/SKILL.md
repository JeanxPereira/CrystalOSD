---
name: decomp-workflow
description: Standard decomp workflow for reconstructing OSDSYS functions. Invoked when decompiling, analyzing, or reconstructing functions from the binary.
---

# CrystalOSD Decomp Workflow

## Step-by-Step Process

### 1. Identify Target
- Use `ghidra-mcp` to find the function (by name or address)
- Check if the function is already named or still `FUN_XXXXXXXX`
- Get function metrics (complexity, basic blocks, call count)

### 2. Decompile & Analyze
- Use `mcp_ghidra-mcp_decompile_function` to get pseudocode
- Use `mcp_ghidra-mcp_disassemble_function` for assembly when decompiler output is unclear
- Identify patterns:
  - State machines (switch on state variable)
  - GS packet building (writes to 128-bit aligned buffers)
  - IOP RPC calls (sceSdRemote, sceCd*, sceMc*)
  - Kernel syscalls (syscall instruction)

### 3. Cross-Reference with PS2SDK
- Search PS2SDK source at `/Users/jeanxpereira/CodingProjects/ps2sdk/`
- Key locations:
  - `common/include/gs_gp.h` → GS register macros
  - `ee/rpc/cdvd/` → CDVD APIs
  - `ee/packet/` → GIF packet building
  - `ee/graph/` → Graphics utilities
  - `ee/kernel/` → EE kernel/syscall wrappers

### 4. Cross-Reference with PCSX2
- Search PCSX2 source at `/Users/jeanxpereira/CodingProjects/pcsx2/`
- Key locations:
  - `pcsx2/GS/GSRegs.h` → GS register bitfield structs
  - `pcsx2/GS/GSState.cpp` → GS state machine emulation
  - `pcsx2/Vif.h` → VIF register structs
  - `pcsx2/SPU2/` → Sound emulation
  - `pcsx2/CDVD/` → CDVD emulation
  - `pcsx2/R5900.cpp` → CPU/syscall emulation

### 5. Write Reconstruction
```c
/* 0x001F72D8 — InitDraw
 * Initializes the GS drawing environment.
 * Clears the draw counter and calls the internal GS setup.
 */
void InitDraw(void)
{
    g_draw_count = 0;
    gs_setup_environment();
}
```
- **Always** include the Ghidra address as a comment
- **Always** include a brief description of what the function does
- Place in the correct `src/<subsystem>/` directory
- Use PS2SDK types and APIs

### 6. Build & Verify
- `make` to compile
- Test on PCSX2
- Compare behavior with original OSDSYS

## Quality Scoring
| Score | Criteria |
|-------|----------|
| 100 | Perfect match — identical behavior to original |
| 80-99 | Functionally correct, minor style differences |
| 60-79 | Mostly correct, some uncertain branches |
| 40-59 | Skeleton complete, logic needs verification |
| 0-39 | Stub or placeholder only |

## Common MIPS/Ghidra Patterns
- `$a0-$a3` = function arguments (param_1 through param_4)
- `$v0-$v1` = return values
- `$s0-$s7` = callee-saved (local variables across calls)
- `$t0-$t9` = caller-saved (temporaries)
- `$ra` = return address
- `uRamXXXXXXXX` = global variable at address
- `DAT_XXXXXXXX` = global data at address
