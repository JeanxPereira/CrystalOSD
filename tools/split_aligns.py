#!/usr/bin/env python3
"""
split_aligns.py — Split large align blocks into individual function segments.

This script analyzes align_*.s files in the asm/ directory, extracts individual
function boundaries from them, and generates updated splat_config.yml entries
that replace the monolithic align with per-function segments.

The result is:
  - More accurate decomp.dev progress tracking
  - Individual functions visible in objdiff
  - Better organization by assigning correct module names

Usage:
    python3 tools/split_aligns.py                    # Preview changes (dry run)
    python3 tools/split_aligns.py --apply             # Apply changes to splat_config.yml
    python3 tools/split_aligns.py --min-size 100      # Only process aligns >= 100 bytes
    python3 tools/split_aligns.py --analyze           # Show detailed analysis only
"""

import argparse
import re
import os
import sys
import shutil
from pathlib import Path
from typing import List, Tuple, Dict, Optional
from dataclasses import dataclass, field


VRAM_BASE = 0x200000
FILE_OFFSET_BASE = 0x1000
# file_offset = VRAM - VRAM_BASE + FILE_OFFSET_BASE
# VRAM = file_offset + VRAM_BASE - FILE_OFFSET_BASE


@dataclass
class FunctionEntry:
    """A function found inside an align block."""
    vram: int
    file_offset: int
    name: str  # e.g., func_002720E0 or D_00272080
    size: int  # in bytes
    is_data: bool  # True if D_ prefix

    @property
    def hex_offset(self) -> str:
        return f"0x{self.file_offset:X}"


@dataclass
class AlignBlock:
    """An align block that may contain hidden functions."""
    line_number: int  # 0-indexed line in splat_config.yml
    file_offset: int
    name: str  # e.g., core/align_073080
    size: int  # from the comment
    original_line: str
    
    # Context
    prev_module: Optional[str] = None
    next_module: Optional[str] = None
    
    # Extracted functions
    functions: List[FunctionEntry] = field(default_factory=list)
    
    @property
    def inferred_module(self) -> str:
        """Best guess for which module these functions belong to."""
        if self.prev_module == self.next_module and self.prev_module:
            return self.prev_module
        # If between two different modules, use the one that appears more often
        # For now, use prev_module as default
        return self.prev_module or self.next_module or "core"
    
    @property
    def total_function_bytes(self) -> int:
        return sum(f.size for f in self.functions)

    @property
    def func_count(self) -> int:
        return sum(1 for f in self.functions if not f.is_data)


def vram_to_offset(vram: int) -> int:
    """Convert VRAM address to file offset."""
    return vram - VRAM_BASE + FILE_OFFSET_BASE


def offset_to_vram(offset: int) -> int:
    """Convert file offset to VRAM address."""
    return offset + VRAM_BASE - FILE_OFFSET_BASE


def parse_splat_config(config_path: str) -> Tuple[List[str], List[AlignBlock]]:
    """Parse splat_config.yml and extract align blocks > 16 bytes."""
    lines = open(config_path).readlines()
    aligns = []
    
    # First pass: build segment list for context
    segments = []
    for i, line in enumerate(lines):
        m = re.search(r'\[0x([0-9A-Fa-f]+),\s*asm,\s*(\w+)/(\w+)\]', line)
        if m:
            segments.append((i, int(m.group(1), 16), m.group(2), m.group(3)))
    
    # Second pass: extract align blocks with context
    for idx, (lineno, offset, module, name) in enumerate(segments):
        if not name.startswith('align_'):
            continue
        
        # Parse size from comment
        m = re.search(r'#\s*(\d+)\s*bytes\s*gap', lines[lineno])
        if not m:
            continue
        size = int(m.group(1))
        if size <= 16:
            continue
        
        block = AlignBlock(
            line_number=lineno,
            file_offset=offset,
            name=f"{module}/{name}",
            size=size,
            original_line=lines[lineno],
        )
        
        # Find context (previous and next non-align segments)
        for j in range(idx - 1, -1, -1):
            if 'align_' not in segments[j][3]:
                block.prev_module = segments[j][2]
                break
        for j in range(idx + 1, len(segments)):
            if 'align_' not in segments[j][3]:
                block.next_module = segments[j][2]
                break
        
        aligns.append(block)
    
    return lines, aligns


