#!/usr/bin/env python3
"""
progress.py — CrystalOSD decompilation progress tracker

Scans symbol_addrs.txt and src/ to calculate real decomp progress.
Outputs per-subsystem and total stats compatible with decomp.dev.

Usage:
    python3 tools/progress.py              # Console progress bars
    python3 tools/progress.py --json       # JSON for decomp.dev
    python3 tools/progress.py --crossref   # Theseus-style cross-reference table
    python3 tools/progress.py --markdown   # Markdown progress table
"""

import re
import os
import sys
import json
from pathlib import Path
from collections import defaultdict

# Import subsystem classifier from split_functions
sys.path.insert(0, str(Path(__file__).parent))
from split_functions import classify_function, parse_symbols

SYMBOL_FILE = "symbol_addrs.txt"
SRC_DIR = "src"
DECOMP_RESULTS = "tools/decomp_results.json"


def scan_c_functions(src_dir: str) -> dict:
    """
    Scan all .c and .inc files for function definitions with Ghidra address comments.
    Returns {func_name: {"file": path, "address": hex_addr, "status": "matched"|"wip"}}
    """
    # Pattern: /* 0xADDRESS - FuncName */ or /* 0xADDRESS */
    addr_pattern = re.compile(r'/\*\s*0x([0-9a-fA-F]+)\s*(?:-\s*(\w+))?\s*\*/')
    # Pattern: function definition (return_type func_name(...))
    func_def_pattern = re.compile(r'^(?:static\s+)?(?:inline\s+)?(?:\w+\s+\*?\s*)+(\w+)\s*\(')

    functions = {}

    for root, dirs, files in os.walk(src_dir):
        for fname in files:
            if not (fname.endswith('.c') or fname.endswith('.inc')):
                continue

            filepath = os.path.join(root, fname)
            relpath = os.path.relpath(filepath, src_dir)

            try:
                with open(filepath, 'r') as f:
                    lines = f.readlines()
            except:
                continue

            i = 0
            while i < len(lines):
                line = lines[i].strip()

                # Look for Ghidra address comment
                addr_match = addr_pattern.search(line)
                if addr_match:
                    addr = int(addr_match.group(1), 16)
                    comment_name = addr_match.group(2)

                    # Look for function definition in next few lines
                    for j in range(i, min(i + 5, len(lines))):
                        func_match = func_def_pattern.match(lines[j].strip())
                        if func_match:
                            func_name = func_match.group(1)
                            # Check if this is a decomp.me link (indicates WIP or matched)
                            status = "matched"
                            for k in range(max(0, i-2), min(i+3, len(lines))):
                                if "decomp.me" in lines[k]:
                                    if "100%" in lines[k] or "match" in lines[k].lower():
                                        status = "matched"
                                    else:
                                        status = "wip"
                                    break

                            functions[func_name] = {
                                "file": relpath,
                                "address": f"0x{addr:08X}",
                                "status": status,
                            }
                            break
                i += 1

    return functions


def load_decomp_results(path: str) -> dict:
    """Load decomp.me results JSON."""
    if not os.path.exists(path):
        return {}
    try:
        with open(path, 'r') as f:
            data = json.load(f)
        # Map func_name -> score
        results = {}
        if isinstance(data, list):
            for entry in data:
                name = entry.get("function") or entry.get("name", "")
                score = entry.get("score", -1)
                results[name] = score
        elif isinstance(data, dict):
            for name, info in data.items():
                if isinstance(info, dict):
                    results[name] = info.get("score", -1)
                else:
                    results[name] = info
        return results
    except:
        return {}


def compute_progress(symbols: list, c_funcs: dict, decomp_scores: dict) -> dict:
    """Compute per-subsystem progress."""
    subsystems = defaultdict(lambda: {
        "total_funcs": 0,
        "total_bytes": 0,
        "matched_funcs": 0,
        "matched_bytes": 0,
        "wip_funcs": 0,
        "wip_bytes": 0,
        "functions": [],
    })

    for vaddr, size, name in symbols:
        subsys = classify_function(name)
        info = subsystems[subsys]
        info["total_funcs"] += 1
        info["total_bytes"] += size

        status = "asm"
        c_file = None

        if name in c_funcs:
            c_file = c_funcs[name]["file"]
            status = c_funcs[name]["status"]

        # Check decomp.me scores
        if name in decomp_scores:
            score = decomp_scores[name]
            if score == 0:
                status = "matched"
            elif score > 0 and score <= 15:
                status = "matched"  # Symbol-only diff
            elif score > 0:
                status = "wip"

        if status == "matched":
            info["matched_funcs"] += 1
            info["matched_bytes"] += size
        elif status == "wip":
            info["wip_funcs"] += 1
            info["wip_bytes"] += size

        info["functions"].append({
            "name": name,
            "address": f"0x{vaddr:08X}",
            "size": size,
            "subsystem": subsys,
            "status": status,
            "c_file": c_file,
        })

    return dict(subsystems)


