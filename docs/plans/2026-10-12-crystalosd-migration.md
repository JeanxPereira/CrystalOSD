# CrystalOSD Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move CrystalClockVK (`main` + `lab`) into the new repository CrystalOSD, built by Clang 23 as C++26, with the corrected method, then archive the two legacy repositories.

**Architecture:** Transplant in steps, each gated: copy as is under MSVC (golden equal), switch the toolchain (golden equal), add the method (tests, verifiers, lint), carry the in-flight work, cut over. The data stays outside git and is named by `CRYSTALOSD_DATA`; the disassembly by `CRYSTALOSD_ASM`.

**Tech Stack:** C++26, Clang 23.1.2, LLD, Ninja Multi-Config, CMake 4.2, Vulkan 1.4, SDL3 3.4.18, Node (verifiers), Python 3 (hooks), gh CLI.

**Spec:** `docs/specs/2026-10-12-crystalosd-design.md`

## Global Constraints

- New repository at `D:/CodingProjects/CrystalOSD-Next` until Task 9 renames it to `D:/CodingProjects/CrystalOSD`.
- Freeze point: CrystalClockVK `main` `7c614a1`, `lab` `5f135e0`. Legacy repositories are read, never changed, before Task 9.
- Never commit Sony data other than `Resources/` (dumps, BIOS, captures, fixtures, textures, asm).
- Never add attribution to Claude or AI anywhere (commit messages, docs, code).
- Commits: `Type(Scope): Imperative description`, ≤ 72 chars; explicit paths only (`git add <file>...`, never `-A`, `.` or a directory).
- No `gh` action (rename, archive, create, edit) and no push without Jean's explicit yes given at that moment.
- No junctions or symlinks. No broad process kills (stop only a PID you started).
- A golden difference is found at its cause; never re-recorded to pass, never a tolerance.
- English only in the repository; zero comments except reverse-engineered arithmetic.
- No `sleep`/`until` polling: long commands run with `run_in_background` and end with one verdict line.
- Before Task 9 the data and the disassembly live at their old places: `CRYSTALOSD_DATA=D:/CodingProjects/CrystalClockVK/References`, `CRYSTALOSD_ASM=D:/CodingProjects/CrystalOSD/asm`. Set both in the environment of every command that reads them.

## Review Focus

1. **Clang codegen changes `NativeArithmetic` pixels** (FP contraction, `std::sin`/`std::pow` inlining, vectorization): the golden must stay equal; Task 3 pins it with all four baselines and a per-library flag check.
2. **A path still pointing at the legacy location after cut-over** (`CrystalClockVK/References`, `CrystalOSD/asm`, `Watson/Runtime/captures` aside): Task 9 runs a grep that must find none, then reruns run_all with the new defaults.
3. **The app started without data or resources**: it must still print what is missing and exit 1, not crash; Task 2 runs it with an empty `--resources`.
4. **Settings folder renamed** (`%LOCALAPPDATA%/CrystalClockVK` → `CrystalOSD`): a first start with no settings file must start with defaults; Task 2 checks it with a temp `LOCALAPPDATA`.
5. **Data move loses bytes**: Task 9 copies, compares file count and total bytes, and only then deletes.

---

## File structure

```
CrystalOSD-Next/
  CMakeLists.txt            app libraries and CrystalOSD.exe (from main CMakeLists.txt + lab additions)
  CMakePresets.json         app / tests configure; app-debug, app-release, tests-debug, tests-release
  cmake/Audio.cmake         from main
  Source/{Scene,Render,Assets,Audio,App,Core,Parity}/   from src/{scene,render,assets,audio,app,core,parity}
  Source/Audio/Lab/         from lab src/audio/lab
  Shaders/                  from shaders/ (+ GsParity.* from lab)
  Resources/                from resources/
  ThirdParty/imgui (submodule), ThirdParty/stb
  tests/                    from lab tests/
  facts/                    from lab facts/
  References/{scripts,lib,model,readings}/   from lab
  tools/build.ps1, tools/test.ps1, tools/hooks/{guard-git.py,lint-facts.py,no-poll.py}
  tools/{ParityTool,parity,scene,audio}/     from lab
  .claude/{agents,skills,workflows,settings.json,AGENT_KIT.md}
  .github/workflows/build.yml
  CLAUDE.md, README.md, LICENSE, .gitignore, .gitattributes, .gitmodules
  docs/specs/, docs/plans/, docs/screenshots/ (from main)
```

Old `docs/superpowers/*` plans and specs stay in the legacy repository.

---

### Task 0: Prove the baselines

**Files:** none changed. Reads `D:/CodingProjects/CrystalClockVK/out/golden/new-{debug,debug-x2,release,release-x2}.txt`.

**Interfaces:** Produces: four baselines known to match `7c614a1` on this machine; later tasks compare against these files.

- [ ] **Step 1: Build legacy main, both configurations** (background)

```powershell
cd D:/CodingProjects/CrystalClockVK
tools/build.ps1 configure app
tools/build.ps1 build app-debug
tools/build.ps1 build app-release
```
Expected: exit 0 each.

- [ ] **Step 2: Check each baseline**

Debug binary after `app-debug`, Release after `app-release` (both write `bin/CrystalClock.exe`; build one, check its two files, then the other):
```powershell
bin/CrystalClock.exe --golden check out/golden/new-debug.txt
bin/CrystalClock.exe --golden check out/golden/new-debug-x2.txt --golden-output x2-msaa4
```
and the same with `new-release*.txt` after the Release build.
Expected: each reports no differing frame, exit 0.

- [ ] **Step 3: If any check fails, stop.** Report the first differing frame to Jean; do not record new baselines without his word (they would hide whatever changed).

---

### Task 1: Transplant the app under MSVC

