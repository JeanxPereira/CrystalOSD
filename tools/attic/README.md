# tools/attic — Archived Tools

These tools are **archived, not deleted**. They are kept for historical reference but are no longer part of the active decomp workflow.

## orchestrator/

LLM-API-driven decomp match pipeline. Submitted functions to decomp.me via API, polled for score improvements, and iterated automatically using LLM-generated patches.

**Superseded by**: The Claude-Code-driven objdiff loop (`/decomp-loop` skill + `tools/generate_objdiff.py`). The new approach runs entirely within the Claude Code session — no API keys burned, no external service polling, and the matching loop is interactive rather than autonomous.

## extract_functions.py

Legacy `texttmp.s` splitter. Read a monolithic MIPS assembly dump and split it into per-function `.s` files.

**Superseded by**: splat per-function output. The splat split pipeline (`make split` / `configure.py`) already emits one `.s` file per function under `asm/`, making this splitter redundant.

---

**Revisit only if the primary objdiff loop proves insufficient.**
