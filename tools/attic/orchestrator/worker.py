"""WORKER: iterate decomp.me match loop with LLM in the loop.

Wraps tools/decomp_match.py for submit/iterate, drives an LLM via llm.py.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

from .config import load as load_config, project_root, resolve
from .judge import classify, Verdict
from .llm import build_with_fallback


PROMPTS_DIR = Path(__file__).parent / "prompts"


@dataclass
class IterationLog:
    iteration: int
    score: int | None
    max_score: int | None
    verdict: str
    latency_ms: int
    tokens_in: int
    tokens_out: int
    diff_excerpt: str = ""
    compiler_error: str = ""


@dataclass
class WorkerResult:
    func_name: str
    final_verdict: Verdict
    final_score: int | None
    slug: str | None
    url: str | None
    iterations: list[IterationLog] = field(default_factory=list)
    final_source: str = ""
    asm_file: str = ""


def _decomp_match_path() -> Path:
    return project_root() / "tools" / "decomp_match.py"


def _run_decomp_match(args: list[str]) -> dict:
    proc = subprocess.run(
        [sys.executable, str(_decomp_match_path()), *args],
        capture_output=True,
        text=True,
        cwd=project_root(),
    )
    stdout = proc.stdout.strip()
    if not stdout:
        return {"error": proc.stderr.strip() or "no output"}
    try:
        return json.loads(stdout)
    except json.JSONDecodeError:
        return {"error": f"non-JSON output: {stdout[:300]}"}


def submit_initial(func_name: str, asm_file: str, source_file: str, context_file: str | None = None) -> dict:
    args = ["submit", func_name, asm_file, source_file]
    if context_file:
        args += ["--context-file", context_file]
    return _run_decomp_match(args)


def iterate_once(slug: str, source_file: str, context_file: str | None = None) -> dict:
    args = ["iterate", slug, source_file]
    if context_file:
        args += ["--context-file", context_file]
    return _run_decomp_match(args)


def write_stub(func_entry: dict, source: str, context_block: str = "") -> tuple[Path, Path | None]:
    """Write C source + optional context header into src/stubs/<sub>/<func>.{c,h}."""
    cfg = load_config()
    sub = func_entry["subsystem"]
    name = func_entry["name"]
    stubs_dir = resolve(cfg["paths"]["stubs_dir"]) / sub
    stubs_dir.mkdir(parents=True, exist_ok=True)
    src_path = stubs_dir / f"{name}.c"
    src_path.write_text(source)
    ctx_path = None
    if context_block.strip():
        ctx_path = stubs_dir / f"{name}.ctx.h"
        ctx_path.write_text(context_block)
    return src_path, ctx_path


def load_worker_prompt(max_iterations: int) -> str:
    text = (PROMPTS_DIR / "worker.md").read_text()
    return text.replace("{max_iterations}", str(max_iterations))


def _build_user_message(
    *,
    iteration: int,
    func_entry: dict,
    target_asm: str,
    previous_c: str,
    iterate_result: dict | None,
    structs_block: str,
    notes: str,
) -> str:
    parts = [
        f"# Function: {func_entry['name']}  /* 0x{func_entry['address']:08X} */",
        f"Iteration: {iteration}",
        "",
        "## Target ASM",
        "```",
        target_asm[:6000],
        "```",
        "",
    ]

    if structs_block:
        parts += ["## Available types/externs", "```c", structs_block, "```", ""]

    if notes:
        parts += ["## Planner notes", notes, ""]

    if previous_c:
        parts += ["## Your previous attempt", "```c", previous_c, "```", ""]

    if iterate_result:
        if "compiler_output" in iterate_result and iterate_result["compiler_output"]:
            parts += ["## Compiler error (FIX FIRST)", "```", iterate_result["compiler_output"][:2000], "```"]
        elif "score" in iterate_result:
            parts += [
                f"## decomp.me score: {iterate_result.get('score')}/{iterate_result.get('max_score')}",
                f"Match: {iterate_result.get('match_pct', 0):.1f}%",
                "",
                "Diff excerpt unavailable — analyze ASM vs your output and infer what changed.",
            ]
        if iterate_result.get("error"):
            parts += [f"## Error: {iterate_result['error']}"]

    parts.append("")
    parts.append("Output the full corrected `.c` file. Nothing else.")
    return "\n".join(parts)


def _extract_c_source(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:c|cpp|C)?\s*\n", "", text)
        text = re.sub(r"\n```\s*$", "", text)
    return text.strip() + "\n"


def run_match_loop(
    *,
    func_entry: dict,
    starting_c: str,
    target_asm: str,
    structs_block: str = "",
    notes: str = "",
    log_callback=None,
) -> WorkerResult:
    cfg = load_config()
    max_iters = cfg["worker"]["max_iterations"]
    judge_cfg = cfg["judge"]
    chat = build_with_fallback(cfg["worker"])

    src_path, ctx_path = write_stub(func_entry, starting_c, structs_block)
    asm_file_rel = func_entry["asm_file"]

    submit_res = submit_initial(
        func_entry["name"],
        asm_file_rel,
        str(src_path.relative_to(project_root())),
        str(ctx_path.relative_to(project_root())) if ctx_path else None,
    )
    if "error" in submit_res:
        return WorkerResult(
            func_name=func_entry["name"],
            final_verdict=Verdict.ERROR,
            final_score=None,
            slug=None,
            url=None,
            asm_file=asm_file_rel,
        )
    slug = submit_res["slug"]
    url = submit_res.get("url", f"https://decomp.me/scratch/{slug}")

    iterations: list[IterationLog] = []
    prev_score: int | None = submit_res.get("score")
    same_score_streak = 0
    current_c = starting_c

    initial_judge = classify(
        submit_res,
        prev_score=None,
        same_score_streak=0,
        symbol_only_threshold=judge_cfg["symbol_only_threshold"],
        close_threshold=judge_cfg["close_threshold"],
        stuck_threshold=cfg["worker"]["stuck_threshold"],
    )
    iterations.append(
        IterationLog(
            iteration=0,
            score=submit_res.get("score"),
            max_score=submit_res.get("max_score"),
            verdict=initial_judge.verdict.value,
            latency_ms=0,
            tokens_in=0,
            tokens_out=0,
        )
    )
    if log_callback:
        log_callback(iterations[-1])
    if initial_judge.verdict in (Verdict.SOLVED, Verdict.SYMBOL_ONLY):
        return WorkerResult(
            func_name=func_entry["name"],
            final_verdict=initial_judge.verdict,
            final_score=submit_res.get("score"),
            slug=slug,
            url=url,
            iterations=iterations,
            final_source=current_c,
            asm_file=asm_file_rel,
        )

    system = load_worker_prompt(max_iters)
    last_iter_result: dict | None = submit_res

    for i in range(1, max_iters + 1):
        user_msg = _build_user_message(
            iteration=i,
            func_entry=func_entry,
            target_asm=target_asm,
            previous_c=current_c,
            iterate_result=last_iter_result,
            structs_block=structs_block,
            notes=notes,
        )
        resp = chat(
            [{"role": "user", "content": user_msg}],
            system=system,
            max_tokens=8000,
            temperature=0.2,
        )
        new_c = _extract_c_source(resp.text)
        if not new_c.strip():
            iterations.append(
                IterationLog(
                    iteration=i,
                    score=prev_score,
                    max_score=last_iter_result.get("max_score") if last_iter_result else None,
                    verdict=Verdict.ERROR.value,
                    latency_ms=resp.latency_ms,
                    tokens_in=resp.input_tokens,
                    tokens_out=resp.output_tokens,
                    diff_excerpt="LLM returned empty source",
                )
            )
            if log_callback:
                log_callback(iterations[-1])
            break

        src_path.write_text(new_c)
        current_c = new_c

        iterate_res = iterate_once(
            slug,
            str(src_path.relative_to(project_root())),
            str(ctx_path.relative_to(project_root())) if ctx_path else None,
        )
        last_iter_result = iterate_res

        score = iterate_res.get("score")
        if score is not None and prev_score is not None and score >= prev_score:
            same_score_streak += 1
        else:
            same_score_streak = 0
        if score is not None:
            prev_score = score

        verdict = classify(
            iterate_res,
            prev_score=prev_score,
            same_score_streak=same_score_streak,
            symbol_only_threshold=judge_cfg["symbol_only_threshold"],
            close_threshold=judge_cfg["close_threshold"],
            stuck_threshold=cfg["worker"]["stuck_threshold"],
        )

        iterations.append(
            IterationLog(
                iteration=i,
                score=iterate_res.get("score"),
                max_score=iterate_res.get("max_score"),
                verdict=verdict.verdict.value,
                latency_ms=resp.latency_ms,
                tokens_in=resp.input_tokens,
                tokens_out=resp.output_tokens,
                compiler_error=(iterate_res.get("compiler_output") or "")[:300],
            )
        )
        if log_callback:
            log_callback(iterations[-1])

        if verdict.verdict in (Verdict.SOLVED, Verdict.SYMBOL_ONLY):
            return WorkerResult(
                func_name=func_entry["name"],
                final_verdict=verdict.verdict,
                final_score=iterate_res.get("score"),
                slug=slug,
                url=url,
                iterations=iterations,
                final_source=current_c,
                asm_file=asm_file_rel,
            )
        if verdict.verdict == Verdict.STUCK:
            return WorkerResult(
                func_name=func_entry["name"],
                final_verdict=Verdict.STUCK,
                final_score=iterate_res.get("score"),
                slug=slug,
                url=url,
                iterations=iterations,
                final_source=current_c,
                asm_file=asm_file_rel,
            )

    return WorkerResult(
        func_name=func_entry["name"],
        final_verdict=Verdict.PROGRESSING,
        final_score=prev_score,
        slug=slug,
        url=url,
        iterations=iterations,
        final_source=current_c,
        asm_file=asm_file_rel,
    )
