# CrystalOSD — design

Date: 2026-10-12. Status: approved in conversation (sections 1–4), awaiting review of this file.

## Purpose

CrystalOSD is the successor of CrystalClockVK: the PS2 OSDSYS (Crystal Clock, menus, opening,
Browser) reimplemented natively in C++ and Vulkan, bit-faithful to the console. It starts with a
fresh history, as MarinKit started from AquaKit. Two repositories become archived legacy:

| Today | Becomes | What it is |
|---|---|---|
| `JeanxPereira/CrystalOSD` (matching decomp, splat, `asm/`) | `CrystalOSD-Decomp-Legacy`, archived | The disassembly the method reads |
| `JeanxPereira/CrystalClockVK` (`main` + `lab`) | `CrystalClockVK-Legacy`, archived | The app and the measurement lab |
| — | `JeanxPereira/CrystalOSD`, public | This repository |

Goals: one repository instead of `main`/`lab`; the current cutting-edge toolchain (MarinKit's);
the method corrected for the errors measured on 2026-10-12 (cost, speed, precision).

Non-goals: new features during the migration; the copyright-free standalone (a separate project);
PC-meaningless OSDSYS parts (disc boot, real HDD, disc-state senders).

## 1. Structure

```
CrystalOSD/
  CMakeLists.txt, CMakePresets.json     Clang 23, Ninja Multi-Config, LLD, C++26, CMake 4.2+
  Source/
    Scene/ Render/ Assets/ Audio/ App/ Core/
  Shaders/        GLSL, compiled by glslc
  Resources/      the console's raw resource files (committed, Jean's decision 2026-10-05)
  ThirdParty/     ImGui submodule, stb
  tests/          C++ tests, built when the project is top level
  facts/          the trusted store (from lab)
  References/
    scripts/      verifiers (.mjs), capture, run_all, mutate, lint_facts, asm.mjs
    lib/  model/
  .claude/        agents, skills, workflows, AGENT_KIT.md
  tools/          build.ps1, hooks, golden helpers
  docs/specs/  docs/plans/
```

Outside git, one data home: `D:/CodingProjects/CrystalOSD-Data/` (dumps, BIOS, captures,
fixtures, start states, golden baselines), named by one variable `CRYSTALOSD_DATA`, which replaces
`CLOCK_REFERENCES`, `CLOCK_DUMPS`, `CLOCK_BIOS`, `CLOCK_CAPTURES`, `CLOCK_SCENE`, `CLOCK_FIXTURE`.
The disassembly is read from `D:/CodingProjects/CrystalOSD-Decomp-Legacy/asm`
(`CRYSTALOSD_ASM`). Scratch work goes to `lab/` (git-ignored). No junctions or symlinks.

Rules kept from CrystalClockVK: Sony data other than `Resources/` is never committed; the app
builds and runs without `facts/`, `References/` or the data home; `Scene/` and `Assets/` stay
testable without a window; zero comments except reverse-engineered arithmetic; English only.

## 2. Toolchain

- Clang 23 (`C:/Program Files/LLVM/bin/clang++.exe`), `llvm-rc`, LLD, Ninja Multi-Config, C++26,
  `CMAKE_CXX_EXTENSIONS OFF`, `-Wall -Wextra -Wpedantic`; non-Clang compilers fail configure.
- Presets: `windows` (configure), `windows-debug`, `windows-release` (build and test).
- MSVC-only flags translated: `/fp:strict` on the scene libraries becomes
  `-ffp-model=strict -ffp-contract=off`; the Debug `/O2 /Ob2` on the audio emulation becomes `-O2`.
- `VSLANG=1033` is no longer needed (Ninja reads Clang's `-MD` depfiles).
- CI (`.github/workflows/build.yml`): Windows, Clang preset, app build.

## 3. Method

Corrections of the 2026-10-12 audit (the session of 2026-10-08 read 1.42 billion cached tokens in
64 subagents against 23.6 million in the main session):

1. **`References/scripts/asm.mjs <func|addr> [--rom]`** prints one function stripped to address
   and instruction, its callers, its writers, and the HDD OSD 1.10U ↔ ROM 2.30 pair. It replaces
   ad-hoc `cat`/`sed`/`strip()` over `asm/` and loose `disasm_rom.py` calls.
2. **`.claude/AGENT_KIT.md`**: one page, byte-stable — verifier API (`readTraceFor`, `pick`,
   EE float ops), capture flags, paths, the no-polling rule. Every named agent reads it first.
3. **No polling.** Captures, mutation and builds run in the background and end with one verdict
   line; agents never `sleep`/`until`. A PreToolUse hook refuses them.
4. **Named agents only**: `re-scout`, `verifier-writer`, `re-refuter`, `doc-writer`, and the new
   `porter` (ports one task from `facts/` into `Source/`). One task per fresh agent; handoff through
   a ledger file. Haiku for triage and reading; Sonnet for writing verifiers and code. Never
   `general-purpose`.
5. **Tiered rigor**:
   - EE/VU arithmetic (clock, cubes, 3D icons): both builds, PAL where the value can depend on
     the video mode, mutation, two refuters.
   - UI layout, strings, sound senders: HDD OSD 1.10U, the golden gate, one refuter.
6. **One short CLAUDE.md** (MarinKit's model): what stops a blind wrong move and where to look.
   State and "what is left" live in `facts/README.md` only.
7. **At most one worktree per active front.**

## 4. Migration

Freeze point: CrystalClockVK `main` `7c614a1` and `lab` `5f135e0`.

Steps, each verified before the next:

1. **Transplant.** Copy the app (main) and the method (lab: `facts/`, `References/scripts|lib|model`,
   `tests/`, `.claude/`, `tools/`) into the new layout, still building with MSVC. Gate: golden
   identical to the CrystalClockVK baseline.
2. **Toolchain.** Switch to Clang 23 / C++26 / LLD. Gate: golden identical. A divergence is found
   at its cause (FP contraction, FP model, codegen), never accepted as tolerance.
3. **Method.** `CRYSTALOSD_DATA`, `asm.mjs`, `AGENT_KIT.md`, agents, hooks, CLAUDE.md. Gates:
   tests pass; `run_all.mjs` passes; `lint_facts.mjs` FOUND; `asm.mjs` positive control.
4. **In-flight work.**
   - `feat/browser` (native Browser): its diff over `7c614a1` is applied on a `feat/browser`
     branch of the new repository and reviewed there.
   - `browser-lab-icons` (7 dirty files, Tasks 8–9): diff shown to Jean, committed in the legacy
     repository, carried over.
   - `loose-lab-*`, `lab-gs-gzip`: triaged and shown to Jean; nothing migrates without his word.
   - `mods`: stays local and isolated; rebased only on request.
5. **Legacy and cut-over.** Every `gh` action (rename, archive, create) and every push runs only
   after Jean's explicit yes at that moment.
   - Decomp: show and commit its 3 loose changes; README banner "Archived. Successor: CrystalOSD";
     `gh repo rename CrystalOSD-Decomp-Legacy`; new description; `gh repo archive`; local folder
     renamed to match.
   - CrystalClockVK: same banner; remove worktree junctions first; move its untracked data
     (`References/`, `facts/`, `tests/` data) to `CrystalOSD-Data/` by copy, byte count, then
     delete; rename to `CrystalClockVK-Legacy`; archive; local folder renamed.
   - New: `gh repo create JeanxPereira/CrystalOSD --public`; the local folder
     `CrystalOSD-Next` becomes `CrystalOSD`; push `main`.

## 5. Done when

- Golden (scene, pixel, audio hash) of the Clang/C++26 app equals the MSVC CrystalClockVK
  baseline for `x1` and `x2-msaa4`, boot and `--skip-boot`.
- `--soak 10` and `--validate sync` report 0 validation errors.
- The C++ test suite passes; `run_all.mjs` passes (882 verifiers plus the sound verifiers)
  reading from `CRYSTALOSD_DATA`; `lint_facts.mjs` ends FOUND.
- `asm.mjs` reproduces a known reading.
- CI builds the app with Clang.
- Both legacy repositories are archived with the successor banner; `JeanxPereira/CrystalOSD`
  holds `main`.