**Files:**
- Create: the tree above from `git -C D:/CodingProjects/CrystalClockVK archive 7c614a1` (app part only).
- Modify: `CMakeLists.txt` (paths `src/`→`Source/`, `shaders`→`Shaders`, `resources`→`Resources`, `3rdparty`→`ThirdParty`; project and executable name `CrystalOSD`), `CMakePresets.json`, `.gitmodules`, `.github/workflows/build.yml`, `README.md` (name), `Source/App/HostInputs.cpp` (settings folder `CrystalOSD`).

**Interfaces:**
- Consumes: Task 0 baselines.
- Produces: `bin/CrystalOSD.exe` with the same flags as `CrystalClock.exe`; CMake libraries keep their names (`ClockScene`, `ClockSceneNative`, `ClockRender`, `ClockAssets`, `ClockAudio*`, `HostInputs`, `ClockInput`, `ClockScreen`, `OpeningSceneNative`, `BootScreens`).

- [ ] **Step 1: Export the freeze point**

```bash
mkdir -p /c/Users/usuario/AppData/Local/Temp/crystalosd && cd /c/Users/usuario/AppData/Local/Temp/crystalosd
mkdir main-7c614a1 && git -C /d/CodingProjects/CrystalClockVK archive --format=tar 7c614a1 | tar -x -C main-7c614a1
ls main-7c614a1
```
Expected: `3rdparty CMakeLists.txt CMakePresets.json cmake docs resources shaders src tools ...`.

- [ ] **Step 2: Place it in the new layout**

```bash
N=/d/CodingProjects/CrystalOSD-Next; M=/c/Users/usuario/AppData/Local/Temp/crystalosd/main-7c614a1
mkdir -p $N/Source $N/ThirdParty
for d in scene render assets audio app core; do cp -r $M/src/$d $N/Source/${d^}; done
cp -r $M/shaders $N/Shaders; cp -r $M/resources $N/Resources; cp -r $M/cmake $N/cmake
cp -r $M/3rdparty/stb $N/ThirdParty/stb
cp $M/CMakeLists.txt $M/CMakePresets.json $M/LICENSE $M/.gitattributes $M/.gitignore $M/README.md $N/
mkdir -p $N/tools $N/.github/workflows $N/docs && cp $M/tools/build.ps1 $N/tools/ && cp $M/.github/workflows/build.yml $N/.github/workflows/ && cp -r $M/docs/screenshots $N/docs/
cd $N && git submodule add https://github.com/ocornut/imgui.git ThirdParty/imgui
git -C ThirdParty/imgui checkout $(git -C /d/CodingProjects/CrystalClockVK ls-tree 7c614a1 3rdparty/imgui | awk '{print $3}')
```
`Source/Audio` keeps its subfolders (`spu2/` etc.) as they are; only the layer folders are renamed.

- [ ] **Step 3: Rewrite paths in CMake and sources**

```bash
cd /d/CodingProjects/CrystalOSD-Next
sed -i -e 's#src/scene#Source/Scene#g; s#src/render#Source/Render#g; s#src/assets#Source/Assets#g; s#src/audio#Source/Audio#g; s#src/app#Source/App#g; s#src/core#Source/Core#g' \
       -e 's#/src)#/Source)#g; s#3rdparty#ThirdParty#g; s#/shaders#/Shaders#g; s#/resources#/Resources#g' CMakeLists.txt cmake/Audio.cmake
grep -rln '#include "\(scene\|render\|assets\|audio\|app\|core\)/' Source | xargs sed -i -E 's#include "(scene|render|assets|audio|app|core)/#include "\u\1/#'
grep -rn 'include "[a-z]*/' Source | grep -v '"[A-Z]' | head
```
Expected: the last grep prints only third-party includes (`imgui`, `vk_mem_alloc`, `SDL3/`, `glm/`, `nlohmann/`). Fix by hand any project include it lists.

Then in `CMakeLists.txt`: `project(CrystalOSD ...)`, `add_executable(CrystalOSD ...)`, every `target_*(CrystalClock ...)` → `CrystalOSD`. Grep `CrystalClock` across the tree and rename every user-visible name (window title, README, settings folder in `Source/App/HostInputs.cpp`, log prefixes); internal `Clock*` type and library names stay.

- [ ] **Step 4: Build under MSVC** (background)

```powershell
cd D:/CodingProjects/CrystalOSD-Next
tools/build.ps1 configure app; tools/build.ps1 build app-debug
```
Expected: exit 0, `bin/CrystalOSD.exe` and `bin/resources/`.

- [ ] **Step 5: Golden equal to the legacy baselines**

```powershell
bin/CrystalOSD.exe --golden check D:/CodingProjects/CrystalClockVK/out/golden/new-debug.txt
bin/CrystalOSD.exe --golden check D:/CodingProjects/CrystalClockVK/out/golden/new-debug-x2.txt --golden-output x2-msaa4
```
Then `build app-release` and the two `new-release*.txt`. Expected: no differing frame in all four.

- [ ] **Step 6: Edge starts (Review Focus 3 and 4)**

```powershell
mkdir $env:TEMP/empty-res; bin/CrystalOSD.exe --resources $env:TEMP/empty-res; $LASTEXITCODE
$env:LOCALAPPDATA="$env:TEMP/fresh-lad"; bin/CrystalOSD.exe --skip-boot --soak 3 --mute; $LASTEXITCODE
```
Expected: first prints the missing files and `1`; second `0` and creates `$env:TEMP/fresh-lad/CrystalOSD/settings.json` or runs on defaults without error. Then `bin/CrystalOSD.exe --soak 10` and `--validate sync`: 0 validation errors.

- [ ] **Step 7: Commit**