def print_progress_bars(progress: dict):
    """Print colorful progress bars to console."""
    total_funcs = sum(s["total_funcs"] for s in progress.values())
    total_bytes = sum(s["total_bytes"] for s in progress.values())
    matched_funcs = sum(s["matched_funcs"] for s in progress.values())
    matched_bytes = sum(s["matched_bytes"] for s in progress.values())
    wip_funcs = sum(s["wip_funcs"] for s in progress.values())

    total_pct = (matched_bytes / total_bytes * 100) if total_bytes > 0 else 0

    print(f"\n  CrystalOSD — OSDSYS Decompilation Progress")
    print(f"  ═══════════════════════════════════════════════════════")
    bar_len = 30
    filled = int(total_pct / 100 * bar_len)
    bar = "█" * filled + "░" * (bar_len - filled)
    print(f"  Total:  {matched_funcs:>4}/{total_funcs:<4} funcs  {matched_bytes:>7}/{total_bytes:<7} bytes  {total_pct:5.1f}%  {bar}")
    if wip_funcs > 0:
        print(f"          + {wip_funcs} WIP functions")
    print()

    # Per-subsystem
    for subsys in sorted(progress.keys(), key=lambda s: -progress[s]["matched_bytes"]):
        info = progress[subsys]
        pct = (info["matched_bytes"] / info["total_bytes"] * 100) if info["total_bytes"] > 0 else 0
        filled = int(pct / 100 * bar_len)
        bar = "█" * filled + "░" * (bar_len - filled)
        wip_str = f" +{info['wip_funcs']}wip" if info["wip_funcs"] > 0 else ""
        print(f"  {subsys:<10} {info['matched_funcs']:>4}/{info['total_funcs']:<4}  {pct:5.1f}%  {bar}{wip_str}")

    print()


def print_crossref(progress: dict):
    """Print Theseus-style cross-reference table."""
    print(f"\n| Address    | Function Name                        | Subsystem | Size  | Status | C Source |")
    print(f"|------------|--------------------------------------|-----------|-------|--------|----------|")

    all_funcs = []
    for subsys, info in progress.items():
        all_funcs.extend(info["functions"])

    all_funcs.sort(key=lambda f: int(f["address"], 16))

    for func in all_funcs:
        status_icon = {"matched": "✅", "wip": "🔶", "asm": "⬜"}.get(func["status"], "⬜")
        c_file = func["c_file"] or "-"
        print(f"| {func['address']} | {func['name']:<36} | {func['subsystem']:<9} | {func['size']:>5} | {status_icon:<6} | {c_file} |")


def print_markdown(progress: dict):
    """Print markdown-formatted progress table."""
    total_funcs = sum(s["total_funcs"] for s in progress.values())
    total_bytes = sum(s["total_bytes"] for s in progress.values())
    matched_funcs = sum(s["matched_funcs"] for s in progress.values())
    matched_bytes = sum(s["matched_bytes"] for s in progress.values())
    total_pct = (matched_bytes / total_bytes * 100) if total_bytes > 0 else 0

    print(f"# CrystalOSD Progress Report\n")
    print(f"**Total**: {matched_funcs}/{total_funcs} functions ({total_pct:.1f}% by bytes)\n")
    print(f"| Subsystem | Matched | Total | % Bytes | Status |")
    print(f"|-----------|---------|-------|---------|--------|")

    for subsys in sorted(progress.keys(), key=lambda s: -progress[s]["matched_bytes"]):
        info = progress[subsys]
        pct = (info["matched_bytes"] / info["total_bytes"] * 100) if info["total_bytes"] > 0 else 0
        bar_len = 15
        filled = int(pct / 100 * bar_len)
        bar = "█" * filled + "░" * (bar_len - filled)
        print(f"| {subsys:<9} | {info['matched_funcs']:>7} | {info['total_funcs']:>5} | {pct:>6.1f}% | {bar} |")


def output_json(progress: dict):
    """Output decomp.dev compatible JSON."""
    result = {
        "project": "CrystalOSD",
        "version": "HDDOSD_110U",
        "subsystems": {}
    }

    for subsys, info in progress.items():
        result["subsystems"][subsys] = {
            "total_functions": info["total_funcs"],
            "total_bytes": info["total_bytes"],
            "matched_functions": info["matched_funcs"],
            "matched_bytes": info["matched_bytes"],
            "wip_functions": info["wip_funcs"],
            "percentage": round(
                (info["matched_bytes"] / info["total_bytes"] * 100) if info["total_bytes"] > 0 else 0,
                2
            ),
        }

    totals = {
        "total_functions": sum(s["total_funcs"] for s in progress.values()),
        "total_bytes": sum(s["total_bytes"] for s in progress.values()),
        "matched_functions": sum(s["matched_funcs"] for s in progress.values()),
        "matched_bytes": sum(s["matched_bytes"] for s in progress.values()),
    }
    totals["percentage"] = round(
        (totals["matched_bytes"] / totals["total_bytes"] * 100) if totals["total_bytes"] > 0 else 0,
        2
    )
    result["totals"] = totals

    print(json.dumps(result, indent=2))


def main():
    import argparse
    parser = argparse.ArgumentParser(description="CrystalOSD progress tracker")
    parser.add_argument("--json", action="store_true", help="Output JSON for decomp.dev")
    parser.add_argument("--crossref", action="store_true", help="Theseus-style cross-ref table")
    parser.add_argument("--markdown", action="store_true", help="Markdown progress table")
    args = parser.parse_args()

    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    os.chdir(project_root)

    # Parse symbol database
    symbols = parse_symbols(SYMBOL_FILE)

    # Scan C sources for matched functions
    c_funcs = scan_c_functions(SRC_DIR)

    # Load decomp.me results
    decomp_scores = load_decomp_results(DECOMP_RESULTS)

    # Compute progress
    progress = compute_progress(symbols, c_funcs, decomp_scores)

    if args.json:
        output_json(progress)
    elif args.crossref:
        print_crossref(progress)
    elif args.markdown:
        print_markdown(progress)
    else:
        print_progress_bars(progress)


if __name__ == "__main__":
    main()
