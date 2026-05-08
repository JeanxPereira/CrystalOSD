"""PLANNER: build context pack for worker.

Two modes:
  - LLM mode (build_pack):    calls planner LLM to produce starting C + notes
  - Agent mode (build_brief): no LLM call; emits raw prompt + ASM + similar funcs
                              for an external agent (Claude Code, Antigravity) to consume

Inputs:
  - func entry (from queue.json)
Pulls:
  - target ASM (already on disk)
  - Ghidra decompilation via ghidra-mcp (called by orchestrator/Claude Code, not here directly)
  - similar matched functions (via mcp__decomp-me-mcp__decomp_search_context, called externally)
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from .config import load as load_config, project_root, resolve
from .llm import build_with_fallback


PROMPTS_DIR = Path(__file__).parent / "prompts"


@dataclass
class ContextPack:
    func_name: str
    address: int
    subsystem: str
    target_asm: str
    ghidra_pseudocode: str | None
    similar_funcs: list[dict]
    flags: dict
    starting_c: str
    notes: str
    structs_block: str
    raw_planner_json: dict


def read_target_asm(asm_file: Path) -> str:
    return asm_file.read_text()


def load_planner_prompt(top_k: int) -> str:
    return (PROMPTS_DIR / "planner.md").read_text().replace("{top_k}", str(top_k))


def build_pack(
    *,
    func_entry: dict,
    ghidra_pseudocode: str | None,
    similar_funcs: list[dict] | None = None,
) -> ContextPack:
    """Synchronous: calls planner LLM with all context, returns parsed pack."""
    cfg = load_config()
    chat = build_with_fallback(cfg["planner"])

    asm_file = resolve(func_entry["asm_file"])
    target_asm = read_target_asm(asm_file)
    similar_funcs = similar_funcs or []

    similar_block = ""
    for i, s in enumerate(similar_funcs[: cfg["embeddings"]["top_k"]]):
        similar_block += f"\n### Similar #{i+1}: {s.get('name','?')}\n"
        if s.get("asm"):
            similar_block += f"ASM:\n```\n{s['asm'][:1500]}\n```\n"
        if s.get("c_source"):
            similar_block += f"Matched C:\n```c\n{s['c_source'][:1500]}\n```\n"

    flags_str = ", ".join(
        k for k in ("has_mmi", "has_mult1", "has_cop2") if func_entry.get(k)
    ) or "none"

    user_msg = f"""Function to plan: **{func_entry['name']}** at 0x{func_entry['address']:08X}
Subsystem: {func_entry['subsystem']}
Size: {func_entry['size']} bytes, {func_entry['instructions']} instructions
Branches: {func_entry['branches']}, Calls: {func_entry['calls']}
Hard-flags: {flags_str}

## Target ASM
```
{target_asm}
```

## Ghidra Pseudocode
```
{ghidra_pseudocode or '(unavailable — analyze ASM directly)'}
```

## Similar Already-Matched Functions
{similar_block or '(none provided)'}

Now produce the JSON context pack as specified.
"""

    system = load_planner_prompt(cfg["embeddings"]["top_k"])
    resp = chat([{"role": "user", "content": user_msg}], system=system, max_tokens=4096, temperature=0.1)

    pack_json = _extract_json(resp.text)
    if not pack_json:
        raise RuntimeError(f"planner returned non-JSON output:\n{resp.text[:500]}")

    return ContextPack(
        func_name=func_entry["name"],
        address=func_entry["address"],
        subsystem=func_entry["subsystem"],
        target_asm=target_asm,
        ghidra_pseudocode=ghidra_pseudocode,
        similar_funcs=similar_funcs,
        flags={
            "has_mmi": func_entry.get("has_mmi", False),
            "has_mult1": func_entry.get("has_mult1", False),
            "has_cop2": func_entry.get("has_cop2", False),
        },
        starting_c=pack_json.get("starting_c", ""),
        notes=pack_json.get("notes_for_worker", ""),
        structs_block=pack_json.get("context_block", ""),
        raw_planner_json=pack_json,
    )


def build_brief(
    *,
    func_entry: dict,
    ghidra_pseudocode: str | None,
    similar_funcs: list[dict] | None = None,
) -> dict:
    """Agent-mode: produce structured brief without calling any LLM.

    Returns dict with keys: func_name, address, asm_file, target_asm,
    ghidra_pseudocode, similar_funcs, flags, system_prompt, user_prompt,
    quirks_path. The calling agent reads system_prompt + user_prompt and writes C.
    """
    cfg = load_config()
    asm_file = resolve(func_entry["asm_file"])
    target_asm = read_target_asm(asm_file)
    similar_funcs = similar_funcs or []
    top_k = cfg["embeddings"]["top_k"]

    similar_block = ""
    for i, s in enumerate(similar_funcs[:top_k]):
        similar_block += f"\n### Similar #{i+1}: {s.get('name','?')}\n"
        if s.get("asm"):
            similar_block += f"ASM:\n```\n{s['asm'][:1500]}\n```\n"
        if s.get("c_source"):
            similar_block += f"Matched C:\n```c\n{s['c_source'][:1500]}\n```\n"

    flags_str = ", ".join(
        k for k in ("has_mmi", "has_mult1", "has_cop2") if func_entry.get(k)
    ) or "none"

    user_prompt = f"""Function: **{func_entry['name']}** at 0x{func_entry['address']:08X}
Subsystem: {func_entry['subsystem']}
Size: {func_entry['size']} bytes, {func_entry['instructions']} instructions
Branches: {func_entry['branches']}, Calls: {func_entry['calls']}
Hard-flags: {flags_str}
ASM file: {func_entry['asm_file']}

## Target ASM
```
{target_asm}
```

## Ghidra Pseudocode
```
{ghidra_pseudocode or '(unavailable — analyze ASM directly)'}
```

## Similar Already-Matched Functions
{similar_block or '(none provided)'}

Write the matching C source. Output should be a complete `.c` file.
Submit to decomp.me iteratively until score=0 (or symbol-only ≤ 15).
"""

    system_prompt = (PROMPTS_DIR / "worker.md").read_text().replace(
        "{max_iterations}", str(cfg["worker"]["max_iterations"])
    )

    return {
        "func_name": func_entry["name"],
        "address": f"0x{func_entry['address']:08X}",
        "subsystem": func_entry["subsystem"],
        "asm_file": func_entry["asm_file"],
        "target_asm": target_asm,
        "ghidra_pseudocode": ghidra_pseudocode,
        "similar_funcs": similar_funcs,
        "flags": {
            "has_mmi": func_entry.get("has_mmi", False),
            "has_mult1": func_entry.get("has_mult1", False),
            "has_cop2": func_entry.get("has_cop2", False),
        },
        "system_prompt": system_prompt,
        "user_prompt": user_prompt,
        "quirks_path": "reference/COMPILER_QUIRKS.md",
    }


def _extract_json(text: str) -> dict | None:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                return None
    return None
