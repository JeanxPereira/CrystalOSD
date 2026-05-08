"""Complexity ranker. Builds queue.json of remaining funcs sorted easy-first.

Heuristics (lower = easier):
  - instruction_count
  - branch_count (beq/bne/bgez/...)
  - call_count (jal)
  - has_mmi (R5900-specific MMI instructions => harder)
  - has_mult1 (mult1/madd1/etc => parallel multiply pipe, near-unmatchable from C)
  - has_cop2 (VU0 macromode => very hard)
"""

from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import dataclass, asdict
from pathlib import Path

from .config import load as load_config, project_root, resolve

MMI_OPS = {
    "pmaddw", "pmadduw", "pmaddh", "pmadduw", "pmsubw", "pmsubh",
    "paddw", "paddh", "paddb", "paddsw", "paddsh", "paddsb",
    "psubw", "psubh", "psubb", "psubsw", "psubsh", "psubsb",
    "pmulth", "pmultw", "pmultuw", "pdivw", "pdivuw",
    "pand", "por", "pxor", "pnor", "pcgtw", "pcgth", "pcgtb",
    "pceqw", "pceqh", "pceqb", "pmaxw", "pmaxh", "pminw", "pminh",
    "pmfhi", "pmflo", "pmthi", "pmtlo", "pmfhl", "pmthl",
    "pinth", "pintoh", "ppach", "ppacw", "ppacb", "pextlw", "pextuw",
    "pextlh", "pextuh", "pextlb", "pextub", "pcpyld", "pcpyud", "pcpyh",
    "psllw", "psrlw", "psraw", "psllh", "psrlh", "psrah",
    "psllvw", "psrlvw", "psravw", "pmovz", "pmovn",
    "pabsw", "pabsh", "plzcw", "psllvw",
    "qfsrv",  # quad-word funnel shift
    "lq", "sq",  # 128-bit load/store
}
MULT1_OPS = {"mult1", "multu1", "div1", "divu1", "madd1", "maddu1", "msub1", "msubu1"}
COP2_OPS = {"vmulq", "vaddq", "vsubq", "vmaddq", "vmsubq", "vdiv", "vsqrt", "vrsqrt",
            "vmove", "vmr32", "vlqi", "vsqi", "vlqd", "vsqd", "vftoi0", "vftoi4", "vftoi12", "vftoi15",
            "vitof0", "vitof4", "vitof12", "vitof15", "vmula", "vadda", "vsuba", "vmadd", "vmsub",
            "qmfc2", "qmtc2", "ctc2", "cfc2", "callmsr", "vcallms"}
BRANCH_OPS = {"beq", "bne", "blez", "bgtz", "bltz", "bgez", "beqz", "bnez", "b",
              "beql", "bnel", "blezl", "bgtzl", "bltzl", "bgezl"}
CALL_OPS = {"jal", "jalr", "bal"}

INSTR_LINE = re.compile(r"^\s*/\*[^*]+\*/\s+(\w+)")


@dataclass
class FuncEntry:
    name: str
    address: int
    size: int
    subsystem: str
    asm_file: str
    instructions: int = 0
    branches: int = 0
    calls: int = 0
    has_mmi: bool = False
    has_mult1: bool = False
    has_cop2: bool = False
    score: int = 0


SUBSYS_DIRS = ("browser", "cdvd", "clock", "config", "core", "graph", "history", "module", "opening", "sound")


def parse_symbols(symbol_file: Path) -> list[tuple[int, int, str]]:
    """Returns list of (vaddr, size, name) for func symbols."""
    pattern = re.compile(
        r"^\s*(\w+)\s*=\s*0x([0-9a-fA-F]+)\s*;(?:\s*//\s*size:0x([0-9a-fA-F]+)\s+type:func)?"
    )
    out = []
    for line in symbol_file.read_text().splitlines():
        m = pattern.match(line)
        if not m:
            continue
        name, addr_hex, size_hex = m.group(1), m.group(2), m.group(3)
        if size_hex is None:
            continue
        out.append((int(addr_hex, 16), int(size_hex, 16), name))
    return out


def classify(name: str) -> str:
    lname = name.lower()
    for sub in SUBSYS_DIRS:
        if lname.startswith(sub) or f"_{sub}_" in lname or lname.startswith(f"{sub}_"):
            return sub
    if name.startswith(("sceCd", "do_read_cdvd", "cdvd_")):
        return "cdvd"
    if name.startswith(("sceSpu", "sound_", "Sound", "sceSd")):
        return "sound"
    if name.startswith(("sceGs", "sceGif", "sceVif", "sceDma", "Font_", "draw_", "Draw", "calc")):
        return "graph"
    if name.startswith(("sceMc", "browser_", "Browser")):
        return "browser"
    if name.startswith(("clock_", "Clock")):
        return "clock"
    if name.startswith(("config_", "ConfigDB", "do_read_config", "do_write_config")):
        return "config"
    if name.startswith(("opening_", "Opening", "tower")):
        return "opening"
    if name.startswith(("history_", "History")):
        return "history"
    if name.startswith(("module_", "load_module", "ModSt")):
        return "module"
    return "core"


