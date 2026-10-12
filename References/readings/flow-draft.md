# Flow and screens: the open items of the clock scene (draft for `facts/`)

## CHECKPOINT (paused 2026-10-02 at Jean's request, for the Watson upgrade)

### Done and verified

- **3. Exits for the drive's codes** (`verify_exits.mjs`, logs `Watson/Runtime/captures/hddosd-110U-flow-exits.log`,
  `rom-0230A-flow-exits.log`): every code 0x6A..0x74 (HDD) and 0x6A..0x75 (ROM) put in `s0` at the
  decision (breakpoint HDD `0x00225A4C`, ROM `0x002210D4`) exits exactly 128 frames later at the end
  (HDD `0x00225CD4`, ROM `0x002213AC`) with the writes the code says. 0x72 does not exit while the
  word at HDD `0x1F0D58` / ROM `0x1F0CF8` is 0 (state as captured); with the word written at the decision
  (`flow_exit72.mjs`, logs `hddosd-110U-flow-exit72.log`, `rom-0230A-flow-exit72.log`; the gate word read back as 1) it
  exits 128 frames later at the same end with module 5, previous 2, execute_app_type -1, on both builds; with it
  written to 0 (`*-exit72-gate0.log`) it does not exit in 400 frames. The gate word is read at HDD `0x00225A78`
  (`blez` at `0x00225A80`). The ROM PAL written-state capture `rom-0230E-pal-clock-written` (state `rom-0230E-pal-clock`,
  `0x375200` written to 5:59:59.900 at frame 0): `verify_clock_state.mjs` FOUND 72 frames, every value equal;
  the capture holds the hour carry (900 ms 5:59:59 to 6:00:00.005) and then the record returns to the RTC time.
- **4. Mode 1 and the reset**: a scan of both binaries for `jal`/`j` to set-mode (HDD `0x00234C28`,
  ROM `0x00231230`) and for the address as a data word finds 6 callers each, all with a constant
  argument 2, 3 or 4, and no pointer: **mode 1 cannot be set** in either build. Its rule (read):
  overlay colour 255, 255, 255 (`D_002B5F30` +0, +4, +8), weight 0. The reset `func_00234B88`
  (ROM `0x00231190`) is called once, at `0x00225DD8` in `module_clock_init_resources`, and set-mode(2)
  at `0x00225E60` in the same function; none of the seven functions called between them reads the
  mode or the weight, so the reset's mode 0 / weight 0 is never seen. What it does set and is seen:
  `D_003702E0 = fps*40/60`, the band ramp length `D_002B5F20 = D_003702E4 = fps*80/60`, `D_003702E8 = 1`.
- **5. Per-orb random angles** (`verify_rand.mjs`, logs `hddosd-110U-flow-rand-boot.log`,
  `hddosd-110U-flow-rand-opening.log`, `rom-0230A-flow-rand-boot.log`): newlib `rand`
  (`state = state*0x41C64E6D + 12345`, `rand = state & 0x7FFFFFFF`, state at `_impure_ptr+0x58`),
  `R_k = rand % 65536`. 21 of 21 angles equal. On a plain HDD OSD power-on the state is 1 when the
  clock draws them, so the angles are always 7EA6 B0E7 E494 9B3D DF32 7483 B600; through the intro
  (whose lights call `rand`) and on the ROM power-on (which plays the intro) the state differs.
- **6. Configuration list ramp** (read in `StartSysConfig`): length = `D_003702E0` (fps*40/60, set in
  `func_00234B88`) + `D_003702CC` (fps*40/60, `func_002324C8`) + `D_003702D0` (fps/6, `func_002324C8`)
  = 90 NTSC, 74 PAL, set on every opening; equal to the values measured by the transitions and PAL work.
