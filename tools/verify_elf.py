#!/usr/bin/env python3
"""
verify_elf.py — Deep comparison between rebuilt and original ELF

Compares headers, sections, and content between the original OSDSYS ELF
and the rebuilt one. Helps diagnose the black-screen boot issue.

Usage:
    python3 tools/verify_elf.py                          # Compare headers
    python3 tools/verify_elf.py --sections               # Compare section layout
    python3 tools/verify_elf.py --binary-diff             # Find first differing byte
    python3 tools/verify_elf.py --hexdump 0x0 0x80        # Hex dump a range
"""

import struct
import sys
import os
from pathlib import Path

ORIG_ELF = "OSDSYS_A_XLF_decrypted_unpacked.elf"
BUILT_ELF = "build/OSDSYS.elf"


def read_elf_header(data: bytes) -> dict:
    """Parse ELF32 header."""
    if len(data) < 52:
        return {"error": "File too small for ELF header"}

    magic = data[:4]
    if magic != b'\x7fELF':
        return {"error": f"Bad magic: {magic.hex()}"}

    fields = struct.unpack('<16sHHIIIIIHHHHHH', data[:52])
    return {
        "e_ident": data[:16].hex(),
        "e_type": fields[1],
        "e_machine": fields[2],
        "e_version": fields[3],
        "e_entry": fields[4],
        "e_phoff": fields[5],
        "e_shoff": fields[6],
        "e_flags": fields[7],
        "e_ehsize": fields[8],
        "e_phentsize": fields[9],
        "e_phnum": fields[10],
        "e_shentsize": fields[11],
        "e_shnum": fields[12],
        "e_shstrndx": fields[13],
    }


def read_program_headers(data: bytes, phoff: int, phnum: int, phentsize: int) -> list:
    """Parse ELF32 program headers."""
    headers = []
    for i in range(phnum):
        off = phoff + i * phentsize
        if off + phentsize > len(data):
            break
        fields = struct.unpack('<IIIIIIII', data[off:off+32])
        headers.append({
            "p_type": fields[0],
            "p_offset": fields[1],
            "p_vaddr": fields[2],
            "p_paddr": fields[3],
            "p_filesz": fields[4],
            "p_memsz": fields[5],
            "p_flags": fields[6],
            "p_align": fields[7],
        })
    return headers


def p_type_name(pt: int) -> str:
    names = {0: "NULL", 1: "LOAD", 2: "DYNAMIC", 3: "INTERP",
             4: "NOTE", 5: "SHLIB", 6: "PHDR", 0x70000000: "MIPS_REGINFO"}
    return names.get(pt, f"0x{pt:X}")


def p_flags_str(flags: int) -> str:
    s = ""
    s += "R" if flags & 4 else "-"
    s += "W" if flags & 2 else "-"
    s += "E" if flags & 1 else "-"
    return s


def compare_headers(orig: bytes, built: bytes):
    """Compare ELF headers."""
    h1 = read_elf_header(orig)
    h2 = read_elf_header(built)

    print("\n  ELF Header Comparison")
    print("  " + "=" * 60)
    print(f"  {'Field':<20} {'Original':>16} {'Rebuilt':>16} {'Match':>6}")
    print("  " + "-" * 60)

    for key in ["e_type", "e_machine", "e_version", "e_entry", "e_phoff",
                "e_shoff", "e_flags", "e_ehsize", "e_phentsize", "e_phnum",
                "e_shentsize", "e_shnum", "e_shstrndx"]:
        v1 = h1.get(key, "?")
        v2 = h2.get(key, "?")
        match = "✅" if v1 == v2 else "❌"
        fmt = f"0x{v1:X}" if isinstance(v1, int) else str(v1)
        fmt2 = f"0x{v2:X}" if isinstance(v2, int) else str(v2)
        print(f"  {key:<20} {fmt:>16} {fmt2:>16} {match:>6}")

    return h1, h2


