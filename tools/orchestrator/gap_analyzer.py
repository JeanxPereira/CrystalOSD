"""Gap analyzer — inventory hidden functions inside gap_*.s files.

Scans asm/core/gap_*.s for func_<addr> labels that spimdisasm auto-generated
because they weren't in symbol_addrs.txt. Outputs:

  - .orchestrator/gaps.json           full inventory
  - --list                            human-readable table
  - --symbols-template                lines ready for symbol_addrs.txt
  - --easy-targets                    functions ≤ N instructions (quick wins)
  - --ghidra-names                    query Ghidra MCP for existing names
"""

from __future__ import annotations

import json
import re
import sys
import urllib.request
import urllib.error
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Any

from .config import load as load_config, project_root, resolve
from .easy_funcs import analyze_asm as _analyze_asm_file, INSTR_LINE, compute_score, FuncEntry

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class GapFunc:
    """A single function hidden inside a gap file."""
    address: str           # hex vaddr, e.g. "00200F78"
    address_hex: str       # with 0x prefix for display
    label: str             # "func_00200F78" or "D_00200F78"
    is_data: bool          # True if D_ label (padding/nop)
    instruction_count: int
    gap_file: str          # relative path
    gap_offset: str        # file offset hex from the comment
    ghidra_name: str | None = None
    size_bytes: int = 0
    branches: int = 0
    calls: int = 0
    has_mmi: bool = False
    has_mult1: bool = False
    has_cop2: bool = False
    complexity_score: int = 0


@dataclass
class GapFile:
    """A single gap_*.s file and its contents."""
    path: str
    offset_hex: str        # from filename, e.g. "001F74"
    total_instructions: int
    functions: list[GapFunc] = field(default_factory=list)
    data_labels: list[GapFunc] = field(default_factory=list)
    is_padding_only: bool = True  # True if only nop/D_ labels


