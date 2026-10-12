# CLAUDE.md

What stops a wrong move made blind, and where to look for the rest. State and what is left live in
`facts/README.md`; agents start from `.claude/AGENT_KIT.md`.

## What CrystalOSD is

The PlayStation 2 OSDSYS (the Crystal Clock, the menus, the opening, the Browser) reimplemented in
C++26 and Vulkan 1.4 for Windows, bit-faithful to the console: an SDL3 window on local time at
59.94 Hz. Two builds are measured: **HDD OSD 1.10U** (canon, `hddosd.elf`) and **ROM 2.30**
(second witness). Parts with no meaning on a PC (disc boot, a real HDD, disc-state senders) are
out of scope.

## The principle

**`facts/` is the truth; the code computes what it states.** A fact is a verifier passing: a
script in `References/scripts/` recomputes a function's output from probed inputs, bit for bit,
survives mutation and is in `run_all.mjs`. Nothing outside `facts/` and its verifiers is fact.

## The rules

1. Every address names its build (HDD OSD 1.10U or ROM 2.30).
2. The rule, not the number: record the expression and the code that writes it. Never fit a
   constant to a capture.
3. Rigor by kind: EE/VU arithmetic gets both builds, PAL where it applies, mutation and two
   refuters; UI layout, strings and sound senders get HDD OSD, the golden gate and one refuter.
4. A difference with no known cause is a failure, never a tolerance.
5. Golden before and after every app change: `--golden record`, then `--golden check`.
6. Read code with `node References/scripts/asm.mjs`; never `cat` the asm folder.
7. Long commands run in the background; never poll (a hook refuses `sleep`).
8. Subagents are the named ones in `.claude/agents/`, one task each; never `general-purpose`.
9. One worktree per active front.
10. Commit only when Jean asks; explicit paths; never push without his word; never any
    attribution to Claude or AI.
11. Sony data is never committed except the raw resource files in `Resources/`; the app builds
    and runs without `facts/`, `References/` or the data home.
12. English only; zero comments except reverse-engineered arithmetic; PascalCase files and types.

## Layers

| Layer | Role |
|---|---|
| `Source/Scene/` | Plain C++, templated on `Arithmetic` (`EeArithmetic` exact in tests, `NativeArithmetic` in the app): state, camera, rods, orbs, text, menus, cubes, the opening. One `scene::Frame` per frame. No Vulkan |
| `Source/Render/` | `Device` and `NativeRenderer` (executes a `scene::Frame`: hardware blend, MSAA, any resolution) |
| `Source/Assets/` | The console's raw resource files decoded (ROMDIR, HDD container decrypt, Expand), the BIOS extractor. No Vulkan |
| `Source/Audio/` | The EE sound queue, the IOP sound driver and the SPU2, emulated; live output through SDL3 |
| `Source/App/` | `CrystalOSD.exe`: window, host inputs (`settings.json`, local time), cold start, logic, debug panel, screens, boot chain, golden |
| `Source/Core/` | VMA and stb_image units, the headless GPU context |
| `Source/Parity/` | The measuring rule: GS frame types, `GsParityRenderer`, comparison (tests only) |

## Build, run, check

- Clang 23, C++26, LLD, Ninja Multi-Config, CMake 4.2+, Vulkan SDK (`glslc`). `tools/build.ps1`
  enters the VS dev shell (Windows SDK) and runs the presets.
- App: `tools/build.ps1 configure app`, `tools/build.ps1 build app-debug|app-release` → `bin/CrystalOSD.exe`.
- Tests: `tools/build.ps1 configure tests`, `build tests-debug`, `test tests-debug` (12 jobs);
  `tools/test.ps1 <label...>` runs one area (`clock menus opening cold assets audio parity render`, `fast`/`slow`).
- `bin/CrystalOSD.exe --soak 10` and `--validate sync`: 0 validation errors. `--skip-boot` starts at the menu.
- `bin/CrystalOSD.exe --golden check <file>` (`--golden-output x2-msaa4`): every frame's scene,
  pixel and audio hash against a recorded run; baselines are per build type and per machine.
- `node References/scripts/run_all.mjs` (`--changed`, `--filter <regex>`), `mutate.mjs <verifier>`,
  `lint_facts.mjs facts/<page>.md` (must end `FOUND`), `node tools/audio/check.mjs --all`.

## Data homes (outside git)

`CRYSTALOSD_DATA` (default `D:/CodingProjects/CrystalOSD-Data`: dumps, BIOS, fixtures, textures),
`CRYSTALOSD_ASM` (default `D:/CodingProjects/CrystalOSD-Decomp-Legacy/asm`), `CRYSTALOSD_CAPTURES`
(default Watson's `Runtime/captures`). Watson reads `watson.json` at the repository root.

## Commits

`Type(Scope): Imperative description`, at most 72 characters; body explains why.
Types `Fix Feat Refactor Perf Build Docs GS`; Scopes `Core Renderer Scene App Assets Audio Parity Shaders CI Project`.
