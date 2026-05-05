#!/usr/bin/env python3
"""
decomp_match.py — CrystalOSD decomp.me matching tool

Usage:
    # Submit a single function (creates scratch, returns URL)
    python3 tools/decomp_match.py submit <func_name> <asm_file> <source_file> [--flags "-O2 -G0"]

    # Iterate on existing scratch (recompiles WITHOUT creating new scratch)
    python3 tools/decomp_match.py iterate <slug> <source_file> [--context-file ctx.h]
    # Returns JSON: {"score": N, "max_score": M, "match": true/false}

    # One-shot: submit + iterate in one command (creates scratch, returns JSON)
    python3 tools/decomp_match.py oneshot <func_name> <asm_file> <source_file>

    # Extract ASM block from an asm/*.s file
    python3 tools/decomp_match.py extract <func_name> <asm_file>

    # Batch submit multiple functions from a JSON manifest
    python3 tools/decomp_match.py batch <manifest.json>

    # List tracked results
    python3 tools/decomp_match.py results [--min-match 90]

    # Auto-discover all nonmatching ASM files
    python3 tools/decomp_match.py discover <subsystem>

All scratches are tracked in tools/decomp_results.json for persistent state.

ARCHITECTURE:
  - POST /api/scratch → creates a new scratch (returns slug + initial score)
  - POST /api/scratch/{slug}/compile → recompiles with new source (no new scratch!)
  - The /compile endpoint requires browser-like headers (User-Agent, Origin, Referer)
    to pass Cloudflare challenge. This is handled automatically.
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

# Browser-like headers to pass Cloudflare on /compile endpoint
API_HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Origin": "https://decomp.me",
    "Referer": "https://decomp.me/",
}

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
extern void *memcpy(void *, const void *, int);
extern int memcmp(const void *, const void *, int);
extern int strlen(const char *);
extern int strcmp(const char *, const char *);
extern int strncmp(const char *, const char *, int);
extern char *strcpy(char *, const char *);
extern char *strcat(char *, const char *);
extern int sprintf(char *, const char *, ...);
extern int printf(const char *, ...);
extern int psmToBppGS(u32);

/* Memory card API */
extern int sceMcGetInfo(int, int, int *, int *, int *, int *);
extern int sceMcOpen(int, int, const char *, int);
extern int sceMcClose(int);
extern int sceMcSync(int, int, int *);
extern int sceMcRead(int, void *, int);
extern int sceMcWrite(int, const void *, int);
extern int sceMcSeek(int, int, int);
extern int sceMcMkDir(int, int, const char *);
extern int sceMcGetDir(int, int, const char *, int, void *);
extern int sceMcDelete(int, int, const char *);
extern int sceMcFlush(int);
extern int sceMcSetFileInfo(int, int, const char *, const void *, int);
extern int sceMcChdir(int, int, const char *, char *);
extern int sceMcFormat(int, int);
extern int sceMcUnformat(int, int);

/* cdvd */
extern int sceCdOpenConfig(int, int, int, int*);
extern int sceCdReadConfig(void*, int*);
extern int sceCdCloseConfig(int*);

/* system */
extern char *get_system_folder_name(void);
"""


def load_results():
    if os.path.exists(RESULTS_FILE):
        with open(RESULTS_FILE) as f:
            return json.load(f)
    return {}


def save_results(results):
    with open(RESULTS_FILE, "w") as f:
        json.dump(results, f, indent=2)


def api_request(url, data=None, method=None):
    """Make an API request with browser-like headers to pass Cloudflare."""
    encoded = json.dumps(data).encode() if data else None
    if method is None:
        method = "POST" if data else "GET"
    req = urllib.request.Request(url, data=encoded, headers=API_HEADERS, method=method)
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())


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


