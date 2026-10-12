# Facts

Pages in this directory are the only notes in this repository meant to be relied on. `docs/`, `context/` and the top-level `MEMORY.md`, which predated these pages and
mixed builds, were removed on 2026-10-03.

Rules for a page here:

- It names the build every address belongs to. Two builds are in play: **HDD OSD 1.10U**
  (`hddosd.elf`, SHA-1 `e932f3508313e2807467a0f354acc56869ea77f6`), the canon build, with the
  CrystalOSD symbols; and **ROM 2.30** (BIOS `0230AC20080220`; `0230EC20080220` in PAL), the build
  run live in Watson.
- It says how each statement is known: *verified* (a script recomputes it bit for bit from inputs
  a trace probe recorded; the script and a capture are named), *measured* (seen in a capture, not
  recomputed), *read* (from disassembly, with the address range).
- It names the script or tool that produced its numbers, so they can be produced again.
- A measured number is not a constant until what writes it has been read. A page records the rule
  that produces a value, not only the value: a number seen in one capture may be eased, depend on
  the video mode, or differ between builds (the scene scale and the vertical proportion both do).
- It states what the system is, in present tense; a later measurement replaces the statement it
  corrects.

| Page | What it holds |
|---|---|
| `verification.md` | Every verifier, what it covers and its result on each build; the regression suite; where the builds differ |
| `clock-function-map.md` | Which HDD OSD function each ROM 2.30 clock function corresponds to |
| `clock-state.md` | How the time becomes the current rod, the angles, the progress and the colours |
| `clock-camera.md` | View and screen matrices, scale and proportion, sines, rod and orb placement |
| `clock-scene.md` | How a frame is assembled: the depth-sorted draw list, measured rod parameters |
| `clock-rod-draw.md` | What the rod drawing function computes, pass by pass |
| `clock-extra-passes.md` | The two reflection passes over the rods |
| `clock-orbs.md` | An orb's trail, ring and sprites |
| `clock-frame.md` | End to end: a model that produces every packet of the rods, orbs, extra passes, background, blur, overlays and System Configuration's cubes of a frame from the frame's inputs, carried frame to frame |
| `clock-frame-rest.md` | The rest of a clock frame: the background tube, blur trips, copies and tint, fade overlay, vignette, bars; text only as which function sends what |
| `clock-transitions.md` | The timeline: entering the clock scene, menu to System Configuration and back, leaving, the first-run path, the options dialog, exits for the drive's codes |
| `clock-gs-state.md` | The helpers that choose buffer, texture, blend and depth test, compared call by call across the builds |
| `clock-config-items.md` | The block of configuration items at `0x409130`: item 0's writer, item 0's two writers, items 5 and 12 never written, the load that runs every frame |
| `clock-menu-leaves.md` | Which code writes the menu's state: the entry list, the page and the main menu, leaf by leaf, from a cold boot; which leaves never change |
| `clock-records.md` | The rod record and the cube record: which draw function stores which leaf each frame, which leaves keep the ELF value |
| `clock-rand-chain.md` | The random generator's state at the clock's start: the calls from power-on, through the opening, with and without a play history |
| `clock-textures.md` | Where the textures come from and what each one is |
| `config-cubes.md` | The glass cubes of System Configuration: the rods' pipeline with a cube mesh; placement, ring, pulse |
| `text.md` | The font file, the glyph cache, a glyph's twelve-vertex fan, the string filter, alpha and place of each string |
| `pal.md` | How each build decides PAL, every value that changes with the video mode and its rule, the verifiers' results on real PAL runs |
| `opening.md` | The boot intro (module `opening`): frame map, timeline, cubes, lights, fog, logo, towers and their VU1 microprogram, ROM 2.30, PAL, the hand-off, the illegal-disc scene |
| `sound-events.md` | Which code queues which sound command on the EE (menus, System Configuration, Square, Version page, clock start and set-up, disc change, opening): command, arguments, return address, frame; the command ring, the drain, the `0x6300` dedup, the `0x60D0` ramp, the boot chain from power-on, `a3` of `0x6300` |
| `hddosd-boot.md` | Why HDD OSD would not start in the emulator, and how it is started here |
| `data/rod-mesh.json` | The rod's mesh from the HDD OSD file: 16 faces; equal in both builds |

