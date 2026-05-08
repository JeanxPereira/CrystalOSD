---
name: decomp-loop
description: Agent-driven decomp loop. Match a function using Claude Code as the LLM (no API key burn). Wraps the orchestrator in agent mode.
---

# /decomp-loop <func_name>

Match a single OSDSYS function to byte-perfect C, with **YOU** (Claude Code) as the LLM in the loop. The orchestrator handles ASM extraction, decomp.me submit/iterate, and scoring; you write and refine the C.

## Prereqs

- `.orchestrator/config.yml` has `worker.provider: agent` (no LLM API call from orchestrator)
- `python3 -m tools.orchestrator queue build` has been run

## Steps to perform

### 1. Build the brief
```bash
python3 -m tools.orchestrator plan <func> --save
```
Reads `.orchestrator/briefs/<func>.json`. Has: target ASM, system_prompt (worker rules + ee-gcc quirks), user_prompt scaffold, flags (MMI/MULT1/COP2 warnings).

### 2. Optional: enrich context
- **Ghidra decompile** via `mcp__ghidra-mcp__decompile_function` — save to `/tmp/<func>.ghidra.c`, then re-plan with `--ghidra-pseudo /tmp/<func>.ghidra.c`.
- **Similar funcs** via `mcp__decomp-me-mcp__decomp_search_context` — save list as JSON `[{"name":...,"asm":...,"c_source":...}]` to `/tmp/<func>.similar.json`, then re-plan with `--similar-json`.

### 3. Write C
Write your reconstruction to `src/stubs/<subsystem>/<func>.c`. Apply the rules from the brief's `system_prompt` (PS2SDK types, ee-gcc 2.9 quirks).

### 4. Submit to decomp.me
```bash
python3 -m tools.orchestrator submit <func> src/stubs/<sub>/<func>.c
```
Returns JSON: `{"slug": "...", "url": "...", "score": N, "max_score": M, "match": bool}`. **Save the slug.**

### 5. Iterate (if score > 0)
- Read the slug's diff at `https://decomp.me/scratch/<slug>` (or via `mcp__decomp-me-mcp__decomp_get_scratch`)
- Edit `src/stubs/<sub>/<func>.c` based on the diff
- Re-submit:
```bash
python3 -m tools.orchestrator iterate <slug> src/stubs/<sub>/<func>.c
```
- Repeat until `match: true` or 5 attempts exhausted

### 6. Stop conditions
- **SOLVED**: score == 0 → tell user the URL, suggest manual promote (`mv src/stubs/<sub>/<func>.c src/<sub>/`, splat config update, `make verify`)
- **SYMBOL_ONLY**: score ≤ 15 → effectively matched, same promote step
- **STUCK**: same score 3 iterations in a row → run `./tools/permuter_import.sh <func> src/stubs/<sub>/<func>.c` and tell user the function needs brute-force permutation
- **EXHAUSTED**: 5 attempts without improvement → save best-effort C, log to `.orchestrator/ask_human/<func>.c`, ask user for hints

## Switch back to API mode

Edit `.orchestrator/config.yml`:
```yaml
worker:
  provider: claude       # or deepseek, gemini
  model: claude-sonnet-4-6
```

Then use the original `/decomp <func>` command which calls the LLM directly.

## Why this exists

Free-tier Gemini/DeepSeek hit RPM caps fast on serial batches. Running through Claude Code instead means:
- No new API key needed
- Uses existing Claude Code session quota
- Can manually steer when stuck (you the human can intervene mid-loop)
- Antigravity / Cursor / any other code agent works the same way

## Quick reference
```bash
python3 -m tools.orchestrator plan <func> --save           # build brief
python3 -m tools.orchestrator submit <func> <c>            # new scratch
python3 -m tools.orchestrator iterate <slug> <c>           # recompile
python3 -m tools.orchestrator queue show --top 20          # pick next target
```
