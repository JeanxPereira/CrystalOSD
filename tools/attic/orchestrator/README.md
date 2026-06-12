# orchestrator — LLM-driven decomp pipeline

PLANNER → WORKER → JUDGE loop for matching MIPS R5900 functions on decomp.me.
Pluggable LLM backend (Claude, DeepSeek, OpenAI, Gemini, local llama.cpp).

## Two operating modes

### API mode (default)
Orchestrator calls an LLM API directly (Claude / DeepSeek / Gemini / OpenAI / local). Burns API quota.

### Agent mode (free, recommended for free-tier users)
Orchestrator only handles ASM/decomp.me/scoring; **the IDE agent (Claude Code, Antigravity, Cursor) writes the C**. No API key burn. Subcommands:

```bash
python3 -m tools.orchestrator plan <func> --save           # build brief, no LLM call
python3 -m tools.orchestrator submit <func> <c_file>       # create decomp.me scratch
python3 -m tools.orchestrator iterate <slug> <c_file>      # recompile with new source
```

Activate by setting `worker.provider: agent` in `.orchestrator/config.yml`. Drive the loop from the `/decomp-loop <func>` slash command (Claude Code) or call the subcommands directly from any agent shell.

## Architecture

```
queue.json (complexity-ranked targets)
        │
        ▼
   PLANNER (LLM)        builds context pack: target ASM, Ghidra pseudocode,
        │               5 similar matched funcs, ee-gcc quirks → starting C
        ▼
   WORKER (LLM, loop)   writes C → tools/decomp_match.py iterate →
        │               receives score+diff → judge → retry/stop
        ▼
   JUDGE (regex)        SOLVED | SYMBOL_ONLY | CLOSE | PROGRESSING | STUCK
        │
        ▼
   on SOLVED   → src/stubs/<sub>/<func>.c (manual promote to src/<sub>/)
   on STUCK    → permuter_fallback → tools/decomp-permuter + .orchestrator/ask_human/
   on EXHAUST  → log + flag for human
```

Worker output is byte-perfect-or-near against the binary. Match rate target ~74% (per macabeus 60-function benchmark with Claude Sonnet 4.6 + RAG context).

## Files

| File | Purpose |
|------|---------|
| `__main__.py` | Entry point for `python3 -m tools.orchestrator <cmd>` |
| `orchestrator.py` | CLI dispatcher: `init`, `providers`, `queue`, `decomp`, `batch`, `stats` |
| `config.py` | YAML loader with mini parser (no PyYAML dependency); deep-merge defaults |
| `llm.py` | `ClaudeProvider` + `OpenAICompatProvider` + `build_with_fallback()` |
| `easy_funcs.py` | Complexity ranker — parses `symbol_addrs.txt` + `asm/`, flags MMI/MULT1/COP2 |
| `planner.py` | Calls planner LLM; produces JSON context pack |
| `worker.py` | Iterate loop — submits to decomp.me, feeds diffs back to LLM, retries |
| `judge.py` | Pure regex/heuristic verdict classifier (no LLM) |
| `permuter_fallback.py` | On STUCK → invokes `tools/permuter_import.sh` + queues for human |
| `prompts/planner.md` | System prompt for planner |
| `prompts/worker.md` | System prompt for worker (ee-gcc 2.9 quirks baked in) |
| `prompts/worker_quirks.md` | Symlink → `reference/COMPILER_QUIRKS.md` |

## CLI

```bash
# initialize default config
python3 -m tools.orchestrator init

# verify provider connectivity
python3 -m tools.orchestrator providers test

# build / refresh complexity-sorted queue
python3 -m tools.orchestrator queue build [--subsystem graph] [--limit N]

# inspect queue
python3 -m tools.orchestrator queue show [--top 20]

# match a single function
python3 -m tools.orchestrator decomp <func_name> \
    [--ghidra-pseudo path/to/ghidra.c] \
    [--similar-json path/to/similar.json]

# batch a subsystem (serial)
python3 -m tools.orchestrator batch <subsystem> [--max N]

# token + cost summary from log.jsonl
python3 -m tools.orchestrator stats
```

## Configuration

`.orchestrator/config.yml` (committed, edit to swap providers):

```yaml
planner:
  provider: deepseek         # claude | deepseek | openai | gemini | local
  model: deepseek-chat

worker:
  provider: claude
  model: claude-sonnet-4-6
  fallback:                  # auto-failover on rate-limit/timeout
    provider: deepseek
    model: deepseek-reasoner
  max_iterations: 8
  stuck_threshold: 3         # same-score iters before STUCK verdict

judge:
  symbol_only_threshold: 15  # score ≤ this counts as effectively matched
  close_threshold: 100

embeddings:
  provider: mcp              # uses mcp__decomp-me-mcp__decomp_search_context
  top_k: 5

paths:
  queue: .orchestrator/queue.json
  log: .orchestrator/log.jsonl
  takeaways: .orchestrator/takeaways.md
  ask_human: .orchestrator/ask_human
  stubs_dir: src/stubs
```

## Required environment

```bash
# pick at least one
export ANTHROPIC_API_KEY=sk-ant-...
export DEEPSEEK_API_KEY=sk-...                     # platform.deepseek.com
export OPENAI_API_KEY=sk-...                       # optional
export GEMINI_API_KEY=...                          # optional
```

## Provider matrix