Measured pages about ROM 2.30 live with the instrument: `Watson/docs/findings/`.

The patent (US 6,693,606, `docs/clock_patent/`) states the intent and agrees with what was
measured: twelve blocks, the hour picks the block, the minutes are a filling that starts full
and runs down, the ring turns, light spots circle a sphere and leave tracks. It holds no
numbers; those come only from the binary. Two leads not read yet, from psdevwiki's OSDSYS page:
patents JP2001154772A (display method) and JP2001148032A (image plotting).

A way to drive the clock for a capture: System Configuration, Clock Adjustment. While a field
is being edited the seconds are held at 0, the orbs gather at the centre, and up or down on the
hour field turns the hour (`watson_gif_trace {hold: ["up"]}` records it from the first frame).

## How to work here

- Skills in `.claude/skills/`: `measure` (one function to a verifier to a fact), `capture` (taking
  a capture from the emulator), `facts-page` (the page contract), `campaign` (many questions at
  once), `commit` (explicit paths, message form).
- Agents in `.claude/agents/` read `.claude/AGENT_KIT.md` first: `lane-worker` (one task of a lane), `re-scout` (read-only scout of
  one question), `verifier-writer` (one verifier, mutation, manifest entries), `re-refuter`
  (re-runs one claim), `doc-writer` (one facts page), `porter` (one task from a page into
  `Source/`).
- `node References/scripts/run_all.mjs` runs the regression suite (`run_all.manifest.json`);
  `node References/scripts/mutate.mjs <verifier>` checks a verifier fails when its arithmetic is
  changed; `node References/scripts/lint_facts.mjs facts/<page>.md` must end `FOUND` after every
  edit of a page.

## What is left

The app (`Source/`) ports what these pages state; the regression suite
(`node References/scripts/run_all.mjs`) passes 981 of 981 entries. Parts of the OSD that have no
meaning on a PC are out of scope and are not ported: booting a disc (PS1, PS2, DVD), a real HDD,
and the disc-state senders.

Not in the app yet:
- The Browser: the native shell, page chrome, device row, card image and icons are on the branch
  `feat/browser`; the memory card pages beyond them, Copy and Delete are not started.
- The Options dialog; the front page of a Version row with sub-rows; the row-enter sound and the
  sub-page sound (`0x6300` with 4 and `0xA`).
- Sounds not wired or not measured: the Browser's own sounds, the Options dialog, the IOP spacing
  of sends within one drain, the tick jitter of the console.

What the pages list as open, deliberately, one line each, grouped by page:

**`clock-frame.md`**
- ROM 2.30 value tables by language: the jump table at `0x002C4920` is read in two orders that
  disagree for languages 3 to 6; settled by `dump_ee.mjs` on a ROM 2.30 capture.
- How a setting reaches item 0 beyond the confirm callback; the gate written by cross in is met
  by no capture.
- ROM 2.30's aspect value table (`0x0028ACE0`) is not read; its confirm of a changed aspect value
  is neither modelled nor captured.
- The generic editor, the enter callback and the gate writers outside the entry list are not
  modelled and not met.
- ROM 2.30 in PAL has the main menu into System Configuration only; PAL item 0 rows are verified
  on HDD OSD only.
- The leaving-entry drawing and the cancel's time guard are not modelled and not met.
- Strings are probed, not derived; a string running out of packet room is met by no capture.
- Overlay modes 1 and 4: which code sets them (the captures write the mode word).
- Not met in a capture: a confirmed value's pulse, a send with no face on one side of a rod,
  orb mode 2 on ROM 2.30, a transition other than the main menu into System Configuration on ROM
  2.30 in PAL, the time record's year, month, day and zone words.

**`clock-frame-rest.md`**
- Overlay mode 1's white colour and what sets modes 1, 3 and 4.
- PAL values of the ramp lengths, `ay` and the text scaling are read; the PAL whole-frame
  captures equal the model.
- The pages function beyond its blur trips; ROM 2.30's vignette sector function in full.

**`clock-transitions.md`**
- The reset in `func_00234B88` is never seen; overlay mode 1 has no caller.
- First-run stage 5 on HDD OSD is read, not compared; stage 3 (the settings pages) is not
  computed by `verify_first_run.mjs`; the PAL first run is captured to stage 2 on HDD OSD only.