```bash
git add CMakeLists.txt CMakePresets.json cmake/Audio.cmake .gitmodules .gitattributes .gitignore LICENSE README.md tools/build.ps1 .github/workflows/build.yml ThirdParty/imgui
git add $(git ls-files --others --exclude-standard Source Shaders Resources ThirdParty/stb docs/screenshots)
git commit -m "Feat(Project): Transplant the app from CrystalClockVK 7c614a1"
```

---

### Task 2: Transplant the lab and name the data

**Files:**
- Create from `lab` `5f135e0`: `tests/`, `facts/`, `References/{scripts,lib,model,readings}/`, `Source/Parity/`, `Source/Audio/Lab/`, `Shaders/GsParity.{vert,frag}`, `tools/{ParityTool,parity,scene,audio,test.ps1}`, `tools/hooks/{guard-git.py,lint-facts.py}`, `.claude/{agents,skills,workflows,settings.json}`.
- Modify: `CMakeLists.txt` (lab's additions: parity library, GsParity shaders, `tests/` hook), `References/lib/data.mjs`, `tests/CMakeLists.txt`, `tests/audio/CMakeLists.txt`, every script that hardcodes `D:/CodingProjects/CrystalOSD/asm` or `CrystalClockVK/References`.
- Create: `References/lib/data.test.mjs`.

**Interfaces:**
- Produces: `DATA_HOME` (from `CRYSTALOSD_DATA`, default `D:/CodingProjects/CrystalOSD-Data`), `ASM_HOME` (from `CRYSTALOSD_ASM`, default `D:/CodingProjects/CrystalOSD-Decomp-Legacy/asm`), `CAPTURES` (from `CRYSTALOSD_CAPTURES`, default `D:/CodingProjects/Watson/Runtime/captures`), `dataPath(rel)`, `asmPath(rel)` in `References/lib/data.mjs`; CMake cache variables `CRYSTALOSD_DATA`, `CRYSTALOSD_ASM`.

- [ ] **Step 1: Export lab and copy its parts** (same `git archive` as Task 1 Step 1 with `5f135e0` into `lab-5f135e0`), then:

```bash
N=/d/CodingProjects/CrystalOSD-Next; L=/c/Users/usuario/AppData/Local/Temp/crystalosd/lab-5f135e0
cp -r $L/tests $L/facts $N/; mkdir -p $N/References && cp -r $L/References/{scripts,lib,model,readings} $N/References/
cp -r $L/src/parity $N/Source/Parity; mkdir -p $N/Source/Audio && cp -r $L/src/audio/lab $N/Source/Audio/Lab
cp $L/shaders/GsParity.* $N/Shaders/; cp -r $L/tools/{ParityTool,parity,scene,audio} $L/tools/test.ps1 $N/tools/
mkdir -p $N/tools/hooks && cp $L/tools/hooks/*.py $N/tools/hooks/; cp -r $L/.claude $N/
diff <(git -C /d/CodingProjects/CrystalClockVK-wt/lab show 5f135e0:CMakeLists.txt) <(git -C /d/CodingProjects/CrystalClockVK show 7c614a1:CMakeLists.txt)
```
Apply the printed lab-only CMake lines to `CMakeLists.txt` with the Task 1 path renames.

- [ ] **Step 2: Failing test for the data paths**

`References/lib/data.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('defaults name the new homes', async () => {
  delete process.env.CRYSTALOSD_DATA; delete process.env.CRYSTALOSD_ASM; delete process.env.CRYSTALOSD_CAPTURES;
  const m = await import('./data.mjs?defaults');
  assert.equal(m.DATA_HOME, 'D:/CodingProjects/CrystalOSD-Data');
  assert.equal(m.ASM_HOME, 'D:/CodingProjects/CrystalOSD-Decomp-Legacy/asm');
  assert.equal(m.CAPTURES, 'D:/CodingProjects/Watson/Runtime/captures');
});

test('environment overrides, backslashes and trailing slash normalized', async () => {
  process.env.CRYSTALOSD_DATA = 'C:\\x\\data\\'; process.env.CRYSTALOSD_ASM = 'C:/y/asm/';
  const m = await import('./data.mjs?env');
  assert.equal(m.DATA_HOME, 'C:/x/data');
  assert.equal(m.dataPath('dumps/a.bin'), 'C:/x/data/dumps/a.bin');
  assert.equal(m.asmPath('clock/f.s'), 'C:/y/asm/clock/f.s');
});
```
Run: `node --test References/lib/data.test.mjs` — Expected: FAIL (`ASM_HOME` undefined).

- [ ] **Step 3: Implement `References/lib/data.mjs`**

```js
// Where the untracked data lives. Every script locates it through here.
import path from 'node:path';

const home = (name, fallback) => (process.env[name] ?? fallback).split('\\').join('/').replace(/\/$/, '');

export const DATA_HOME = home('CRYSTALOSD_DATA', 'D:/CodingProjects/CrystalOSD-Data');
export const ASM_HOME = home('CRYSTALOSD_ASM', 'D:/CodingProjects/CrystalOSD-Decomp-Legacy/asm');
export const CAPTURES = home('CRYSTALOSD_CAPTURES', 'D:/CodingProjects/Watson/Runtime/captures');

export const dataPath = (relative) => path.posix.join(DATA_HOME, relative);
export const asmPath = (relative) => path.posix.join(ASM_HOME, relative);
```
Run the test: Expected: PASS.

- [ ] **Step 4: Route every hardcoded path through it**

```bash
cd /d/CodingProjects/CrystalOSD-Next
grep -rlnE "CrystalOSD[\\/]+asm|CrystalClockVK/References|CLOCK_REFERENCES|CLOCK_CAPTURES" References tools tests .claude facts Source
```
Scripts: replace literals with `asmPath(...)`/`dataPath(...)`/`CAPTURES` imports. Agents, skills, facts: the asm path becomes `$CRYSTALOSD_ASM/<module>/<func>.s`. `Source/Scene/Text.cpp`: only a comment path — rewrite to `<asm>/...`. CMake (`tests/CMakeLists.txt`, `tests/audio/CMakeLists.txt`): add at the top of `tests/CMakeLists.txt`
```cmake
set(CRYSTALOSD_DATA "$ENV{CRYSTALOSD_DATA}" CACHE PATH "Untracked data home: dumps, BIOS, fixtures, start states")
if(NOT CRYSTALOSD_DATA)
    set(CRYSTALOSD_DATA "D:/CodingProjects/CrystalOSD-Data" CACHE PATH "" FORCE)
endif()
set(CLOCK_REFERENCES_DEFAULT ${CRYSTALOSD_DATA})
```
and make each `*_DEFAULT` derive from `CLOCK_REFERENCES_DEFAULT`; remove `CLOCK_CAPTURES` defaults in favour of `$ENV{CRYSTALOSD_CAPTURES}` with the Watson default. Re-run the grep: Expected: only `References/lib/data.mjs` and `tests/CMakeLists.txt` defaults.

- [ ] **Step 5: Build and run the tests** (background)

```powershell
$env:CRYSTALOSD_DATA='D:/CodingProjects/CrystalClockVK/References'; $env:CRYSTALOSD_ASM='D:/CodingProjects/CrystalOSD/asm'
tools/build.ps1 configure tests; tools/build.ps1 build tests-debug; tools/build.ps1 test tests-debug
```
Expected: configure prints `parity gates active: ...`; ctest 100% passed. Any test that passed on lab `5f135e0` and fails here is a path bug of this task.

- [ ] **Step 6: Verifiers and lint**

```bash
export CRYSTALOSD_DATA=D:/CodingProjects/CrystalClockVK/References CRYSTALOSD_ASM=D:/CodingProjects/CrystalOSD/asm
node References/scripts/run_all.mjs > lab/run_all.txt 2>&1; tail -3 lab/run_all.txt
node References/scripts/lint_facts.mjs facts/*.md | tail -1
node tools/audio/check.mjs --all --no-build | tail -8
```
Expected: run_all all pass (882 + sound); lint `FOUND`; audio every run PASS.

- [ ] **Step 7: Commit** (explicit file lists via `git ls-files --others --exclude-standard <dir>` per directory, as in Task 1 Step 7)

```bash
git commit -m "Feat(Project): Transplant the lab from CrystalClockVK 5f135e0"
```

---

### Task 3: Clang 23, C++26, LLD

**Files:**
- Modify: `CMakeLists.txt` (top), `CMakePresets.json`, `cmake/Audio.cmake:37`, `tools/build.ps1`, `tools/test.ps1`, `tests/CMakeLists.txt` (`CLOCK_PCH_STD`), `.github/workflows/build.yml`.

**Interfaces:**
- Produces: presets `app`, `tests` configure with Clang; build presets unchanged names.

- [ ] **Step 1: Compiler guard and standard** — top of `CMakeLists.txt`:

```cmake
cmake_minimum_required(VERSION 4.2)
project(CrystalOSD VERSION 0.1.0 DESCRIPTION "The PS2 OSDSYS, native in C++ and Vulkan" LANGUAGES CXX C)

if(NOT CMAKE_CXX_COMPILER_ID STREQUAL "Clang")
    message(FATAL_ERROR "CrystalOSD builds with Clang (got ${CMAKE_CXX_COMPILER_ID}); use a preset from CMakePresets.json")
endif()

set(CMAKE_CXX_STANDARD 26)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
add_compile_options(-Wall -Wextra -Wno-missing-field-initializers)
```
Remove the `string(REGEX REPLACE ... RTC ...)` line. Keep `_MSVC_STL_HARDENING` and `_ITERATOR_DEBUG_LEVEL` (Clang uses the MSVC STL on this target). Replace both `if(MSVC) /fp:strict else ...` blocks by
```cmake
target_compile_options(ClockScene PRIVATE -ffp-model=strict -ffp-contract=off)
```
(and the same for `OpeningSceneNative`). `cmake/Audio.cmake:37`: `$<$<CONFIG:Debug>:-O2>`.

- [ ] **Step 2: Presets** — in `base`: remove `"environment": { "VSLANG": "1033" }`; add
```json
"cacheVariables": {
  "CMAKE_CXX_COMPILER": "C:/Program Files/LLVM/bin/clang++.exe",
  "CMAKE_C_COMPILER": "C:/Program Files/LLVM/bin/clang.exe",
  "CMAKE_RC_COMPILER": "C:/Program Files/LLVM/bin/llvm-rc.exe",
  "CMAKE_LINKER_TYPE": "LLD",
  "CMAKE_CONFIGURATION_TYPES": "Debug;Release",
  "CMAKE_EXPORT_COMPILE_COMMANDS": "ON",
  "CLOCK_DEPS_DIR": "${sourceDir}/build/_deps"
}
```
Delete the `windows-vs` presets. `tools/build.ps1` keeps entering the VS dev shell (Windows SDK headers and libs) and drops `$env:VSLANG`; `tools/test.ps1` likewise.

- [ ] **Step 3: Configure fresh and build** (background)

```powershell
Remove-Item -Recurse -Force build/app, build/tests -ErrorAction SilentlyContinue
tools/build.ps1 configure app; tools/build.ps1 build app-debug
```
Expected: configure reports `The CXX compiler identification is Clang 23.1.2`; build exit 0. Fix each error at its cause (Clang is stricter on templates, `-Wall` warnings stay warnings). In `tests/CMakeLists.txt` translate MSVC PCH flags in `CLOCK_PCH_STD` to Clang's (`target_precompile_headers` works on both; remove `/Yu`-style options if any).

- [ ] **Step 4: Confirm the FP flags reached the scene libraries (Review Focus 1)**

```bash
grep -c -- "-ffp-model=strict" build/app/compile_commands.json
grep -- "Source/Scene/Rods.cpp" build/app/compile_commands.json | grep -o -- "-ffp-[a-z-]*=[a-z]*" | sort -u
```
Expected: count > 0; `-ffp-contract=off` and `-ffp-model=strict` on `Rods.cpp`.

- [ ] **Step 5: Golden, all four** (Debug then Release, as Task 1 Step 5). Expected: no differing frame.
  If a frame differs: use superpowers:systematic-debugging. Bisect by library: build `ClockSceneNative`/`OpeningSceneNative` with `-O0` and compare; check `-fno-builtin` on `sin/cos/sqrtf`; compare `/fp:precise` semantics vs `-ffp-model=strict`. Stop and report to Jean with the cause before changing any baseline.

- [ ] **Step 6: Tests, soak, validation** (background)

```powershell
tools/build.ps1 configure tests; tools/build.ps1 build tests-debug; tools/build.ps1 test tests-debug
bin/CrystalOSD.exe --soak 10; bin/CrystalOSD.exe --soak 10 --validate sync
```
Expected: ctest 100%; 0 validation errors.

- [ ] **Step 7: CI** — `.github/workflows/build.yml`: install LLVM 23 (`choco install llvm --version=23.1.2 -y`), keep the Vulkan SDK step, `cmake --preset app`, `cmake --build --preset app-release`.

- [ ] **Step 8: Commit**

```bash
git add CMakeLists.txt CMakePresets.json cmake/Audio.cmake tools/build.ps1 tools/test.ps1 tests/CMakeLists.txt .github/workflows/build.yml
git commit -m "Build(Project): Build with Clang 23 as C++26 and link with LLD"
```
(add any source file Step 3 fixed, by explicit path)

---

### Task 4: `asm.mjs`

**Files:**
- Create: `References/scripts/asm.mjs`, `References/scripts/asm.test.mjs`
- Uses: `References/lib/data.mjs` (`ASM_HOME`), `References/scripts/find_in_rom.mjs` logic for the ROM pair.

**Interfaces:**
- Produces: CLI `node References/scripts/asm.mjs <name|0xADDR> [--rom] [--callers] [--writers <symbol>]`; module exports `findFunction(nameOrAddr) -> {name, module, file, start, lines: [{addr, text}]}`, `callers(name) -> [{name, addr}]`, `writers(symbol) -> [{name, addr, text}]`.

- [ ] **Step 1: Failing test** — `References/scripts/asm.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findFunction, callers, writers } from './asm.mjs';

test('finds a function by name with stripped lines', () => {
  const f = findFunction('clock_config_change_cb_aspect_ratio');
  assert.equal(f.module, 'clock');
  assert.equal(f.start, 0x227D30);
  assert.deepEqual(f.lines[0], { addr: 0x227D30, text: 'addiu $sp, $sp, -0x20' });
  assert.ok(f.lines.some((l) => l.text === 'jal config_get_aspect_ratio'));
});

test('finds the same function by an address inside it', () => {
  assert.equal(findFunction('0x227D44').name, 'clock_config_change_cb_aspect_ratio');
});

test('positive control: func_002344F8 has a known caller', () => {
  assert.ok(callers('func_002344F8').some((c) => c.name === 'func_002347D8'));
});

test('unknown name reports not found with a positive control', () => {
  assert.throws(() => findFunction('no_such_function_xyz'), /not found.*clock_config_change_cb_aspect_ratio found/);
});

test('writers lists stores that name the symbol', () => {
  const w = writers('config_get_aspect_ratio');
  assert.ok(Array.isArray(w));
});
```
Run: `CRYSTALOSD_ASM=D:/CodingProjects/CrystalOSD/asm node --test References/scripts/asm.test.mjs` — Expected: FAIL (module not found).

- [ ] **Step 2: Implement `References/scripts/asm.mjs`**

```js
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ASM_HOME } from '../lib/data.mjs';

const LINE = /^\s*\/\*\s+[0-9A-F]+\s+([0-9A-F]{8})\s+[0-9A-F]{8}\s+\*\/\s+(.*)$/;
let index = null;

function load() {
  if (index) return index;
  index = [];
  for (const module of fs.readdirSync(ASM_HOME)) {
    const dir = path.join(ASM_HOME, module);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.s'))) {
      const lines = [];
      for (const raw of fs.readFileSync(path.join(dir, file), 'utf8').split('\n')) {
        const m = LINE.exec(raw);
        if (m) lines.push({ addr: parseInt(m[1], 16), text: m[2].trim().replace(/\s+/g, ' ') });
      }
      if (lines.length) index.push({ name: file.slice(0, -2), module, file: path.join(dir, file).split('\\').join('/'), start: lines[0].addr, lines });
    }
  }
  return index;
}

export function findFunction(key) {
  const all = load();
  const addr = /^0x[0-9a-f]+$/i.test(key) ? parseInt(key, 16) : null;
  const hit = addr === null
    ? all.find((f) => f.name === key)
    : all.find((f) => addr >= f.start && addr <= f.lines.at(-1).addr);
  if (!hit) {
    const control = all.find((f) => f.name === 'clock_config_change_cb_aspect_ratio');
    throw new Error(`${key} not found in ${ASM_HOME}; the same search: clock_config_change_cb_aspect_ratio found=${Boolean(control)}`);
  }
  return hit;
}

export function callers(name) {
  const out = [];
  for (const f of load()) for (const l of f.lines) if (l.text === `jal ${name}` || l.text === `j ${name}`) out.push({ name: f.name, addr: l.addr });
  return out;
}

export function writers(symbol) {
  const store = /^(sb|sh|sw|sd|sq|swc1|sqc2) /;
  const out = [];
  for (const f of load()) for (const l of f.lines) if (store.test(l.text) && l.text.includes(symbol)) out.push({ name: f.name, addr: l.addr, text: l.text });
  return out;
}

const hex = (n) => `0x${n.toString(16).toUpperCase()}`;

if (import.meta.url === `file:///${process.argv[1].split('\\').join('/')}`) {
  const [key, ...flags] = process.argv.slice(2);
  const f = findFunction(key);
  console.log(`${f.name}  ${f.module}  ${hex(f.start)}..${hex(f.lines.at(-1).addr)}  ${f.file}`);
  for (const l of f.lines) console.log(`${hex(l.addr)}  ${l.text}`);
  if (flags.includes('--callers')) for (const c of callers(f.name)) console.log(`caller ${c.name} @ ${hex(c.addr)}`);
  const w = flags.indexOf('--writers');
  if (w >= 0) for (const s of writers(flags[w + 1])) console.log(`writer ${s.name} @ ${hex(s.addr)}  ${s.text}`);
  if (flags.includes('--rom')) process.stdout.write(execFileSync('node', [path.join(import.meta.dirname, 'find_in_rom.mjs'), f.start.toString(16)], { encoding: 'utf8' }));
}
```

- [ ] **Step 3: Run the test** — Expected: PASS (5/5). If the `callers` control fails, open `asm/clock/func_002347D8.s`, confirm the `jal func_002344F8` text form and adjust the match, not the test's expectation.

- [ ] **Step 4: Run the CLI once, timed**

```bash
time CRYSTALOSD_ASM=D:/CodingProjects/CrystalOSD/asm node References/scripts/asm.mjs func_002344F8 --callers --rom | tail -4
```
Expected: the function, at least one `caller` line, a `HDD 0x2344f8 -> ROM 0x... head N/16` line; under 3 s.

- [ ] **Step 5: Commit**

```bash
git add References/scripts/asm.mjs References/scripts/asm.test.mjs
git commit -m "Feat(Project): Read a function, its callers and writers in one call"
```

---

### Task 5: Agent kit, agents, no-polling hook

**Files:**
- Create: `.claude/AGENT_KIT.md`, `.claude/agents/porter.md`, `tools/hooks/no-poll.py`, `tools/hooks/no_poll_test.py`
- Modify: `.claude/agents/{re-scout,verifier-writer,re-refuter,doc-writer}.md`, `.claude/skills/{measure,capture,campaign}/SKILL.md`, `.claude/workflows/measure-campaign.js`, `.claude/workflows/measure-lanes.js`, `.claude/settings.json`

**Interfaces:**
- Produces: `tools/hooks/no-poll.py` reads PreToolUse JSON on stdin, exit 2 with a message when the Bash/PowerShell command contains `sleep N` (N ≥ 1), `Start-Sleep`, or `until ...; do ... sleep`; exit 0 otherwise.

- [ ] **Step 1: Failing hook test** — `tools/hooks/no_poll_test.py`:

```python
import json, subprocess, sys, pathlib
HOOK = pathlib.Path(__file__).with_name('no-poll.py')

