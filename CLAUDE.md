# CrystalOSD — PS2 OSDSYS Reconstruction

> Clean-room reconstruction of the PlayStation 2 OSDSYS (system menu), built by analyzing the binary in Ghidra and cross-referencing against PS2SDK and PCSX2 source.

## Architecture
- **Target**: HDDOSD/HOSDSYS 1.10U (OSDSYS_A.XLF from SUDC4, MIPS R5900)
- **Toolchain**: ps2dev binutils 2.45 + gcc 15.2 (extracted to `~/ps2dev/`)
- **Build**: splat split → asm assemble → ld link → byte-perfect ELF
- **Output**: Native PS2 ELF, testable on PCSX2
- **Future**: Desktop port via SDL2+OpenGL (shared source tree)

## Binary Stats
- Binary: `OSDSYS_A_XLF_decrypted_unpacked.elf` (3.7 MB, base `0x200000`, single LOAD seg)
- Identical to `hddosd.elf` (HDDOSD 1.10U) — same 3,864,601 bytes
- Entry point: `0x200008` (after 8 bytes of nop padding)
- GP value: `0x377970`; bss size: `0x199de0`
- 1,675 functions imported into Ghidra (from community `symbol_addrs.txt`)
- 4,619 data labels imported; 6,372 total symbols
- Analysis: MIPS-R5900, Aggressive Instruction Finder OFF
- `main` at `0x0020d4d0` — standalone, 429 lines, 921 instructions

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
7. Iterate match on decomp.me (`tools/decomp_match.py`)
8. Build full ELF with `make elf` → test on PCSX2

## Build Commands
```bash
# Pre-flight (every new shell): export toolchain
export PATH=$HOME/ps2dev/ee/bin:$HOME/ps2dev/iop/bin:$HOME/ps2dev/dvp/bin:$PATH
export PS2DEV=$HOME/ps2dev
export PS2SDK=$PS2DEV/ps2sdk

make split    # regenerate asm/ + linker script (run once after symbol_addrs.txt change)
make elf      # link build/OSDSYS.elf from splat output
make verify   # cmp build/OSDSYS.elf == OSDSYS_A_XLF_decrypted_unpacked.elf (byte-perfect)
make all      # objdiff matching workflow (target/base .o for diffs)
```

## Build System Files
- `splat_config.yml` — splat binary-split config (gp/vram/bss layout)
- `OSDSYS_A.ld` — splat-generated SECTIONS (REGENERATED — do not hand-edit)
- `OSDSYS_link.ld` — handcrafted wrapper, fixes splat layout bug + includes `undefined_*.txt` (this is what `ld -T` uses)
- `symbol_addrs.txt` — splat symbol DB (6,372 entries; format: `name = 0xADDR; // type:func`)
- `undefined_funcs_auto.txt`/`undefined_syms_auto.txt` — splat-detected externs (regenerated)
- `OSDSYS_A_XLF_decrypted_unpacked.elf` — original binary (gitignored, copyrighted)
- `Makefile` — `split`/`elf`/`verify`/`all` targets

## Toolchain
- Location: `~/ps2dev/` (not `/usr/local/ps2dev` — avoids sudo)
- Source: ps2dev/ps2toolchain GitHub Actions artifact (`macos-15-intel-x86_64-brew`)
- gcc 15.2.0, binutils 2.45.1, prefix `mips64r5900el-ps2-elf-`
- ps2sdk NOT yet built — fetch artifact `ps2sdk-*` separately when needed for C with PS2SDK headers
- Hackintosh-specific: brew/Docker/source-build all failed; pre-built CI artifact is the working path

## Code Rules
- Use PS2SDK types (`u32`, `s16`, `u8`) not stdint
- Use PS2SDK APIs where available — never reimplement
- Comment the original Ghidra address: `/* 0x001F72D8 - InitDraw */`
- Preserve original control flow structure when possible
- Mark uncertain code with `/* TODO: verify against binary */`
- GS register writes use `GS_SET_*` macros from `gs_gp.h`
- VIF1 packets use `packet_t` from PS2SDK

## Git Commit Convention
We follow a strict **Conventional Commits** format: `type(scope): description`.
- **`decomp(scope)`**: Matching decompiled functions (e.g., `decomp(graph): match gsAllocBuffer`).
- **`build(scope)`**: Changes to `Makefile`, `splat_config.yml`, `configure.py`, or linker scripts.
- **`docs(scope)`**: Updates to documentation, `.md` files, or comments.
- **`tools(scope)`**: Scripts, tools, or CI updates.
- **`fix(scope)`**: Fixes to previously decompiled code or scripts.
- **`chore(scope)`**: Minor maintenance, formatting, renaming.
- **`feat(scope)`**: New project features (e.g., desktop port, new scripts).