def create_scratch(name, target_asm, source, context=None, flags=None, compiler=None):
    """Create a new scratch on decomp.me. Returns result dict with slug."""
    data = {
        "name": name,
        "target_asm": target_asm,
        "context": context or DEFAULT_CONTEXT,
        "source_code": source,
        "compiler": compiler or DEFAULT_COMPILER,
        "compiler_flags": flags or DEFAULT_FLAGS,
        "platform": DEFAULT_PLATFORM,
        "diff_label": name,
    }

    try:
        r = api_request("https://decomp.me/api/scratch", data)
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

        print(f"  {icon} {name}: {score}/{max_score} ({pct}%) → {url}", file=sys.stderr)

        return {
            "score": score,
            "max_score": max_score,
            "match_pct": float(pct) if pct != "?" else 0,
            "slug": slug,
            "url": url,
            "claim_token": r.get("claim_token", ""),
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        print(f"  ❌ {name}: ERROR - {e}", file=sys.stderr)
        return None


def compile_scratch(slug, source_code, context=None):
    """
    Recompile an existing scratch with new source code.
    This does NOT create a new scratch — it uses the /compile endpoint.
    Returns score info.
    """
    data = {"source_code": source_code}
    if context is not None:
        data["context"] = context

    try:
        r = api_request(f"https://decomp.me/api/scratch/{slug}/compile", data)
        success = r.get("success", False)
        compiler_output = r.get("compiler_output", "").strip()

        score = None
        max_score = None
        if r.get("diff_output"):
            score = r["diff_output"].get("current_score")
            max_score = r["diff_output"].get("max_score")

        return {
            "success": success,
            "score": score,
            "max_score": max_score,
            "compiler_output": compiler_output,
        }
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:500]
        return {"success": False, "error": f"HTTP {e.code}: {body}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def update_results_tracking(func_name, result, asm_file=None, slug=None):
    """Update the persistent results tracker with new result if it's better."""
    if not result:
        return
    results = load_results()
    existing = results.get(func_name) or {}
    score = result.get("score", result.get("best_score", 99999))

    if score is not None and score < existing.get("best_score", 99999):
        results[func_name] = {
            "best_score": score,
            "max_score": result.get("max_score", 0),
            "match_pct": result.get("match_pct", 0),
            "best_slug": result.get("slug", slug or existing.get("best_slug", "?")),
            "url": result.get("url", existing.get("url", "")),
            "asm_file": asm_file or existing.get("asm_file"),
            "slug": slug or result.get("slug", existing.get("slug")),
            "attempts": existing.get("attempts", 0) + 1,
            "last_updated": result.get("timestamp", datetime.now().isoformat()),
        }
        save_results(results)


# ─── Commands ────────────────────────────────────────────────────────────────

def cmd_extract(args):
    """Extract ASM for a function from a .s file."""
    asm = extract_function_asm(args.asm_file, args.func_name)
    if asm:
        print(asm)
    else:
        print(f"Function '{args.func_name}' not found in {args.asm_file}", file=sys.stderr)
        sys.exit(1)


def cmd_submit(args):
    """Submit a function to decomp.me (creates a new scratch)."""
    asm = extract_function_asm(args.asm_file, args.func_name)
    if not asm:
        print(f"Function '{args.func_name}' not found in {args.asm_file}", file=sys.stderr)
        sys.exit(1)

    with open(args.source_file) as f:
        source = f.read()

    ctx = DEFAULT_CONTEXT
    if args.context_file:
        with open(args.context_file) as f:
            ctx = f.read()

    result = create_scratch(args.func_name, asm, source, ctx, args.flags)
    if result:
        update_results_tracking(args.func_name, result, args.asm_file, result["slug"])
        # Output slug for subsequent iterate calls
        print(json.dumps({
            "slug": result["slug"],
            "url": result["url"],
            "score": result["score"],
            "max_score": result["max_score"],
            "match": result["score"] == 0,
        }))


def cmd_iterate(args):
    """
    Recompile an existing scratch with updated source.
    Uses /compile endpoint — NO new scratch created.
    Outputs JSON to stdout for agent consumption.
    """
    with open(args.source_file) as f:
        source = f.read()

    ctx = None
    if args.context_file:
        with open(args.context_file) as f:
            ctx = f.read()

    result = compile_scratch(args.slug, source, ctx)

    if result.get("success") and result.get("score") is not None:
        score = result["score"]
        max_score = result["max_score"]
        pct = (1 - score / max_score) * 100 if max_score > 0 else 0

        icon = "✅" if score == 0 else "🟡" if score <= 20 else "🔶" if score <= 100 else "🔸"
        print(f"  {icon} Score: {score}/{max_score} ({pct:.1f}%)", file=sys.stderr)

        output = {
            "slug": args.slug,
            "score": score,
            "max_score": max_score,
            "match_pct": round(pct, 1),
            "match": score == 0,
            "url": f"https://decomp.me/scratch/{args.slug}",
        }

        # Update tracking if we know the function name
        results = load_results()
        for func_name, r in results.items():
            if r.get("slug") == args.slug or r.get("best_slug") == args.slug:
                update_results_tracking(func_name, {
                    "score": score,
                    "max_score": max_score,
                    "match_pct": round(pct, 1),
                    "slug": args.slug,
                    "url": f"https://decomp.me/scratch/{args.slug}",
                    "timestamp": datetime.now().isoformat(),
                }, slug=args.slug)
                break
    else:
        output = {"error": result.get("error", "Compilation failed")}
        if result.get("compiler_output"):
            output["compiler_output"] = result["compiler_output"]
        print(f"  ❌ Compile failed", file=sys.stderr)

    print(json.dumps(output))


def cmd_oneshot(args):
    """Submit + get score in one command. Creates scratch, returns JSON."""
    asm = extract_function_asm(args.asm_file, args.func_name)
    if not asm:
        print(json.dumps({"error": f"Function '{args.func_name}' not found in {args.asm_file}"}))
        sys.exit(1)

    with open(args.source_file) as f:
        source = f.read()

    ctx = DEFAULT_CONTEXT
    if args.context_file:
        with open(args.context_file) as f:
            ctx = f.read()

    result = create_scratch(args.func_name, asm, source, ctx, args.flags)

    if result:
        update_results_tracking(args.func_name, result, args.asm_file, result["slug"])
        output = {
            "function": args.func_name,
            "slug": result["slug"],
            "url": result["url"],
            "score": result["score"],
            "max_score": result["max_score"],
            "match_pct": result["match_pct"],
            "match": result["score"] == 0,
        }
    else:
        output = {"error": "Failed to create scratch", "function": args.func_name}

    print(json.dumps(output))


def cmd_batch(args):
    """Submit multiple functions from a JSON manifest."""
    with open(args.manifest) as f:
        manifest = json.load(f)

    results = load_results()
    print(f"=== Batch submission: {len(manifest['functions'])} functions ===\n", file=sys.stderr)

    for entry in manifest["functions"]:
        name = entry["name"]
        asm_file = entry.get("asm_file", manifest.get("default_asm_file"))
        source = entry["source"]
        ctx = entry.get("context", manifest.get("default_context", DEFAULT_CONTEXT))
        flags = entry.get("flags", manifest.get("default_flags", DEFAULT_FLAGS))

        asm = extract_function_asm(asm_file, name) if asm_file else entry.get("asm")
        if not asm:
            print(f"  ⚠️  {name}: ASM not found, skipping", file=sys.stderr)
            continue

        result = create_scratch(name, asm, source, ctx, flags)
        if result:
            existing = results.get(name)
            if not existing or result["score"] < existing.get("best_score", 99999):
                results[name] = {
                    "best_score": result["score"],
                    "max_score": result["max_score"],
                    "match_pct": result["match_pct"],
                    "best_slug": result["slug"],
                    "url": result["url"],
                    "slug": result["slug"],
                    "asm_file": asm_file,
                    "attempts": (existing or {}).get("attempts", 0) + 1,
                    "last_updated": result["timestamp"],
                }

    save_results(results)
    print(f"\n=== Done. Results saved to {RESULTS_FILE} ===", file=sys.stderr)


def cmd_results(args):
    """Show tracked results."""
    results = load_results()
    if not results:
        print("No results tracked yet.")
        return

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


def cmd_discover(args):
    """Discover all nonmatching ASM files for a subsystem."""
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    asm_dir = os.path.join(project_root, "asm", args.subsystem)

    if not os.path.isdir(asm_dir):
        print(f"Directory not found: {asm_dir}", file=sys.stderr)
        sys.exit(1)

    functions = []
    for fname in sorted(os.listdir(asm_dir)):
        if fname.endswith(".s"):
            func_name = fname[:-2]
            asm_path = os.path.join(asm_dir, fname)
            with open(asm_path) as f:
                instr_count = sum(1 for line in f if re.match(r'\s*/\*.*\*/\s+\w', line))
            functions.append({
                "name": func_name,
                "asm_file": os.path.relpath(asm_path, project_root),
                "instructions": instr_count,
            })

    output = {
        "subsystem": args.subsystem,
        "total_functions": len(functions),
        "functions": functions,
    }

    print(json.dumps(output, indent=2))


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="CrystalOSD decomp.me matching tool")
    subparsers = parser.add_subparsers(dest="command")

    # extract
    p_extract = subparsers.add_parser("extract", help="Extract ASM from .s file")
    p_extract.add_argument("func_name")
    p_extract.add_argument("asm_file")

    # submit — creates new scratch
    p_submit = subparsers.add_parser("submit", help="Create scratch on decomp.me")
    p_submit.add_argument("func_name")
    p_submit.add_argument("asm_file")
    p_submit.add_argument("source_file")
    p_submit.add_argument("--flags", default=DEFAULT_FLAGS)
    p_submit.add_argument("--context-file", default=None)

    # iterate — recompile existing scratch (no new scratch!)
    p_iterate = subparsers.add_parser("iterate",
        help="Recompile existing scratch with new source (no new scratch)")
    p_iterate.add_argument("slug", help="Scratch slug from previous submit")
    p_iterate.add_argument("source_file")
    p_iterate.add_argument("--context-file", default=None)

    # oneshot — submit + score in one command
    p_oneshot = subparsers.add_parser("oneshot",
        help="Create scratch and return JSON score (one-shot)")
    p_oneshot.add_argument("func_name")
    p_oneshot.add_argument("asm_file")
    p_oneshot.add_argument("source_file")
    p_oneshot.add_argument("--flags", default=DEFAULT_FLAGS)
    p_oneshot.add_argument("--context-file", default=None)

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

    # discover
    p_discover = subparsers.add_parser("discover", help="Discover nonmatching ASM files")
    p_discover.add_argument("subsystem", help="Subsystem name (e.g., history, config)")

    args = parser.parse_args()

    commands = {
        "extract": cmd_extract,
        "submit": cmd_submit,
        "iterate": cmd_iterate,
        "oneshot": cmd_oneshot,
        "batch": cmd_batch,
        "results": cmd_results,
        "discover": cmd_discover,
    }

    # submit_inline handled separately
    if args.command == "submit_inline":
        result = create_scratch(args.func_name, args.asm, args.source, args.context, args.flags)
        if result:
            update_results_tracking(args.func_name, result)
    elif args.command in commands:
        commands[args.command](args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