def run(cmd, tool='Bash'):
    p = subprocess.run([sys.executable, str(HOOK)], input=json.dumps({'tool_name': tool, 'tool_input': {'command': cmd}}), capture_output=True, text=True)
    return p.returncode

def test_refuses():
    assert run('sleep 240; tail out.txt') == 2
    assert run('until grep -q verdict x; do sleep 10; done') == 2
    assert run('Start-Sleep -Seconds 5', 'PowerShell') == 2

def test_allows():
    assert run('grep -n "sleep" References/scripts/capture.mjs') == 0
    assert run('node References/scripts/run_all.mjs --changed') == 0
    assert run('echo "no sleep here"') == 0
```
Run: `python -m pytest tools/hooks/no_poll_test.py -q` — Expected: FAIL (hook missing).

- [ ] **Step 2: Implement `tools/hooks/no-poll.py`**

```python
"""PreToolUse hook: refuses waiting by polling. Long commands run in the background and end with one verdict line."""
import json, re, sys

call = json.load(sys.stdin)
command = call.get('tool_input', {}).get('command', '')
bare = re.sub(r'"[^"]*"|\'[^\']*\'', '', command)
if re.search(r'(^|[;&|\s])sleep\s+\d', bare) or re.search(r'\bStart-Sleep\b', bare, re.I):
    sys.stderr.write('Polling is refused here: run the command with run_in_background and wait for its notification; the script prints one verdict line at the end.\n')
    sys.exit(2)
