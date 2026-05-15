#!/usr/bin/env python3
"""
generate_objdiff.py — Generate objdiff.json based on current C files

Usage:
    python3 tools/generate_objdiff.py
"""

import json
from pathlib import Path
import os

def main():
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    os.chdir(project_root)

    asm_dir = Path("asm")
    src_dir = Path("src")
    
    subsystems = ["core", "browser", "cdvd", "clock", "config", "graph", "history", "module", "opening", "sound", "data"]

    progress_categories = []
    for subsys in subsystems:
        progress_categories.append({
            "id": subsys,
            "name": subsys.capitalize()
        })

    units = []
    for subsys in subsystems:
        subsys_dir = asm_dir / subsys
        if not subsys_dir.exists():
            continue
            
        for s_file in sorted(subsys_dir.rglob("*.s")):
            name = s_file.stem
            
            target_path = f"build/target/{subsys}/{name}.o"
            
            # Check if C file exists
            c_file_exact = src_dir / subsys / f"{name}.c"
            c_file_subsys = src_dir / subsys / f"{subsys}.c"
            
            if c_file_exact.exists():
                base_path = f"build/base/{subsys}/{name}.o"
                metadata = {
                    "progress_categories": [subsys]
                }
            elif c_file_subsys.exists():
                base_path = f"build/base/{subsys}/{subsys}.o"
                metadata = {
                    "progress_categories": [subsys]
                }
            else:
                base_path = None
                metadata = {
                    "progress_categories": [subsys],
                    "auto_generated": True
                }
            
            units.append({
                "name": f"{subsys}/{name}",
                "target_path": target_path,
                "base_path": base_path,
                "metadata": metadata
            })

    config = {
        "$schema": "https://raw.githubusercontent.com/encounter/objdiff/main/config.schema.json",
        "custom_make": "make",
        "custom_args": ["-j4"],
        "build_target": True,
        "build_base": True,
        "watch_patterns": ["*.c", "*.h", "*.s", "*.S", "Makefile", "include/**/*.h"],
        "ignore_patterns": ["reference/**/*", ".git/**/*"],
        "progress_categories": progress_categories,
        "units": units
    }

    with open("objdiff.json", "w") as f:
        json.dump(config, f, indent=2)
    
    print(f"Generated objdiff.json with {len(units)} units")

if __name__ == "__main__":
    main()
