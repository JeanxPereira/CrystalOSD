---
name: status
description: Show current decomp progress — functions reconstructed, subsystem breakdown, and suggested next targets.
---

# /status

Show the current state of the CrystalOSD reconstruction.

## Steps
1. Count `.c` files and functions in `src/` directories
2. Count functions with Ghidra address comments
3. Compare against known function totals from Ghidra (2,008 total)
4. Break down by subsystem
5. Check build state: `make verify` (byte-perfect rebuild status)
6. Suggest next high-impact targets

## Expected Output
```
=== CrystalOSD Status ===
Total: X/2008 functions (Y%)
Named in Ghidra: 894/2008

Browser:  [████████░░] X/~200
Opening:  [░░░░░░░░░░] X/~80
Clock:    [░░░░░░░░░░] X/~150
Config:   [░░░░░░░░░░] X/~120
Sound:    [░░░░░░░░░░] X/~80
Graph:    [░░░░░░░░░░] X/~300
CDVD:     [░░░░░░░░░░] X/~80
History:  [░░░░░░░░░░] X/~50
Module:   [░░░░░░░░░░] X/~50

Next targets:
 → InitDraw (0x001F72D8) — graph, leaf, low complexity
 → InitDoubleBuffer (0x00206BD0) — graph, leaf
 → ...
```
