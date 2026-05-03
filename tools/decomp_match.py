#!/usr/bin/env python3
"""
decomp_match.py — CrystalOSD decomp.me matching tool

Usage:
    # Submit a single function
    python3 tools/decomp_match.py submit <func_name> <asm_file> <source_file> [--flags "-O2 -G0"]

    # Submit with inline source
    python3 tools/decomp_match.py submit_inline <func_name> --asm "<asm>" --source "<source>"

    # Extract ASM block from an asm/*.s file
    python3 tools/decomp_match.py extract <func_name> <asm_file>

    # Batch submit multiple functions from a JSON manifest
    python3 tools/decomp_match.py batch <manifest.json>

    # List tracked results
    python3 tools/decomp_match.py results [--min-match 90]

All scratches are tracked in tools/decomp_results.json for persistent state.
"""

import json
import sys
import os
import re
import urllib.request
import argparse
from datetime import datetime

RESULTS_FILE = os.path.join(os.path.dirname(__file__), "decomp_results.json")
DEFAULT_COMPILER = "ee-gcc2.9-991111"
DEFAULT_FLAGS = "-O2 -G0"
DEFAULT_PLATFORM = "ps2"

DEFAULT_CONTEXT = """typedef unsigned char u8;
typedef unsigned short u16;
typedef unsigned int u32;
typedef signed char s8;
typedef signed short s16;
typedef signed int s32;
typedef unsigned long u64;
typedef signed long s64;

typedef unsigned int size_t;

extern void sceDevVif0Reset(void);
extern void sceDevVu0Reset(void);
extern void sceDevVif1Reset(void);
extern void sceDevVu1Reset(void);
extern void sceDevGifReset(void);
extern void sceGsResetPath(void);
extern void sceDmaReset(int);
extern void *memset(void *, int, int);
extern int psmToBppGS(u32);
extern int sceCdOpenConfig(int, int, int, int*);
extern int sceCdReadConfig(void*, int*);
extern int sceCdCloseConfig(int*);
"""


def load_results():
    if os.path.exists(RESULTS_FILE):
        with open(RESULTS_FILE) as f:
            return json.load(f)
    return {}


def save_results(results):
    with open(RESULTS_FILE, "w") as f:
        json.dump(results, f, indent=2)


def extract_function_asm(asm_file, func_name):
    """Extract a single function's ASM from a .s file (between glabel and endlabel)."""
    with open(asm_file) as f:
        lines = f.readlines()

    in_func = False
    asm_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped == f"glabel {func_name}":
            in_func = True
            continue
        if stripped == f"endlabel {func_name}":
            break
        if in_func:
            # Strip line comments with address info, keep instruction
            m = re.match(r'\s*/\*.*?\*/\s*(.*)', stripped)
            if m:
                instr = m.group(1).split('/*')[0].strip()
                if instr:
                    asm_lines.append(f"    {instr}")
            elif stripped.startswith(".L"):
                asm_lines.append(stripped)
            elif stripped and not stripped.startswith("/*"):
                asm_lines.append(f"    {stripped}")

    if not asm_lines:
        return None

    header = ".set noat\n.set noreorder\n"
    return header + f"\n{func_name}:\n" + "\n".join(asm_lines)


