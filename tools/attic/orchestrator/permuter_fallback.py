"""On STUCK verdict, hand off the function to decomp-permuter for brute-force search."""

from __future__ import annotations

import json
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

from .config import load as load_config, project_root, resolve


def queue_for_human(func_name: str, source: str, slug: str | None, asm_file: str, reason: str) -> Path:
    cfg = load_config()
    out_dir = resolve(cfg["paths"]["ask_human"])
    out_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "func_name": func_name,
        "asm_file": asm_file,
        "decomp_me_slug": slug,
        "decomp_me_url": f"https://decomp.me/scratch/{slug}" if slug else None,
        "reason": reason,
        "queued_at": datetime.now().isoformat(),
    }
    json_path = out_dir / f"{func_name}.json"
    src_path = out_dir / f"{func_name}.c"
    json_path.write_text(json.dumps(payload, indent=2))
    src_path.write_text(source)
    return json_path


def run_permuter_import(func_name: str, src_file: Path) -> tuple[bool, str]:
    """Invoke tools/permuter_import.sh. Returns (success, output)."""
    script = project_root() / "tools" / "permuter_import.sh"
    if not script.exists():
        return False, f"missing {script}"
    try:
        proc = subprocess.run(
            ["bash", str(script), func_name, str(src_file.relative_to(project_root()))],
            capture_output=True,
            text=True,
            cwd=project_root(),
            timeout=120,
        )
        ok = proc.returncode == 0
        return ok, (proc.stdout + proc.stderr)
    except subprocess.TimeoutExpired:
        return False, "permuter_import.sh timed out"
    except Exception as e:
        return False, str(e)


def handle_stuck(
    *,
    func_name: str,
    source: str,
    slug: str | None,
    asm_file: str,
    final_score: int | None,
) -> dict:
    """Try permuter import; queue for human regardless. Returns summary dict."""
    cfg = load_config()
    stubs_dir = resolve(cfg["paths"]["stubs_dir"])
    candidate = None
    for c_file in stubs_dir.rglob(f"{func_name}.c"):
        candidate = c_file
        break

    permuter_ok = False
    permuter_log = ""
    if candidate:
        permuter_ok, permuter_log = run_permuter_import(func_name, candidate)

    human_path = queue_for_human(
        func_name,
        source,
        slug,
        asm_file,
        reason=f"STUCK at score={final_score}; permuter_import={'ok' if permuter_ok else 'failed'}",
    )

    return {
        "func_name": func_name,
        "permuter_imported": permuter_ok,
        "permuter_log_excerpt": permuter_log[-400:],
        "ask_human_path": str(human_path.relative_to(project_root())),
    }
