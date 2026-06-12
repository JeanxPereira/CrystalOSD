#!/usr/bin/env python3
"""
patch_data_labels.py — Add missing data symbol definitions to regenerated asm/data.

Problem this solves
--------------------
The byte-perfect build needs the committed CODE asm (asm/<sub>/*.s, git-tracked) to link
against regenerated DATA asm (asm/data/*.s, gitignored). With the current splat64 /
spimdisasm, two failures break `ld`:

1. Missing labels: splat emits the data BYTES but no `glabel` for many symbols that are in
   symbol_addrs.txt (langtbl_*, asciz strings, etc.).
2. Name drift: the committed code references a data address by its OLD auto-name
   `D_003DDCA0`, while regenerated data labels the SAME address with its current
   symbol_addrs name (`micropt_1`). The linker sees two different symbols.

Both are fixed by inserting the needed `glabel`s. A label emits NO bytes, so the linked
ELF stays byte-identical — this only resolves references. Co-located labels (e.g. both
`glabel micropt_1` and `glabel D_003DDCA0` at one address) are legal and both resolve.

Run after `configure.py`, before `make elf`. Idempotent.
Usage: python3 tools/wsl/patch_data_labels.py [--asm-dir asm/data] [--scan-dir asm]
"""
import argparse
import re
from collections import defaultdict
from pathlib import Path

# Matches a spimdisasm data line: `/* OFF VRAM [BYTES] */ ...` — BYTES optional (.byte lines omit it).
LINE_RE = re.compile(r"^\s*/\*\s*[0-9A-Fa-f]+\s+([0-9A-Fa-f]{8})(?:\s+[0-9A-Fa-f]+)?\s*\*/")
SYM_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*0x([0-9A-Fa-f]+)\s*;")
LABEL_RE = re.compile(r"^\s*(?:glabel|dlabel|jlabel)\s+([A-Za-z_][A-Za-z0-9_]*)")
# Auto-name a reference to an unnamed data address: D_<8 uppercase hex of its address>.
DREF_RE = re.compile(r"\bD_([0-9A-Fa-f]{8})\b")


def load_named(path: Path) -> dict:
    named = {}
    for line in path.read_text().splitlines():
        m = SYM_RE.match(line.strip())
        if m:
            named[int(m.group(2), 16)] = m.group(1)
    return named


def collect_needed(symbols_path: Path, scan_dir: Path) -> dict:
    """addr -> set(names that must be defined at that addr)."""
    named = load_named(symbols_path)
    needed = defaultdict(set)
    for addr, name in named.items():
        needed[addr].add(name)
    # every D_<addr> auto-name referenced anywhere in the asm tree must resolve too
    for s_file in scan_dir.rglob("*.s"):
        for m in DREF_RE.finditer(s_file.read_text()):
            addr = int(m.group(1), 16)
            needed[addr].add(f"D_{addr:08X}")
    return needed


def preceding_labels(out: list) -> set:
    """Labels already present in the contiguous label/blank run at the end of `out`."""
    labels = set()
    for line in reversed(out):
        if not line.strip():
            continue
        m = LABEL_RE.match(line)
        if m:
            labels.add(m.group(1))
            continue
        break  # hit a non-label, non-blank line -> end of the label run
    return labels


def patch_file(s_file: Path, needed: dict) -> int:
    lines = s_file.read_text().splitlines(keepends=True)
    out = []
    inserted = 0
    for line in lines:
        m = LINE_RE.match(line)
        if m:
            vram = int(m.group(1), 16)
            want = needed.get(vram)
            if want:
                have = preceding_labels(out)
                for name in sorted(want - have):
                    out.append(f"glabel {name}\n")
                    inserted += 1
        out.append(line)
    if inserted:
        s_file.write_text("".join(out))
    return inserted


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--asm-dir", default="asm/data")
    ap.add_argument("--scan-dir", default="asm")
    ap.add_argument("--symbols", default="symbol_addrs.txt")
    args = ap.parse_args()

    needed = collect_needed(Path(args.symbols), Path(args.scan_dir))
    print(f"patch_data_labels: {len(needed)} addresses need labels")
    total = 0
    for s_file in sorted(Path(args.asm_dir).rglob("*.s")):
        n = patch_file(s_file, needed)
        if n:
            print(f"  {s_file}: +{n} glabel")
            total += n
    print(f"patch_data_labels: inserted {total} glabel definitions")


if __name__ == "__main__":
    main()
