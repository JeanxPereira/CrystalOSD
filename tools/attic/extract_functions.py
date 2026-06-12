#!/usr/bin/env python3
"""
Extract individual function .s files from splat's monolithic texttmp.s
for use with objdiff matching.

Usage: python3 tools/extract_functions.py

Reads:  reference/osdsys_re/asm/texttmp.s
Writes: asm/<subsystem>/<function_name>.s
"""

import os
import re
import sys

INPUT_FILE = "reference/osdsys_re/asm/texttmp.s"
OUTPUT_DIR = "asm"

# Map function names to subsystems based on prefix/known membership
SUBSYSTEM_MAP = {
    # Sound
    "sound_": "sound",
    "sceSpu2": "sound",
    "load_sound": "sound",
    # Config
    "config_": "config",
    "do_read_cdvd": "config",
    "do_write_cdvd": "config",
    # Graphics
    "gs": "graph",
    "Gs": "graph",
    "graph_": "graph",
    "GetTex": "graph",
    "draw_": "graph",
    "vif1_": "graph",
    # Browser
    "Browser": "browser",
    "browser_": "browser",
    "MC_": "browser",
    "mc_": "browser",
    # Clock
    "Clock": "clock",
    "clock_": "clock",
    "rod_": "clock",
    # Opening
    "Opening": "opening",
    "opening_": "opening",
    # Core / Expand
    "Expand": "core",
    "expand_": "core",
    "romdir_": "core",
    "do_load_module": "core",
    "GetResource": "core",
    "get_resource": "core",
    # Module system
    "module_": "module",
}

def classify_function(name):
    """Determine which subsystem a function belongs to."""
    for prefix, subsystem in SUBSYSTEM_MAP.items():
        if name.startswith(prefix):
            return subsystem
    return "core"  # Default to core for unclassified


def extract_functions(input_path, output_dir):
    """Parse texttmp.s and extract functions into per-subsystem files."""
    
    if not os.path.exists(input_path):
        print(f"ERROR: {input_path} not found. Run splat first:")
        print(f"  cd reference/osdsys_re/ && python3 configure.py")
        sys.exit(1)
    
    # Read entire file
    with open(input_path, 'r') as f:
        lines = f.readlines()
    
    # Parse into functions
    functions = {}  # name -> (subsystem, lines)
    current_func = None
    current_lines = []
    header_lines = []  # .include, .set, .section directives
    
    for line in lines:
        # Detect function start: "glabel <name>"
        match = re.match(r'^glabel\s+(\w+)', line)
        if match:
            # Save previous function
            if current_func:
                subsystem = classify_function(current_func)
                if subsystem not in functions:
                    functions[subsystem] = []
                functions[subsystem].append((current_func, current_lines))
            
            current_func = match.group(1)
            current_lines = [line]
            continue
        
        # Detect function end: "endlabel <name>"
        end_match = re.match(r'^endlabel\s+(\w+)', line)
        if end_match:
            if current_lines:
                current_lines.append(line)
            continue
        
        # Detect nonmatching directive (function metadata)
        non_match = re.match(r'^nonmatching\s+(\w+)', line)
        if non_match:
            if current_func and current_lines:
                subsystem = classify_function(current_func)
                if subsystem not in functions:
                    functions[subsystem] = []
                functions[subsystem].append((current_func, current_lines))
                current_func = None
                current_lines = []
            # Start collecting for the next glabel
            current_lines = [line]
            continue
        
        # Header directives (before any function)
        if current_func is None and not current_lines:
            if line.strip().startswith('.') or line.strip().startswith('/*'):
                header_lines.append(line)
                continue
        
        # Regular instruction line
        if current_func:
            current_lines.append(line)
        elif current_lines:
            current_lines.append(line)
    
    # Save last function
    if current_func and current_lines:
        subsystem = classify_function(current_func)
        if subsystem not in functions:
            functions[subsystem] = []
        functions[subsystem].append((current_func, current_lines))
    
    # Write per-subsystem .s files
    header = "".join(header_lines) if header_lines else ".set noat\n.set noreorder\n\n.section .text, \"ax\"\n\n"
    
    total_funcs = 0
    for subsystem, func_list in sorted(functions.items()):
        sub_dir = os.path.join(output_dir, subsystem)
        os.makedirs(sub_dir, exist_ok=True)
        
        # Write combined subsystem file (all functions in one .s)
        combined_path = os.path.join(sub_dir, f"{subsystem}.s")
        with open(combined_path, 'w') as f:
            f.write(header)
            for func_name, func_lines in func_list:
                f.write(f"\n/* === {func_name} === */\n")
                f.writelines(func_lines)
                f.write("\n")
        
        total_funcs += len(func_list)
        print(f"  {subsystem:12s}: {len(func_list):4d} functions → {combined_path}")
    
    print(f"\nTotal: {total_funcs} functions across {len(functions)} subsystems")
    return functions


if __name__ == "__main__":
    print("=== CrystalOSD Function Extractor ===\n")
    extract_functions(INPUT_FILE, OUTPUT_DIR)
    print("\nDone! Run 'objdiff -p .' to start matching.")
