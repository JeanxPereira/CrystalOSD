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

    src_dir = Path("src")
    c_files = list(src_dir.rglob("*.c"))

    units = []
    for c_file in sorted(c_files):
        # c_file is something like src/core/get_clock_should_render_orbs.c
        rel_path = c_file.relative_to(src_dir)
        # e.g. core/get_clock_should_render_orbs.c
        subsys = rel_path.parent
        name = rel_path.stem

        target_path = f"build/target/{subsys}/{name}.o"
        base_path = f"build/base/{subsys}/{name}.o"

        # Also add any manually verified units even if they don't have C files yet?
        # Actually objdiff is best used for files we are working on.
        units.append({
            "name": f"{subsys}/{name}",
            "target_path": target_path,
            "base_path": base_path
        })

    config = {
        "$schema": "https://raw.githubusercontent.com/encounter/objdiff/main/config.schema.json",
        "custom_make": "make",
        "custom_args": ["-j4"],
        "build_target": True,
        "build_base": True,
        "watch_patterns": ["*.c", "*.h", "*.s", "*.S", "Makefile", "include/**/*.h"],
        "ignore_patterns": ["reference/**/*", ".git/**/*"],
        "units": units
    }

    with open("objdiff.json", "w") as f:
        json.dump(config, f, indent=2)
    
    print(f"Generated objdiff.json with {len(units)} units")

if __name__ == "__main__":
    main()
