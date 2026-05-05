---
name: decomp
description: Full decomp workflow — decompile a function from OSDSYS, match it on decomp.me, and reconstruct in C.
---

# /decomp <address_or_name>

Execute the full decompilation + matching workflow for a single OSDSYS function.

## Steps
1. Use ghidra-mcp to decompile the function
2. Get function metrics (complexity, calls, basic blocks)
3. Classify the function (thunk, leaf, worker, api, state_machine, packet_builder)
4. Search PS2SDK for matching APIs
5. Search PCSX2 for hardware documentation
6. Determine which subsystem it belongs to
7. Write C reconstruction in `src/<subsystem>/`
8. Submit to decomp.me: `python3 tools/decomp_match.py submit <name> <asm> <src>`
9. Iterate until matched: `python3 tools/decomp_match.py iterate <slug> <src>`
10. On match, update `PS2_PROJECT_STATE.md`

## Expected Input
- A Ghidra address: `/decomp 0x001F72D8`
- Or a function name: `/decomp InitDraw`
- Or a subsystem to batch: `/decomp history`

## Expected Output
Complete analysis with:
- Decompiled pseudocode
- Function classification
- PS2SDK cross-reference
- Matched C reconstruction (with decomp.me URL + score)
- File placement (which src/<subsystem>/)

## Matching via decomp.me API
```bash
# Create scratch (once)
python3 tools/decomp_match.py submit <func> asm/<sub>/<func>.s src/<sub>/<func>.c
# → slug saved to tools/decomp_results.json

# Iterate (reuse slug, no new scratch!)
python3 tools/decomp_match.py iterate <slug> src/<sub>/<func>.c
# → {"score": 0, "match": true} = done!
```
