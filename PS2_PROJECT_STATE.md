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
Build infrastructure complete. Next: per-function asm split for incremental C overrides.

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
- `OSDSYS_A.ld` — splat-generated (regenerated each `make split`); has layout BUG (places `module_storage` between data and rodata; should be after bss)
- `OSDSYS_link.ld` — handcrafted wrapper, fixes layout, includes `undefined_*.txt`. **This is what Makefile uses.**

### Build Flow
```bash
make split    # run splat → regenerate asm/, OSDSYS_A.ld
make elf      # link → build/OSDSYS.elf
make verify   # cmp build/OSDSYS.elf OSDSYS_A_XLF_decrypted_unpacked.elf
```

### Linker tricks for byte-perfect match
- `-m elf32lr5900` (eabi variant, NOT n32; matches assembler `eabi64` output)
- `-G 0x10000 --defsym=_gp=0x377970` (large small-data threshold + explicit GP)
- `-e 0x200008` (entry symbol; first 8 bytes are nop padding)
- `-s` (strip)
- `objcopy --strip-section-headers` (remove SHT entirely)
- `dd` overwrites `e_flags` (offset 36-39) with zeros (original has 0; ours has `0x20924001` from MIPS abi flags)

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
- [ ] Test rebuilt ELF in PCSX2 (boot validation)
- [ ] Per-function asm split (so individual C reconstructions can replace asm)
- [ ] First C-substituted ELF link (with at least one C function in place of asm)
- [ ] Re-dump latest OSDSYS from BIOS (optional fresh start)

## Open Questions
- **PCSX2 boot test**: ELF rebuilds byte-perfect. Validate it actually boots in emulator (sanity check).
- **Per-function split strategy**: splat config has `find_file_boundaries: False` → all code in `texttmp.s`. To override individual functions with C, need either (a) per-function `.s` files in `subsegments` so we can drop them from link, or (b) `--allow-multiple-definition` with C objects first in link order. Option (a) is cleaner.
- **PS2SDK install**: not built yet. When we link C reconstructions that use PS2SDK APIs, need to fetch ps2sdk artifact too.
- **`gsInitAlloc` matching**: requires `screenW`/`screenH` placed at exactly `0x1F0CB4`/`0x1F0CB8`. Linker script can do this with `--defsym` or PROVIDE.

## Last Session
- **Date**: 2026-05-03
- **Focus**: Build infrastructure — splat + toolchain + linker script + byte-perfect ELF rebuild
- **Key results**:
  - Splat config promoted from `reference/osdsys_re/` to root; runs cleanly with splat 0.40
  - PS2 toolchain installed via GitHub Actions artifact (no Docker, no source build)
  - Custom `OSDSYS_link.ld` corrects splat-generated layout bug
  - `make elf` produces ELF byte-identical to `OSDSYS_A_XLF_decrypted_unpacked.elf`
  - Total bytes diff: 0 (verified with `cmp`)
- **Files added/changed at root**:
  - `splat_config.yml`, `OSDSYS_A.ld` (splat-gen), `OSDSYS_link.ld` (handcrafted), `configure.py`
  - `OSDSYS_A_XLF_decrypted_unpacked.elf` (gitignored), `symbol_addrs.txt` (6372 syms)
  - `undefined_funcs_auto.txt`, `undefined_syms_auto.txt` (splat-gen)
  - `Makefile` rewritten with `split`/`elf`/`verify` targets
  - `.gitignore` updated for splat artifacts
- **Symbol fix**: `gsExtraBuffers` had `type:data` (invalid); changed to `type:u32`