@dataclass
class GapInventory:
    """Full scan result."""
    total_gaps: int = 0
    padding_only_gaps: int = 0
    gaps_with_functions: int = 0
    total_hidden_functions: int = 0
    total_data_labels: int = 0
    total_instructions: int = 0
    gaps: list[GapFile] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Instruction analysis (inline, doesn't need a temp file)
# ---------------------------------------------------------------------------

from .easy_funcs import MMI_OPS, MULT1_OPS, COP2_OPS, BRANCH_OPS, CALL_OPS


def _analyze_instructions(lines: list[str]) -> tuple[int, int, int, bool, bool, bool]:
    """Analyze a block of asm lines for complexity metrics."""
    instrs = branches = calls = 0
    mmi = mult1 = cop2 = False
    for line in lines:
        m = INSTR_LINE.match(line)
        if not m:
            continue
        op = m.group(1).lower()
        instrs += 1
        if op in BRANCH_OPS:
            branches += 1
        elif op in CALL_OPS:
            calls += 1
        if op in MMI_OPS:
            mmi = True
        if op in MULT1_OPS:
            mult1 = True
        if op in COP2_OPS:
            cop2 = True
    return instrs, branches, calls, mmi, mult1, cop2


# ---------------------------------------------------------------------------
# Gap parser
# ---------------------------------------------------------------------------

# Matches: glabel func_00200F78  or  glabel D_00200F74
GLABEL_RE = re.compile(r"^glabel\s+(func_|D_)([0-9A-Fa-f]+)")
# Matches: nonmatching func_00200F78, 0xC
NONMATCH_RE = re.compile(r"^nonmatching\s+(func_|D_)([0-9A-Fa-f]+),\s*0x([0-9A-Fa-f]+)")
# Matches instruction comment for file offset: /* 1F78 00200F78 ... */
OFFSET_RE = re.compile(r"/\*\s+([0-9A-Fa-f]+)\s+([0-9A-Fa-f]+)\s+")


def parse_gap_file(path: Path) -> GapFile:
    """Parse a single gap_*.s file, extracting all func_/D_ labels."""
    offset_hex = path.stem.replace("gap_", "")
    text = path.read_text()
    lines = text.splitlines()

    gap = GapFile(
        path=str(path),
        offset_hex=offset_hex,
        total_instructions=0,
    )

    # Find all labels and their instruction blocks
    current_label: str | None = None
    current_prefix: str | None = None
    current_addr: str | None = None
    current_size: int = 0
    current_lines: list[str] = []

    def flush():
        nonlocal current_label, current_prefix, current_addr, current_size, current_lines
        if current_label is None:
            return

        instrs, br, ca, mmi, m1, cp2 = _analyze_instructions(current_lines)
        is_data = current_prefix == "D_"

        gf = GapFunc(
            address=current_addr,
            address_hex=f"0x{current_addr}",
            label=f"{current_prefix}{current_addr}",
            is_data=is_data,
            instruction_count=instrs,
            gap_file=str(path),
            gap_offset=offset_hex,
            size_bytes=current_size,
            branches=br,
            calls=ca,
            has_mmi=mmi,
            has_mult1=m1,
            has_cop2=cp2,
        )

        # Compute complexity score using same formula as easy_funcs
        e = FuncEntry(
            name=gf.label, address=int(current_addr, 16), size=current_size,
            subsystem="core", asm_file=str(path),
            instructions=instrs, branches=br, calls=ca,
            has_mmi=mmi, has_mult1=m1, has_cop2=cp2,
        )
        gf.complexity_score = compute_score(e)

        gap.total_instructions += instrs

        if is_data:
            gap.data_labels.append(gf)
        else:
            gap.functions.append(gf)
            gap.is_padding_only = False

        current_label = None
        current_lines = []

    for line in lines:
        # Check for nonmatching directive (gives us size)
        nm = NONMATCH_RE.match(line)
        if nm:
            flush()
            current_prefix = nm.group(1)
            current_addr = nm.group(2).upper()
            current_size = int(nm.group(3), 16)
            current_label = f"{current_prefix}{current_addr}"
            current_lines = []
            continue

        # Check for glabel (start of actual instructions)
        gl = GLABEL_RE.match(line)
        if gl:
            # If we already have a label from nonmatching, this confirms it
            if current_label is None:
                current_prefix = gl.group(1)
                current_addr = gl.group(2).upper()
                current_label = f"{current_prefix}{current_addr}"
                current_lines = []
            continue

        # endlabel closes a block
        if line.startswith("endlabel "):
            current_lines.append(line)  # include for counting
            flush()
            continue

        # Accumulate instruction lines
        if current_label is not None:
            current_lines.append(line)

    flush()
    return gap


def scan_all_gaps(asm_dir: Path) -> GapInventory:
    """Scan all gap_*.s in asm/core/."""
    inv = GapInventory()
    gap_dir = asm_dir / "core"
    if not gap_dir.exists():
        return inv

    gap_files = sorted(gap_dir.glob("gap_*.s"))
    inv.total_gaps = len(gap_files)

    for gf_path in gap_files:
        gap = parse_gap_file(gf_path)
        inv.gaps.append(gap)

        if gap.is_padding_only:
            inv.padding_only_gaps += 1
        else:
            inv.gaps_with_functions += 1

        inv.total_hidden_functions += len(gap.functions)
        inv.total_data_labels += len(gap.data_labels)
        inv.total_instructions += gap.total_instructions

    return inv


# ---------------------------------------------------------------------------
# Ghidra HTTP integration (direct to GhidraMCP Java plugin)
# ---------------------------------------------------------------------------

GHIDRA_BASE = "http://127.0.0.1:8089"


def ghidra_get_function_name(address_hex: str) -> str | None:
    """Query Ghidra's HTTP API for a function name at address.

    Uses the decompile_function endpoint on the GhidraMCP Java plugin.
    Returns the function name if it's been renamed (not FUN_*), else None.
    """
    try:
        addr = address_hex.lower()
        url = f"{GHIDRA_BASE}/decompile_function?address={addr}"
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read().decode("utf-8")
            # The decompiled output starts with the function signature
            # e.g. "void FUN_00200f78(void)" or "void readClock(void)"
            for line in data.splitlines():
                line = line.strip()
                if not line or line.startswith("/*") or line.startswith("//") or line.startswith("{"):
                    continue
                # Match: returntype funcname(
                m = re.search(r"\b(\w+)\s*\(", line)
                if m:
                    name = m.group(1)
                    # Skip auto-names — we only want human-assigned names
                    if name.startswith("FUN_") or name.startswith("func_"):
                        return None
                    return name
            return None
    except Exception:
        return None


def enrich_with_ghidra(inv: GapInventory, verbose: bool = False) -> int:
    """Query Ghidra for all hidden functions, return count of named ones."""
    named = 0
    total = sum(len(g.functions) for g in inv.gaps)
    checked = 0

    for gap in inv.gaps:
        for func in gap.functions:
            checked += 1
            if verbose and checked % 50 == 0:
                print(f"  ghidra: {checked}/{total} checked, {named} named...",
                      file=sys.stderr)
            name = ghidra_get_function_name(func.address_hex)
            if name:
                func.ghidra_name = name
                named += 1

    return named


# ---------------------------------------------------------------------------
# Output formatters
# ---------------------------------------------------------------------------

def format_table(inv: GapInventory, show_all: bool = False) -> str:
    """Human-readable summary table."""
    lines = []
    lines.append(f"Gap Analysis Summary")
    lines.append(f"{'='*60}")
    lines.append(f"Total gap files:        {inv.total_gaps}")
    lines.append(f"Padding-only (nop):     {inv.padding_only_gaps}")
    lines.append(f"Gaps with functions:    {inv.gaps_with_functions}")
    lines.append(f"Hidden functions:       {inv.total_hidden_functions}")
    lines.append(f"Data labels:            {inv.total_data_labels}")
    lines.append(f"Total instructions:     {inv.total_instructions}")
    lines.append("")

    # Per-gap breakdown (only gaps with functions)
    interesting = [g for g in inv.gaps if not g.is_padding_only]
    interesting.sort(key=lambda g: -len(g.functions))

    lines.append(f"{'Gap File':<30} {'Funcs':>5} {'Instrs':>7} {'Largest':>7}")
    lines.append(f"{'-'*30} {'-'*5} {'-'*7} {'-'*7}")

    for gap in interesting[:50] if not show_all else interesting:
        largest = max((f.instruction_count for f in gap.functions), default=0)
        name = Path(gap.path).stem
        lines.append(f"{name:<30} {len(gap.functions):>5} {gap.total_instructions:>7} {largest:>7}")

    if not show_all and len(interesting) > 50:
        lines.append(f"  ... and {len(interesting) - 50} more gaps")

    return "\n".join(lines)


def format_symbols_template(inv: GapInventory) -> str:
    """Generate symbol_addrs.txt lines for all hidden functions."""
    lines = []
    lines.append("# === Gap functions (auto-generated by gap_analyzer) ===")
    lines.append("# Review and rename before adding to symbol_addrs.txt")
    lines.append("")

    for gap in inv.gaps:
        if gap.is_padding_only:
            continue
        for func in gap.functions:
            name = func.ghidra_name or func.label
            addr = func.address_hex.lower()
            size_hex = f"0x{func.size_bytes:x}" if func.size_bytes else "0x0"
            comment = ""
            if func.ghidra_name:
                comment = f"  # ghidra: {func.ghidra_name}"
            elif func.instruction_count <= 5:
                comment = "  # tiny, likely stub/getter"
            lines.append(
                f"{name} = {addr}; // size:{size_hex} type:func{comment}"
            )

    return "\n".join(lines)


def format_easy_targets(inv: GapInventory, max_instrs: int = 15) -> str:
    """List functions under N instructions — quick wins."""
    targets: list[GapFunc] = []
    for gap in inv.gaps:
        for func in gap.functions:
            if func.instruction_count <= max_instrs and not func.has_mmi and not func.has_cop2:
                targets.append(func)

    targets.sort(key=lambda f: f.complexity_score)

    lines = []
    lines.append(f"Easy targets (≤{max_instrs} instructions, no MMI/COP2): {len(targets)}")
    lines.append(f"{'='*70}")
    lines.append(f"{'Address':<14} {'Instrs':>6} {'Score':>5} {'Ghidra Name':<30} {'Gap'}")
    lines.append(f"{'-'*14} {'-'*6} {'-'*5} {'-'*30} {'-'*20}")

    for f in targets:
        gname = f.ghidra_name or "(unnamed)"
        gap_name = Path(f.gap_file).stem
        lines.append(
            f"{f.address_hex:<14} {f.instruction_count:>6} {f.complexity_score:>5} "
            f"{gname:<30} {gap_name}"
        )

    return "\n".join(lines)


def write_inventory(inv: GapInventory, path: Path) -> None:
    """Write full inventory JSON."""
    path.parent.mkdir(parents=True, exist_ok=True)

    payload: dict[str, Any] = {
        "summary": {
            "total_gaps": inv.total_gaps,
            "padding_only_gaps": inv.padding_only_gaps,
            "gaps_with_functions": inv.gaps_with_functions,
            "total_hidden_functions": inv.total_hidden_functions,
            "total_data_labels": inv.total_data_labels,
            "total_instructions": inv.total_instructions,
        },
        "gaps": [],
    }

    for gap in inv.gaps:
        if gap.is_padding_only:
            continue
        gap_dict: dict[str, Any] = {
            "file": gap.path,
            "offset": gap.offset_hex,
            "total_instructions": gap.total_instructions,
            "function_count": len(gap.functions),
            "functions": [asdict(f) for f in gap.functions],
        }
        payload["gaps"].append(gap_dict)

    path.write_text(json.dumps(payload, indent=2))


# ---------------------------------------------------------------------------
# Agent-mode: prepare-batch (fetch decompilations for IDE agent naming)
# ---------------------------------------------------------------------------

def ghidra_decompile(address_hex: str) -> str | None:
    """Fetch full decompiled C from Ghidra for a function address."""
    try:
        addr = address_hex.lower()
        url = f"{GHIDRA_BASE}/decompile_function?address={addr}"
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.read().decode("utf-8").strip()
    except Exception:
        return None


def prepare_batch(
    inv: GapInventory,
    batch_size: int = 20,
    max_instrs: int | None = None,
    offset: int = 0,
    with_decompilation: bool = True,
    verbose: bool = False,
) -> dict:
    """Prepare a batch of gap functions with Ghidra decompilation context.

    Returns a dict ready to be written as a batch JSON brief.
    """
    # Collect all gap functions sorted by complexity (easiest first)
    all_funcs: list[GapFunc] = []
    for gap in inv.gaps:
        for func in gap.functions:
            if max_instrs and func.instruction_count > max_instrs:
                continue
            all_funcs.append(func)

    all_funcs.sort(key=lambda f: f.complexity_score)

    # Apply offset and batch size
    batch_funcs = all_funcs[offset:offset + batch_size]

    if not batch_funcs:
        return {"error": "no functions in range", "total_available": len(all_funcs)}

    entries: list[dict] = []
    for i, func in enumerate(batch_funcs):
        if verbose:
            print(f"  [{i+1}/{len(batch_funcs)}] decompiling {func.address_hex}...",
                  file=sys.stderr)

        entry: dict[str, Any] = {
            "address": func.address_hex,
            "label": func.label,
            "instruction_count": func.instruction_count,
            "size_bytes": func.size_bytes,
            "complexity_score": func.complexity_score,
            "branches": func.branches,
            "calls": func.calls,
            "gap_file": Path(func.gap_file).name,
            "flags": [],
        }

        if func.has_mmi:
            entry["flags"].append("MMI")
        if func.has_mult1:
            entry["flags"].append("MULT1")
        if func.has_cop2:
            entry["flags"].append("COP2")

        if with_decompilation:
            decomp = ghidra_decompile(func.address_hex)
            entry["decompilation"] = decomp or "(decompilation failed)"

        # Include the raw asm lines for extra context
        gap_path = Path(func.gap_file)
        if gap_path.exists():
            text = gap_path.read_text()
            # Extract just this function's asm block
            asm_block = _extract_func_asm(text, func.label)
            if asm_block:
                entry["asm"] = asm_block

        entries.append(entry)

    batch = {
        "batch_info": {
            "offset": offset,
            "size": len(batch_funcs),
            "total_available": len(all_funcs),
            "max_instrs_filter": max_instrs,
        },
        "instructions": (
            "For each function below, analyze the decompiled C code and assembly, "
            "then suggest a descriptive C function name following PS2 OSDSYS naming "
            "conventions (PascalCase for public APIs, snake_case for internal helpers). "
            "Consider: what the function does, what it calls, what data structures "
            "it accesses. Output a JSON object mapping address to suggested name.\n\n"
            "Example output format:\n"
            '{\n'
            '  "0x00200F78": "get_clock_status_byte",\n'
            '  "0x00200FC0": "read_rtc_clock_bcd",\n'
            '  "0x002050A8": "reset_timer_counter"\n'
            '}\n\n'
            "Rules:\n"
            "- Use descriptive names based on WHAT the function does\n"
            "- Prefix with subsystem if obvious (Font_, Sound_, Browser_, etc.)\n"
            "- For simple getters/setters, use get_/set_ prefix\n"
            "- For init functions, use init_ prefix\n"
            "- If unsure, use a best-guess descriptive name — never leave as func_*\n"
            "- Names must be valid C identifiers (a-z, A-Z, 0-9, _)\n"
        ),
        "functions": entries,
    }

    return batch


def _extract_func_asm(gap_text: str, label: str) -> str | None:
    """Extract the assembly block for a specific function from a gap file."""
    lines = gap_text.splitlines()
    capturing = False
    result: list[str] = []

    for line in lines:
        if f"glabel {label}" in line:
            capturing = True
            result.append(line)
            continue
        if capturing:
            if line.startswith("endlabel "):
                result.append(line)
                break
            result.append(line)

    return "\n".join(result) if result else None


def apply_names(names_file: Path, symbol_file: Path, dry_run: bool = True) -> dict:
    """Apply suggested names from a JSON file to symbol_addrs.txt.

    The names_file should contain a JSON object: {"0xADDR": "name", ...}
    Returns summary of what was/would be applied.
    """
    names = json.loads(names_file.read_text())
    if not isinstance(names, dict):
        return {"error": "names file must be a JSON object {address: name}"}

    # Read existing symbols to avoid duplicates
    existing_names: set[str] = set()
    existing_addrs: set[str] = set()
    if symbol_file.exists():
        for line in symbol_file.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("=")
            if len(parts) >= 2:
                existing_names.add(parts[0].strip())
                addr_part = parts[1].split(";")[0].strip()
                existing_addrs.add(addr_part.lower())

    new_lines: list[str] = []
    skipped: list[dict] = []
    applied: list[dict] = []

    for addr, name in sorted(names.items()):
        addr_norm = addr.lower()
        if not re.match(r"^0x[0-9a-f]+$", addr_norm):
            skipped.append({"address": addr, "name": name, "reason": "invalid address"})
            continue

        if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", name):
            skipped.append({"address": addr, "name": name, "reason": "invalid C identifier"})
            continue

        if name in existing_names:
            skipped.append({"address": addr, "name": name, "reason": "name already exists"})
            continue

        if addr_norm in existing_addrs:
            skipped.append({"address": addr, "name": name, "reason": "address already in symbols"})
            continue

        line = f"{name} = {addr_norm}; // type:func"
        new_lines.append(line)
        applied.append({"address": addr, "name": name})

    result: dict[str, Any] = {
        "applied": len(applied),
        "skipped": len(skipped),
        "dry_run": dry_run,
        "entries": applied,
    }
    if skipped:
        result["skipped_details"] = skipped

    if not dry_run and new_lines:
        with symbol_file.open("a") as f:
            f.write("\n# === Gap function names (agent-suggested) ===\n")
            for line in new_lines:
                f.write(line + "\n")
        result["appended_to"] = str(symbol_file)

    return result


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    import argparse

    p = argparse.ArgumentParser(
        prog="gap_analyzer",
        description="Analyze gap_*.s files for hidden functions",
    )
    p.add_argument("action", nargs="?", default="scan",
                   choices=["scan", "list", "symbols-template", "easy-targets",
                            "prepare-batch", "apply-names"],
                   help="Action to perform (default: scan)")
    p.add_argument("--ghidra-names", action="store_true",
                   help="Query Ghidra MCP for function names (slow)")
    p.add_argument("--max-instrs", type=str, default=None,
                   help="Max instructions filter (easy-targets default: 15)")
    p.add_argument("--show-all", action="store_true",
                   help="Show all gaps in list view")
    p.add_argument("--out", help="Output path for inventory JSON")
    p.add_argument("-v", "--verbose", action="store_true")
    # prepare-batch args
    p.add_argument("--batch-size", type=str, default="20",
                   help="Functions per batch (default: 20)")
    p.add_argument("--offset", type=str, default="0",
                   help="Start offset into sorted function list")
    p.add_argument("--no-decompile", action="store_true",
                   help="Skip Ghidra decompilation in batch (faster)")
    # apply-names args
    p.add_argument("--names-file", help="Path to JSON names file for apply-names")
    p.add_argument("--apply", action="store_true",
                   help="Actually write to symbol_addrs.txt (default: dry-run)")
    args = p.parse_args(argv)

    cfg = load_config()
    root = project_root()
    asm_dir = resolve(cfg["paths"]["asm_dir"])

    # apply-names doesn't need a full scan
    if args.action == "apply-names":
        if not args.names_file:
            print("error: --names-file required for apply-names", file=sys.stderr)
            return 1
        names_path = Path(args.names_file)
        if not names_path.exists():
            print(f"error: {names_path} not found", file=sys.stderr)
            return 1
        sym_file = root / "symbol_addrs.txt"
        result = apply_names(names_path, sym_file, dry_run=not args.apply)
        print(json.dumps(result, indent=2))
        if result.get("dry_run"):
            print(f"\n  (dry-run — rerun with --apply to write)", file=sys.stderr)
        return 0

    # All other actions need the inventory scan
    out_path = Path(args.out) if args.out else root / ".orchestrator" / "gaps.json"
    
    def _parse_int(val, default):
        if val is None or val == "None": return default
        return int(val)

    b_size = _parse_int(args.batch_size, 20)
    b_offset = _parse_int(args.offset, 0)
    m_instrs = _parse_int(args.max_instrs, None)
    
    max_instrs_default = 15 if args.action == "easy-targets" and m_instrs is None else m_instrs

    print("Scanning gap files...", file=sys.stderr)
    inv = scan_all_gaps(asm_dir)
    print(f"Found {inv.total_hidden_functions} hidden functions "
          f"in {inv.gaps_with_functions} gaps "
          f"({inv.padding_only_gaps} padding-only skipped)",
          file=sys.stderr)

    if args.ghidra_names:
        print("Querying Ghidra MCP for function names...", file=sys.stderr)
        named = enrich_with_ghidra(inv, verbose=args.verbose)
        print(f"Ghidra named {named}/{inv.total_hidden_functions} functions",
              file=sys.stderr)

    if args.action == "scan":
        write_inventory(inv, out_path)
        print(f"\nWrote inventory → {out_path}", file=sys.stderr)
        print(format_table(inv))

    elif args.action == "list":
        print(format_table(inv, show_all=args.show_all))

    elif args.action == "symbols-template":
        print(format_symbols_template(inv))

    elif args.action == "easy-targets":
        print(format_easy_targets(inv, max_instrs=max_instrs_default or 15))

    elif args.action == "prepare-batch":
        batch = prepare_batch(
            inv,
            batch_size=b_size,
            max_instrs=m_instrs,
            offset=b_offset,
            with_decompilation=not args.no_decompile,
            verbose=args.verbose,
        )
        batches_dir = root / ".orchestrator" / "gap_batches"
        batches_dir.mkdir(parents=True, exist_ok=True)
        batch_num = b_offset // b_size + 1
        batch_path = batches_dir / f"batch_{batch_num:03d}.json"
        batch_path.write_text(json.dumps(batch, indent=2))
        info = batch.get("batch_info", {})
        print(f"Wrote batch → {batch_path}", file=sys.stderr)
        print(f"  {info.get('size', 0)} functions "
              f"(offset {info.get('offset', 0)} of {info.get('total_available', '?')})",
              file=sys.stderr)
        print(str(batch_path))

    return 0


if __name__ == "__main__":
    sys.exit(main())
