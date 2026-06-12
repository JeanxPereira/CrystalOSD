"""Promote stubs to real source files after a decomp.me match.

Promotion steps:
  1. Verify stub exists at src/stubs/<sub>/<func>.c
  2. Verify decomp.me score == 0 (or score <= symbol_only_threshold) in decomp_results.json
  3. Skip if destination src/<sub>/<func>.c already exists (no overwrite)
  4. Move stub file to src/<sub>/<func>.c
  5. Move optional companion src/stubs/<sub>/<func>.ctx.h → include/<func>.ctx.h (if any)
  6. Update splat_config.yml: change subsegment '[ADDR, asm, sub/func]' to 'c'
  7. Optionally run `make verify` to confirm byte-perfect

CLI usage (via orchestrator):
  orchestrator promote --list              show ready-to-promote candidates
  orchestrator promote <func>              promote one
  orchestrator promote --all               promote every score-0 stub on disk
  orchestrator promote <func> --build      run `make verify` after
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from .config import load as load_config, project_root, resolve


@dataclass
class Candidate:
    func_name: str
    subsystem: str
    stub_path: Path
    src_path: Path
    score: int | None
    max_score: int | None
    slug: str | None
    has_ctx: bool


SUBSYS_DIRS = ("browser", "cdvd", "clock", "config", "core", "graph", "history", "module", "opening", "sound")

# splat_config.yml subsegment line:  [0x5E98, asm, core/nullsub_1]
SPLAT_LINE_RE = re.compile(
    r"^(\s*-\s*\[\s*0x[0-9a-fA-F]+\s*,\s*)asm(\s*,\s*([\w/]+/)?(\w+)\s*\]\s*)$"
)

# match any subsegment line (asm or c): [ADDR, type, sub/func]
SPLAT_SUBSEG_RE = re.compile(
    r"^\s*-\s*\[\s*0x[0-9a-fA-F]+\s*,\s*\w+\s*,\s*(\w+)/(\w+)\s*\]\s*$"
)


def _splat_subsystem_index() -> dict[str, str]:
    """Return {func_name: subsystem} from splat_config.yml subsegments."""
    splat_path = resolve("splat_config.yml")
    if not splat_path.exists():
        return {}
    out: dict[str, str] = {}
    for line in splat_path.read_text().splitlines():
        m = SPLAT_SUBSEG_RE.match(line)
        if m:
            out[m.group(2)] = m.group(1)
    return out


def already_defined_in_src(func_name: str) -> Path | None:
    """Check if func is already defined (anywhere) in src/ outside stubs.

    Returns the file path if found, else None. Detects function definitions —
    not declarations or call sites — by matching `<type> <name>(args) {`.
    """
    src_dir = resolve("src")
    if not src_dir.exists():
        return None
    pattern = re.compile(
        rf"^[\w\s\*]+\b{re.escape(func_name)}\s*\([^;]*\)\s*\{{",
        re.MULTILINE,
    )
    for c_file in src_dir.rglob("*.c"):
        if "stubs" in c_file.parts:
            continue
        try:
            text = c_file.read_text()
        except Exception:
            continue
        if pattern.search(text):
            return c_file
    return None


def find_stub(func_name: str) -> tuple[Path | None, str | None]:
    """Return (stub_path, subsystem) for a given function, or (None, None)."""
    stubs_root = resolve("src/stubs")
    for sub in SUBSYS_DIRS:
        cand = stubs_root / sub / f"{func_name}.c"
        if cand.exists():
            return cand, sub
    return None, None


def load_decomp_score(func_name: str) -> dict | None:
    res_path = resolve("tools/decomp_results.json")
    if not res_path.exists():
        return None
    try:
        data = json.loads(res_path.read_text())
    except json.JSONDecodeError:
        return None
    return data.get(func_name)


def is_promotable_score(score: int | None, threshold: int) -> bool:
    if score is None:
        return False
    if score < 0:
        return False
    return score <= threshold


def collect_candidates(*, threshold: int) -> tuple[list[Candidate], list[dict]]:
    """Scan all stubs; return (promotable, skipped).

    A stub is *skipped* (not promotable) when:
      - score is missing or > threshold
      - the function is already defined in src/ (e.g. inside a shared file like osd_config.c)
    """
    stubs_root = resolve("src/stubs")
    promotable: list[Candidate] = []
    skipped: list[dict] = []
    if not stubs_root.exists():
        return promotable, skipped

    # function name → (real_subsystem, stub_path) lookup via splat_config
    splat_subsys = _splat_subsystem_index()
    seen_funcs: set[str] = set()
    for sub_dir in stubs_root.iterdir():
        if not sub_dir.is_dir() or sub_dir.name not in SUBSYS_DIRS:
            continue
        for stub in sub_dir.glob("*.c"):
            func = stub.stem
            if func in seen_funcs:
                continue
            # if splat says this func belongs to a different subsystem, skip this stub
            real_sub = splat_subsys.get(func)
            if real_sub and real_sub != sub_dir.name:
                skipped.append({
                    "func": func, "subsystem": sub_dir.name,
                    "reason": f"splat_config places it under '{real_sub}/' (this stub at '{sub_dir.name}/' is orphan)",
                })
                continue
            seen_funcs.add(func)

            r = load_decomp_score(func)
            score = None
            if r:
                score = r.get("best_score") if "best_score" in r else r.get("score")

            if not is_promotable_score(score, threshold):
                skipped.append({
                    "func": func, "subsystem": sub_dir.name,
                    "reason": f"score={score} not promotable (threshold={threshold})",
                })
                continue

            existing = already_defined_in_src(func)
            if existing is not None:
                skipped.append({
                    "func": func, "subsystem": sub_dir.name,
                    "reason": f"already defined in {existing.relative_to(project_root())}",
                })
                continue

            ctx_file = stub.with_suffix(".ctx.h")
            promotable.append(
                Candidate(
                    func_name=func,
                    subsystem=sub_dir.name,
                    stub_path=stub,
                    src_path=resolve(f"src/{sub_dir.name}/{func}.c"),
                    score=score,
                    max_score=r.get("max_score") if r else None,
                    slug=(r.get("best_slug") or r.get("slug")) if r else None,
                    has_ctx=ctx_file.exists(),
                )
            )
    return promotable, skipped


def update_splat_config(func_name: str, subsystem: str) -> bool:
    """Flip the splat subsegment for func_name from 'asm' to 'c'.

    Returns True if a change was applied, False if no matching line found.
    """
    splat_path = resolve("splat_config.yml")
    if not splat_path.exists():
        return False
    text = splat_path.read_text()
    out_lines = []
    changed = False
    suffix_match = f"{subsystem}/{func_name}]"
    for line in text.splitlines():
        if not changed and line.rstrip().endswith(suffix_match):
            m = SPLAT_LINE_RE.match(line)
            if m:
                line = f"{m.group(1)}c{m.group(2)}"
                changed = True
        out_lines.append(line)
    if changed:
        splat_path.write_text("\n".join(out_lines) + ("\n" if text.endswith("\n") else ""))
    return changed


def promote_one(c: Candidate, *, dry_run: bool = False) -> dict:
    """Execute promotion for a single candidate. Returns a result dict."""
    result = {
        "func": c.func_name,
        "subsystem": c.subsystem,
        "score": c.score,
        "stub": str(c.stub_path.relative_to(project_root())),
        "dest": str(c.src_path.relative_to(project_root())),
        "actions": [],
        "ok": True,
        "errors": [],
    }

    if c.src_path.exists():
        result["ok"] = False
        result["errors"].append(f"destination already exists: {c.src_path}")
        return result

    if dry_run:
        result["actions"].append(f"would move {c.stub_path} -> {c.src_path}")
        if c.has_ctx:
            ctx_dest = resolve(f"include/{c.func_name}.ctx.h")
            result["actions"].append(f"would move {c.stub_path.with_suffix('.ctx.h')} -> {ctx_dest}")
        result["actions"].append(f"would flip splat_config subsegment {c.subsystem}/{c.func_name}: asm -> c")
        return result

    c.src_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(c.stub_path), str(c.src_path))
    result["actions"].append(f"moved {c.stub_path.name} -> src/{c.subsystem}/")

    if c.has_ctx:
        ctx_src = c.stub_path.with_suffix(".ctx.h")
        ctx_dest = resolve(f"include/{c.func_name}.ctx.h")
        ctx_dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(ctx_src), str(ctx_dest))
        result["actions"].append(f"moved ctx header -> include/{ctx_dest.name}")

    flipped = update_splat_config(c.func_name, c.subsystem)
    if flipped:
        result["actions"].append(f"flipped splat_config: {c.subsystem}/{c.func_name} asm -> c")
    else:
        result["errors"].append(
            f"splat_config.yml: no subsegment found for {c.subsystem}/{c.func_name} (manual edit may be needed)"
        )

    return result


def cleanup_empty_subsystem_dirs() -> list[str]:
    """Remove empty src/stubs/<sub>/ directories. Returns paths removed."""
    stubs_root = resolve("src/stubs")
    removed = []
    if not stubs_root.exists():
        return removed
    for sub_dir in stubs_root.iterdir():
        if sub_dir.is_dir() and not any(sub_dir.iterdir()):
            sub_dir.rmdir()
            removed.append(str(sub_dir.relative_to(project_root())))
    return removed


PS2DEV_PATH = "/Users/jeanxpereira/ps2dev"


def _ps2dev_env() -> dict:
    import os as _os
    env = dict(_os.environ)
    bin_paths = [f"{PS2DEV_PATH}/ee/bin", f"{PS2DEV_PATH}/iop/bin", f"{PS2DEV_PATH}/dvp/bin"]
    env["PATH"] = ":".join(bin_paths + [env.get("PATH", "")])
    env.setdefault("PS2DEV", PS2DEV_PATH)
    env.setdefault("PS2SDK", f"{PS2DEV_PATH}/ps2sdk")
    return env


def run_make(target: str = "verify", jobs: int = 16) -> tuple[bool, str]:
    proc = subprocess.run(
        ["make", f"-j{jobs}", target],
        cwd=project_root(),
        env=_ps2dev_env(),
        capture_output=True,
        text=True,
        timeout=600,
    )
    return proc.returncode == 0, (proc.stdout + proc.stderr)[-3000:]


def run_make_verify() -> tuple[bool, str]:
    return run_make("verify")
