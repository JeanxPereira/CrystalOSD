# CrystalOSD — Project State

> Auto-updated by agent after each milestone. External hippocampus for session continuity.

## Progress

| Metric | Count |
|--------|-------|
| Total functions (Ghidra) | 2,008 |
| Named functions | ~500+ confirmed via ghidra-mcp |
| Community symbols imported | ✅ Many imported via ImportOsdsysCsv.java |
| Functions reconstructed | 73 (across 5 files) |
| Functions matching | 0 (no build system yet) |
| Subsystems started | 4/9 (config, sound, core, graph) |

## Current Focus
Aggressive function reconstruction from well-decompiled named functions.

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

## Reference Library
- `reference/ps2-hardware-docs/` — Hardware registers, ISA, VU instructions
- `reference/osdsys_wiki_knowledge.md` — Wiki: cmd params, decompress algo, patents
- `reference/crystalclock_analysis/` — Prior deep analysis of clock rendering pipeline
  - 5-pass pipeline, rod struct (0x160 bytes), VU0 axis-angle rotation decode
  - `decode_vu0.py` — VU0 COP2 decoder tool
- `reference/osdsys_re/` — Community symbols (6,372)
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
- [ ] Build system (Makefile + PS2SDK)
- [ ] splat integration
- [ ] First matching function (objdiff)
- [ ] Re-dump latest OSDSYS from BIOS (optional fresh start)

## Open Questions
- **Re-dump strategy**: User open to fresh Ghidra project with clean analysis. Latest OSDSYS version to target?
- **PCSX2-MCP macOS**: Defer — focus on decomp + build first
- Original ELF: `hddosd.elf` at `/Users/jeanxpereira/CodingProjects/OSDSYS-RE/hddosd.elf`

## Last Session
- **Date**: 2026-05-02
- **Focus**: Full `config_*` reconstruction (67 functions). Mechacon param 1/2 bitfield map fully documented and cross-referenced against `OSDConfigStore_t` in `reference/osdsys_launcher_ref.md`.
- **Addresses analyzed**: 0x00203a20-0x002041e0 (mechacon get/set + peripheral wrappers), 0x002041f0-0x00204e70 (hdd_prepare/write_keys, mechacon_prepare, rc/dvdp), 0x00204ea0-0x00206be0 (INI open/close/parse/write), 0x00208170, 0x0020c8e0, 0x00234f88-0x002352d0 (clock UI load/save)
- **Functions reconstructed**: 73 total (67 new in osd_config.c)
- **Key discoveries**:
  - `var_mechacon_config_param_1` @ 0x00371818 is u32 packed view of EEPROM 0x0F-0x14
  - `var_mechacon_config_param_2` @ 0x0037181c holds date_format/rc/dvdp bits
  - Bit layout in u32 is repacked vs EEPROM byte stream — fields match Launcher ref `OSDConfigStore_t`
  - HDD .ini stores keyboard/mouse/atok/softkb (not Mechacon EEPROM) with originals snapshot for diff-based writes
  - Address shift: old osd_config.c used 0x001f4xxx (different binary version) — current Ghidra import uses 0x00203xxx
