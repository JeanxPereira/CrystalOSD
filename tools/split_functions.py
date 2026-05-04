#!/usr/bin/env python3
"""
split_functions.py — Generate per-function splat subsegments from symbol_addrs.txt

Reads the symbol database, groups functions by subsystem, and generates
splat_config.yml subsegments so each function gets its own .s file.
This enables incremental C substitution: to match a function, just create
src/<subsystem>/<func_name>.c and change the subsegment type from 'asm' to 'c'.

Usage:
    python3 tools/split_functions.py                    # Preview subsegments
    python3 tools/split_functions.py --write            # Write updated splat_config.yml
    python3 tools/split_functions.py --stats            # Show subsystem stats
    python3 tools/split_functions.py --check-coverage   # Verify all bytes are covered
"""

import re
import sys
import os
from pathlib import Path
from collections import OrderedDict

# ── Configuration ──────────────────────────────────────
SYMBOL_FILE = "symbol_addrs.txt"
SPLAT_CONFIG = "splat_config.yml"
SRC_DIR = "src"

# ELF layout constants
VRAM_BASE = 0x200000    # Virtual address base
FILE_START = 0x1000     # File offset of first code byte
TEXT_END_VADDR = 0x2A47A0  # End of .text section (from linker script)

# Data section offsets (file offsets, must match current splat_config)
DATA_SECTIONS = [
    (0x0a57a0, "data",    "datasect"),
    (0x1487e0, "rodata",  "rodatasect"),
    (0x170980, "sdata",   "sdatasect"),
    (0x1719a0, "bss",     "sbsssect"),
    (0x171c98, "bss",     "bsssect"),
    (0x30b780, "databin", "module_storage"),
]
SEGMENT_END = 0x5AE830

