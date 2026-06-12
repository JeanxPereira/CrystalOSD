# CrystalOSD Reorganization Plan — "Foundation First"

> **Date:** 2026-06-12
> **Status:** Draft — awaiting review
> **Approach:** A (Foundation first) — environment → compiler → tooling/metric/reframe → AI port loop
> **Trigger:** decomp.dev Discord feedback (2026-05-10) + accumulated tooling sprawl

---

## 1. Diagnosis (what "the mess" actually is)

The project is in better shape than it feels — the ELF rebuild is byte-perfect and CI
already uses the correct matching compiler. The mess is **inconsistency**, not breakage:

| # | Problem | Evidence |
|---|---------|----------|
| 1 | **Compiler story contradicts itself in 3 places** | `Makefile` compiles C with ps2dev GCC 15.2 (`CC`, `MATCH_CC ?= $(CC)`); `decomp.yaml` (transmuter) also uses GCC 15.2 with a comment admitting it won't match; only decomp.me and **CI** use the real matching compiler (ee-gcc 2.9-991111, `-O2 -G0`). Discord (Ethanol) flagged this directly. |
| 2 | **Toolchain paths hardcoded to a dead environment** | `/Users/jeanxpereira/ps2dev/` (macOS Hackintosh) baked into Makefile docs, `decomp.yaml`, `tools/README.md`, CLAUDE.md, permuter `compile.sh`. Current machine is Windows (`C:\`, user `dell04`). Nothing tooling-side runs locally today. |
| 3 | **Five overlapping match tools, no golden path** | `orchestrator/`, `decomp_match.py`, `transmuter/`, `permuter/` + `decomp-permuter/`. Three of them overlap. Submodules uninitialized locally; no local ee-gcc; no m2c. |
| 4 | **Progress metric is polluted** | decomp.dev graph counts non-code as "code to decompile": 1,448 `align_*` (zero padding), 902 `gap_*` (unclassified bytes — some real data, some padding), 17 `j_*` thunks, 9 mislabeled `pad_*` symbols that are real functions (e.g. `pad_sound_handler_thread_proc`, 0x480 bytes). Makes 0.56% look worse and the graph look broken. |
| 5 | **Project framing is stale** | README/docs still imply a future desktop port (dropped after Discord feedback); decomp.dev shields mapped to DOL/REL (GameCube concepts, meaningless for PS2). |

**Goal (re-confirmed):** byte-identical OSDSYS ELF, rebuilt from C, with an
AI-assisted per-function port loop that is *easy to run*. SDK library matching is a
welcome side effect (useful to other PS2 decomps). **Non-goal:** desktop port (dropped).

---

## 2. Target end-state

- **One environment:** WSL2 (Ubuntu) on the Windows machine. All tooling paths relative
  to repo root or `$PS2DEV`/`$MATCH_CC` env vars — zero absolute user-home paths in the repo.
- **One compiler truth:** ee-gcc 2.9-991111 (`-O2 -G0`) compiles **all C**. Modern
  ps2dev binutils used **only** as assembler + linker (GAS for `.s`, `ld` for the link)
  — that part already produces byte-perfect output and stays.
- **One golden path** for porting a function, with two named fallbacks:
  1. **Primary:** objdiff loop — write C → `make all`-style target/base compile → objdiff compare (all offline in WSL).
  2. **Fallback 1:** decomp-permuter for last-mile brute force.
  3. **Fallback 2:** decomp.me scratch (via `decomp_match.py`) when collaboration/sharing helps.
  - Transmuter survives only as a stub cleaner (Ghidra noise → readable C), explicitly *not* a matcher.
  - Orchestrator: archived (see Phase 3 decision).
- **Honest metric:** decomp.dev report counts only real functions; padding/aligns excluded;
  gaps resolved into data sections; mislabeled symbols renamed.
- **Docs match reality:** README/CLAUDE.md state the byte-perfect + SDK-research goal,
  document the WSL setup, and describe exactly one workflow.

**Invariant for every phase:** `make verify` (or `make sha1` when the original ELF
isn't on disk) must still report byte-perfect after each merged change.

---

## 3. Phases

### Phase 0 — Reframe (docs only, zero build risk)
*Can land immediately, independent of everything else.*

- README.md: drop desktop-port aspiration; state goals = byte-identical ELF + research
  value (SDK libs for other PS2 decomps).
- Fix decomp.dev shields: remove/replace DOL/REL badges with overall-progress only
  (per Ethanol: "just the overall progress is enough").
- CLAUDE.md: mark desktop port as explicitly out of scope.
- Rename the 9 mislabeled `pad_*` function symbols in `symbol_addrs.txt` to honest names
  (`pad_handler_*` ones that are real pad-input handlers keep meaningful names; the
  point is none should *look like* padding). Requires `make split` + `make verify` after.

**Deliverable:** docs/README consistent with the actual goal; no misleading symbols.

### Phase 1 — Environment: WSL2 migration
*Prerequisite for everything that compiles.*

1. Set up WSL2 Ubuntu: `build-essential`, `python3`, `pip` (splat 0.40.0, spimdisasm 1.40.2
   per `requirements_splat.txt`), node (for transmuter), `git submodule update --init`.
2. Install toolchains inside WSL:
   - ps2dev binutils/gcc (Linux release artifact) → `$HOME/ps2dev/` — assembler/linker role.
   - ee-gcc 2.9-991111 from decompme/compilers (native Linux ELF — runs directly, no QEMU)
     → `$HOME/ee-gcc2.9-991111/`.
   - PS2SDK headers (release artifact, as CI does) → `$PS2DEV/ps2sdk`.
3. Repo de-hardcoding: replace every `/Users/jeanxpereira/...` with env vars
   (`$PS2DEV`, `$MATCH_CC`) or repo-relative paths. Files affected: `Makefile` comments,
   `decomp.yaml`, `tools/README.md`, `tools/permuter/compile.sh`, `permuter_import.sh`,
   CLAUDE.md, PS2_PROJECT_STATE.md. Add a checked-in `env.example.sh` (sourceable) documenting
   the required exports.
4. Acceptance gate: inside WSL, `python3 configure.py -c && make -j elf && make verify`
   → byte-perfect. This re-validates the whole splat→asm→link pipeline on Linux.

**Deliverable:** clean checkout + documented setup script = green `make verify` in WSL.

### Phase 2 — Single compiler truth
*The fix Ethanol called out.*

1. Makefile: `MATCH_CC` becomes **required** for any C compile (no more `?= $(CC)`
   silent fallback — fail loudly with install instructions if unset). All `src/**.c`
   rules (`build/src/%.c.o`, `$(BASE_DIR)/%.o`) switch from `$(CC)` to `$(MATCH_CC)`
   with the confirmed flags (`-O2 -G0` + EE defines/includes).
   GCC 15.2 keeps only `AS`/`LD`/`OBJCOPY` duties.
2. `decomp.yaml` (transmuter): point at `$MATCH_CC` instead of GCC 15.2; delete the
   "results will NOT match" apology comment because it becomes false.
3. Align CI and local: local WSL build now mirrors what `progress.yml` already does
   (CI already downloads ee-gcc 2.9 — local catches up to CI, not the other way).
4. Acceptance gate: pick one already-matched function (e.g. `do_read_cdvd_config_entry`
   or `draw_menu_item`), compile locally with `MATCH_CC`, confirm objdiff reports a match
   **offline** — first time this is possible without decomp.me.
5. Stretch (explicitly optional, separate decision): link one matched C object into the
   ELF in place of its `.s` and keep `make verify` green. This proves the
   C-replaces-asm pipeline end-to-end but touches splat subsegments — do not block
   Phase 3 on it.

**Deliverable:** one compiler story everywhere; offline match proven on a known-good function.

### Phase 3 — Tooling consolidation
*Reduce five tools to one path + two fallbacks.*

Keep / demote / archive:

| Tool | Verdict | Rationale |
|------|---------|-----------|
| objdiff + Makefile target/base | **Primary loop** | Offline, fast, already wired into CI report |
| `decomp-permuter/` + `tools/permuter/` | **Fallback 1** | Last-mile brute force; needs ee-gcc which Phase 1–2 provide |
| `decomp_match.py` (decomp.me API) | **Fallback 2** | Sharing/collab; no longer the daily driver |
| `transmuter/` | **Demote to stub cleaner** | Useful for Ghidra-noise cleanup; never advertised as a matcher again |
| `tools/orchestrator/` | **Archive** → `tools/attic/` | LLM-API-driven pipeline superseded by Claude-Code-driven loop (no API key burn); revisit only if needed |
| `extract_functions.py` | **Archive** → `tools/attic/` | Already marked legacy |

Also: rewrite `tools/README.md` around the single golden path; update the
`decomp-loop`/`decomp-agent` skills to match (they currently wrap the orchestrator).

**Deliverable:** `tools/` where every file has exactly one purpose; one documented loop.

### Phase 4 — Honest metric
*Fix what the decomp.dev graph shows.*

1. **Exclude padding from the denominator:** configure the objdiff report so
   `align_*` files (1,448) and pure-padding `gap_*` are not counted as matchable code
   (objdiff report categories / `report.json` filtering in `progress.yml`, plus
   `generate_objdiff.py` if needed).
2. **Triage `gap_*` (902):** classify each gap region — real `.rodata`/`.data` →
   promote to proper sections in `splat_config.yml`; literal inter-function padding →
   mark as such. This is incremental work; the plan only commits to the *mechanism*
   plus a first pass over the largest gaps. Every splat change re-gated by `make verify`.
3. **Thunks (`j_*`, 17):** keep as functions (they're real 8-byte tail-calls) but mark
   matched trivially — a thunk's C is one call; they should be free wins, not noise.
4. Re-upload report; sanity-check the decomp.dev graph visually.

**Deliverable:** decomp.dev graph reflects actual code; progress % is honest (it will
*go up* just from de-noising).

### Phase 5 — AI port loop (the "portar fácil" payoff)
*Only after 1–4: a repeatable, boring, documented loop.*

Golden path per function (driven from Claude Code in WSL, no LLM API keys):

```
1. pick target        → progress.py / objdiff report (smallest unmatched real funcs first)
2. analyze            → ghidra-mcp decompile + reference/COMPILER_QUIRKS.md
3. write C            → src/<subsystem>/<file>.c  (+ Ghidra address comment)
4. compile + diff     → make base/target + objdiff  (offline, MATCH_CC)
5. iterate            → manual ↔ decomp-permuter fallback
6. integrate          → splat subsegment: c instead of asm → make elf && make verify
7. commit             → decomp(<scope>): match <func>
```

- Document this as the **only** workflow in CLAUDE.md (replacing the three currently
  described ones) and in the `decomp` skill.
- Batch dimension: `BatchExportToC.java` → `src/stubs/` → transmuter cleanup stays as
  the *bulk pre-processing* feeder for step 3, unchanged in role.
- Acceptance gate: port 3 new functions end-to-end through the loop, including step 6
  (C object linked into the byte-perfect ELF), without touching decomp.me.

**Deliverable:** a loop a contributor (human or AI) can run from a fresh WSL clone in
under 30 minutes of setup.

---

## 4. Sequencing & dependencies

```
Phase 0 (docs)          — independent, land first
Phase 1 (WSL)           — blocks 2,3,4,5
Phase 2 (compiler)      — blocks 3,5; needs 1
Phase 3 (tooling)       — needs 2
Phase 4 (metric)        — needs 1 (for make verify gating); parallel with 3
Phase 5 (AI loop)       — needs 2,3; 4 desirable but not blocking
```

## 5. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| WSL rebuild not byte-perfect (host toolchain differences) | Phase 1 gate is exactly this check, before anything else changes; CI (ubuntu) already proves Linux can do it |
| ee-gcc 2.9 artifact needs 32-bit libs | CI already solves this (`libc6:i386`); copy that recipe into setup docs |
| `gap_*` triage destabilizes splat layout | Every splat change individually gated by `make verify`; circuit-breaker rule applies |
| Archiving orchestrator loses work | Move to `tools/attic/`, never delete; git history keeps everything |
| Linking first C object breaks byte-perfect (Phase 2 stretch) | Marked optional/stretch; known-risky subsegment work isolated from the phase gate |

## 6. Out of scope

- Desktop port (dropped permanently per 2026-05-10 Discord discussion).
- PSX/PSP XMB research (fun, but "one thing at a time" — Ethanol).
- Re-dumping a fresh OSDSYS from BIOS.
- Full `gap_*` resolution (Phase 4 commits to mechanism + first pass only).
- macOS environment maintenance (Hackintosh paths removed, not dual-maintained).
