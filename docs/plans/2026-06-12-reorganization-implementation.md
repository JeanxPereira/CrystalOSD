# CrystalOSD Reorganization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put CrystalOSD "on rails" — one environment (WSL2), one compiler truth (ee-gcc 2.9-991111), one decomp loop — and reframe the project around byte-perfect ELF + a sequenced desktop north star, without ever losing the byte-perfect rebuild.

**Architecture:** Six phases, foundation-first. Each phase is gated by `make verify` (byte-perfect) or `make sha1` when the original ELF isn't on disk. Mechanical/gated phases (0, 1, 3) are safe for Sonnet subagents; build-infra-fragile and matching-judgment phases (2, 4, 5) stay on Opus. Every code change either keeps the ELF byte-identical or fails the gate — that deterministic oracle is what makes cheap subagents safe.

**Tech Stack:** WSL2 Ubuntu, splat 0.40.0 + spimdisasm 1.40.2 (Python), ps2dev binutils 2.45 (assembler/linker only), ee-gcc 2.9-991111 (`-O2 -G0`, all C), objdiff, decomp-permuter, GNU make.

**Worker model legend:** `[sonnet]` = safe for a Sonnet subagent (mechanical + objective gate). `[opus]` = keep on Opus (build-infra fragility or compiler-quirk judgment). Every task ends with a verification gate; no commit without a green gate.

**Ground truth confirmed (2026-06-12 audit):** build guardrails in CLAUDE.md are accurate (subalign 4, ld_bss_is_noload False, `-G 0`, gp 0x377970, configure.py module_storage→`.main_modstor`@0x50A780, ALIGN 16→4, `.float 0`→`.word`, Exit rename). Known doc errors to fix as we go: STATE.md "main inside FUN_0020d490" is stale (main is a clean symbol at 0x0020d4d0); CLAUDE.md LDFLAGS omits the two `-T undefined_*.txt` includes; 1,388 `/Users/jeanxpereira` occurrences across 18 files; original ELF not on disk locally.

---

## File Structure

| Path | Responsibility | Phase |
|------|----------------|-------|
| `env.example.sh` (new) | Single sourceable env file: `$PS2DEV`, `$PS2SDK`, `$MATCH_CC`, PATH | 1 |
| `docs/SETUP_WSL.md` (new) | Reproducible WSL2 bring-up incl. fetching the byte-perfect oracle | 1 |
| `Makefile` | `MATCH_CC` becomes required for C; GCC15 only as/ld; fix check-toolchain text | 1,2 |
| `decomp.yaml` | Point transmuter at `$MATCH_CC`; drop "won't match" comment | 2 |
| `splat_config.yml` | `gap_*` triage → promote real data to proper sections | 4 |
| `symbol_addrs.txt` | Rename 9 mislabeled `pad_*` function symbols | 0 |
| `README.md` | Reframe goals + desktop north star; fix shields | 0 |
| `CLAUDE.md` | Render-subsystem priority; fix LDFLAGS doc; single workflow | 0,2,5 |
| `PS2_PROJECT_STATE.md` | Fix stale `main` note; refresh metrics | 0 |
| `tools/attic/` (new) | Archive orchestrator + extract_functions.py | 3 |
| `tools/README.md` | Rewrite around the single golden path | 3 |
| `.github/workflows/progress.yml` | Exclude padding/align from report denominator | 4 |
| `include/include_asm.h` | De-hardcode path (build-affecting) | 1 |
| `.mcp.json` | De-hardcode path | 1 |

---

## Phase 0 — Reframe (docs only, zero build risk) `[sonnet]`

### Task 0.1: Reframe README around real goal + desktop north star `[sonnet]`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read current README**

Run: read `README.md` in full. Note every sentence implying a *current* desktop port or implying the ELF runs on PC.

- [ ] **Step 2: Rewrite the goals section**

Replace any "desktop port" framing with this exact framing (adapt prose to surrounding tone, keep these three facts):
1. Primary goal: byte-identical OSDSYS ELF rebuilt from C (research value: SDK libs reusable by other PS2 decomps).
2. Long-term north star: a desktop *reimplementation* of the OSDSYS aesthetic (crystal clock, fog, towers, refraction cube), enabled by — and sequenced after — the decomp.
3. Explicit caveat: the byte-perfect ELF is PS2/MIPS and does **not** run on PC; the port reuses the *understanding* from the decomp, not the binary.