- The regression suite does not hold `hddosd-110U-flow-pal-fr-logos`, the four
  `*-flow-exit72*.log` logs or `rom-0230E-pal-clock-written`.
- PAL hour carry: no script compares the carry itself; the wrap from 23 to 0 is not exercised.
- The buffers between sends (section 4e) are readings, not verifiers.

**`text.md`**
- ROM 2.30's trimming branch (`0x0020CBA0`, `0x0020CE44`) is reported, not reproduced.
- ROM 2.30 PAL constants in `romPlace` have no mutation run on the PAL captures.
- ROM 2.30 button pictures (NTSC and PAL) are not compared; its pages' load at start-up is not
  traced.
- The Japanese BIOS capture `hddosd-110U-text2-ja-boot` is empty (one reported hang, not
  reproduced); a Japanese console's layout row 0 is not verified.
- Font blocks 1, 3 and 5, decorations and a line break are reached by no clock string.
- Languages: video mode 0's path of `config_get_osd_language`, field values of 8 or more, the
  language entry's save path, Spanish, Portuguese, Italian and Dutch at the menu and at boot.
- `clock_text.mjs` takes the date and time strings from the probe and the caller's string id from
  the capture; ROM 2.30 has no frame model of text.
- Soft-double rounding in `DrawIcon`'s PAL branch is not distinguishable by any capture.
- The Browser's text.

**`pal.md`**
- ROM 2.30 PAL: `verify_trail_fill.mjs` and `verify_first_run.mjs` not run.
- HDD OSD PAL first run: only stages 0 to 2 captured.
- Hour carry in PAL: no script compares it; 23 to 0 is not exercised.
- Text in PAL: soft doubles modelled as IEEE; ROM 2.30 PAL button pictures not compared; no
  language other than English in PAL.
- `verify_opening3_illegal_v2.mjs` on the PAL capture: 31 of 177 mutants survive.

**`opening.md`**
- The hand-off's wait on exec 0 is entered and not left inside a capture.
- Hard-disk words not exercised (exec values, the ready word cleared during a run, the drive
  state machine at `0x002083B0`).
- The meaning of the sound command ids.
- The illegal scene's end wait: disc states other than 0x64, 0x72 and 0x74 are read, not captured;
  the tile fade branch `z < 672` is not reached.
- The ROM CDDA count's second store (`0x0020FDB0`) is known from a watchpoint only.
- Mutation coverage of the stage verifiers is not complete.
- PAL towers: the captures cover the state's start and the dive's end, not every frame between.
- The fade's 'W' mode; verifiers without a `_v2` copy keep the plain arithmetic helper.

**`sound-events.md`**
- Not reached: Up, Down and Cross inside the Version sub-page, the Options dialog, slide-list entries and other System Configuration entries, clock disc values `0x6B`, `0x6D`, `0x6E`, `0x70`, `0x71`, `0x73` (from the jump table only), the clock thread's second wake.
- ROM 2.30 senders (read only; `ra` of StartSysConfig and of the ROM thread start unsettled) and PAL.
- Where `a3 = 0x8000` at the opening's stage-2 `0x6140` comes from; what the IOP does with the ids other than `0x6300`.

**`clock-scene.md`**
- The sorted insertion and the depth key are not recomputed on their own.

**`clock-state.md`**
- The time keeper by recomputation; who reads the hour-hand and second-hand globals.

**`clock-camera.md`**
- Which menu event calls each of the three configuration callbacks.
- The code of orb modes 2 and 3 is read only as far as the targets and the colours.

**`clock-rod-draw.md`, `clock-extra-passes.md`**
- Which side of the rod flag 0 is; the float-to-unsigned conversion of the reflection
  coordinates below zero.

**`clock-gs-state.md`**
- The helpers that bind the display buffer, copy, blur and overlay are not compared call by call.

**`clock-textures.md`**
- Where `TEXCSMOK` and `TEXCSTSL` are drawn; the font's textures.

**`config-cubes.md`**
- What each send does to the pixels is a reading; no picture was compared.
- The placement vector's fourth word; the blur chain's own rule apart from `verify_frame.mjs
  --carry`; the font draws on that screen.
