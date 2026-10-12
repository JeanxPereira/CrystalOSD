# Workflow

## Build
- `tools/build.ps1 configure app` then `tools/build.ps1 build app-debug`: the app only (`build/app`, output `bin/`).
- `tools/build.ps1 configure tests` then `tools/build.ps1 build tests-debug [--target T...]`: tests, ParityTool, gates (`build/tests`, output `build/tests/bin/`). The data comes from `CRYSTALOSD_DATA`.
- The wrapper enters the VS dev shell for the Windows SDK; the compiler is Clang 23 (presets).
- A new worktree needs `git submodule update --init ThirdParty/imgui` and `-DCLOCK_DEPS_DIR=<another worktree>/build/_deps` to skip the dependency clones.

## Test by label
- `tools/test.ps1 <label...>` builds only the targets of the matching tests, runs them (`ctest -j4`) and prints one line per test and a `TOTAL` line. Labels are ANDed.
- Area labels: `clock`, `menus`, `opening`, `cold`, `assets`, `audio`, `parity`, `render`. Cost labels: `fast` (under 10 s in Debug), `slow`.
- `tools/test.ps1 audio fast` is the audio loop; `tools/test.ps1 opening slow` the heavy opening gates; `-Preset tests-release` runs Release; `-NoBuild` skips the build.
- Labels are assigned in `tests/Labels.cmake` (area by test name, slow by `CLOCK_SLOW_TESTS`). A new test needs an area rule there; a test with no area fails configure.
- The whole suite: `tools/build.ps1 test tests-debug` (12 jobs, about 11 minutes in Debug).

## Audio check
- `node tools/audio/check.mjs [run...|--all] [--release] [--no-build] [--write]` builds SoundLab, renders boot-a, compares with Watson's WAV and the exact budget in `tests/audio/budgets/`, and prints per run: PASS/FAIL, `differ`, `maxAbs`, `first`, `last`, the per-class write-time residue and the first misses. Exit 0 when every run equals its budget.
- Runs: `observed`, `paired`, `paired-init`, `paired-tick`, `native`, `modelled` (default). `--write` rewrites the budget from the render: use it only when the change is explained.
- Sound is validated by numbers and WAV files, never played aloud.

## One verifier
- `node References/scripts/run_all.mjs --filter <regex>` runs the manifest entries whose "verifier capture" matches (`--filter verify_sound_ramp`); `--changed` runs only verifiers touched since the last pass; no argument runs all (882 at the last full run, plus the sound verifiers). Mutation: `node References/scripts/mutate.mjs`, `mutate_model.mjs` for the sound model.

## Agent rules
- Never broad-kill processes (`taskkill /IM`, `Stop-Process -Name`): stop only a process you started, by its PID.
- Untracked Sony data lives in `CRYSTALOSD_DATA` (default `D:/CodingProjects/CrystalOSD-Data`); scripts locate it through `References/lib/data.mjs`, CMake through `CRYSTALOSD_DATA`. Never copy or commit it; no junctions or symlinks.
- Build with the presets only, one build tree per purpose.
- Prefer the label run over the full suite; run the full suite once before a merge.
- Commits name explicit files; never `git add` a directory or `.superpowers`.