def find_asm_file(name: str, asm_dir: Path) -> Path | None:
    for sub in SUBSYS_DIRS:
        cand = asm_dir / sub / f"{name}.s"
        if cand.exists():
            return cand
    cand = asm_dir / f"{name}.s"
    return cand if cand.exists() else None


def analyze_asm(path: Path) -> tuple[int, int, int, bool, bool, bool]:
    instrs = branches = calls = 0
    mmi = mult1 = cop2 = False
    for line in path.read_text().splitlines():
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


def compute_score(e: FuncEntry) -> int:
    s = e.instructions + e.branches * 2 + e.calls * 1
    if e.has_mmi:
        s += 100
    if e.has_mult1:
        s += 200
    if e.has_cop2:
        s += 500
    return s


def already_done(name: str, src_dir: Path) -> bool:
    """Check if function has a definition (not just call) in src/ (excluding src/stubs)."""
    def_pattern = re.compile(
        rf"^[\w\s\*]+\b{re.escape(name)}\s*\([^;]*\)\s*\{{",
        re.MULTILINE,
    )
    for c_file in src_dir.rglob("*.c"):
        if "stubs" in c_file.parts:
            continue
        try:
            text = c_file.read_text()
        except Exception:
            continue
        if def_pattern.search(text):
            return True
    return False


def build_queue(skip_done: bool = True) -> list[FuncEntry]:
    cfg = load_config()
    root = project_root()
    asm_dir = resolve(cfg["paths"]["asm_dir"])
    src_dir = resolve(cfg["paths"]["src_dir"])
    sym_file = root / "symbol_addrs.txt"
    if not sym_file.exists():
        raise FileNotFoundError(f"missing symbol_addrs.txt at {sym_file}")

    symbols = parse_symbols(sym_file)
    out: list[FuncEntry] = []
    for vaddr, size, name in symbols:
        if name.startswith(("FUN_", "func_", "j_")) or name.startswith("gap_"):
            continue
        asm_path = find_asm_file(name, asm_dir)
        if asm_path is None:
            continue
        if skip_done and already_done(name, src_dir):
            continue
        instrs, br, ca, mmi, m1, cp2 = analyze_asm(asm_path)
        e = FuncEntry(
            name=name,
            address=vaddr,
            size=size,
            subsystem=classify(name),
            asm_file=str(asm_path.relative_to(root)),
            instructions=instrs,
            branches=br,
            calls=ca,
            has_mmi=mmi,
            has_mult1=m1,
            has_cop2=cp2,
        )
        e.score = compute_score(e)
        out.append(e)

    out.sort(key=lambda e: (e.score, e.size))
    return out


def write_queue(entries: list[FuncEntry], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "count": len(entries),
        "by_subsystem": {},
        "functions": [asdict(e) for e in entries],
    }
    by_sub: dict[str, int] = {}
    for e in entries:
        by_sub[e.subsystem] = by_sub.get(e.subsystem, 0) + 1
    payload["by_subsystem"] = dict(sorted(by_sub.items(), key=lambda x: -x[1]))
    path.write_text(json.dumps(payload, indent=2))


def main(argv: list[str] | None = None) -> int:
    import argparse

    p = argparse.ArgumentParser(description="Build complexity-sorted decomp queue")
    p.add_argument("--include-done", action="store_true", help="don't skip already-decompiled funcs")
    p.add_argument("--subsystem", help="filter to one subsystem")
    p.add_argument("--limit", type=int, help="cap queue to N entries")
    p.add_argument("--out", help="output path (default: from config)")
    args = p.parse_args(argv)

    cfg = load_config()
    out_path = Path(args.out) if args.out else resolve(cfg["paths"]["queue"])

    entries = build_queue(skip_done=not args.include_done)
    if args.subsystem:
        entries = [e for e in entries if e.subsystem == args.subsystem]
    if args.limit:
        entries = entries[: args.limit]

    write_queue(entries, out_path)
    print(f"wrote {len(entries)} entries → {out_path}")
    if entries:
        print("\ntop 10 easiest:")
        for e in entries[:10]:
            tags = []
            if e.has_mmi:
                tags.append("MMI")
            if e.has_mult1:
                tags.append("MULT1")
            if e.has_cop2:
                tags.append("COP2")
            t = f" [{','.join(tags)}]" if tags else ""
            print(f"  score={e.score:4d}  {e.subsystem:8s} {e.name}  ({e.instructions}i){t}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