- **1. Options dialog (triangle in System Configuration)** (`verify_options.mjs`): triangle on a list
  entry pushes a dialog (HDD `func_0022D558(page)` from `func_002316B8`, page chosen by the entry;
  ROM `0x002288B8`, one fixed page titled "Options"). Dialog ramp (HDD `D_002B46B8`, ROM `0x00293BA8`)
  length `D_003702D0 + D_003702CC` = 50; ticked once a frame from the pages function
  (`func_0022D5D8`, ROM `0x00228918`); the page opens (`func_0022ABC8`) on the frame the rising value
  reaches `D_003702CC` (40); when the page's own ramp falls the dialog hides (`func_0022D5A0`).
  Captures `hddosd-110U-flow-options-{open,close}`, `rom-0230A-flow-options-{open,close}`: 77+77 and
  77+77 ticks, every ramp value equal (rising 5..50, falling 46..0), page opened on the computed
  frame on both. `verify_frame.mjs` (per-frame snapshots) on the same captures: every packet the
  model produces equal (HDD 74 + 75 frames, 86.2% / 84.6% of the packets; ROM 75 + 75, 92.6% /
  90.0%; the rest is text). With `--carry` the model's carried state differs in `entryActive` and
  the configuration-items ramp: the dialog is an event the model does not take yet.
  Page title differs: HDD shows the entry's name ("Clock Adjustment"), ROM "Options".
- **7.** Cube blur chain `func_00236350(n)`, `n = 5 − level`: in the whole-frame model
  (`clock_cubes.mjs`); `verify_frame.mjs --carry` on `hddosd-110U-whole-to-clock` gives 390 + 390
  chain packets equal. ROM 2.30's config-screen GS state (`rom-0230A-flow-config-gs`, 14 frames,
  `verify_gs_state.mjs`): 6 720 helper calls, every register equal to the reading except the three
  known ROM differences (`TEST_1 0x70000`, register `0x7F` for `TEXFLUSH`, `CLAMP_1` 5 / 0).
  ROM binder `0x002305F0` and vignette `0x00230000`: read by the whole-frame work and reproduced
  packet for packet by it (vignette 1 275 packets in `rom-0230A-whole-enter`, 289 in PAL).
- **8. PAL leftovers, done**: `verify_transitions.mjs` FOUND on `hddosd-110U-flow-pal-boot` (power-on),
  `-pal-open`, `-pal-close`, `rom-0230E-flow-pal-open`, `-pal-close`; `verify_trail_fill.mjs`
  2 086 strips / 49 392 points on `hddosd-110U-flow-pal-boot`; `verify_cubes.mjs` 190 cubes on
  `rom-0230E-flow-pal-cubes-appear`; `verify_clock_state.mjs` 66 / 67 frames and
  `verify_placement.mjs` on `hddosd-110U-flow-pal-hour`, `rom-0230E-flow-pal-hour` (hour turned in
  Clock Adjustment); `verify_orbs.mjs` 924 strips / 1 848 sprites on `hddosd-110U-flow-pal-fade-up2`
  (ramp rising 178 calls, length 213). No verifier needed a `_pal` copy (they take `CLOCK_VIDEO=pal`).
- **9. What the buffers hold, at frame end** (`extract_buffers.mjs`, PNGs in the git-ignored
  `References/textures/buffers/`): from the GS memory at the start of a dump (= the end of the
  previous frame) of `hddosd-110U-whole-clock`, `-whole-config`, `rom-0230A-whole-config`:
  work buffer 0 (FBP 0xD2) holds the scene as the refraction source (background, rods with +255,
  orbs in their second colours), alpha 127 mostly; work buffer 1 (FBP 0x118) holds, on the clock
  screen, the second extra pass (reflection + grain on the rods' near faces, alpha 128/127), and
  on System Configuration the cubes' grey silhouettes; work buffer 0's alpha there is 128 exactly
  inside the cubes' silhouettes, 0 elsewhere (the cubes' depth/alpha quads); the display buffers'
  alpha is 0 in the picture and 128 under the bars and the text.