# ── Subsystem Detection ───────────────────────────────
# Order matters: first match wins
SUBSYSTEM_RULES = [
    # (prefix_patterns, subsystem_name)
    (["sceSpu2", "sound_", "load_sound_resources", "prepare_sound_for_cdda",
      "sound_thread_", "sound_handler_", "sound_handle_"],                    "sound"),
    (["Expand", "ExpandInit", "ExpandMain", "ExpandSetBlock", "ExpandGetSize"], "core"),
    (["romdir_"],                                                              "core"),
    (["do_read_cdvd_config", "config_", "write_osd_config", "flush_hdd",
      "set_osd_config_to_eekernel", "config_mark_dirty", "is_config_dirty",
      "config_save_", "config_load_", "config_item_change_cb",
      "set_ps1drv_config_dirty"],                                              "config"),
    (["module_opening_", "Opening", "InitDMA", "InitDoubleBuffer",
      "InitLightsCubes", "InitSPR"],                                           "opening"),
    (["module_clock_", "clock_", "StartSysConfig", "do_show_version_info",
      "do_show_timezone_info", "get_summer_time_str", "oobe_"],                "clock"),
    (["module_browser_", "browser_", "dvd_player_err_fn"],                     "browser"),
    (["graph_", "gs", "GetTexExponent", "psmToBpp", "InitDraw",
      "StartFrame", "SwapBuffers", "OpeningDoWaitNextFrame",
      "graph_swap_frame_thread_proc", "vif1", "pkt", "spr",
      "GsGetIMR", "GsPutIMR", "draw_button_panel", "draw_menu_item",
      "draw_clock_menu_items", "DrawIcon", "DrawNonSelectableItem",
      "do_load_font", "menupos_", "Font_", "fontFilter",
      "updateScreenMatrix", "updateTransMatrix", "calcDrawArea",
      "j_Font_", "j_calcDrawArea"],                                            "graph"),
    (["cdvd_", "thunk_sceCd", "override_illegal_disc_type"],                   "cdvd"),
    (["history_", "check_or_clear_history"],                                    "history"),
    (["module_", "do_load_module", "do_get_mechacon_version",
      "var_current_module", "do_load_hosdsys", "init_modules_",
      "check_device_name", "do_exec_stockosd"],                                "module"),
    (["fileops_"],                                                             "core"),
    (["callback_queue_"],                                                      "core"),
    (["do_memcpy128"],                                                         "core"),
    (["do_mc_", "generate_mc_path"],                                           "core"),
    (["Tim2"],                                                                 "graph"),
    (["load_tim2_", "do_load_tim2_"],                                          "graph"),
    (["Fep_", "sceAtok", "interruptFromKey", "prepare_skb_resources",
      "check_atok_erx", "sendKeyAtok", "CharHanToZen", "CharZenToHan",
      "StrHanToZen", "StrZenToHan", "FifoDelete", "FifoSendData",
      "do_makesema", "getContext", "edit_input_thread_proc",
      "FepSetConfig", "FepTreat", "ascii2UCS4"],                               "browser"),
    (["do_format_date", "do_format_time"],                                     "core"),
    (["timezone_related", "get_timezone_", "config_check_timezone_city"],       "config"),
    (["ExecutePs2", "ExecutePS1", "ExecuteDVDPlayer", "ExecuteHDD",
      "ExecuteHddApp", "Game_Boot_", "is_ps1_game_disc",
      "get_config_key", "delaythread_"],                                       "cdvd"),
    (["do_hdd_", "do_check_hdd", "do_check_boot_type",
      "do_generate_hdd_path", "do_browser_instsec"],                           "browser"),
    (["pad_handler_", "pad_rm2_handler", "pad_sound_handler_thread_proc"],     "core"),
    (["vblankHandler", "get_vblank_count"],                                    "core"),
    (["main", "prepare_system_folder_name", "get_system_folder_name",
      "get_update_folder_path", "get_dvdplayer_name", "get_boot_path",
      "decryption_forconfigfile", "parse_path_conf",
      "module_update_parse_option_desc_str", "get_pathconf_key",
      "get_module_update_config", "module_machine_", "module_cdplayer_",
      "module_ps1drv_", "module_dvdplayer_", "module_smap_",
      "handle_version_info", "do_load_resources", "GetResourceData",
      "get_resource_size", "module_dummy_setup"],                               "core"),
    (["rm2_", "get_rm2_struct"],                                               "core"),
    (["return_to_browser", "deinit_"],                                         "core"),
    (["thunk_config_", "config_set_langtbl", "get_lang_string",
      "handle_get_vidmode", "get_vidmode_with_fallback", "get_curlang",
      "is_pal_vmode_", "enter_clock_module_", "disable_enter_clock_module_",
      "enable_enter_clock_module_", "is_hdd_boot_ready",
      "get_hddboot_exec_", "get_hdd_boot_ready_ptr"],                          "core"),
    (["poweroff_callback_", "sema_related_"],                                   "core"),
    (["cdvd_handler_", "cdvd_cmd_"],                                           "cdvd"),
    (["some_sort_of_lut_calc"],                                                "core"),
    (["sound_thread_proc"],                                                    "sound"),
    (["osd_icon_related_"],                                                    "browser"),
    (["vVif1Finish"],                                                          "graph"),
    (["GetDefaultIconPath"],                                                   "core"),
    (["special_character_check"],                                              "config"),
    (["sound_handle_queue_cmd_auto"],                                          "sound"),
    (["do_show_dvd_player_error"],                                             "cdvd"),
]


def classify_function(name: str) -> str:
    """Determine which subsystem a function belongs to based on its name."""
    for prefixes, subsystem in SUBSYSTEM_RULES:
        for prefix in prefixes:
            if name.startswith(prefix) or name == prefix:
                return subsystem
    return "core"  # Default fallback


def vaddr_to_fileoff(vaddr: int) -> int:
    """Convert virtual address to file offset."""
    return vaddr - VRAM_BASE + FILE_START