- [ ] **Step 3: Verify no contradictions remain**

Run: `grep -niE 'desktop|port|runs on (pc|desktop)' README.md`
Expected: every remaining hit is consistent with the north-star framing (no claim of a current/buildable desktop app, no claim the ELF runs on PC).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): reframe goals — byte-perfect ELF + sequenced desktop north star"
```

### Task 0.2: Fix decomp.dev shields (DOL/REL → overall progress) `[sonnet]`

**Files:**
- Modify: `README.md` (shield/badge markdown)

- [ ] **Step 1: Locate the shields**

Run: `grep -nE 'DOL|REL|img.shields.io|badge|decomp.dev' README.md`
Expected: find the DOL/REL badge markdown (GameCube concepts, meaningless for PS2).

- [ ] **Step 2: Replace with overall-progress only**

Remove DOL/REL badges. Keep (or add) a single overall-progress badge sourced from decomp.dev. If unsure of the exact decomp.dev badge URL, use the project page link form:
`[![Progress](https://decomp.dev/JeanxPereira/CrystalOSD/badge.svg)](https://decomp.dev/JeanxPereira/CrystalOSD)`
(verify the URL resolves; if it 404s, fall back to a plain link to the project page and note it in the commit body.)

- [ ] **Step 3: Verify**

Run: `grep -niE 'DOL|REL' README.md`
Expected: no matches (no GameCube-format shields remain).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): replace DOL/REL shields with overall-progress badge (PS2, not GC)"
```

### Task 0.3: Rename mislabeled `pad_*` function symbols `[opus]`

> `[opus]` because it touches `symbol_addrs.txt` (feeds splat) and must pass `make verify`. The 9 `pad_*` entries with `type:func` are real functions, not padding.

**Files:**
- Modify: `symbol_addrs.txt`

- [ ] **Step 1: List the offenders**

Run: `grep -nE '^pad_[A-Za-z0-9_]* = .*type:func' symbol_addrs.txt`
Expected: ~9 entries, e.g. `pad_sound_handler_thread_proc = 0x0020cd20; // size:0x480 type:func`.

- [ ] **Step 2: Rename each to an honest name**

For each, drop the misleading `pad_` prefix when the function is unrelated to pad-input, OR keep a meaningful pad-input name where accurate. Concretely:
- `pad_sound_handler_thread_proc` → `sound_handler_thread_proc`
- `pad_sound_handler_thread_lowmem` → `sound_handler_thread_lowmem`
- `pad_handler_hddboot_check_20CC50` → `hddboot_check_20cc50`
- `pad_handler_211860` → `handler_211860`
- `pad_rm2_handler_201588` → `rm2_handler_201588`
- (remaining `pad_*`: rename by the same rule — strip `pad_` unless it is genuinely a `scePad`/controller handler.)
Preserve each line's address and `// size:... type:func` metadata exactly.

- [ ] **Step 3: Regenerate and gate**

Run:
```bash
python3 configure.py -c && make -j elf && make verify   # or `make sha1` if no original ELF
```
Expected: byte-perfect match (renaming a symbol must not change a single byte).

- [ ] **Step 4: Commit**

```bash
git add symbol_addrs.txt
git commit -m "chore(symbols): rename 9 mislabeled pad_* funcs to honest names"
```

### Task 0.4: Fix stale facts in CLAUDE.md / PS2_PROJECT_STATE.md `[sonnet]`

**Files:**
- Modify: `PS2_PROJECT_STATE.md`, `CLAUDE.md`

- [ ] **Step 1: Fix the stale `main` note**

In `PS2_PROJECT_STATE.md`, the line claiming `main()` lives inside `FUN_0020d490` is wrong. Replace with: `main` is a standalone symbol at `0x0020d4d0` (size `0xe68`), split to `asm/core/main.s`.

- [ ] **Step 2: Complete the LDFLAGS doc in CLAUDE.md**

In CLAUDE.md "Makefile Linker Flags", append the two includes the Makefile actually uses:
`-T undefined_syms_auto.txt -T undefined_funcs_auto.txt` (note them as splat-generated extern tables).

- [ ] **Step 3: Record render-subsystem decomp priority in CLAUDE.md**

Under "Subsystems" (or a new "Decomp Priority" note), state: render subsystems (clock, opening, graph) are prioritized because they feed the desktop north star.

- [ ] **Step 4: Verify (docs only, no build)**

Run: `grep -nE 'FUN_0020d490' PS2_PROJECT_STATE.md`
Expected: no matches (stale claim removed).

- [ ] **Step 5: Commit**

```bash
git add PS2_PROJECT_STATE.md CLAUDE.md
git commit -m "docs: fix stale main note, complete LDFLAGS doc, record render priority"
```

---

## Phase 1 — Environment: WSL2 migration `[sonnet]` (gate-heavy)

> Prerequisite for everything that compiles. Mechanical, but the gate is the whole point.

### Task 1.1: Author `env.example.sh` and `docs/SETUP_WSL.md` `[sonnet]`

**Files:**
- Create: `env.example.sh`
- Create: `docs/SETUP_WSL.md`

- [ ] **Step 1: Write `env.example.sh`**

```bash
#!/usr/bin/env bash
# CrystalOSD environment — copy to env.sh and `source` it (env.sh is gitignored).
# All paths are WSL2/Linux. No absolute user-home paths belong in tracked files.
export PS2DEV="${PS2DEV:-$HOME/ps2dev}"
export PS2SDK="${PS2SDK:-$PS2DEV/ps2sdk}"
# Matching compiler (ee-gcc 2.9-991111) — REQUIRED for all C compiles.
export MATCH_CC="${MATCH_CC:-$HOME/ee-gcc2.9-991111/bin/ee-gcc}"
export PATH="$PS2DEV/ee/bin:$PS2DEV/iop/bin:$PS2DEV/dvp/bin:$PATH"
```

- [ ] **Step 2: Write `docs/SETUP_WSL.md`**

Document, as copy-pasteable steps:
1. `wsl --install -d Ubuntu` (from Windows PowerShell), then all subsequent steps inside Ubuntu.
2. APT deps: `sudo apt-get update && sudo apt-get install -y build-essential python3 python3-pip git curl libc6:i386 libstdc++6:i386` (the i386 libs are required by the 32-bit ee-gcc binary — same recipe CI uses).
3. `pip install -r requirements_splat.txt`.
4. ps2dev toolchain: download the Linux release artifact to `$PS2DEV` (binutils/gcc + ps2sdk headers), mirroring `.github/workflows/progress.yml`.
5. ee-gcc: `curl -sSL https://github.com/decompme/compilers/releases/download/compilers/ee-gcc2.9-991111.tar.xz | tar -xJ -C $HOME` → set `$MATCH_CC`.
6. `git submodule update --init --recursive` (decomp-permuter).
7. **Byte-perfect oracle:** `git clone` the private `crystalosd-build` repo (needs a PAT) to obtain `OSDSYS_A_XLF_decrypted_unpacked.elf` at repo root. If no token, document that only `make sha1` is available locally and `make verify` runs in CI.
8. `cp env.example.sh env.sh && source env.sh`.

- [ ] **Step 3: Gitignore the live env + oracle**

Ensure `.gitignore` contains `env.sh` and `OSDSYS_A_XLF_decrypted_unpacked.elf` (latter likely already present — verify).
Run: `grep -nE 'env.sh|OSDSYS_A_XLF' .gitignore`
Expected: both present (add whichever is missing).

- [ ] **Step 4: Commit**

```bash
git add env.example.sh docs/SETUP_WSL.md .gitignore
git commit -m "build(env): add env.example.sh + WSL setup guide (single env source)"
```

### Task 1.2: De-hardcode `/Users/jeanxpereira` across the repo `[sonnet]`

> 1,388 occurrences in 18 files. Split build-affecting from docs to gate correctly.

**Files (build-affecting — must pass gate):**
- Modify: `Makefile`, `include/include_asm.h`, `decomp.yaml`, `tools/permuter/compile.sh`, `tools/run_batch_transmuter.sh`, `tools/orchestrator/promoter.py`, `.mcp.json`

**Files (docs — no gate):**
- Modify: `CLAUDE.md`, `PS2_PROJECT_STATE.md`, `tools/README.md`, `.claude/commands/*.md`, `.claude/skills/decomp-workflow/SKILL.md`, `.claude/subagents/sdk-crossref.md`, `reference/*.md`, `.orchestrator/gaps.json`

- [ ] **Step 1: Enumerate exactly**

Run: `grep -rIn '/Users/jeanxpereira' . --exclude-dir=.git`
Expected: the 18-file set. Keep this list as the checklist.

- [ ] **Step 2: Replace in build-affecting files first**

In each build-affecting file, replace the absolute prefix with an env-var or repo-relative reference:
- `/Users/jeanxpereira/ps2dev` → `$(PS2DEV)` (Makefile), `$PS2DEV` (shell), `${PS2DEV}` (yaml/python via env).
- `/Users/jeanxpereira/CodingProjects/CrystalOSD` → repo-relative (`.`) or `$(CURDIR)` in Makefile.
- `include/include_asm.h`: if it hardcodes an asm include root, switch to a path relative to the header / a `-I include` assumption.

- [ ] **Step 3: Gate the build-affecting changes**

Run:
```bash
source env.sh
python3 configure.py -c && make -j elf && make verify   # or make sha1
```
Expected: byte-perfect (paths feed tooling, not bytes — but include_asm.h and Makefile can break the build if wrong; the gate proves they didn't).

- [ ] **Step 4: Replace in docs files**

Replace remaining `/Users/jeanxpereira/...` in docs with `$PS2DEV` / `<repo-root>` placeholders. No gate needed (prose).

- [ ] **Step 5: Confirm zero remain**

Run: `grep -rIn '/Users/jeanxpereira' . --exclude-dir=.git | grep -v 'docs/plans/2026-06-12'`
Expected: no matches (the design doc may quote the old path historically; everything else clean).

- [ ] **Step 6: Commit (two commits — build, then docs)**

```bash
git add Makefile include/include_asm.h decomp.yaml tools/permuter/compile.sh tools/run_batch_transmuter.sh tools/orchestrator/promoter.py .mcp.json
git commit -m "build(paths): replace hardcoded macOS toolchain path with \$PS2DEV/\$MATCH_CC"
git add -A
git commit -m "docs(paths): replace hardcoded /Users/jeanxpereira with env-var placeholders"
```

### Task 1.3: Acceptance gate — full pipeline green in WSL `[opus]`

> Opus reviews because this is the load-bearing proof the whole migration rests on.

- [ ] **Step 1: Clean rebuild from scratch in WSL**

Run:
```bash
source env.sh
python3 configure.py -c && make -j16 elf && make verify
```
Expected: `✅ byte-perfect match` (or `make sha1` → `✅ SHA1 match` if no original ELF).

- [ ] **Step 2: Record the result in PS2_PROJECT_STATE.md**

Add a "Last Session" entry: WSL2 migration complete, byte-perfect rebuild reproduced on Linux, date 2026-06-12.

- [ ] **Step 3: Commit**

```bash
git add PS2_PROJECT_STATE.md
git commit -m "docs(state): WSL2 migration verified byte-perfect"
```

---

## Phase 2 — Single compiler truth `[opus]`

> The fix Ethanol called out. Short but it's Makefile surgery + compiler judgment.

### Task 2.1: Make `MATCH_CC` required for all C compiles `[opus]`

**Files:**
- Modify: `Makefile`

- [ ] **Step 1: Remove the silent fallback**

Change `MATCH_CC ?= $(CC)` (line ~27) so that C rules fail loudly if `MATCH_CC` is unset/missing. Add a guard target:

```makefile
# ee-gcc 2.9-991111 is REQUIRED for C — modern GCC15 will NOT match the original binary.
MATCH_CC ?=
require-match-cc:
	@test -x "$(MATCH_CC)" || (echo "ERROR: MATCH_CC not set to an executable ee-gcc 2.9-991111." && \
	  echo "Install: https://github.com/decompme/compilers/releases (ee-gcc2.9-991111)" && \
	  echo "Then: export MATCH_CC=\$$HOME/ee-gcc2.9-991111/bin/ee-gcc" && exit 1)
```

- [ ] **Step 2: Switch C compile rules to `$(MATCH_CC)`**

In the two C object rules (`build/src/%.c.o` and `$(BASE_DIR)/%.o`), replace `$(CC)` with `$(MATCH_CC)` and add `require-match-cc` as an order-only prerequisite. Leave `AS`/`LD`/`OBJCOPY` (GCC15 binutils) untouched.

- [ ] **Step 3: Verify the guard fires**

Run: `make base MATCH_CC=` (empty)
Expected: FAIL with the "MATCH_CC not set" message.

- [ ] **Step 4: Verify a real C compile uses ee-gcc**

Run: `make base` (with `MATCH_CC` set via env.sh)
Expected: C objects compile via ee-gcc; no error.

- [ ] **Step 5: Commit**

```bash
git add Makefile
git commit -m "build(cc): require ee-gcc 2.9 (MATCH_CC) for all C; GCC15 limited to as/ld"
```

### Task 2.2: Point transmuter at the matching compiler `[opus]`

**Files:**
- Modify: `decomp.yaml`

- [ ] **Step 1: Replace the compiler block**

Swap the GCC15 invocation for `$MATCH_CC` with the confirmed flags (`-O2 -G0 -D_EE -mabi=eabi -mno-abicalls -fno-common -fno-exceptions -I include -I $PS2SDK/ee/include -I $PS2SDK/common/include`). Delete the "results will NOT match" comment — it becomes false.

- [ ] **Step 2: Verify YAML parses and references the right binary**

Run: `grep -nE 'MATCH_CC|ee-gcc|gcc 15|will NOT match' decomp.yaml`
Expected: references `$MATCH_CC`/ee-gcc; no "will NOT match" comment; no `mips64r5900el-ps2-elf-gcc`.

- [ ] **Step 3: Commit**

```bash
git add decomp.yaml
git commit -m "build(transmuter): use ee-gcc 2.9 (MATCH_CC), drop stale won't-match note"
```

### Task 2.3: Acceptance gate — offline match of a known-good function `[opus]`

> First proof a match can be reproduced locally without decomp.me.

- [ ] **Step 1: Pick an already-matched function**

Use `do_read_cdvd_config_entry` (src/config/cdvd_config.c) or `draw_menu_item` — both listed as matched in PS2_PROJECT_STATE.md.

- [ ] **Step 2: Build base + target and diff offline**

Run:
```bash
source env.sh
make all                      # builds target (.s→.o) and base (.c→.o via ee-gcc)
# then objdiff the pair, e.g.:
./objdiff-cli diff build/target/config/do_read_cdvd_config_entry.o build/base/config/cdvd_config.o
```
Expected: the chosen function reports a match (100%) offline.

- [ ] **Step 3: Record the milestone**

Add to PS2_PROJECT_STATE.md: first offline match reproduced (function name, date).

- [ ] **Step 4: Commit**

```bash
git add PS2_PROJECT_STATE.md
git commit -m "docs(state): first offline match reproduced with ee-gcc (no decomp.me)"
```

---

## Phase 3 — Tooling consolidation `[sonnet]`

> Reduce five overlapping tools to one path + two fallbacks. Mostly file moves + README.

### Task 3.1: Archive superseded tools to `tools/attic/` `[sonnet]`

**Files:**
- Create dir: `tools/attic/`
- Move: `tools/orchestrator/` → `tools/attic/orchestrator/`, `tools/extract_functions.py` → `tools/attic/extract_functions.py`

- [ ] **Step 1: Move with git**

```bash
mkdir -p tools/attic
git mv tools/orchestrator tools/attic/orchestrator
git mv tools/extract_functions.py tools/attic/extract_functions.py
```

- [ ] **Step 2: Add an attic README**

Create `tools/attic/README.md`: "Archived, not deleted. orchestrator = LLM-API-driven match pipeline, superseded by the Claude-Code-driven loop (no API-key burn). extract_functions.py = legacy texttmp.s splitter, superseded by splat per-function output. Revisit only if the primary loop proves insufficient."

- [ ] **Step 3: Verify nothing in the active build references the moved paths**

Run: `grep -rIn 'tools/orchestrator\|tools.orchestrator\|extract_functions' . --exclude-dir=.git --exclude-dir=attic`
Expected: only references inside docs we will update in Task 3.2 (no Makefile/CI dependency). If the Makefile or a skill imports it, note it and update there too.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "tools(attic): archive orchestrator + extract_functions (superseded by golden-path loop)"
```

### Task 3.2: Rewrite `tools/README.md` around the single golden path `[sonnet]`

**Files:**
- Modify: `tools/README.md`

- [ ] **Step 1: Rewrite the layout + "by purpose" sections**

State the one loop and two fallbacks explicitly:
- **Primary:** objdiff loop (`make all` → objdiff diff), offline, ee-gcc.
- **Fallback 1:** decomp-permuter (last-mile brute force).
- **Fallback 2:** decomp.me via `decomp_match.py` (sharing/collab).
- **transmuter:** stub cleaner only, never a matcher.
- Note orchestrator/extract_functions are archived in `tools/attic/`.

- [ ] **Step 2: Verify no stale references**

Run: `grep -nE 'orchestrator|extract_functions' tools/README.md`
Expected: only mentions pointing to `tools/attic/` (not as live tools).

- [ ] **Step 3: Commit**

```bash
git add tools/README.md
git commit -m "docs(tools): rewrite around single golden path + two fallbacks"
```

### Task 3.3: Update decomp skills to drop orchestrator dependency `[sonnet]`

**Files:**
- Modify: `.claude/skills/decomp-loop/SKILL.md`, `.claude/skills/decomp-agent/SKILL.md` (and `decomp-workflow` if it references orchestrator)

- [ ] **Step 1: Find skill references to the orchestrator**

Run: `grep -rln 'orchestrator' .claude/`
Expected: the decomp-loop / decomp-agent skills.

- [ ] **Step 2: Repoint them to the objdiff golden path**

Rewrite the workflow steps to: pick target → ghidra-mcp analyze → write C → `make all` + objdiff → permuter fallback → integrate (splat subsegment) → `make verify` → commit. Remove `python3 -m tools.orchestrator ...` invocations.

- [ ] **Step 3: Verify**

Run: `grep -rln 'tools.orchestrator\|orchestrator queue' .claude/`
Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add .claude/
git commit -m "docs(skills): repoint decomp skills to objdiff golden path"
```

---

## Phase 4 — Honest metric `[opus]`

> HIGH risk: touches `splat_config.yml` (the most-guardrailed file). Opus only. Mechanism + first pass — not full gap resolution.

### Task 4.1: Exclude padding/align from the report denominator `[opus]`

**Files:**
- Modify: `.github/workflows/progress.yml` (and `tools/generate_objdiff.py` if it sets units)

- [ ] **Step 1: Understand how objdiff categorizes units**

Run: `./objdiff-cli report generate -o /tmp/report.json` then inspect category/unit names for `align_*`, `gap_*` (1,448 + 902 units).

- [ ] **Step 2: Filter padding/align out of the progress total**

Configure the report so `align_*` units and pure-padding `gap_*` are excluded from the matchable-code denominator (objdiff report scope config, or a post-process step in the workflow that strips those units from `report.json` before upload). Do NOT change any byte — this is reporting only.

- [ ] **Step 3: Verify the number moves the right way**

Compare progress % before/after on the same build. Expected: % **rises** (denominator shrinks by de-noising), and `align_*` no longer appear as "to decompile".

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/progress.yml tools/generate_objdiff.py
git commit -m "tools(report): exclude align/padding units from progress denominator"
```

### Task 4.2: First-pass `gap_*` triage in splat_config `[opus]`

> Incremental. Commit to mechanism + the largest gaps only. EVERY change individually gated by `make verify`. Circuit-breaker: if a gap change breaks verify 3× the same way, STOP and document.

**Files:**
- Modify: `splat_config.yml`

- [ ] **Step 1: Rank gaps by size**

Run: `find asm -name 'gap_*.s' | xargs wc -l | sort -rn | head -20`
Expected: the largest unclassified regions — triage candidates.

- [ ] **Step 2: Classify and promote the top few**

For each large gap, inspect bytes (is it `.rodata` strings? `.data`? jump table? real padding?). Promote genuine data to the correct section type in `splat_config.yml`; leave true inter-function padding as-is. Change ONE gap at a time.

- [ ] **Step 3: Gate after EACH gap**

Run (after each single change):
```bash
python3 configure.py -c && make -j16 elf && make verify   # or make sha1
```
Expected: byte-perfect. If not, revert that one change immediately.

- [ ] **Step 4: Commit per successful gap (or small batch)**

```bash
git add splat_config.yml
git commit -m "build(splat): classify gap_XXXXXX as .rodata (byte-perfect preserved)"
```

---

## Phase 5 — AI port loop (the payoff) `[sonnet]` tries, `[opus]` last-mile

> Only after 2 & 3. The boring, documented, repeatable loop. Sonnet attempts matches cheaply (a non-match is never a bad commit — the gate prevents it); Opus does last-mile compiler-quirk matching.

### Task 5.1: Document the single workflow in CLAUDE.md + `decomp` skill `[sonnet]`

**Files:**
- Modify: `CLAUDE.md` (replace the three current workflow descriptions with one), `.claude/skills/decomp/SKILL.md`

- [ ] **Step 1: Write the one loop**

```
1. pick target   → smallest unmatched REAL function; render subsystems (clock/opening/graph) first
2. analyze       → ghidra-mcp decompile + reference/COMPILER_QUIRKS.md
3. write C        → src/<subsystem>/<file>.c  (+ /* 0xADDR - name */ comment)
4. compile+diff   → make all + objdiff (offline, MATCH_CC=ee-gcc 2.9)
5. iterate        → manual ↔ decomp-permuter fallback
6. integrate      → splat subsegment: c instead of asm → make elf && make verify
7. commit         → decomp(<scope>): match <func>
```

- [ ] **Step 2: Remove the competing workflow descriptions**

In CLAUDE.md, collapse "Decomp Workflow" + "Batch Export" + any objdiff-only variant into references to the single loop above (Batch Export stays only as the *bulk feeder* for step 3).

- [ ] **Step 3: Verify single source**

Run: `grep -niE 'workflow' CLAUDE.md`
Expected: one canonical loop; no contradictory second procedure.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md .claude/skills/decomp/SKILL.md
git commit -m "docs(workflow): collapse to one decomp loop (render-first, offline, gated)"
```

### Task 5.2: Acceptance gate — port 3 new functions end-to-end `[sonnet]`+`[opus]`

> Proves the loop works incl. step 6 (C linked into byte-perfect ELF). Sonnet attempts; Opus reviews/last-miles.

- [ ] **Step 1: Pick 3 small unmatched functions in render subsystems**

Use the objdiff report / `tools/progress.py` to find the 3 smallest unmatched real functions in clock/opening/graph.

- [ ] **Step 2: Run the loop for each (steps 2–6 of Task 5.1)**

For each function: analyze → write C → objdiff match → integrate into splat → `make verify`.
Expected per function: objdiff 100% AND `make verify` stays byte-perfect after the asm→C subsegment swap.

- [ ] **Step 3: Commit each**

```bash
git add src/<sub>/<file>.c splat_config.yml
git commit -m "decomp(<sub>): match <func>"
```

- [ ] **Step 4: Update progress state**

Add the 3 functions to PS2_PROJECT_STATE.md reconstructed table; refresh counts.

```bash
git add PS2_PROJECT_STATE.md
git commit -m "docs(state): +3 render-subsystem functions via golden-path loop"
```

---

## Sequencing & dependencies

```
Phase 0 (docs)      — land first, independent  [sonnet, except 0.3 opus]
Phase 1 (WSL)       — blocks 2,3,4,5           [sonnet + 1.3 opus gate]
Phase 2 (compiler)  — needs 1; blocks 3,5      [opus]
Phase 3 (tooling)   — needs 2                   [sonnet]
Phase 4 (metric)    — needs 1; parallel w/ 3    [opus]
Phase 5 (AI loop)   — needs 2,3; 4 desirable    [sonnet attempts + opus last-mile]
```

## Global rules (apply to every task)

- **No commit without a green gate.** `make verify` (byte-perfect) when the original ELF is on disk; `make sha1` otherwise. Docs-only tasks are exempt but must pass their `grep` verification step.
- **Circuit breaker:** if a build/splat change fails the same way 3×, STOP, document what was tried, present alternatives. Never silently retry (CLAUDE.md rule).
- **Never hand-edit** `OSDSYS_A.ld`, `undefined_*.txt`, `asm/data/*` — splat regenerates them via `configure.py`.
- **Never change** `subalign`, `ld_bss_is_noload`, `section_order`, or `-G 0` (GPREL16 implications — verified-accurate guardrails).
- **Subagent diffs are reviewed by Opus before commit** on any `[opus]` task and on Phase 5 last-mile.