- **9b. What each send adds** (`flow_buffers_sends.mjs`, logs and PNGs in the git-ignored
  `References/textures/buffers/{hddosd-110U,rom-0230A}-flow-sends-{clock,config}/`; run through
  `with_emulator.mjs`, recompilers, `watson_gs_read`). A breakpoint sits after the path sync that opens the
  DMA kick of the send function (HDD `0x00233468`, ROM `0x0022F9A0`); the send sites are found by scanning for
  `jal` to the send entry (HDD `0x00238DB0`, ROM `0x00235350`) and the caller is the return address saved at
  `0x10(sp)`. Observed method property: the software renderer draws a batch only when the next draw changes
  state, so the GS memory read at the stop before send *k* holds sends up to *k-2*. A send's effect is therefore
  the difference between the snapshots at the stops *k+1* and *k+2* (the script prints it so), with two exceptions
  seen: a rod's last send followed by an orb send (the orb's first draw does not change the state) shows its
  effect one stop later (3 of 12 rods in the first HDD clock frame; the "late" lines; its pixel count equals the
  fourth send's exactly), and full-screen sprites (clears, the alpha-30 rectangle) land at once, so they show in
  the entry of the send before them. In ROM 2.30 the one-face-a-time grain sends of a split rod have the same
  state and merge: their effect shows only when the pass changes state (the "late" lines of `rod.s2`, `rod.s3`).
  Buffers: display 1 is the one drawn on the frames captured (display 0 on others), work 1 FBP 0x118, work 0
  FBP 0xD2; boxes are screen pixels.
  - **Rod, HDD OSD (clock screen)**: five sends per rod, `rod.s1..s5` (whole) or `rod.s6..s10` (split). Effects,
    equal in every rod of the capture frame (12 rods, 135 sends): s1/s6 refracted far faces into work 1 (N
    pixels, colour moves toward the scene's refraction, alpha 0..128); s2/s7 grain into work 1 (about 0.9 N
    pixels, alpha stays 127); s3/s8 second grain (about 0.8 N, alpha 127); s4/s9 near faces into the display
    buffer (N pixels, alpha 0..128, the same box as s1); s5/s10 the same near faces into work 0 (the same count
    as s4, brightened: mean colour toward white). The counts for the first rod: 1515, 1358, 1185, 1515, 1515.
    Targets are those of `clock-rod-draw.md` (pass 1 to 0x118, 2 and 3 texture, 4 the frame, 5 to 0x0D2).
  - **Extra passes (HDD)**: `extra-rod.s2` puts the reflection into work 1 (0 to mean 50..85 grey, alpha 127, the
    rod's own pixel count), `extra-rod.s3` the grain over it (mean falls to 10..45, the pixel count of s2 or
    slightly less); `extra-rod.s1` stands in for s2 once in each pass (one rod of twelve, the same effect). The alpha-30 rectangle covering
    the frame (143 305 pixels, alpha 29/30) comes after the last rod of each pass.
  - **Cubes, HDD OSD (System Configuration)**: eight sends per cube, `cube.s1..s8`: s1 refracted body into work
    1 (alpha 0..128), s2 and s3 two grain sends into work 1 (alpha 127, 0.92 and 0.85 of s1's pixels); s4 the same
    body into work 0 (colour falls to the grey silhouette, mean about 24 of 255); s5 the same pixels with alpha
    32 and unchanged colour (the depth/alpha quad: the alpha channel only); s6 refracted body again into work 0
    (colour back up, alpha 0..128), s7 and s8 two grain sends into work 0 (alpha 127). The highlight layer's
    `cube-hl.s1` draws each cube's silhouette into work 1 after a full-screen clear of work 1 to 0 (143 259
    pixels) and `cube-hl.s2` sets alpha 128 on about 9% of those pixels with the colour unchanged.
  - **ROM 2.30**: rods, five passes per rod as in `clock-rod-draw.md`: `rod.s8..s12` for a whole rod have the same
    effects as HDD (work 1, work 1, work 1, display, work 0, equal counts for the two near-face sends; first rod
    1092, 912, 792, 1098, 1098); split rods send the grain one face a time (`rod.s2`, `rod.s3`, `rod.s4`,
    `rod.s5`, repeated), whose effect appears together. Cubes: six sends, `cube.s1..s3` into work 1 and
    `cube.s4..s6` into work 0 (body, then two grain sends, alpha 0..128 then 127; no alpha-only quad send
    and no grey silhouette step, colours of work 0 rise to blue, e.g. 2,29,39 to 6,77,180); `cube-hl.s1` once per
    cube, whose `s2` does not occur (the ROM highlight cube is a single send). The ROM extra-pass sends are
    `extra-rod.s2` (reflection into work 1, grey 0 to 65..77) and `extra-rod.s3` (grain, down to 21..29).
  - Not done: a per-send claim is a reading of two snapshots a stop apart, not a verifier; the effects of the
    first send of each group are relative to a baseline that includes the previous orb's pending batch (a 2-pixel
    stray appears in the entries of `rod.s8` and `rod.s9` of the first HDD rod).