def parse_symbols(path: str) -> list:
    """Parse symbol_addrs.txt and return sorted list of (vaddr, size, name, type) tuples."""
    pattern = re.compile(
        r'^\s*([\w.]+)\s*=\s*0x([0-9a-fA-F]+)\s*;(.*)$'
    )
    size_pat = re.compile(r'size:0x([0-9a-fA-F]+)')
    type_pat = re.compile(r'type:(\w+)')

    functions = []
    with open(path, 'r') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or line.startswith('//'):
                continue
            m = pattern.match(line)
            if not m:
                continue

            name = m.group(1)
            vaddr = int(m.group(2), 16)
            comment = m.group(3)

            sym_type = "data"
            size = 0
            if comment:
                tm = type_pat.search(comment)
                if tm:
                    sym_type = tm.group(1)
                sm = size_pat.search(comment)
                if sm:
                    size = int(sm.group(1), 16)

            if sym_type == "func" and size > 0:
                functions.append((vaddr, size, name))

    functions.sort(key=lambda x: x[0])
    return functions


def find_existing_c_files(src_dir: str) -> dict:
    """Find existing C source files and map function names to paths."""
    c_files = {}
    if not os.path.isdir(src_dir):
        return c_files
    for root, dirs, files in os.walk(src_dir):
        for fname in files:
            if fname.endswith('.c'):
                rel = os.path.relpath(os.path.join(root, fname), src_dir)
                # Strip .c extension for the subsegment name
                name = rel[:-2]  # e.g. "graph/draw_button"
                c_files[name] = os.path.join(root, fname)
    return c_files


def group_into_translation_units(functions: list) -> list:
    """
    Group consecutive functions with the same subsystem into translation units.
    Returns list of (subsystem, start_vaddr, end_vaddr, [(vaddr, size, name), ...])
    """
    if not functions:
        return []

    groups = []
    current_subsys = classify_function(functions[0][2])
    current_funcs = [functions[0]]

    for i in range(1, len(functions)):
        vaddr, size, name = functions[i]
        subsys = classify_function(name)

        # Check if this function is contiguous with the previous group
        prev_vaddr, prev_size, _ = current_funcs[-1]
        prev_end = prev_vaddr + prev_size

        # Allow small gaps (padding/alignment up to 16 bytes)
        is_contiguous = (vaddr - prev_end) <= 16
        same_subsys = subsys == current_subsys

        if same_subsys and is_contiguous:
            current_funcs.append((vaddr, size, name))
        else:
            # Close current group
            group_start = current_funcs[0][0]
            last = current_funcs[-1]
            group_end = last[0] + last[1]
            groups.append((current_subsys, group_start, group_end, current_funcs))
            # Start new group
            current_subsys = subsys
            current_funcs = [(vaddr, size, name)]

    # Close last group
    if current_funcs:
        group_start = current_funcs[0][0]
        last = current_funcs[-1]
        group_end = last[0] + last[1]
        groups.append((current_subsys, group_start, group_end, current_funcs))

    return groups


def generate_subsegments(functions: list, existing_c: dict) -> list:
    """Generate splat subsegment entries for each function."""
    subsegments = []

    # Filter to .text section only (vaddr < TEXT_END_VADDR)
    text_funcs = [f for f in functions if f[0] < TEXT_END_VADDR]

    for vaddr, size, name in text_funcs:
        fileoff = vaddr_to_fileoff(vaddr)
        subsys = classify_function(name)
        seg_name = f"{subsys}/{name}"

        # Check if a C source exists for this function's subsystem/name
        seg_type = "asm"
        # For now, keep everything as asm — user switches to c when matched

        subsegments.append((fileoff, seg_type, seg_name, vaddr, size, name, subsys))

    return subsegments


