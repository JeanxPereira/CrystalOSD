# tools/

Scripts and subprojects supporting the CrystalOSD decomp workflow.

## Layout

```
tools/
├── orchestrator/           LLM-driven match pipeline (PLANNER/WORKER/JUDGE)
├── decomp-permuter/        submodule — brute-force C permutation matcher
├── permuter/               compile.sh wrapper invoked by decomp-permuter
├── transmuter/             vendored npm package — automated stub cleaner
│
├── decomp_match.py         decomp.me API client (submit/iterate/extract)
├── decomp_results.json     persistent state for decomp.me scratches
├── extract_functions.py    legacy — splits texttmp.s into per-function .s files
├── split_functions.py      generates per-function splat subsegments
├── generate_objdiff.py     emits objdiff.json from current C files
├── progress.py             scans src/ + symbol_addrs.txt → progress report
├── verify_elf.py           deep ELF compare (sections, headers, byte-diff)
├── patch_stubs.py          Ghidra-stub cleanup helper
├── permuter_import.sh      import a function into decomp-permuter
├── run_batch_transmuter.sh batch-run transmuter over src/stubs/<subsystem>/
├── test_api.py             one-shot decomp.me API smoke test
├── commit_organizer.py     plan + create atomic Conventional Commits
│
├── discover_core.json      per-subsystem function manifest (core)
└── graph_manifest.json     per-subsystem function manifest (graph)
```

## Tools by purpose

### Decomp pipeline
| Tool | What it does |
|------|--------------|
| **`orchestrator/`** | Full LLM-driven match pipeline. See `orchestrator/README.md`. |
| `decomp_match.py` | Direct decomp.me API client — `submit`, `iterate`, `extract`, `discover`. Foundation for the orchestrator. |
| `permuter_import.sh` | Imports `<func> + <src>` → `decomp-permuter/nonmatchings/<func>/`. |
| `decomp-permuter/` | Submodule. `python3 ./permuter.py nonmatchings/<func> -j8` brute-forces matches. |
| `transmuter/` | Vendored npm package; see CLAUDE.md "Transmuter" section. |
| `run_batch_transmuter.sh` | Batch-cleans Ghidra stubs in `src/stubs/<sub>/`. |

### Build / verify
| Tool | What it does |
|------|--------------|
| `split_functions.py` | Reads `symbol_addrs.txt`, emits per-function splat subsegments into `splat_config.yml`. |
| `generate_objdiff.py` | Builds `objdiff.json` from current `src/` + `asm/` layout. |
| `verify_elf.py` | Compares `build/OSDSYS.elf` vs original — section layout, headers, first byte differing. |
| `progress.py` | Per-subsystem decomp progress report; supports `--json`, `--markdown`, `--crossref`. |
| `commit_organizer.py` | Scans the working tree, groups changes by Conventional Commit (`type(scope)`), proposes one atomic commit per group. Modes: preview (default), `--interactive`, `--commit`, `--dry-run`. Follows the convention defined in `CLAUDE.md`. |

### Misc / one-shots
| Tool | What it does |
|------|--------------|
| `extract_functions.py` | Legacy helper that splits old `texttmp.s` (kept for reference; mostly superseded by splat per-function output). |
| `patch_stubs.py` | Touches up Ghidra-emitted stubs (e.g. variable renames). |
| `test_api.py` | Minimal decomp.me API request — useful when diagnosing CF/header issues. |
| `discover_core.json`, `graph_manifest.json` | Static manifests of which functions belong to which subsystem. |

## Common commands

```bash
# rank remaining functions by complexity, run LLM match on easiest
python3 -m tools.orchestrator queue build
python3 -m tools.orchestrator queue show --top 20
python3 -m tools.orchestrator decomp <func>

# raw decomp.me submission (no LLM)
python3 tools/decomp_match.py submit <func> asm/<sub>/<func>.s src/<sub>/<func>.c
python3 tools/decomp_match.py iterate <slug> src/<sub>/<func>.c

# brute-force search when LLM gives up
./tools/permuter_import.sh <func> src/<sub>/<func>.c
cd tools/decomp-permuter && python3 ./permuter.py nonmatchings/<func> -j8

# progress
python3 tools/progress.py
python3 tools/progress.py --markdown

# build + verify
python3 configure.py -c && make -j16 elf && make verify
```

## Dependencies

| Tool | Requires |
|------|----------|
| `orchestrator/` | python3 (stdlib only); LLM API key for at least one provider |
| `decomp_match.py` | python3 (stdlib only); internet |
| `decomp-permuter/` | python3, ee-gcc toolchain at `/Users/jeanxpereira/ps2dev/ee/bin/` |
| `transmuter/` | node.js (vendored package, no global install) |
| `verify_elf.py` | python3; both ELFs on disk |
| `permuter_import.sh` | bash, ee-gcc `as`, source ELF artifacts |

## Notes

- The orchestrator is the recommended entry point for new function matches. `decomp_match.py` is the lower-level layer it sits on; both are useful.
- `decomp-permuter` is the fallback for STUCK functions where the LLM cannot find the exact compiler-quirk-correct C source.
- `transmuter` cleans `uVar1` / `puVar2` Ghidra noise into idiomatic C, but does NOT match against ASM. Pair it with `decomp_match.py` or the orchestrator for matching.
- All scripts run from the project root (`/Users/jeanxpereira/CodingProjects/CrystalOSD/`); they use absolute paths for the toolchain (`/Users/jeanxpereira/ps2dev/ee/bin/...`).
