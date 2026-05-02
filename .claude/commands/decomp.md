---
name: decomp
description: Full decomp workflow — decompile a function from OSDSYS, analyze it, cross-reference with PS2SDK/PCSX2, and prepare for reconstruction.
---

# /decomp <address_or_name>

Execute the full decompilation workflow for a single OSDSYS function.

## Steps
1. Use ghidra-mcp to decompile the function
2. Get function metrics (complexity, calls, basic blocks)
3. Classify the function (thunk, leaf, worker, api, state_machine, packet_builder)
4. Search PS2SDK for matching APIs
5. Search PCSX2 for hardware documentation
6. Determine which subsystem it belongs to
7. Output a complete analysis with suggested reconstruction

## Expected Input
- A Ghidra address: `/decomp 0x001F72D8`
- Or a function name: `/decomp InitDraw`

## Expected Output
Complete analysis with:
- Decompiled pseudocode
- Function classification
- PS2SDK cross-reference
- PCSX2 cross-reference
- Suggested C reconstruction
- File placement (which src/<subsystem>/)
