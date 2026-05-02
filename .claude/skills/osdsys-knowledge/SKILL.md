---
name: osdsys-knowledge
description: OSDSYS-specific domain knowledge — subsystem map, known functions, cross-reference table between OSDSYS binary, PS2SDK, and PCSX2. Living document updated as decomp progresses.
---

# OSDSYS Domain Knowledge

## Binary Info
- **File**: OSDSYS.elf (HDDOSD/HOSDSYS 1.10U)
- **Architecture**: MIPS R5900 (Emotion Engine)
- **Total Functions**: 2,008
- **Named**: 894 (44.5%)
- **Unnamed**: 1,114 (55.5%)

## Subsystem Map

### Opening (Boot Sequence)
- `OpeningInitTowersFog` (0x0020D428) → Font_SetRatio setup
- `OpeningDoIllegalDisc` (0x0020E568) → state machine for illegal disc screen
- `OpeningInitIllegalScene` → scene initialization
- `module_opening_225728` (0x00210DD0) → opening module entry

### Browser (Memory Card)
- `browser_get_icon_bytes` (0x00237BE8) → loads icon texture data
- `browser_texture_indices` → global texture index table
- `module_browser_options` (0x0023B638) → initializes browser option arrays
- `module_browser_250628` (0x00239A48)
- `module_browser_2539A8` (0x0023D638)
- `module_browser_256728` (0x0023FEB0)
- `check_device_name` (0x001F8D98) → validates device paths

### Clock / Settings
- `module_clock_225F38` (0x00211610)
- `module_clock_22F2C0` (0x0021B2E0)
- `module_clock_22FC88` (0x0021BCA8)
- `module_clock_23A3C0` (0x00226A28)
- `module_clock_23A418` (0x00226A80)
- `clock_config_change_cb_dvdp_reset_progressive` (0x00215940)

### Config / System
- `config_set_langtbl` (0x001F4F20) → language table setup
- `config_set_jpn_language` → Japanese language config
- `get_vidmode_with_fallback` (0x001F5880) → PAL/NTSC detection
- `is_pal_vmode_p9_tgt` (0x001F58B8)
- `module_machine_getdesc` (0x001F6178) → machine description string
- `timezone_related_20C0B8` (0x001F7638) → timezone table management

### Sound / Audio
- `sound_handle_bd` (0x001F0130) → DMA block transfer to SPU2
- `sound_handler_2009E0` (0x001F09F8)
- `sound_handler_queue_cmd` (0x001F0BE8)
- `sceSpu2DmaWriteEe2Iop` (0x001F00C0)

### Graphics / Rendering
- `InitDraw` (0x001F72D8) → GS drawing init
- `InitDoubleBuffer` (0x00206BD0) → double framebuffer setup
- `graph_swap_frame_thread_proc` (0x001F7558) → frame swap thread
- `pktSetSCISSOR_1` (0x00206B28) → GS scissor packet
- `pktSetCLAMP_1` (0x00206B88) → GS clamp packet
- `pktSetAD` (0x00206DC8) → GS A+D packet (generic register write)
- `pktSetTEST_1` (0x00206FD0) → GS test packet
- `vif1SetTexRect` (0x002072A0) → textured rectangle via VIF1
- `vif1SetTexture` (0x00208400) → texture setup via VIF1
- `sprInitAlloc` (0x00207548) → scratchpad allocation
- `Font_SetRatio` → font scaling
- `evenOddFrame` (0x001F0C40) → interlace field control

### CDVD / Disc
- `do_read_cdvd_config_entry` (entry) → read CDVD config via RPC
- `disc_type_1F000C` (0x001F0010) → disc type handler
- `execute_app_type` (0x001F0014) → launch application from disc
- `cdvd_cmd_rcbypassctl` (0x001FF8D8) → remote control bypass
- `thunk_sceCdInit` (0x00200998)
- `thunk_sceCdIntToPos` (0x002009B8)
- `thunk_sceCdPosToInit` (0x00200A00)
- `thunk_sceCdTrayReq` (0x00200AA8)

### History / Stats
- `history_pick_slot` (0x001F1EA0) → 131-line function, play tracking
- `history_data_1F0198` → history data storage

### Module System
- `init_modules_20D228` (0x001F8D20) → dynamic module loader via func ptrs
- `menupos_p3_p8_tgt` (0x0021E5C0) → menu positioning
- `ExpandGetSize` (0x001F0F08) → decompression size query

## Cross-Reference Table
| OSDSYS Function | PS2SDK Equivalent | PCSX2 Reference |
|----------------|-------------------|-----------------|
| `pktSetSCISSOR_1` | `GS_SET_SCISSOR()` | `GIFRegSCISSOR` |
| `pktSetTEST_1` | `GS_SET_TEST()` | `GIFRegTEST` |
| `pktSetCLAMP_1` | `GS_SET_CLAMP()` | `GIFRegCLAMP` |
| `pktSetAD` | `GIF_REG_A_D` | `GIF_A_D_REG_*` |
| `vif1SetTexture` | `GS_SET_TEX0()` | `GIFRegTEX0` |
| `sound_handle_bd` | IOP `libsd` | `SPU2/` |
| `sceCdOpenConfig` | `ee/rpc/cdvd/scmd.c` | `CDVD/` |
| `sprInitAlloc` | `ee/dma/` | `SPR.cpp` |
