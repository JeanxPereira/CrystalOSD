# CrystalOSD — Project State

> Auto-updated by agent after each milestone. External hippocampus for session continuity.

## Progress

| Metric | Count |
|--------|-------|
| Total functions (Ghidra) | 2,008 |
| Named functions | ~500+ confirmed via ghidra-mcp |
| Community symbols imported | ✅ 6,372 via splat `symbol_addrs.txt` |
| Functions reconstructed | 73 (across 5 files) |
| Functions matching (decomp.me) | 2 perfect + 28 symbol-only (30 total) |
| Subsystems started | 4/9 (config, sound, core, graph) |
| **ELF rebuild** | ✅ **byte-perfect match** (3,864,601 bytes) |

## Current Focus
Build infrastructure is complete and byte-perfect match has been achieved! 
The absolute focus now is **Decompilation (Decomp)** of individual functions from Assembly to C using the `objdiff` workflow.

### Workflow:
1. Pick a function from `asm/`.
2. Write C equivalent in `src/`.
3. Verify matching assembly output with `objdiff`.
4. Update `splat_config.yml` to compile the C file instead of asm.
5. Commit using `decomp(module): description`.

### Reconstructed Files

| File | Functions | Status |
|------|-----------|--------|
| `src/config/cdvd_config.c` | `do_read_cdvd_config_entry` | ✅ Done |
| `src/config/osd_config.c` | All 67 `config_*` functions (Mechacon NVRAM bitfields, HDD .ini peripherals, clock/UI mirror) | ✅ Done |
| `src/sound/spu2_dma.c` | `sceSpu2DmaWriteEe2Iop`, `sound_handle_bd` | ✅ Done |
| `src/core/expand.c` | `Expand`, `ExpandInit`, `ExpandMain` | ✅ Done |
| `src/core/romdir.c` | `romdir_get_offset`, `romdir_search_entry` | ✅ Done |
| `src/graph/gs_util.c` | `GetTexExponent`, `gsAllocBuffer` | ✅ Done |

### ⚠️ Known Issue: Ghidra Function Boundaries
Some mega-functions still exist (e.g., `FUN_0020d490` containing `main()`).
Most named functions decompile cleanly — focus on those first.

### ⚠️ Non-matchable from C (need inline asm or layout fix)
- `gsAllocBuffer` — uses `mult1` (R5900 pipe-1 multiply); compiler-scheduled, not controllable from C
- `gsInitAlloc` — `screenW`/`screenH` accessed via `lui+lw` absolute (vaddr `0x1F0CB4`); needs linker placement to match

## Build System

### Toolchain
- **Location**: `~/ps2dev/` (extracted from ps2dev/ps2toolchain CI artifact `macos-15-intel-x86_64-brew`)
- **Version**: gcc 15.2.0, binutils 2.45.1
- **Why not brew/build**: hackintosh has no virtualization (no Docker/VM); brew/source build of ps2toolchain failed
- **Env vars** (add to `.zshrc`):
  ```bash
  export PS2DEV=$HOME/ps2dev
  export PS2SDK=$PS2DEV/ps2sdk
  export PATH=$PATH:$PS2DEV/ee/bin:$PS2DEV/iop/bin:$PS2DEV/dvp/bin:$PS2SDK/bin
  ```
- **Note**: `ps2sdk` not yet built — only EE toolchain. Fetch separately when needed for C builds with PS2SDK headers.

### Splat
- Config: `splat_config.yml` (gp=0x377970, vram=0x200000, bss_size=0x199de0)
- Original ELF: `OSDSYS_A_XLF_decrypted_unpacked.elf` (HDD Utility Disc 1.10U from SUDC4)
- Run: `python3 configure.py` (regenerates `asm/texttmp.s` + `asm/data/*` + `OSDSYS_A.ld` + `undefined_*.txt`)
- Splat 0.40.0; spimdisasm 1.40.2

### Linker Script
- `OSDSYS_A.ld` — splat-generated, post-processed by `configure.py` to fix module_storage placement and alignments. **This is what Makefile uses.**
- `OSDSYS_link.ld` — legacy handcrafted wrapper (NO LONGER USED; kept for reference)

### Build Flow
```bash
make split    # run splat → regenerate asm/, OSDSYS_A.ld
make elf      # link → build/OSDSYS.elf
make verify   # cmp build/OSDSYS.elf OSDSYS_A_XLF_decrypted_unpacked.elf
```

### Linker tricks for byte-perfect match
- `-G 0` (NOT -G 0x10000; prevents GPREL16 overflow)
- `--defsym=_gp=0x377970` (explicit GP)
- `-e 0x200008` (entry symbol; first 8 bytes are nop padding)
- `-s` (strip)
- `objcopy --strip-section-headers` (remove SHT entirely)
- ELF header replacement: strips linker-generated header, prepends original 4KB header from reference ELF