| Provider | Models | API key env | Setup |
|----------|--------|-------------|-------|
| `claude` | `claude-sonnet-4-6`, `claude-opus-4-7`, `claude-haiku-4-5` | `ANTHROPIC_API_KEY` | https://console.anthropic.com |
| `deepseek` | `deepseek-chat`, `deepseek-reasoner` | `DEEPSEEK_API_KEY` | https://platform.deepseek.com |
| `openai` | `gpt-4o`, `gpt-4o-mini`, ... | `OPENAI_API_KEY` | https://platform.openai.com |
| `gemini` | `gemini-2.5-pro`, `gemini-2.5-flash` | `GEMINI_API_KEY` | OpenAI-compat endpoint |
| `local` | any GGUF served by llama.cpp/Ollama on :8080 | none | `llama-server -m model.gguf -c 8192 --port 8080` |

To swap, edit `.orchestrator/config.yml` and re-run. No code change.

## Complexity ranking

`easy_funcs.py` scores functions by:

```
score = instructions
      + branches × 2
      + calls × 1
      + 100 if any MMI op (PMADDH, PADDW, ...)
      + 200 if any MULT1 op (mult1, madd1, ...)
      + 500 if any COP2 op (VU0 macromode)
```

Lower = easier. MMI/MULT1/COP2 functions are flagged because they cannot be emitted from plain C with ee-gcc 2.9-991111 — they need inline asm or are inherently non-matchable.

## Iteration loop

```
write src/stubs/<sub>/<func>.c
  ↓
decomp_match.py submit → slug + score
  ↓
worker LLM rewrite ← previous C + diff/error
  ↓
decomp_match.py iterate (slug, new C) → new score
  ↓
judge.classify → verdict
  ↓
SOLVED      → return
SYMBOL_ONLY → return (effective match, score ≤ 15)
PROGRESSING → loop
STUCK       → permuter_fallback (3 iters at same score)
```

Max 8 iterations by default. Empirically (macabeus 60-func bench), ~50% of matches happen on first attempt with good context, so most loops are short.

## Outputs

| Artifact | Location | Purpose |
|----------|----------|---------|
| Source stub | `src/stubs/<sub>/<func>.c` | Result of last iteration |
| Context header | `src/stubs/<sub>/<func>.ctx.h` | Extra externs/typedefs (when planner emits) |
| Telemetry | `.orchestrator/log.jsonl` | One line per iteration: tokens, latency, verdict |
| Takeaways | `.orchestrator/takeaways.md` | Append-only log of completed funcs |
| Stuck queue | `.orchestrator/ask_human/<func>.json` + `.c` | Funcs needing manual attention |

## Promotion (manual)

After a SOLVED/SYMBOL_ONLY verdict:

1. Review `src/stubs/<sub>/<func>.c` for style + correctness.
2. Move to `src/<sub>/<func>.c` (or merge into existing file).
3. Update `splat_config.yml` subsegment from `asm` → `c`.
4. Run `python3 configure.py -c && make -j16 elf && make verify`.
5. Commit with `decomp(<sub>): match <func>`.

Auto-promote is intentionally not done — every match deserves a human eyeball before it lands in `src/`.

## Limits / non-goals (v1)

- **Serial only** — one function at a time. Parallelism is v2 work.
- **Manual Ghidra context** — pass `--ghidra-pseudo path/to/file.c` per call. Auto-fetch via `mcp__ghidra-mcp__decompile_function` happens in Claude Code, not in this CLI.
- **Manual similar-funcs RAG** — pass `--similar-json` from `mcp__decomp-me-mcp__decomp_search_context` output. Auto-query is v2.
- **MMI / MULT1 / COP2** — flagged but not solved. Worker will warn; expect ~12% hard-fail rate on those.

## Cost ballpark

For one function, ~30K input tokens and ~3K output per iteration, ~4 iterations average with RAG context.

| Worker model | Cost / function | Full project (1,578 remaining) |
|--------------|-----------------|--------------------------------|
| `claude-sonnet-4-6` | ~$1.80 | ~$2,800 |
| `deepseek-reasoner` | ~$0.30 | ~$470 |
| `gpt-4o-mini` | ~$0.10 | ~$160 (lower match rate) |

`deepseek-reasoner` fallback catches Claude rate-limit overflow without burning the plan quota.

## Future Mac swap (Apple Silicon)

When local LLM inference becomes viable:

```bash
brew install llama.cpp
# pull a coder model
huggingface-cli download Qwen/Qwen2.5-Coder-7B-Instruct-GGUF \
    qwen2.5-coder-7b-instruct-q5_k_m.gguf
llama-server -m qwen2.5-coder-7b-instruct-q5_k_m.gguf \
    -c 8192 --port 8080
```

Then edit `.orchestrator/config.yml`:

```yaml
worker:
  provider: local
  model: qwen2.5-coder-7b-instruct-q5_k_m
```

Same code, no changes.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `DEEPSEEK_API_KEY not set` | env var missing | `export DEEPSEEK_API_KEY=...` |
| `function 'X' not found in symbol_addrs.txt` | typo or unsplatted | check `symbol_addrs.txt`; rebuild queue |
| `non-JSON output` from planner | LLM returned prose | retune `prompts/planner.md`, lower temperature |
| `score=0` but build fails | scratch context omits a real extern | add to `tools/decomp_match.py` `DEFAULT_CONTEXT` or pass `--context-file` |
| Stuck on simple function | wrong starting C, planner mis-typed | inspect `src/stubs/<sub>/<func>.c`, edit, re-run |
| `STUCK` on every function | rate-limit hit before fallback kicked in | check `log.jsonl` latency; increase fallback aggressiveness |