def generate_splat_yaml(subsegments: list) -> str:
    """Generate the subsegments portion of splat_config.yml."""
    lines = []
    lines.append("name: Decrypted, unpacked OSDSYS_A.XLF from HDD Utility Disc 1.10U from SUDC4")
    lines.append("sha1: e932f3508313e2807467a0f354acc56869ea77f6")
    lines.append("options:")
    lines.append("    # paths")
    lines.append("    basename: OSDSYS_A")
    lines.append("    target_path: OSDSYS_A_XLF_decrypted_unpacked.elf")
    lines.append("    base_path: .")
    lines.append("    ")
    lines.append("    asm_path: asm")
    lines.append("    src_path: src")
    lines.append("    build_path: build")
    lines.append("    ")
    lines.append("    symbol_addrs_path: symbol_addrs.txt")
    lines.append("    undefined_funcs_auto_path: undefined_funcs_auto.txt")
    lines.append("    undefined_syms_auto_path: undefined_syms_auto.txt")
    lines.append("    ")
    lines.append("    # compiler ")
    lines.append("    compiler: GCC")
    lines.append("    platform: ps2")
    lines.append("    ")
    lines.append("    string_encoding: UTF-8")
    lines.append("    rodata_string_guesser_level: 2")
    lines.append("    disasm_unknown: True")
    lines.append("    named_regs_for_c_funcs: False")
    lines.append("    gp_value: 0x377970")
    lines.append("    subalign: 8")
    lines.append("    ")
    lines.append("    find_file_boundaries: False")
    lines.append('    section_order: [".text", ".data", ".rodata", ".bss"]')
    lines.append("segments:")
    lines.append("    - [0, databin, elf_header]")
    lines.append("    - name: main")
    lines.append("      type: code")
    lines.append("      start: 0x1000")
    lines.append("      vram: 0x200000")
    lines.append("      bss_size: 0x199de0")
    lines.append("      subsegments:")

    # Group consecutive functions for cleaner output
    prev_end_off = 0x1000  # Start of .text in file

    for fileoff, seg_type, seg_name, vaddr, size, name, subsys in subsegments:
        # If there's a gap between previous function and this one, emit a gap segment
        if fileoff > prev_end_off:
            gap_size = fileoff - prev_end_off
            if gap_size > 0:
                lines.append(f"        - [0x{prev_end_off:X}, asm, core/gap_{prev_end_off:06X}]  # {gap_size} bytes gap")

        lines.append(f"        - [0x{fileoff:X}, {seg_type}, {seg_name}]")
        prev_end_off = fileoff + size

    # Fill gap to data sections if needed
    text_end_fileoff = vaddr_to_fileoff(TEXT_END_VADDR)
    if prev_end_off < text_end_fileoff:
        lines.append(f"        - [0x{prev_end_off:X}, asm, core/gap_text_end]")

    # Data sections (same as original)
    for off, dtype, dname in DATA_SECTIONS:
        lines.append(f"        - [0x{off:X}, {dtype}, {dname}]")

    lines.append(f"        - [0x{SEGMENT_END:X}]")
    lines.append("")

    return "\n".join(lines)


def print_stats(functions: list):
    """Print subsystem statistics."""
    from collections import Counter
    subsys_counts = Counter()
    subsys_bytes = Counter()

    for vaddr, size, name in functions:
        subsys = classify_function(name)
        subsys_counts[subsys] += 1
        subsys_bytes[subsys] += size

    total_funcs = sum(subsys_counts.values())
    total_bytes = sum(subsys_bytes.values())

    print(f"\n{'Subsystem':<12} {'Functions':>10} {'Bytes':>10} {'% Code':>8}")
    print("─" * 44)

    for subsys in sorted(subsys_counts.keys(), key=lambda s: -subsys_bytes[s]):
        count = subsys_counts[subsys]
        bytez = subsys_bytes[subsys]
        pct = (bytez / total_bytes * 100) if total_bytes > 0 else 0
        bar = "█" * int(pct / 5) + "░" * (20 - int(pct / 5))
        print(f"{subsys:<12} {count:>10} {bytez:>10} {pct:>7.1f}% {bar}")

    print("─" * 44)
    print(f"{'TOTAL':<12} {total_funcs:>10} {total_bytes:>10} {'100.0%':>8}")