sys.exit(0)
```
Run the test — Expected: PASS.

- [ ] **Step 3: Register hooks and model** — `.claude/settings.json`:

```json
{
  "env": { "CLAUDE_CODE_SUBAGENT_MODEL": "sonnet" },
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash|PowerShell", "hooks": [
        { "type": "command", "command": "python \"$CLAUDE_PROJECT_DIR/tools/hooks/guard-git.py\"" },
        { "type": "command", "command": "python \"$CLAUDE_PROJECT_DIR/tools/hooks/no-poll.py\"" }
      ] }
    ],
    "PostToolUse": [
      { "matcher": "Edit|Write|MultiEdit", "hooks": [
        { "type": "command", "command": "python \"$CLAUDE_PROJECT_DIR/tools/hooks/lint-facts.py\"" }
      ] }
    ]
  }
}
```

- [ ] **Step 4: Write `.claude/AGENT_KIT.md`** (byte-stable; no dates, no state). Content, in this order, one short section each:
  1. Paths: `CRYSTALOSD_DATA`, `CRYSTALOSD_ASM`, `CRYSTALOSD_CAPTURES` and what lives in each; scratch in `lab/`.
  2. Reading code: `node References/scripts/asm.mjs <name|0xADDR> [--callers] [--writers <sym>] [--rom]`; never `cat`/`sed` over the asm folder; `disasm_rom.py` only for ROM code with no HDD counterpart.
  3. Verifier API: the exports of `References/lib/index.mjs` (copy the export list verbatim from the file) and `References/scripts/builds.mjs` (`pick, range, pc, BUILD, PAL`); EE float rule (each op cut toward zero via `add/sub/mul/div`, never `f(a + b)`; no denormals; `cvt.w.s` truncates); the verdict line `verdict: FOUND|PARTIAL ...`.
  4. Capture: the one command form from `.claude/skills/capture/SKILL.md` with `--mode exact`, `--build hdd|rom`, `--state`, `--presses`, `--verifiers`; naming `<build>-<topic>-<what>`.
  5. Waiting: long commands (`capture`, `mutate`, `run_all`, builds) with `run_in_background`; never poll; the hook refuses `sleep`.
  6. Rigor tiers (spec §3.5): which items need both builds + PAL + mutation + two refuters, which need HDD OSD + golden + one refuter.
  7. Output: return the agent's report shape; no history pasted back.
- [ ] **Step 5: Agents** — every agent file's first instruction becomes `Read .claude/AGENT_KIT.md first.`; set `model:` per role: `re-scout: haiku`, `re-refuter: sonnet`, `verifier-writer: sonnet`, `doc-writer: haiku`. Create `.claude/agents/porter.md`:

```markdown
---
name: porter
description: Ports ONE task from facts/ into Source/ — the C++ that computes what a facts page states, templated on Arithmetic where the scene is — and proves it with a test and the golden gate. Never edits facts/, verifiers or the model; never commits.
tools: Read, Grep, Glob, Bash, Write, Edit
model: sonnet
---
Read `.claude/AGENT_KIT.md` and `CLAUDE.md` first, then the facts page and the task you are given.