### In progress (sessions running when paused; let finish, not yet checked)

- `hddosd-110U-flow-fr-{logos,lang,end}`: HDD OSD first run from state
  `Watson/Runtime/states/hddosd-1.10U-host-flow-firstrun.p2s` (made by writing 0 to
  `should_enter_clock_module_2AD22C` at the clock's set-up breakpoint `0x002324C8`), probes of
  `verify_first_run.mjs` + `verify_transitions.mjs`. Check with
  `CLOCK_BUILD=hdd node verify_first_run.mjs <trace>` and `verify_transitions.mjs`.
- `hddosd-110U-flow-pal-hour-free` (PAL, time record written to hh:59:59 + 901.5 ms), probes of
  `verify_clock_state.mjs` + `verify_placement.mjs`.
- `rom-0230E-flow-pal-fade-up3` (ROM PAL fade rising; the earlier `-fade-up2` stopped after 2 frames
  on a spurious stop at `0x81FC0`).

### Next, in order

1. Check the three captures above.
2. ROM first run: trace from `Watson/Runtime/states/rom-0230A-flow-firstrun-700.p2s` with the probes of
   `verify_first_run.mjs` (ROM addresses are in it: machine `0x00229778`, ramps `0x002953F0`, stage
   `0x002C987C`, overlay `0x002C9840`, pad `0x002C9948`, gate `0x001F00B0`) + `verify_transitions.mjs`:
   steps `[["trace","rom-0230A-flow-fr-logos",320],["pad",["cross"],6],["trace","rom-0230A-flow-fr-lang",70],
   4 × (["pad",["cross"],6],["advance",150]),["trace","rom-0230A-flow-fr-end",120,["cross"]]]`.
   The ROM logo image function is not mapped yet (HDD `oobe_load_image` 0x0022E5D8).
3. HDD PAL first run: make the state (boot PAL BIOS + ELF + `SkipSearchLater`, breakpoint
   `0x002324C8`, write 0 to `0x2AD22C`, save `hddosd-1.10U-host-pal-flow-firstrun`), then trace 360
   frames of the logos with the same probes and `CLOCK_VIDEO=pal`.
4. 0x72 exit with its gate word written at the decision breakpoint, both builds.
5. PAL written-state capture on ROM (`rom-0230E-pal-clock`, write `0x375200`).
6. Item 9 between sends: done, see 9b above (HDD OSD and ROM 2.30; clock and System Configuration).
7. Fold these results into `facts/` (main session).

### Limits and problems met

- `with_emulator.mjs` can crash with `ENOENT ... stat 'emulator.slot-N'` when a slot directory is
  removed between its `mkdir` and its `stat` (race with another worker); the session is then lost.
  The capture helper retried.
- Under load `watson_pause` right after a launch can time out, and a trace can stop on a spurious
  stop at `0x81FC0`; both cost reruns.
- Probe de-duplication by `pc` keeps the first verifier's ranges: two verifiers probing the same
  function with different ranges (e.g. `verify_placement` and `verify_orbs` at the orb function)
  cannot share a capture; the first PAL fade-up captures were useless for `verify_orbs` for this reason.
- Breakpoints do not fire under the interpreter, so a state made with a breakpoint (first run) needs
  a recompiler session first and an interpreter session second.
- **Watson feature needed for item 9**: a command that, with the VM paused at an EE breakpoint,
  waits for the GS thread to drain (MTGS `WaitGS`) and returns bytes of GS local memory (the
  software renderer, which `Run.ps1` already selects with Renderer 13, keeps `GSLocalMemory`
  current), e.g. `watson_gs_read {address (in 256-byte blocks or words), length}` or
  `{fbp, fbw, psm, x, y, w, h, path}` decoded to PNG on the server side. With breakpoints after the
  DMA send of each rod/cube send (the emitters' send calls), it would show each buffer between sends.
  `pcsx2-gsrunner` replay could serve too, but it renders nothing on this machine (open problem in
  Watson's gsdump plan).

## Result so far

| Item | HDD OSD 1.10U | ROM 2.30 |
|---|---|---|
| 1. Options dialog | 77 + 77 frames, every ramp value; page on the computed frame; frames' packets equal | the same |
| 2. First run | pages and stage machine read; traces in progress | pages measured by snapshots; trace next |
| 3. Exits | 11 codes equal (0x72 gated) | 12 codes equal (0x72 gated) |
| 4. Mode 1, reset | no caller (scan of the binary); reset unobservable | the same |
| 5. Random angles | 14 of 14 | 7 of 7 |
| 6. List ramp | rule read: 40 + 40 + 10 / 33 + 33 + 8 | same code |
| 7. Chain, GS state, binder, vignette | 780 chain packets | 6 720 calls; binder and vignette via the whole-frame model |
| 8. PAL | transitions, trail, hour, fade rising: all equal | transitions, cubes, hour: equal; fade rising in progress |
| 9. Buffers | measured at frame end; between sends needs a Watson feature | the same |

## The first-run path (read; verification in progress)

What marks it (HDD OSD): `main` calls `enable_enter_clock_module_208398` (writes 0 to
`should_enter_clock_module_2AD22C`) when `config_first()` reports no saved configuration or
`oobe_forced` is set; `enter_clock_module_208378()` is then 1, and the clock's set-up
`func_002324C8` ends in `func_0022D760`: gate ramp `D_002B46D0` shown, logo ramp `D_002B46F0`
length fps, text ramp `D_002B46E0` length fps/2, `D_002B4A34 = fps/2`, stage `D_00370264 = 0`,
overlay `D_00370238 = 0x80`, scale target `D_00370294 = D_0036FBC8 = 0.8`. Stages (table
`0x00365710`): 0 PlayStation logo, 1 PS2 logo (`oobe_load_image(res, x, y, w, h, alpha)`, rules in
`verify_first_run.mjs`; each logo rises fps frames, holds fps, falls fps; set-mode(4) when it
starts), 2 the language prompt (text ramp; cross hides it; leaving it calls set-mode(2)), 3 the
User Preferences pages (page record `D_002B4A18`; overlay 0), 4 "Settings completed" (cross), 5 the
end (scale and target 1.0, gate hides, set-mode(2) unless an exit is pending, the first-run flag is
switched off by `disable_enter_clock_module_208388`). ROM 2.30 has the same six-stage machine at
`0x00229778` with the extra condition on `0x001F00B0`. Snapshots: `hddosd-110U-flow-fr-*.png`,
`rom-0230A-flow-fr-*.png` (language list in seven languages, Language, Time Zone, Daylight Savings,
Settings completed).