def compare_program_headers(orig: bytes, built: bytes, h1: dict, h2: dict):
    """Compare program headers."""
    ph1 = read_program_headers(orig, h1["e_phoff"], h1["e_phnum"], h1["e_phentsize"])
    ph2 = read_program_headers(built, h2["e_phoff"], h2["e_phnum"], h2["e_phentsize"])

    print(f"\n  Program Headers (Original: {len(ph1)}, Rebuilt: {len(ph2)})")
    print("  " + "=" * 80)

    for i, (p1, p2) in enumerate(zip(ph1, ph2)):
        print(f"\n  Segment [{i}]:")
        print(f"  {'Field':<15} {'Original':>16} {'Rebuilt':>16} {'Match':>6}")
        print("  " + "-" * 55)
        for key in ["p_type", "p_offset", "p_vaddr", "p_paddr", "p_filesz", "p_memsz", "p_flags", "p_align"]:
            v1 = p1[key]
            v2 = p2[key]
            match = "✅" if v1 == v2 else "❌"
            extra = ""
            if key == "p_type":
                extra = f"  ({p_type_name(v1)})"
            elif key == "p_flags":
                extra = f"  ({p_flags_str(v1)})"
            print(f"  {key:<15} 0x{v1:>08X}        0x{v2:>08X}        {match}{extra}")


def find_first_diff(orig: bytes, built: bytes, max_show: int = 20):
    """Find first byte difference."""
    min_len = min(len(orig), len(built))
    diffs = []

    for i in range(min_len):
        if orig[i] != built[i]:
            diffs.append(i)
            if len(diffs) >= max_show:
                break

    if len(orig) != len(built):
        print(f"\n  ⚠️  File sizes differ: original={len(orig)}, rebuilt={len(built)}")

    if not diffs:
        print(f"\n  ✅ Files are byte-identical ({len(orig):,} bytes)")
        return

    print(f"\n  ❌ First {len(diffs)} byte differences:")
    print(f"  {'Offset':<12} {'Original':>10} {'Rebuilt':>10} {'Section'}")
    print("  " + "-" * 50)
    for offset in diffs:
        section = "header" if offset < 0x1000 else ".text" if offset < 0xA57A0 else ".data"
        print(f"  0x{offset:08X}   0x{orig[offset]:02X}         0x{built[offset]:02X}         {section}")


def hexdump_range(data: bytes, start: int, length: int, label: str = ""):
    """Print hex dump of a byte range."""
    if label:
        print(f"\n  {label}")
    end = min(start + length, len(data))
    for offset in range(start, end, 16):
        hex_str = " ".join(f"{data[i]:02X}" for i in range(offset, min(offset + 16, end)))
        ascii_str = "".join(
            chr(data[i]) if 32 <= data[i] < 127 else "."
            for i in range(offset, min(offset + 16, end))
        )
        print(f"  {offset:08X}  {hex_str:<48}  {ascii_str}")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="ELF verification tool")
    parser.add_argument("--sections", action="store_true", help="Compare section layout")
    parser.add_argument("--binary-diff", action="store_true", help="Find byte differences")
    parser.add_argument("--hexdump", nargs=2, metavar=("START", "LENGTH"),
                       help="Hex dump a range (hex values)")
    parser.add_argument("--orig", default=ORIG_ELF, help="Original ELF path")
    parser.add_argument("--built", default=BUILT_ELF, help="Built ELF path")
    args = parser.parse_args()

    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    os.chdir(project_root)

    if not os.path.exists(args.orig):
        print(f"❌ Original ELF not found: {args.orig}")
        sys.exit(1)
    if not os.path.exists(args.built):
        print(f"❌ Built ELF not found: {args.built}")
        print("   Run 'make elf' first")
        sys.exit(1)

    with open(args.orig, 'rb') as f:
        orig = f.read()
    with open(args.built, 'rb') as f:
        built = f.read()

    print(f"\n  Original: {args.orig} ({len(orig):,} bytes)")
    print(f"  Built:    {args.built} ({len(built):,} bytes)")

    h1, h2 = compare_headers(orig, built)

    if args.sections:
        compare_program_headers(orig, built, h1, h2)

    if args.binary_diff:
        find_first_diff(orig, built)

    if args.hexdump:
        start = int(args.hexdump[0], 16)
        length = int(args.hexdump[1], 16)
        hexdump_range(orig, start, length, f"Original @ 0x{start:X}")
        hexdump_range(built, start, length, f"Built    @ 0x{start:X}")

    if not args.sections and not args.binary_diff and not args.hexdump:
        compare_program_headers(orig, built, h1, h2)
        find_first_diff(orig, built)


if __name__ == "__main__":
    main()