Rules:
- The code computes the rule the page states, operation by operation; never a value taken from a capture.
- A test under `tests/` pins it (EeArithmetic against the verifier's oracle where one exists); `tools/test.ps1 <area> fast` passes.
- Golden: record before your change, check after; a differing frame is either the change the task asks for (say which frames and why) or a bug.
- Builds and tests run in the background; never poll.

Return: **Task** · **Files** · **Test** (command and last line) · **Golden** (verdict) · **Open**.
```

- [ ] **Step 6: Workflows and skills** — `measure-campaign.js` and `measure-lanes.js`: every `agent(...)` call names one of the five agents (`subagentType`), one task per call, never `general-purpose`; `measure-lanes.js` runs tasks of a lane as fresh agents in sequence (handoff by the lane's ledger file `lab/ledger/<lane>.md`), not one agent per lane. `measure/SKILL.md` step 1 and `re-scout.md` point to `asm.mjs` instead of the folder.

- [ ] **Step 7: Check** — `python -m pytest tools/hooks -q` passes; `grep -rn "general-purpose\|CrystalOSD\\\\asm\|cat .*asm/" .claude` prints nothing.

- [ ] **Step 8: Commit**

```bash
git add .claude/AGENT_KIT.md .claude/agents/porter.md .claude/agents/re-scout.md .claude/agents/verifier-writer.md .claude/agents/re-refuter.md .claude/agents/doc-writer.md .claude/skills/measure/SKILL.md .claude/skills/capture/SKILL.md .claude/skills/campaign/SKILL.md .claude/workflows/measure-campaign.js .claude/workflows/measure-lanes.js .claude/settings.json tools/hooks/no-poll.py tools/hooks/no_poll_test.py
git commit -m "Feat(Project): Give the agents one kit and refuse polling"
```

---

### Task 6: One short CLAUDE.md, docs, ignore rules

**Files:**
- Create: `CLAUDE.md`, `docs/workflow.md` (from lab, paths updated)
- Modify: `facts/README.md` (state and what is left move here), `.gitignore`, `README.md`

- [ ] **Step 1: `CLAUDE.md`** — MarinKit's shape, under 80 lines, no state, no dates of work: what CrystalOSD is (one paragraph); the principle (`facts/` is the truth, the code computes what it states); the rules (build-id on every address, a fact is a verifier passing, rigor tiers, golden before/after, no polling, named agents, one worktree per front, commit and push rules, no attribution, Sony data rule); layers table (Scene, Render, Assets, Audio, App, Core, Parity); build/run/check commands (presets, `--soak`, `--validate sync`, `--golden`, `tools/test.ps1`, `run_all.mjs`, `asm.mjs`); data homes (`CRYSTALOSD_DATA`, `CRYSTALOSD_ASM`, `CRYSTALOSD_CAPTURES`); commit convention (Types `Fix Feat Refactor Perf Build Docs GS`, Scopes `Core Renderer Scene App Assets Audio Parity Shaders CI Project`). Where to look: `facts/README.md` (state, what is left), `docs/workflow.md`, `.claude/AGENT_KIT.md`.
- [ ] **Step 2: `facts/README.md`** gets a "What is left" section holding today's open items from both legacy CLAUDE.md files (sounds not wired, Version sub-row front page, Browser slices, Options dialog), PC scope rule (disc boot, real HDD, disc-state senders out). Run `node References/scripts/lint_facts.mjs facts/README.md` — Expected: `FOUND`.
- [ ] **Step 3: `.gitignore`** — `build/`, `bin/`, `out/`, `lab/`, `.cache/`, `compile_commands.json`, `.superpowers/`, `__pycache__/`, `*.pyc`, `.claude/settings.local.json`, `.mcp.json`. Check: `git status --short --ignored | head` shows no Sony data as untracked-not-ignored.
- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/workflow.md facts/README.md .gitignore README.md
git commit -m "Docs(Project): State the project in one short CLAUDE.md"
```

---

### Task 7: In-flight work

**Files:** branch `feat/browser` in the new repository; nothing on `main`.

- [ ] **Step 1: Native Browser** — in the legacy repo: `git -C D:/CodingProjects/CrystalClockVK diff 7c614a1 feat/browser --stat` and save `git diff 7c614a1 feat/browser > lab/feat-browser.diff`. Rewrite paths in the diff (`src/<layer>/` → `Source/<Layer>/`, `shaders/` → `Shaders/`, `resources/` → `Resources/`, includes as Task 1 Step 3) with `sed`, then in the new repo `git switch -c feat/browser && git apply --3way lab/feat-browser.diff`. Build app-debug, `tools/test.ps1 menus fast`, golden check against a baseline recorded on `main` of the new repo before the switch (`--golden record out/golden/main-debug.txt` on `main`, then on the branch `--golden check`): differing frames are only expected where the Browser is reached; report which. Commit on the branch: `Feat(App): Carry the native Browser from CrystalClockVK`.
- [ ] **Step 2: `browser-lab-icons`** — show Jean `git -C D:/CodingProjects/CrystalClockVK-wt/browser-lab-icons status --short` and `git diff`; on his word commit there, then apply the same way onto `feat/browser`.
- [ ] **Step 3: Triage report** for `loose-lab-{audio2,options,slide,values,vfront}`, `lab-gs-gzip`, `feat/browser-ico`, `feat/browser-devices`: per worktree, `git log --oneline 6a28003..HEAD`, `git status --short`, `git diff --stat`, and one line on what it holds. Present to Jean; carry only what he names.

---

### Task 8: Final branch review

- [ ] **Step 1:** Fresh reviewer (superpowers:requesting-code-review) on `main` of the new repo from `723ff2c`: spec coverage, path leftovers, CMake correctness.
- [ ] **Step 2:** Fix round for every finding with a cause; re-run Task 3 Step 5 and Task 2 Step 6 after fixes.

---

### Task 9: Cut-over (each step waits for Jean's yes)

- [ ] **Step 1: Data home** — size first: `du -sh D:/CodingProjects/CrystalClockVK/References/{bios,dumps,fixtures,pcsx2,textures}` and `df -h /d`. Copy with `robocopy D:\CodingProjects\CrystalClockVK\References D:\CodingProjects\CrystalOSD-Data /E /XD scripts lib model readings /NFL /NDL`; compare file count and total bytes both sides (PowerShell `Get-ChildItem -Recurse -File | Measure-Object Length -Sum`). Delete the source folders only after equal counts, and only on Jean's yes. Also move the start fixtures and any `tests/data` the tests read (named by `tests/CMakeLists.txt` defaults).
- [ ] **Step 2: Decomp legacy** — show its 3 loose changes (`git -C D:/CodingProjects/CrystalOSD status --short`, diff); on yes commit them. README banner at top:
  `> **Archived.** Successor: [CrystalOSD](https://github.com/JeanxPereira/CrystalOSD). This repository holds the matching-decompilation work and the disassembly the successor reads.`
  Commit `Docs(Project): Mark the repository archived`, push (yes), `gh repo rename CrystalOSD-Decomp-Legacy -R JeanxPereira/CrystalOSD` (yes), `gh repo edit JeanxPereira/CrystalOSD-Decomp-Legacy --description "Archived: matching decompilation of the PS2 OSDSYS. Successor: CrystalOSD"` (yes), `gh repo archive JeanxPereira/CrystalOSD-Decomp-Legacy --yes` (yes). Rename folder to `D:/CodingProjects/CrystalOSD-Decomp-Legacy` and `git remote set-url origin https://github.com/JeanxPereira/CrystalOSD-Decomp-Legacy`.
- [ ] **Step 3: CrystalClockVK legacy** — `git worktree list`; for each worktree folder, remove any junction inside it with `cmd /c rmdir` before `git worktree remove` (memory rule); worktrees with unmerged work Jean did not name are left in place and listed to him. Banner in README (`Successor: CrystalOSD`), commit, push (yes), `gh repo rename CrystalClockVK-Legacy` (yes), description (yes), archive (yes). Rename folder to `D:/CodingProjects/CrystalClockVK-Legacy`.
- [ ] **Step 4: New repository** — `gh repo create JeanxPereira/CrystalOSD --public --description "The PS2 OSDSYS, native in C++ and Vulkan" --source D:/CodingProjects/CrystalOSD-Next` (yes); rename folder to `D:/CodingProjects/CrystalOSD`; `git push -u origin main` (yes); push `feat/browser` only if Jean says so.
- [ ] **Step 5: Leftover paths (Review Focus 2)** — unset `CRYSTALOSD_DATA`/`CRYSTALOSD_ASM`, then:

```bash
cd /d/CodingProjects/CrystalOSD
grep -rnE "CrystalClockVK/References|CodingProjects/CrystalOSD/asm|CrystalClockVK-wt" --exclude-dir=build --exclude-dir=.git . | grep -v "docs/specs\|docs/plans" | head
node References/scripts/run_all.mjs > lab/run_all-final.txt 2>&1; tail -3 lab/run_all-final.txt
```
Expected: grep prints nothing; run_all all pass on defaults. Then `tools/build.ps1 test tests-debug` 100%, CI green on the pushed `main`.
- [ ] **Step 6: Memory** — update `MEMORY.md` entries that name CrystalClockVK paths (native fronts, canon binary, facts dir, ninja VSLANG — now obsolete under Clang) for the new repository; the project memory folder moves with the new working directory.
