---
name: crossref
description: Cross-reference a function or concept between OSDSYS binary, PS2SDK, and PCSX2 sources.
---

# /crossref <query>

Find how a function, register, or concept maps across the three codebases.

## Steps
1. Search for `<query>` in the OSDSYS binary (via ghidra-mcp)
2. Search PS2SDK source at `/Users/jeanxpereira/CodingProjects/ps2sdk/`
3. Search PCSX2 source at `/Users/jeanxpereira/CodingProjects/pcsx2/`
4. Present a unified cross-reference table

## Expected Input
- A function name: `/crossref sceCdOpenConfig`
- A GS register: `/crossref SCISSOR`
- A concept: `/crossref double buffering`

## Expected Output
Unified table showing:
- OSDSYS function(s) that use it
- PS2SDK header/source location
- PCSX2 emulation implementation
- Recommended usage pattern for reconstruction