Scope should be the module name (`graph`, `core`, `browser`, `sound`, etc.) or left empty for global changes.

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
- **context-mode**: Session state sandboxing and tool output management
- Always verify decompilation via Ghidra before writing code
- Cross-check prototypes with PS2SDK headers

## Reference Documentation
Curated hardware docs live in `reference/ps2-hardware-docs/`:
- `02-mips-r5900-isa.md` — MIPS R5900 instruction set (MMI, COP0, FPU)
- `db-registers.md` — Full PS2 register reference (53KB)
- `db-memory-map.md` — EE/IOP/GS memory layout
- `db-vu-instructions.md` — VU0/VU1 instructions
- `db-sdk-functions.md` — PS2SDK function catalog
- `09-ps2tek.md` — PS2Tek hardware bible (225KB) — load on-demand only
- `10-agent-guardrails.md` — Circuit-breaker and anti-loop patterns

OSDSYS-specific knowledge:
- `reference/COMPILER_QUIRKS.md` — Essential rules for matching EE GCC 2.9-ee-991111 output (delay slots, masks, etc).
- `reference/osdsys_wiki_knowledge.md` — Command line params, decompression algo, patents
- Sony Patent JP2001154772A — Clock/Browser 3D visualization (block-based clock)
- Sony Patent JP2001148032A — Refraction rendering (transparent cube texturing)
- US Patent US6693606 — Clock display method (PDF at CrystalClockVK/docs/clock_patent/)

Prior analysis (from CrystalClockVK project):
- `reference/crystalclock_analysis/README.md` — Index of all findings
- Rod struct (0x160 bytes), 5-pass pipeline, VU0 axis-angle rotation decode
- `decode_vu0.py` — Python VU0 COP2 instruction decoder tool
- Full originals: `/Users/jeanxpereira/CodingProjects/CrystalClockVK/docs/`

Community symbols: `symbol_addrs.txt` at root (6,372 symbols; promoted from `reference/osdsys_re/`)
OSDSYS-Launcher reference: `reference/osdsys_launcher_ref.md` (EEPROM layout, region detection)
Legacy Ghidra scripts: `reference/legacy-scripts/`

## Ghidra Import
Current script: `/Users/jeanxpereira/ghidra_scripts/ImportSymbolAddrs.java`
- Parses splat format: `name = 0xADDRESS; // size:0xXX type:func`
- NO offset — addresses in symbol_addrs.txt match hddosd.elf directly
- Creates functions with body size when `size:` metadata present
- Creates labels for data symbols
- Status: **✅ COMPLETE** — 1,675 functions + 4,619 labels, 0 errors
- ⚠️ OLD script `ImportOsdsysCsv.java` is BROKEN (wrong format + wrong offset)

## Output Optimization
Keep responses terse and technical. Save tokens for code, not prose.
- Skip preambles, pleasantries, restating what user said
- Use tables over paragraphs for structured data
- Code speaks louder than explanation — show diff, not essay
- For decompilation: show C code first, explain only non-obvious parts
- Abbreviate known concepts: "GS" not "Graphics Synthesizer", "VIF" not "Vector Interface"
- When listing functions: `addr | name | size` table, no prose wrapper
- Drop to full prose ONLY for: security warnings, irreversible actions, ambiguous multi-step plans

## Circuit Breaker (Anti-Loop)
If a build/analysis fails 3 times with the same error:
1. STOP attempting the same fix
2. Document what was tried and what failed
3. Present alternatives to the user
4. Never silently retry the same approach

## Session State
Track progress in `PS2_PROJECT_STATE.md` (root). Update after each major milestone:
- Functions decompiled (count + names)
- Current subsystem focus
- Open questions / blockers
- Last Ghidra addresses analyzed

## Do NOT
- Do not distribute the original BIOS/ROM binary or `OSDSYS_A_XLF_decrypted_unpacked.elf` (gitignored)
- Do not guess function semantics — verify in Ghidra first
- Do not use C++ features — this is C99 compiled with ee-gcc
- Do not reimplement PS2SDK functionality
- Do not load `09-ps2tek.md` (225KB) unless specifically needed
- Do not clean build directories without explicit approval
- Do not invent function names — use `FUN_XXXXXXXX` until verified
- Do not hand-edit `OSDSYS_A.ld`, `undefined_*.txt`, `asm/texttmp.s`, `asm/data/*` — splat regenerates them; edit `OSDSYS_link.ld` or `splat_config.yml` instead
