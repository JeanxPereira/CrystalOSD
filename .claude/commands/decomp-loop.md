---
name: decomp-loop
description: Agent-driven decomp loop. Match a single OSDSYS function to byte-perfect C using the objdiff golden path. Fully offline — no API key burn.
---

# /decomp-loop <func_name>

Match a single OSDSYS function to byte-perfect C using the **objdiff golden path**.
The orchestrator is archived in `tools/attic/` — do not invoke it.

## Prereqs

- `MATCH_CC` points to `ee-gcc2.9-991111` (the matching compiler)
- `$PS2DEV`, `$PS2SDK` exported
- `objdiff` binary on `$PATH`
- `python3 tools/generate_objdiff.py` has been run at least once to produce `objdiff.json`

## Steps

### 1. Pick target and locate ASM

Confirm the function exists in `asm/<subsystem>/<func>.s` (unmatched splat output).
If not found, check `symbol_addrs.txt` for the address and subsystem.

### 2. Analyze in Ghidra

Call `mcp__ghidra__decompile_function` with `name=<func>`.
Note: subsystem, address, control flow, called functions, data types.
Cross-reference with PS2SDK (`/crossref`) for known API usage.

### 3. Write C reconstruction

Path: `src/<subsystem>/<func>.c`

Rules — strict adherence:
- Compiler target: `ee-gcc2.9-991111`, flags `-O2 -G0`
- PS2SDK types only (`u8`/`u16`/`u32`/`s8`/`s16`/`s32`/`u64`/`s64`); never `stdint.h`
- C99; `/* */` comments only
- Line above every function definition: `/* 0x<ADDRESS> - <FUNC> */`
- Match every branch and call exactly; no invented code paths
- See `reference/COMPILER_QUIRKS.md` for ee-gcc 2.9 delay-slot / mask / bitfield rules

### 4. Build target + base .o

```bash
make all
```

This builds:
- `build/target/<sub>/<func>.o` — assembled from `asm/<sub>/<func>.s`
- `build/base/<sub>/<func>.o` — compiled from `src/<sub>/<func>.c` via `$MATCH_CC`

### 5. Compare with objdiff

Open objdiff and navigate to `<func>`. Read the diff:
- Instruction order differences → reorder local declarations or statements
- Register allocation differences → adjust variable types or declaration order
- Mask form (`li` vs `lui+ori`) → use negative masks `((s32)var & -7)`
- Branch direction → check signed vs unsigned comparisons
- Extra/missing `nop` in delay slot → review `reference/COMPILER_QUIRKS.md`

### 6. Iterate

Edit `src/<sub>/<func>.c`, re-run `make all`, re-check objdiff. Repeat until diff is zero.

**Stop conditions during iteration:**
- **SOLVED**: diff is zero → proceed to step 7
- **STUCK** (same diff after 3 targeted edits): switch to Fallback 1 (decomp-permuter)
- **MMI/MULT1/COP2 instructions in target**: these are not C-emittable — use inline asm, then verify

### 7. Fallback 1 — decomp-permuter (if stuck)

```bash
./tools/permuter_import.sh <func> src/<sub>/<func>.c
cd tools/decomp-permuter && python3 ./permuter.py nonmatchings/<func> -j8
```

When permuter finds a match, copy the winning source back to `src/<sub>/<func>.c`.

### 8. Promote into build

Once the objdiff diff is zero:

1. Flip the splat subsegment in `splat_config.yml` from type `asm` to `c` for `<func>`
2. Run the full build:
   ```bash
   python3 configure.py -c && make -j16 elf && make verify
   ```
   Must report byte-perfect match. If `make verify` fails, revert `splat_config.yml` and investigate.

### 9. Commit

```bash
git add src/<sub>/<func>.c splat_config.yml
git commit -m "decomp(<sub>): match <func>"
```

---

## Fallback 2 — decomp.me (community sharing)

If you want to share progress or get a hosted scratch for collaboration:

```bash
python3 tools/decomp_match.py submit <func> asm/<sub>/<func>.s src/<sub>/<func>.c
python3 tools/decomp_match.py iterate <slug> src/<sub>/<func>.c
```

This is not required for local byte-perfect matching — it is supplementary.

---

## Quick reference

```bash
make all                                              # build target + base .o
python3 tools/generate_objdiff.py                     # regenerate objdiff.json
./tools/permuter_import.sh <func> src/<sub>/<func>.c  # import into permuter
cd tools/decomp-permuter && python3 ./permuter.py nonmatchings/<func> -j8
python3 configure.py -c && make -j16 elf && make verify
```

## Note on archived orchestrator

The former `tools/orchestrator/` (LLM-driven PLANNER/WORKER/JUDGE pipeline) is archived in
`tools/attic/orchestrator/`. The objdiff golden path above replaces it entirely.
Do not invoke `python3 -m tools.orchestrator` — that module no longer exists at the live path.
