---
name: capture
description: Use when taking a capture from the emulator (Watson/PCSX2) for a verifier — which mode, how to drive the menus, PAL and builds, the slot wrapper, and the mistakes that cost sessions before.
---
# capture — one session, one command

- **Always through the wrapper**, one launch-to-kill session per command: `node References/scripts/with_emulator.mjs node References/scripts/capture.mjs ...`. It queues for a free emulator slot (`watson.json` `instances`). Never call `watson_kill` after a failed launch.
- **Modes** (`--mode`): `exact` (interpreters, no packet origins; default, ~0.07 s/frame) for every bit-for-bit check; `trace` (origins of each packet, ~9 s/frame) only to learn which function sent a packet; `fast` (recompilers) for structure only — its floats differ by ulps. `--navigate fast` drives menus under the recompilers and switches to the interpreters for the capture.
- **Builds and states**: `--build hdd|rom`, `--state menu|config|clock` (and `*-pal-*`, `*-opening-*` states in `Watson/Runtime/states/`). HDD OSD boots only with an argument (`SkipSearchLater`; `BootOpening` plays the intro). PAL: `--video pal` with BIOS `$CRYSTALOSD_DATA/bios/megadump/ps2-0230e-20080220.bin`.
- **Input**: `--presses '[["cross",6,60]]'` (button, frames held, frames waited); a press of 2–3 frames is sometimes not taken, hold 6. `--hold up` holds for the whole capture.
- **Verifiers share a capture**: list them all in `--verifiers a.mjs,b.mjs`; the probes are merged (several probes may share a pc).
- **Memory writes** (stimuli) land only after the program's code is loaded; a code patch written at frame 1 is overwritten. Say in the fact when a branch was reached by a write.
- Name captures `<build>-<topic>-<what>` (`hddosd-110U-…`, `rom-0230A-…`, `rom-0230E-pal-…`). Keep traces short (30–120 frames).
- GS memory between draws: pause at a breakpoint (recompilers) and `watson_gs_read`.