def extract_functions_from_asm(asm_path: str, block: AlignBlock) -> List[FunctionEntry]:
    """Extract individual function entries from an align .s file."""
    if not os.path.exists(asm_path):
        return []
    
    content = open(asm_path).read()
    functions = []
    
    # Find all glabel/endlabel pairs with their positions
    glabels = list(re.finditer(r'glabel\s+((?:func|D)_([0-9A-Fa-f]+))', content))
    endlabels = {m.group(1): m for m in re.finditer(r'endlabel\s+((?:func|D)_([0-9A-Fa-f]+))', content)}
    
    for i, gl in enumerate(glabels):
        label_name = gl.group(1)
        vram = int(gl.group(2), 16)
        is_data = label_name.startswith('D_')
        
        # Calculate size from instructions between glabel and endlabel
        size = 4  # minimum
        if label_name in endlabels:
            block_text = content[gl.start():endlabels[label_name].end()]
            instr_count = len(re.findall(r'/\*.*?\*/', block_text))
            size = max(4, instr_count * 4)
        
        functions.append(FunctionEntry(
            vram=vram,
            file_offset=vram_to_offset(vram),
            name=label_name,
            size=size,
            is_data=is_data,
        ))
    
    # Sort by address
    functions.sort(key=lambda f: f.vram)
    return functions


def generate_splat_entries(block: AlignBlock, indent: str = "        ") -> List[str]:
    """Generate splat_config.yml entries for functions in an align block."""
    if not block.functions:
        return [block.original_line]
    
    module = block.inferred_module
    entries = []
    
    # Check if there's padding at the start (before first function)
    first_func_offset = block.functions[0].file_offset
    if first_func_offset > block.file_offset:
        gap = first_func_offset - block.file_offset
        if gap > 0 and gap <= 16:
            # Small padding before first function - include as align
            entries.append(
                f"{indent}- [0x{block.file_offset:X}, asm, core/align_{block.file_offset:06X}]"
                f"  # {gap} bytes padding\n"
            )
        elif gap > 16:
            # There might be data here
            entries.append(
                f"{indent}- [0x{block.file_offset:X}, asm, {module}/gap_{block.file_offset:06X}]"
                f"  # {gap} bytes unknown\n"
            )
    
    for i, func in enumerate(block.functions):
        # Determine if we need alignment padding between functions
        if i > 0:
            prev_end = block.functions[i-1].file_offset + block.functions[i-1].size
            gap = func.file_offset - prev_end
            if gap > 0 and gap <= 16:
                entries.append(
                    f"{indent}- [0x{prev_end:X}, asm, core/align_{prev_end:06X}]"
                    f"  # {gap} bytes padding\n"
                )
            elif gap > 16:
                entries.append(
                    f"{indent}- [0x{prev_end:X}, asm, {module}/gap_{prev_end:06X}]"
                    f"  # {gap} bytes gap\n"
                )
        
        # The function itself
        entries.append(
            f"{indent}- [0x{func.file_offset:X}, asm, {module}/{func.name}]\n"
        )
    
    return entries


def print_analysis(aligns: List[AlignBlock]):
    """Print detailed analysis of align blocks."""
    total_funcs = sum(b.func_count for b in aligns)
    total_bytes = sum(b.size for b in aligns)
    
    print(f"\n{'='*70}")
    print(f"ALIGN ANALYSIS SUMMARY")
    print(f"{'='*70}")
    print(f"  Align blocks > 16 bytes:  {len(aligns)}")
    print(f"  Total hidden functions:   {total_funcs}")
    print(f"  Total hidden bytes:       {total_bytes:,} ({total_bytes/1024:.1f} KB)")
    print()
    
    # Group by inferred module
    by_module: Dict[str, List[AlignBlock]] = {}
    for block in aligns:
        mod = block.inferred_module
        by_module.setdefault(mod, []).append(block)
    
    print(f"{'Module':<15} {'Blocks':>6} {'Functions':>9} {'Bytes':>10}")
    print(f"{'-'*15} {'-'*6} {'-'*9} {'-'*10}")
    for mod in sorted(by_module, key=lambda m: -sum(b.size for b in by_module[m])):
        blocks = by_module[mod]
        funcs = sum(b.func_count for b in blocks)
        bytes_total = sum(b.size for b in blocks)
        print(f"{mod:<15} {len(blocks):>6} {funcs:>9} {bytes_total:>10,}")
    
    print(f"\n{'='*70}")
    print(f"TOP 20 LARGEST BLOCKS")
    print(f"{'='*70}")
    for block in sorted(aligns, key=lambda b: -b.size)[:20]:
        print(f"\n  {block.name} ({block.size:,}B) — {block.func_count} funcs")
        print(f"  Context: {block.prev_module} → {block.next_module}")
        print(f"  Inferred module: {block.inferred_module}")
        for func in sorted(block.functions, key=lambda f: -f.size)[:5]:
            prefix = "DATA" if func.is_data else "FUNC"
            print(f"    [{prefix}] {func.name} — {func.size}B at 0x{func.file_offset:X}")
        if len(block.functions) > 5:
            print(f"    ... +{len(block.functions)-5} more")