## Reference Library
- `reference/ps2-hardware-docs/` — Hardware registers, ISA, VU instructions
- `reference/osdsys_wiki_knowledge.md` — Wiki: cmd params, decompress algo, patents
- `reference/crystalclock_analysis/` — Prior deep analysis of clock rendering pipeline
  - 5-pass pipeline, rod struct (0x160 bytes), VU0 axis-angle rotation decode
  - `decode_vu0.py` — VU0 COP2 decoder tool
- `reference/osdsys_re/` — Source skeleton for splat (config promoted to root)
- CrystalClockVK originals: `/Users/jeanxpereira/CodingProjects/CrystalClockVK/docs/`
- US Patent US6693606: Clock display method (30 pages PDF at CrystalClockVK)

## Completed Milestones
- [x] ADK structure (CLAUDE.md, skills, subagents, commands)
- [x] Ghidra MCP integration
- [x] context-mode MCP installed
- [x] ps2re/osdsys_re cloned (6,372 community symbols)
- [x] PS2 hardware docs extracted from ps2-recomp-Agent-SKILL
- [x] Legacy Ghidra scripts migrated from OSDSYS-RE
- [x] Community symbols partially imported via ImportOsdsysCsv.java
- [x] OSDSYS wiki knowledge base created
- [x] CrystalClockVK analysis archived to reference/
- [x] First 10 functions reconstructed across 4 subsystems
- [x] First matching function on decomp.me (`do_read_cdvd_config_entry` — 0/3700)
- [x] Perfect match: `graph_reset_related1` (0/2800)
- [x] Perfect match: `draw_menu_item` (0/4000)
- [x] Compiler flags confirmed: `ee-gcc2.9-991111` + `-O2 -G0`
- [x] Built unified `tools/decomp_match.py` for automated iteration
- [x] **PS2 toolchain installed** (`~/ps2dev/`, gcc 15.2.0)
- [x] **Splat integration** (full asm split + linker script)
- [x] **ELF link infrastructure** (Makefile `make elf` target)
- [x] **🎯 Byte-perfect ELF rebuild** (3,864,601 bytes match)
- [x] Test rebuilt ELF in PCSX2 (boot validation)
- [x] Per-function asm split (so individual C reconstructions can replace asm)
- [x] First C-substituted ELF link (with at least one C function in place of asm)
- [ ] Re-dump latest OSDSYS from BIOS (optional fresh start)

## Open Questions
- **PCSX2 boot test**: ELF rebuilds byte-perfect. Validate it actually boots in emulator (sanity check).
- **Per-function split strategy**: splat config has `find_file_boundaries: False` → all code in `texttmp.s`. To override individual functions with C, need either (a) per-function `.s` files in `subsegments` so we can drop them from link, or (b) `--allow-multiple-definition` with C objects first in link order. Option (a) is cleaner.
- **PS2SDK install**: not built yet. When we link C reconstructions that use PS2SDK APIs, need to fetch ps2sdk artifact too.
- **`gsInitAlloc` matching**: requires `screenW`/`screenH` placed at exactly `0x1F0CB4`/`0x1F0CB8`. Linker script can do this with `--defsym` or PROVIDE.

## Last Session
- **Date**: 2026-05-05
- **Focus**: Adopt afe-decomp methodologies (CI, SHA1 verify, decomp-permuter)
- **Key results**:
  - `decomp-permuter` submodule added and configured for PS2 ee-gcc (`tools/permuter/compile.sh`)
  - Created `tools/permuter_import.sh` for easy one-click imports of non-matching functions
  - Added `make sha1` verification target (doesn't require original ELF)
  - Created private `crystalosd-build` repo to hold the original ELF for CI byte-perfect checks
  - Overhauled `progress.yml` with build caching, SHA1 verification, and `make verify` via private repo

## Previous Session
- **Date**: 2026-05-04
- **Focus**: Per-function asm split + GPREL16 fix + byte-perfect rebuild
- **Key results**:
  - `configure.py` now post-processes `OSDSYS_A.ld`: moves module_storage, fixes alignment, patches .bss floats
  - GPREL16 overflow fixed (module_storage moved to `.main_modstor`)
  - `subalign: 4`, `ld_bss_is_noload: False`, `-G 0` confirmed working
  - Per-function split: 2,578 individual `.s` files in `asm/`
  - `make elf && make verify` → ✅ byte-perfect match (3,864,601 bytes)
- **Build command**: `python3 configure.py -c && make -j16 elf && make verify`
