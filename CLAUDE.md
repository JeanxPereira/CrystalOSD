# CrystalOSD — PS2 OSDSYS Reconstruction

> Clean-room reconstruction of the PlayStation 2 OSDSYS (system menu), built by analyzing the binary in Ghidra and cross-referencing against PS2SDK and PCSX2 source.

## Architecture
- **Target**: HDDOSD/HOSDSYS 1.10U (OSDSYS.elf, MIPS R5900)
- **Toolchain**: PS2SDK (ee-gcc cross-compiler)
- **Output**: Native PS2 ELF, testable on PCSX2
- **Future**: Desktop port via SDL2+OpenGL (shared source tree)

## Binary Stats (Ghidra)
- 2,008 total functions
- 894 named (44.5%), 1,114 unnamed (55.5%)
- ~500-800 functions are original OSDSYS logic (rest is runtime/libc)

## Naming Conventions
- Functions: `snake_case` — preserve original names when known
- Decompiled: prefix with subsystem (`browser_`, `clock_`, `opening_`, `graph_`)
- Unknown: keep `FUN_XXXXXXXX` until identified, never invent names
- Types: `PascalCase` for structs (`BrowserState`, `GsPacket`)
- Constants: `UPPER_SNAKE_CASE`
- Files: `snake_case.c` / `snake_case.h`

## Decomp Workflow
1. Identify target function in Ghidra (ghidra-mcp)
2. Decompile → analyze control flow and data structures
3. Cross-reference with PS2SDK (`/crossref`)
4. Cross-reference with PCSX2 source for hardware behavior
5. Write clean C reconstruction in `src/<subsystem>/`
6. Add Ghidra address comment above every reconstructed function
7. Build with `make` → test on PCSX2

## Code Rules
- Use PS2SDK types (`u32`, `s16`, `u8`) not stdint
- Use PS2SDK APIs where available — never reimplement
- Comment the original Ghidra address: `/* 0x001F72D8 - InitDraw */`
- Preserve original control flow structure when possible
- Mark uncertain code with `/* TODO: verify against binary */`
- GS register writes use `GS_SET_*` macros from `gs_gp.h`
- VIF1 packets use `packet_t` from PS2SDK

## Subsystems
| Module | Directory | Description |
|--------|-----------|-------------|
| Browser | `src/browser/` | Memory card file browser |
| Opening | `src/opening/` | Boot sequence, towers, fog |
| Clock | `src/clock/` | Clock/settings UI |
| Config | `src/config/` | Language, timezone, video mode |
| Sound | `src/sound/` | SPU2 via IOP RPC |
| Graph | `src/graph/` | GS packets, VIF1, framebuffer |
| CDVD | `src/cdvd/` | Disc detection and launch |
| History | `src/history/` | Play history tracking |
| Module | `src/module/` | Dynamic module system |

## MCP Integration
- **ghidra-mcp**: Always available for binary analysis
- Always verify decompilation via Ghidra before writing code
- Cross-check prototypes with PS2SDK headers

## Do NOT
- Do not distribute the original BIOS/ROM binary
- Do not guess function semantics — verify in Ghidra first
- Do not use C++ features — this is C99 compiled with ee-gcc
- Do not reimplement PS2SDK functionality