def apply_changes(config_path: str, lines: List[str], aligns: List[AlignBlock]):
    """Apply the changes to splat_config.yml."""
    # Create backup
    backup_path = config_path + ".bak"
    shutil.copy2(config_path, backup_path)
    print(f"  Backup created: {backup_path}")
    
    # Process in reverse order (so line numbers don't shift)
    aligns_sorted = sorted(aligns, key=lambda b: -b.line_number)
    
    total_replaced = 0
    total_new_entries = 0
    
    for block in aligns_sorted:
        if not block.functions:
            continue
        
        new_entries = generate_splat_entries(block)
        if len(new_entries) <= 1:
            continue
        
        # Replace the single align line with multiple entries
        lines[block.line_number:block.line_number + 1] = new_entries
        total_replaced += 1
        total_new_entries += len(new_entries)
    
    # Write the modified config
    with open(config_path, 'w') as f:
        f.writelines(lines)
    
    print(f"  Replaced {total_replaced} align blocks with {total_new_entries} entries")
    print(f"  Modified: {config_path}")
    print(f"\n  Next steps:")
    print(f"    1. Run: python3 configure.py -c  (clean)")
    print(f"    2. Run: python3 configure.py     (re-extract)")
    print(f"    3. Run: make                     (rebuild)")
    print(f"    4. Regenerate objdiff.json")


def preview_changes(aligns: List[AlignBlock], limit: int = 3):
    """Show a preview of what changes would be made."""
    print(f"\n{'='*70}")
    print(f"PREVIEW OF CHANGES (showing first {limit} blocks)")
    print(f"{'='*70}")
    
    shown = 0
    for block in sorted(aligns, key=lambda b: -b.size):
        if not block.functions or shown >= limit:
            continue
        
        print(f"\n--- {block.name} ({block.size:,}B, {block.func_count} funcs) ---")
        print(f"BEFORE:")
        print(f"  {block.original_line.rstrip()}")
        print(f"AFTER:")
        new_entries = generate_splat_entries(block)
        for entry in new_entries[:10]:
            print(f"  {entry.rstrip()}")
        if len(new_entries) > 10:
            print(f"  ... +{len(new_entries)-10} more entries")
        shown += 1


def main():
    parser = argparse.ArgumentParser(
        description="Split large align blocks into individual function segments"
    )
    parser.add_argument(
        "--apply", action="store_true",
        help="Apply changes to splat_config.yml (default is dry-run/preview)"
    )
    parser.add_argument(
        "--analyze", action="store_true",
        help="Show detailed analysis without preview"
    )
    parser.add_argument(
        "--min-size", type=int, default=20,
        help="Minimum align size in bytes to process (default: 20)"
    )
    parser.add_argument(
        "--config", type=str, default="splat_config.yml",
        help="Path to splat_config.yml"
    )
    parser.add_argument(
        "--asm-dir", type=str, default="asm",
        help="Path to asm directory"
    )
    args = parser.parse_args()
    
    if not os.path.exists(args.config):
        print(f"Error: {args.config} not found")
        sys.exit(1)
    
    print(f"Parsing {args.config}...")
    lines, aligns = parse_splat_config(args.config)
    
    # Filter by min size
    aligns = [a for a in aligns if a.size >= args.min_size]
    print(f"Found {len(aligns)} align blocks >= {args.min_size} bytes")
    
    # Extract functions from each align's .s file
    print(f"Extracting functions from .s files...")
    for block in aligns:
        asm_path = os.path.join(args.asm_dir, f"{block.name}.s")
        block.functions = extract_functions_from_asm(asm_path, block)
    
    # Always show analysis
    print_analysis(aligns)
    
    if args.analyze:
        return
    
    # Preview or apply
    if args.apply:
        print(f"\nApplying changes...")
        apply_changes(args.config, lines, aligns)
    else:
        preview_changes(aligns)
        total_funcs = sum(b.func_count for b in aligns)
        print(f"\n{'='*70}")
        print(f"DRY RUN — No changes made.")
        print(f"This would split {len([b for b in aligns if b.functions])} align blocks")
        print(f"into ~{total_funcs} individual function entries.")
        print(f"Run with --apply to make changes.")
        print(f"{'='*70}")


if __name__ == "__main__":
    main()