def submit_scratch(name, target_asm, source, context=None, flags=None, compiler=None):
    """Submit a scratch to decomp.me and return result dict."""
    data = json.dumps({
        "name": name,
        "target_asm": target_asm,
        "context": context or DEFAULT_CONTEXT,
        "source_code": source,
        "compiler": compiler or DEFAULT_COMPILER,
        "compiler_flags": flags or DEFAULT_FLAGS,
        "platform": DEFAULT_PLATFORM,
        "diff_label": name,
    }).encode()

    req = urllib.request.Request(
        "https://decomp.me/api/scratch",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        resp = urllib.request.urlopen(req)
        r = json.loads(resp.read())
        score = r.get("score", -1)
        max_score = r.get("max_score", 0)
        slug = r.get("slug", "?")
        url = f"https://decomp.me/scratch/{slug}"
        pct = f"{(1 - score / max_score) * 100:.1f}" if max_score > 0 else "?"

        if score == 0:
            icon = "✅"
        elif score <= 20:
            icon = "🟡"
        elif score <= 100:
            icon = "🔶"
        else:
            icon = "🔸"

        print(f"  {icon} {name}: {score}/{max_score} ({pct}%) → {url}")

        return {
            "score": score,
            "max_score": max_score,
            "match_pct": float(pct) if pct != "?" else 0,
            "slug": slug,
            "url": url,
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        print(f"  ❌ {name}: ERROR - {e}")
        return None


def cmd_extract(args):
    """Extract ASM for a function from a .s file."""
    asm = extract_function_asm(args.asm_file, args.func_name)
    if asm:
        print(asm)
    else:
        print(f"Function '{args.func_name}' not found in {args.asm_file}", file=sys.stderr)
        sys.exit(1)


def cmd_submit(args):
    """Submit a function to decomp.me."""
    # Extract ASM
    asm = extract_function_asm(args.asm_file, args.func_name)
    if not asm:
        print(f"Function '{args.func_name}' not found in {args.asm_file}", file=sys.stderr)
        sys.exit(1)

    # Read source
    with open(args.source_file) as f:
        source = f.read()

    ctx = DEFAULT_CONTEXT
    if args.context_file:
        with open(args.context_file) as f:
            ctx = f.read()

    result = submit_scratch(args.func_name, asm, source, ctx, args.flags)

    if result:
        results = load_results()
        # Keep best result
        existing = results.get(args.func_name)
        if not existing or result["score"] < existing.get("best_score", 99999):
            results[args.func_name] = {
                "best_score": result["score"],
                "max_score": result["max_score"],
                "match_pct": result["match_pct"],
                "best_slug": result["slug"],
                "url": result["url"],
                "asm_file": args.asm_file,
                "attempts": (existing or {}).get("attempts", 0) + 1,
                "last_updated": result["timestamp"],
            }
            save_results(results)


def cmd_submit_inline(args):
    """Submit with inline ASM and source."""
    result = submit_scratch(args.func_name, args.asm, args.source, args.context, args.flags)
    if result:
        results = load_results()
        existing = results.get(args.func_name)
        if not existing or result["score"] < existing.get("best_score", 99999):
            results[args.func_name] = {
                "best_score": result["score"],
                "max_score": result["max_score"],
                "match_pct": result["match_pct"],
                "best_slug": result["slug"],
                "url": result["url"],
                "attempts": (existing or {}).get("attempts", 0) + 1,
                "last_updated": result["timestamp"],
            }
            save_results(results)


def cmd_batch(args):
    """Submit multiple functions from a JSON manifest."""
    with open(args.manifest) as f:
        manifest = json.load(f)

    results = load_results()
    print(f"=== Batch submission: {len(manifest['functions'])} functions ===\n")

    for entry in manifest["functions"]:
        name = entry["name"]
        asm_file = entry.get("asm_file", manifest.get("default_asm_file"))
        source = entry["source"]
        ctx = entry.get("context", manifest.get("default_context", DEFAULT_CONTEXT))
        flags = entry.get("flags", manifest.get("default_flags", DEFAULT_FLAGS))

        asm = extract_function_asm(asm_file, name) if asm_file else entry.get("asm")
        if not asm:
            print(f"  ⚠️  {name}: ASM not found, skipping")
            continue

        result = submit_scratch(name, asm, source, ctx, flags)
        if result:
            existing = results.get(name)
            if not existing or result["score"] < existing.get("best_score", 99999):
                results[name] = {
                    "best_score": result["score"],
                    "max_score": result["max_score"],
                    "match_pct": result["match_pct"],
                    "best_slug": result["slug"],
                    "url": result["url"],
                    "asm_file": asm_file,
                    "attempts": (existing or {}).get("attempts", 0) + 1,
                    "last_updated": result["timestamp"],
                }

    save_results(results)
    print(f"\n=== Done. Results saved to {RESULTS_FILE} ===")


def cmd_results(args):
    """Show tracked results."""
    results = load_results()
    if not results:
        print("No results tracked yet.")
        return

    # Sort by match percentage descending
    sorted_results = sorted(results.items(), key=lambda x: x[1].get("match_pct", 0), reverse=True)

    perfect = [r for r in sorted_results if r[1]["best_score"] == 0]
    symbol_only = [r for r in sorted_results if 0 < r[1]["best_score"] <= 20]
    close = [r for r in sorted_results if 20 < r[1]["best_score"] <= 100]
    wip = [r for r in sorted_results if r[1]["best_score"] > 100]

    min_match = args.min_match if hasattr(args, "min_match") else 0

    print(f"=== Decomp.me Results ({len(results)} functions tracked) ===\n")

    if perfect:
        print(f"✅ Perfect matches ({len(perfect)}):")
        for name, r in perfect:
            print(f"   {name}: 0/{r['max_score']} → {r['url']}")

    if symbol_only:
        print(f"\n🟡 Symbol-only diffs ({len(symbol_only)}):")
        for name, r in symbol_only:
            print(f"   {name}: {r['best_score']}/{r['max_score']} ({r['match_pct']:.1f}%) → {r['url']}")

    if close:
        print(f"\n🔶 Close matches ({len(close)}):")
        for name, r in close:
            if r["match_pct"] >= min_match:
                print(f"   {name}: {r['best_score']}/{r['max_score']} ({r['match_pct']:.1f}%) → {r['url']}")

    if wip:
        print(f"\n🔸 In progress ({len(wip)}):")
        for name, r in wip:
            if r["match_pct"] >= min_match:
                print(f"   {name}: {r['best_score']}/{r['max_score']} ({r['match_pct']:.1f}%) → {r['url']}")

    print(f"\nTotal: {len(perfect)} perfect + {len(symbol_only)} symbol-only = {len(perfect) + len(symbol_only)} matching")


def main():
    parser = argparse.ArgumentParser(description="CrystalOSD decomp.me matching tool")
    subparsers = parser.add_subparsers(dest="command")

    # extract
    p_extract = subparsers.add_parser("extract", help="Extract ASM from .s file")
    p_extract.add_argument("func_name")
    p_extract.add_argument("asm_file")

    # submit
    p_submit = subparsers.add_parser("submit", help="Submit function to decomp.me")
    p_submit.add_argument("func_name")
    p_submit.add_argument("asm_file")
    p_submit.add_argument("source_file")
    p_submit.add_argument("--flags", default=DEFAULT_FLAGS)
    p_submit.add_argument("--context-file", default=None)

    # submit_inline
    p_inline = subparsers.add_parser("submit_inline", help="Submit with inline ASM/source")
    p_inline.add_argument("func_name")
    p_inline.add_argument("--asm", required=True)
    p_inline.add_argument("--source", required=True)
    p_inline.add_argument("--context", default=DEFAULT_CONTEXT)
    p_inline.add_argument("--flags", default=DEFAULT_FLAGS)

    # batch
    p_batch = subparsers.add_parser("batch", help="Batch submit from manifest")
    p_batch.add_argument("manifest")

    # results
    p_results = subparsers.add_parser("results", help="Show tracked results")
    p_results.add_argument("--min-match", type=float, default=0)

    args = parser.parse_args()

    if args.command == "extract":
        cmd_extract(args)
    elif args.command == "submit":
        cmd_submit(args)
    elif args.command == "submit_inline":
        cmd_submit_inline(args)
    elif args.command == "batch":
        cmd_batch(args)
    elif args.command == "results":
        cmd_results(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