def check_coverage(functions: list):
    """Check for gaps and overlaps in function address ranges."""
    text_funcs = sorted(
        [f for f in functions if f[0] >= VRAM_BASE and f[0] < TEXT_END_VADDR],
        key=lambda x: x[0]
    )

    total_covered = 0
    total_text = TEXT_END_VADDR - VRAM_BASE
    gaps = []
    overlaps = []

    for i, (vaddr, size, name) in enumerate(text_funcs):
        total_covered += size
        if i > 0:
            prev_vaddr, prev_size, prev_name = text_funcs[i - 1]
            prev_end = prev_vaddr + prev_size
            if vaddr > prev_end:
                gap = vaddr - prev_end
                if gap > 16:  # Ignore small alignment padding
                    gaps.append((prev_end, vaddr, gap, prev_name, name))
            elif vaddr < prev_end:
                overlap = prev_end - vaddr
                overlaps.append((vaddr, overlap, prev_name, name))

    coverage_pct = (total_covered / total_text * 100) if total_text > 0 else 0

    print(f"\n.text coverage: {total_covered:,} / {total_text:,} bytes ({coverage_pct:.1f}%)")
    print(f"Functions in .text: {len(text_funcs)}")

    if gaps:
        print(f"\n⚠️  {len(gaps)} significant gaps (>16 bytes):")
        for start, end, size, prev, next_f in gaps[:20]:
            print(f"  0x{start:08X} - 0x{end:08X} ({size:6} bytes)  between {prev} and {next_f}")
        if len(gaps) > 20:
            print(f"  ... and {len(gaps) - 20} more")

    if overlaps:
        print(f"\n❌ {len(overlaps)} overlaps:")
        for addr, size, prev, next_f in overlaps[:10]:
            print(f"  0x{addr:08X} ({size} bytes overlap)  {prev} vs {next_f}")

    if not gaps and not overlaps:
        print("✅ No gaps or overlaps detected")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Generate per-function splat subsegments")
    parser.add_argument("--write", action="store_true", help="Write updated splat_config.yml")
    parser.add_argument("--stats", action="store_true", help="Show subsystem statistics")
    parser.add_argument("--check-coverage", action="store_true", help="Check address coverage")
    parser.add_argument("--preview", action="store_true", help="Preview first 50 subsegments")
    args = parser.parse_args()

    # Find project root (where symbol_addrs.txt lives)
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    os.chdir(project_root)

    # Parse symbols
    functions = parse_symbols(SYMBOL_FILE)
    print(f"Parsed {len(functions)} functions with type:func and size from {SYMBOL_FILE}")

    if args.stats:
        print_stats(functions)
        return

    if args.check_coverage:
        check_coverage(functions)
        return

    # Find existing C files
    existing_c = find_existing_c_files(SRC_DIR)
    if existing_c:
        print(f"Found {len(existing_c)} existing C source files:")
        for name in sorted(existing_c.keys()):
            print(f"  src/{name}.c")

    # Generate subsegments
    subsegments = generate_subsegments(functions, existing_c)
    text_segs = [s for s in subsegments if s[0] < vaddr_to_fileoff(TEXT_END_VADDR)]
    print(f"Generated {len(text_segs)} .text subsegments")

    if args.preview or (not args.write and not args.stats and not args.check_coverage):
        print("\nFirst 30 subsegments:")
        for i, (off, typ, name, va, sz, fn, sub) in enumerate(subsegments[:30]):
            print(f"  [{i:4}] 0x{off:06X} {typ:4} {name:<45} # 0x{va:08X} ({sz} bytes)")
        if len(subsegments) > 30:
            print(f"  ... {len(subsegments) - 30} more")
        print(f"\nRun with --write to update {SPLAT_CONFIG}")
        print(f"Run with --stats for subsystem breakdown")
        print(f"Run with --check-coverage to verify address coverage")

    if args.write:
        yaml_content = generate_splat_yaml(subsegments)
        # Backup original
        if os.path.exists(SPLAT_CONFIG):
            backup = SPLAT_CONFIG + ".bak"
            import shutil
            shutil.copy2(SPLAT_CONFIG, backup)
            print(f"Backed up {SPLAT_CONFIG} → {backup}")

        with open(SPLAT_CONFIG, 'w') as f:
            f.write(yaml_content)
        print(f"✅ Wrote {SPLAT_CONFIG} with {len(text_segs)} function subsegments")
        print(f"\nNext steps:")
        print(f"  1. python3 configure.py    # Re-run splat")
        print(f"  2. make elf                # Rebuild ELF")
        print(f"  3. make verify             # Verify byte-perfect")


if __name__ == "__main__":
    main()
