# CrystalOSD — Project State

> Auto-updated by agent after each milestone. External hippocampus for session continuity.

## Progress

| Metric | Count |
|--------|-------|
| Total functions (Ghidra) | 2,008 |
| Named functions | ~500+ confirmed via ghidra-mcp |
| Community symbols imported | ✅ Many imported via ImportOsdsysCsv.java |
| Functions reconstructed | 73 (across 5 files) |
| Functions matching (decomp.me) | 2 perfect + 28 symbol-only (30 total) |
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
- [x] First matching function on decomp.me (`do_read_cdvd_config_entry` — 0/3700)
- [x] Perfect match: `graph_reset_related1` (0/2800)
- [x] Perfect match: `draw_menu_item` (0/4000)
- [x] Compiler flags confirmed: `ee-gcc2.9-991111` + `-O2 -G0`
- [x] Built unified `tools/decomp_match.py` for automated iteration
- [ ] Build system (Makefile + PS2SDK toolchain install)
- [ ] splat integration
- [ ] First matching function locally (objdiff)
- [ ] Re-dump latest OSDSYS from BIOS (optional fresh start)

## Open Questions
- **Re-dump strategy**: User open to fresh Ghidra project with clean analysis. Latest OSDSYS version to target?
- **PCSX2-MCP macOS**: Defer — focus on decomp + build first
- Original ELF: `hddosd.elf` at `/Users/jeanxpereira/CodingProjects/OSDSYS-RE/hddosd.elf`

## Last Session
- **Date**: 2026-05-03
- **Focus**: Unified decomp.me tooling and graph subsystem matching
- **Key results**:
  - Perfect matches (0 pts): `do_read_cdvd_config_entry`, `graph_reset_related1`, `draw_menu_item`
  - Symbol-only diffs (10-15 pts): `graph_swap_frame_thread_proc`, plus 28 config getters/setters
  - `graph_reset_related3`: 550/4900 (88.8%) — tail call optimization diff (`j` vs `jal; jr ra`)
  - `GetTexExponent`: 335/1700 (80.3%)
- **Tooling**:
  - Created `tools/decomp_match.py` to automate extraction, submission, inline testing, and batch runs
  - Cleaned up scattered Python scripts
  - Updated `.claude/skills/decomp-workflow/SKILL.md` with instructions and compiler quirks
