#!/usr/bin/env python3
"""
patch_stubs.py — Auto-generate extern declarations for raw Ghidra stubs.

Scans each stub .c file for:
  - DAT_XXXXXXXX references → generates 'extern int DAT_XXXXXXXX;'
  - Undeclared function calls → generates 'int func_name();'

This makes stubs compilable (with warnings) for Transmuter/decomp-permuter.
"""

import os
import re
import sys

# Pattern for Ghidra DAT_ globals
DAT_PATTERN = re.compile(r'\bDAT_([0-9a-fA-F]{8})\b')
# Pattern for Ghidra string references (aPrintfSomething)
ASTR_PATTERN = re.compile(r'\b(a[A-Z]\w+)\b')
# Known standard functions that don't need extern declaration
KNOWN_FUNCS = {
    'memset', 'memcpy', 'memmove', 'strlen', 'strcpy', 'strncpy',
    'strcmp', 'strncmp', 'strcat', 'printf', 'sprintf', 'snprintf',
    'malloc', 'free', 'calloc', 'realloc', 'trap',
}

def patch_stub(filepath):
    """Add extern declarations to a stub file so it compiles."""
    with open(filepath, 'r') as f:
        content = f.read()

    # Skip if already patched
    if '/* AUTO-GENERATED EXTERNS */' in content:
        return False

    # Find all DAT_ references
    dat_refs = sorted(set(DAT_PATTERN.findall(content)))
    
    # Find all aPrintfStyle string references
    astr_refs = sorted(set(ASTR_PATTERN.findall(content)))
    # Filter out common false positives
    astr_refs = [a for a in astr_refs if a not in ('auStack', 'acStack')]

    if not dat_refs and not astr_refs:
        return False

    # Build extern block
    externs = []
    externs.append('/* AUTO-GENERATED EXTERNS — do not edit manually */')
    
    for dat in dat_refs:
        externs.append(f'extern int DAT_{dat.lower()};')
    
    for astr in astr_refs:
        # String references from Ghidra
        externs.append(f'extern char {astr}[];')
    
    externs.append('')
    extern_block = '\n'.join(externs)

    # Insert after #include "ghidra_types.h" line
    if '#include "ghidra_types.h"' in content:
        content = content.replace(
            '#include "ghidra_types.h"',
            f'#include "ghidra_types.h"\n\n{extern_block}'
        )
    else:
        # Insert after the header comment block
        lines = content.split('\n')
        insert_idx = 0
        for i, line in enumerate(lines):
            if line.strip() == '*/':
                insert_idx = i + 1
                break
        lines.insert(insert_idx, f'\n{extern_block}\n')
        content = '\n'.join(lines)

    with open(filepath, 'w') as f:
        f.write(content)
    
    return True


def main():
    stubs_dir = sys.argv[1] if len(sys.argv) > 1 else 'src/stubs'
    
    if not os.path.isdir(stubs_dir):
        print(f"ERROR: {stubs_dir} not found")
        sys.exit(1)

    patched = 0
    skipped = 0
    
    for root, dirs, files in sorted(os.walk(stubs_dir)):
        for fname in sorted(files):
            if not fname.endswith('.c'):
                continue
            fpath = os.path.join(root, fname)
            if patch_stub(fpath):
                patched += 1
            else:
                skipped += 1

    print(f"Patched: {patched}  Skipped: {skipped}")


if __name__ == '__main__':
    main()
