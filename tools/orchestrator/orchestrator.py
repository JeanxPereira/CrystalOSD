"""CrystalOSD orchestrator CLI.

Commands:
    orchestrator providers test                  smoke-test configured providers
    orchestrator queue build [--subsystem X]     refresh ranked queue.json
    orchestrator queue show [--top N]            print top of queue
    orchestrator decomp <func>                   single-function pipeline
    orchestrator batch <subsystem> [--max N]     serial batch
    orchestrator stats                           per-provider token + cost
    orchestrator resume                          replay last failed func
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path

from . import config as cfg_mod
from . import easy_funcs
from . import permuter_fallback
from . import planner as planner_mod
from . import worker as worker_mod
from .judge import Verdict
from .llm import build_provider, build_with_fallback


# rough USD per 1M tokens (input, output) — for stats only, not billing
COST_TABLE = {
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-opus-4-7": (15.00, 75.00),
    "claude-haiku-4-5": (0.80, 4.00),
    "deepseek-chat": (0.27, 1.10),
    "deepseek-reasoner": (0.55, 2.19),
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
    "gemini-2.5-pro": (1.25, 10.00),
    "gemini-2.5-flash": (0.075, 0.30),
}


def _log_path() -> Path:
    return cfg_mod.resolve(cfg_mod.load()["paths"]["log"])


def append_log(record: dict) -> None:
    p = _log_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    record = {"ts": datetime.now().isoformat(), **record}
    with p.open("a") as f:
        f.write(json.dumps(record) + "\n")


def cmd_providers_test(args) -> int:
    cfg = cfg_mod.load()
    failed = 0
    for role in ("planner", "worker"):
        spec = cfg[role]
        print(f"\n[{role}] primary={spec['provider']}  model={spec.get('model')}")
        try:
            chat = build_with_fallback(spec)
            t0 = time.time()
            resp = chat(
                [{"role": "user", "content": "Reply with the single word OK."}],
                max_tokens=256,
                temperature=0,
            )
            dt = (time.time() - t0) * 1000
            head = resp.text.strip().splitlines()[0] if resp.text.strip() else "(empty)"
            print(f"  ✅ {head}  ({resp.input_tokens}→{resp.output_tokens} tok, {dt:.0f}ms)")
        except Exception as e:
            failed += 1
            print(f"  ❌ {e}")
        if cfg[role].get("fallback"):
            fb = cfg[role]["fallback"]
            print(f"[{role}] fallback={fb['provider']}  model={fb.get('model')}")
            try:
                p = build_provider(fb)
                resp = p.chat(
                    [{"role": "user", "content": "Reply with the single word OK."}],
                    max_tokens=8,
                    temperature=0,
                )
                head = resp.text.strip().splitlines()[0] if resp.text.strip() else "(empty)"
                print(f"  ✅ {head}  ({resp.input_tokens}→{resp.output_tokens} tok)")
            except Exception as e:
                failed += 1
                print(f"  ❌ {e}")
    return 1 if failed else 0


def cmd_queue_build(args) -> int:
    cfg = cfg_mod.load()
    out_path = cfg_mod.resolve(cfg["paths"]["queue"])
    entries = easy_funcs.build_queue(skip_done=not args.include_done)
    if args.subsystem:
        entries = [e for e in entries if e.subsystem == args.subsystem]
    if args.limit:
        entries = entries[: args.limit]
    easy_funcs.write_queue(entries, out_path)
    print(f"wrote {len(entries)} entries → {out_path}")
    return 0


def cmd_queue_show(args) -> int:
    cfg = cfg_mod.load()
    qp = cfg_mod.resolve(cfg["paths"]["queue"])
    if not qp.exists():
        print(f"no queue at {qp}; run `orchestrator queue build` first")
        return 1
    data = json.loads(qp.read_text())
    fns = data["functions"][: args.top]
    print(f"queue: {data['count']} total")
    print(f"by subsystem: {data['by_subsystem']}\n")
    for e in fns:
        tags = ",".join(t for t in ("MMI", "MULT1", "COP2") if e.get(f"has_{t.lower()}")) or ""
        if tags:
            tags = f" [{tags}]"
        print(f"  score={e['score']:4d}  {e['subsystem']:8s}  {e['name']:40s}  ({e['instructions']}i){tags}")
    return 0


def _find_queue_entry(name: str) -> dict | None:
    cfg = cfg_mod.load()
    qp = cfg_mod.resolve(cfg["paths"]["queue"])
    if not qp.exists():
        return None
    data = json.loads(qp.read_text())
    for e in data["functions"]:
        if e["name"] == name:
            return e
    return None


def _build_entry_adhoc(name: str) -> dict | None:
    """Build a queue entry on the fly for a single function."""
    entries = easy_funcs.build_queue(skip_done=False)
    for e in entries:
        if e.name == name:
            from dataclasses import asdict
            return asdict(e)
    return None


def cmd_decomp(args) -> int:
    cfg = cfg_mod.load()
    name = args.func
    entry = _find_queue_entry(name) or _build_entry_adhoc(name)
    if entry is None:
        print(f"function '{name}' not found in symbol_addrs.txt or no asm file")
        return 1

    worker_provider = cfg["worker"].get("provider", "")
    if worker_provider == "agent":
        return _decomp_agent_mode(args, entry, cfg)

    print(f"== decomp {name} ==")
    print(f"  subsystem={entry['subsystem']}  score={entry['score']}  size={entry['size']}b")

    asm_file = cfg_mod.resolve(entry["asm_file"])
    target_asm = asm_file.read_text()

    ghidra_pseudo = args.ghidra_pseudo or os.environ.get("GHIDRA_PSEUDO_PATH")
    ghidra_text = None
    if ghidra_pseudo and Path(ghidra_pseudo).exists():
        ghidra_text = Path(ghidra_pseudo).read_text()

    similar: list[dict] = []
    if args.similar_json and Path(args.similar_json).exists():
        similar = json.loads(Path(args.similar_json).read_text())

    print("  → planner")
    try:
        pack = planner_mod.build_pack(
            func_entry=entry,
            ghidra_pseudocode=ghidra_text,
            similar_funcs=similar,
        )
    except Exception as e:
        traceback.print_exc()
        append_log({"event": "planner_fail", "func": name, "error": str(e)})
        return 2

    starting_c = pack.starting_c.strip() or f"/* 0x{entry['address']:08X} - {name} */\nvoid {name}(void) {{\n}}\n"

    print("  → worker loop")

    def _on_iter(it):
        v = it.verdict
        s = it.score
        print(f"     iter {it.iteration}: score={s}  verdict={v}  ({it.tokens_in}→{it.tokens_out} tok, {it.latency_ms}ms)")
        append_log({"event": "iter", "func": name, "iteration": it.iteration,
                    "score": s, "verdict": v, "tokens_in": it.tokens_in,
                    "tokens_out": it.tokens_out, "latency_ms": it.latency_ms})

    res = worker_mod.run_match_loop(
        func_entry=entry,
        starting_c=starting_c,
        target_asm=target_asm,
        structs_block=pack.structs_block,
        notes=pack.notes,
        log_callback=_on_iter,
    )

    print(f"\n== result: {res.final_verdict.value}  score={res.final_score}  url={res.url}")
    append_log({
        "event": "worker_done",
        "func": name,
        "verdict": res.final_verdict.value,
        "score": res.final_score,
        "iterations": len(res.iterations),
        "url": res.url,
    })

    if res.final_verdict in (Verdict.SOLVED, Verdict.SYMBOL_ONLY):
        _append_takeaway(name, res, "matched")
        print(f"  ✅ stub at src/stubs/{entry['subsystem']}/{name}.c — ready for promote review")
        return 0

    if res.final_verdict == Verdict.STUCK:
        out = permuter_fallback.handle_stuck(
            func_name=name,
            source=res.final_source,
            slug=res.slug,
            asm_file=res.asm_file,
            final_score=res.final_score,
        )
        print(f"  → permuter imported: {out['permuter_imported']}")
        print(f"  → human queue: {out['ask_human_path']}")
        append_log({"event": "stuck_handoff", "func": name, **out})
        _append_takeaway(name, res, "stuck")
        return 3

    print("  ⚠️  iteration budget exhausted without match")
    _append_takeaway(name, res, "exhausted")
    return 4


def _decomp_agent_mode(args, entry, cfg) -> int:
    """Agent mode: emit a brief for an external agent (Claude Code, Antigravity) to act on.

    Steps an agent should perform after this command:
      1. Read brief from .orchestrator/briefs/<func>.json
      2. (optional) decompile target via ghidra-mcp; pass --ghidra-pseudo
      3. (optional) fetch similar funcs via mcp__decomp-me-mcp__decomp_search_context
      4. Write C source to src/stubs/<sub>/<func>.c
      5. Submit:  python3 -m tools.orchestrator submit <func> src/stubs/<sub>/<func>.c
      6. If score > 0, edit C source, then:
         python3 -m tools.orchestrator iterate <slug> src/stubs/<sub>/<func>.c
      7. Repeat until SOLVED or stuck
    """
    name = entry["name"]
    print(f"== AGENT-MODE brief for {name} ==")

    ghidra_text = None
    if args.ghidra_pseudo and Path(args.ghidra_pseudo).exists():
        ghidra_text = Path(args.ghidra_pseudo).read_text()

    similar: list[dict] = []
    if args.similar_json and Path(args.similar_json).exists():
        similar = json.loads(Path(args.similar_json).read_text())

    brief = planner_mod.build_brief(
        func_entry=entry,
        ghidra_pseudocode=ghidra_text,
        similar_funcs=similar,
    )

    briefs_dir = cfg_mod.resolve(".orchestrator/briefs")
    briefs_dir.mkdir(parents=True, exist_ok=True)
    brief_path = briefs_dir / f"{name}.json"
    brief_path.write_text(json.dumps(brief, indent=2))

    sub = entry["subsystem"]
    stub_path = f"src/stubs/{sub}/{name}.c"

    print(f"  brief written to: {brief_path.relative_to(cfg_mod.project_root())}")
    print(f"  asm:               {entry['asm_file']}")
    print(f"  target stub:       {stub_path}")
    if entry.get("has_mmi") or entry.get("has_mult1") or entry.get("has_cop2"):
        flags = ",".join(t for t in ("MMI","MULT1","COP2") if entry.get(f"has_{t.lower()}"))
        print(f"  ⚠️  hard-flags: {flags} — may need inline asm")
    print()
    print("# Next steps for the agent:")
    print(f"# 1. (optional) ghidra decompile → save as <path>; rerun with --ghidra-pseudo <path>")
    print(f"# 2. (optional) decomp.me similar search; pass via --similar-json <path>")
    print(f"# 3. write C to: {stub_path}")
    print(f"# 4. submit:")
    print(f"     python3 -m tools.orchestrator submit {name} {stub_path}")
    print(f"# 5. iterate if needed:")
    print(f"     python3 -m tools.orchestrator iterate <slug> {stub_path}")
    return 0


def cmd_plan(args) -> int:
    """Build a brief without calling any LLM. Outputs JSON to stdout."""
    cfg = cfg_mod.load()
    entry = _find_queue_entry(args.func) or _build_entry_adhoc(args.func)
    if entry is None:
        print(json.dumps({"error": f"function '{args.func}' not found"}))
        return 1

    ghidra_text = None
    if args.ghidra_pseudo and Path(args.ghidra_pseudo).exists():
        ghidra_text = Path(args.ghidra_pseudo).read_text()

    similar: list[dict] = []
    if args.similar_json and Path(args.similar_json).exists():
        similar = json.loads(Path(args.similar_json).read_text())

    brief = planner_mod.build_brief(
        func_entry=entry,
        ghidra_pseudocode=ghidra_text,
        similar_funcs=similar,
    )
    if args.save:
        briefs_dir = cfg_mod.resolve(".orchestrator/briefs")
        briefs_dir.mkdir(parents=True, exist_ok=True)
        out_path = briefs_dir / f"{args.func}.json"
        out_path.write_text(json.dumps(brief, indent=2))
        print(str(out_path.relative_to(cfg_mod.project_root())))
    else:
        print(json.dumps(brief, indent=2))
    return 0


def cmd_submit(args) -> int:
    """Thin wrapper: submit C source as new decomp.me scratch. Outputs JSON."""
    from . import worker as worker_mod
    entry = _find_queue_entry(args.func) or _build_entry_adhoc(args.func)
    if entry is None:
        print(json.dumps({"error": f"function '{args.func}' not found"}))
        return 1
    src_file = args.source_file
    asm_file = entry["asm_file"]
    res = worker_mod.submit_initial(args.func, asm_file, src_file, args.context_file)
    print(json.dumps(res, indent=2))
    return 0 if "error" not in res else 1


def cmd_iterate(args) -> int:
    """Thin wrapper: recompile existing scratch with new source. Outputs JSON."""
    from . import worker as worker_mod
    res = worker_mod.iterate_once(args.slug, args.source_file, args.context_file)
    print(json.dumps(res, indent=2))
    return 0 if "error" not in res else 1


def _append_takeaway(func_name: str, res, status: str) -> None:
    cfg = cfg_mod.load()
    p = cfg_mod.resolve(cfg["paths"]["takeaways"])
    p.parent.mkdir(parents=True, exist_ok=True)
    line = (
        f"- {datetime.now().date().isoformat()}  **{func_name}**  status=`{status}`  "
        f"score={res.final_score}  iters={len(res.iterations)}  "
        f"url={res.url}\n"
    )
    if not p.exists():
        p.write_text("# CrystalOSD orchestrator takeaways\n\n")
    with p.open("a") as f:
        f.write(line)


def cmd_batch(args) -> int:
    cfg = cfg_mod.load()
    qp = cfg_mod.resolve(cfg["paths"]["queue"])
    if not qp.exists():
        print(f"no queue at {qp}; run `orchestrator queue build` first")
        return 1
    data = json.loads(qp.read_text())
    fns = [e for e in data["functions"] if e["subsystem"] == args.subsystem]
    if args.max:
        fns = fns[: args.max]
    print(f"== batch subsystem={args.subsystem}  count={len(fns)} ==")
    rc_summary = {"solved": 0, "symbol_only": 0, "stuck": 0, "exhausted": 0, "error": 0}
    for i, e in enumerate(fns, 1):
        print(f"\n[{i}/{len(fns)}] {e['name']}")
        sub_args = argparse.Namespace(
            func=e["name"], ghidra_pseudo=None, similar_json=None
        )
        try:
            rc = cmd_decomp(sub_args)
            if rc == 0:
                rc_summary["solved"] += 1
            elif rc == 3:
                rc_summary["stuck"] += 1
            elif rc == 4:
                rc_summary["exhausted"] += 1
            else:
                rc_summary["error"] += 1
        except KeyboardInterrupt:
            print("\n^C — stopping batch")
            break
        except Exception as ex:
            traceback.print_exc()
            rc_summary["error"] += 1
            append_log({"event": "batch_exception", "func": e["name"], "error": str(ex)})
    print(f"\n== batch done: {rc_summary} ==")
    return 0


def cmd_stats(args) -> int:
    p = _log_path()
    if not p.exists():
        print(f"no log at {p}")
        return 0
    by_provider: dict[str, dict] = {}
    by_func: dict[str, dict] = {}
    for line in p.read_text().splitlines():
        if not line.strip():
            continue
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            continue
        if r.get("event") != "iter":
            continue
        prov_key = "unknown"
        d = by_provider.setdefault(prov_key, {"in": 0, "out": 0, "iters": 0})
        d["in"] += r.get("tokens_in", 0)
        d["out"] += r.get("tokens_out", 0)
        d["iters"] += 1
        f = r.get("func", "?")
        fd = by_func.setdefault(f, {"in": 0, "out": 0, "iters": 0})
        fd["in"] += r.get("tokens_in", 0)
        fd["out"] += r.get("tokens_out", 0)
        fd["iters"] += 1

    print("== Token totals ==")
    total_in = sum(d["in"] for d in by_provider.values())
    total_out = sum(d["out"] for d in by_provider.values())
    print(f"input:  {total_in:,}")
    print(f"output: {total_out:,}")
    print()

    cfg = cfg_mod.load()
    worker_model = cfg["worker"].get("model", "")
    if worker_model in COST_TABLE:
        ci, co = COST_TABLE[worker_model]
        usd = (total_in / 1_000_000) * ci + (total_out / 1_000_000) * co
        print(f"est. cost @ {worker_model}: ${usd:.2f}")
    print()

    print("== Top 10 funcs by tokens ==")
    top = sorted(by_func.items(), key=lambda kv: -(kv[1]["in"] + kv[1]["out"]))[:10]
    for name, d in top:
        print(f"  {name:35s} iters={d['iters']:2d}  in={d['in']:>7,}  out={d['out']:>6,}")
    return 0


def cmd_init(args) -> int:
    cfg_mod.write_default(force=args.force)
    print(f"wrote {cfg_mod.CONFIG_PATH}")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="orchestrator")
    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("init", help="write default .orchestrator/config.yml")
    sp.add_argument("--force", action="store_true")
    sp.set_defaults(_handler=cmd_init)

    sp = sub.add_parser("providers")
    pp = sp.add_subparsers(dest="action", required=True)
    p_t = pp.add_parser("test")
    p_t.set_defaults(_handler=cmd_providers_test)

    sp = sub.add_parser("queue")
    pp = sp.add_subparsers(dest="action", required=True)
    p_b = pp.add_parser("build")
    p_b.add_argument("--subsystem")
    p_b.add_argument("--limit", type=int)
    p_b.add_argument("--include-done", action="store_true")
    p_b.set_defaults(_handler=cmd_queue_build)
    p_s = pp.add_parser("show")
    p_s.add_argument("--top", type=int, default=20)
    p_s.set_defaults(_handler=cmd_queue_show)

    sp = sub.add_parser("decomp", help="match a single function")
    sp.add_argument("func")
    sp.add_argument("--ghidra-pseudo", help="path to .c with Ghidra decompile output")
    sp.add_argument("--similar-json", help="path to JSON list of similar matched funcs")
    sp.set_defaults(_handler=cmd_decomp)

    sp = sub.add_parser("plan", help="agent-mode: build brief without calling any LLM")
    sp.add_argument("func")
    sp.add_argument("--ghidra-pseudo")
    sp.add_argument("--similar-json")
    sp.add_argument("--save", action="store_true", help="save to .orchestrator/briefs/<func>.json")
    sp.set_defaults(_handler=cmd_plan)

    sp = sub.add_parser("submit", help="agent-mode: create decomp.me scratch from C file")
    sp.add_argument("func")
    sp.add_argument("source_file")
    sp.add_argument("--context-file")
    sp.set_defaults(_handler=cmd_submit)

    sp = sub.add_parser("iterate", help="agent-mode: recompile existing scratch with new source")
    sp.add_argument("slug")
    sp.add_argument("source_file")
    sp.add_argument("--context-file")
    sp.set_defaults(_handler=cmd_iterate)

    sp = sub.add_parser("batch", help="run queue for one subsystem serially")
    sp.add_argument("subsystem")
    sp.add_argument("--max", type=int)
    sp.set_defaults(_handler=cmd_batch)

    sp = sub.add_parser("stats", help="token + cost summary from log.jsonl")
    sp.set_defaults(_handler=cmd_stats)

    args = p.parse_args(argv)
    return args._handler(args)


if __name__ == "__main__":
    sys.exit(main())
