# Opening module map (HDD OSD 1.10U)

Recorded 2026-10-02. Static reading only: no emulator, no MCP.

Build: **HDD OSD 1.10U** (`hddosd.elf`, SHA-1 `e932f3508313e2807467a0f354acc56869ea77f6`, checked equal to the
file named in `splat_config.yml`). Every address below belongs to this build.

Inputs:

- Disassembly: `D:\CodingProjects\CrystalOSD\asm\opening\` (70 files), plus callers in `asm\core`, `asm\graph`,
  `asm\cdvd`, `asm\history`, `asm\module`, `asm\clock`.
- Names: `CrystalOSD\symbol_addrs.txt` (names taken on its word; `func_XXXXXXXX` is only an address).
- Initialised data (floats, tables, strings): read from the file image of `hddosd.elf` at
  `file offset = vaddr - 0x200000 + 0x1000` (single LOAD segment). Anything that is `.bss` (for example the
  camera block `0x003DB800`, `0x002B0C60`) is zero in the file and its run-time content is **not** known from here.
- `CrystalOSD/docs/modules/opening/*.md` was **not** relied on; two claims in it disagree with the code (see
  section 2 note).

Labels: **READ** = what the instructions do (address given). **INFER** = my interpretation. **NOT DETERMINED**
= not settled.

gp for every module thread is `module_gp_area = 0x00377970` (`core/main` 0x0020DB98 passes it to `CreateThread`;
`module_opening_prepare` 0x0021AAE4 does the same). So `%gp_rel(D_003700xx)` names are absolute addresses
`0x003700xx`, shared by all modules. Names below such as `D_00370004` are those absolute addresses.

---

## 1. Entry points and call tree

### 1.1 How the module is entered

READ, in order:

1. `handle_version_info` (`core/`) calls `module_opening_setup` at 0x0020AA74, then `module_clock_setup`
   (0x0020AA7C), `module_browser_setup` (0x0020AA84), `module_dummy_setup` (0x0020AA8C),
   `module_cdplayer_setup` (0x0020AA94). Each setup fills a 0x1C-byte registry entry through `func_00208408`
   (`module_opening_setup` 0x0021AB38: prepare = `module_opening_prepare`, desc = `module_opening_getdesc`,
   version = `module_opening_getversion`). `module_dummy_setup` (0x0021AB88) registers an entry whose prepare is
   NULL.
2. `init_modules_20D228` (0x0020D228) calls every non-NULL prepare (`jalr` at 0x0020D258) and stores the
   returned thread id in the table `D_00386C60` (store at 0x0020D268). With the dummy skipped the table order is
   **[0] opening, [1] clock, [2] browser, [3] cdplayer**. (INFER from the registration order; the order of
   `func_00208558` entries was not independently read.)
3. `module_opening_prepare` (0x0021AAC8): `CreateThread` (entry `module_opening_thread_proc`, stack
   `D_003B7FE0`, stack size 0x20000, priority 6, gp = `module_gp_area`, 0x0021AAD4..0x0021AB08) then
   `StartThread` (0x0021AB18). The thread immediately sleeps (`SleepThread`, 0x0021ABE0).
4. `core/main` selects the module in `var_current_module` (0x001F0648) and wakes it:
   - `module == 4` loads `D_00386C60[0]` (0x0020E1F8..0x0020E1FC): **module 4 runs the same thread as module 1.**
   - `module == 1` goes through the generic path `D_00386C60[module-1]` (0x0020E2EC..0x0020E308) = `[0]`.
   - `WakeupThread` at 0x0020E30C, then `WaitSema(moduleFinishSema = threadid_2AE5D8 + 0x14)` at 0x0020E328.
   - Other modules: `main` loops (0x0020E120 .. 0x0020E334); after each return it re-checks
     `execute_app_type` (0x001F0010) and boots a disc if it is not -1, otherwise wakes the thread again.

**There is no per-frame call from `core` into the opening module.** `main` wakes the thread once; the thread
runs the whole intro in its own frame loop and posts `moduleFinishSema` once at the end
(`SignalSema(threadid_2AE5D8+0x14)` at 0x0021AC40). (The clock module differs: its thread signals and sleeps
after every frame, `module_clock_thread_proc` 0x00225D80..0x00225D88.) READ.

Which value of `var_current_module` selects the opening:

- `1` = normal intro scene, `4` = "illegal disc" scene (same thread; see `opening_thread_set_vars` 0x0021AE40..0x0021AE50:
  `D_0037000C = (var_current_module == 4)`).
- READ, `main` argument parsing: argument `BootOpening` sets module 1 (0x0020DEA0..0x0020DEB0); `BootWarning` sets 4
  (0x0020DEC8..0x0020DED0); `BootIllegal` calls `override_illegal_disc_type` (0x00211920, writes 0x74 to
  `0x1F000C` and `D_00392924`) then sets 4 (0x0020DEF0..0x0020DEF8). `BootClock` = 2, `BootBrowser` = 3,
  `BootCdPlayer` = 5.
- READ: with **no** `Boot*` argument `main` leaves module 0 and decides from the raw disc register
  (0x0020DF48..0x0020E064): if `enter_clock_module_208378()` is non-zero module = 2; otherwise
  raw type (byte at 0x1F40200F) < 0x10 or in 0x15..0xFB or unknown = module 2; 0xFD = module 5; 0xFF = module 4;
  PS1/PS2/DVD types set `execute_app_type` directly (0x14->0, 0x12/0x13->1, 0x10/0x11->2, 0xFC/0xFE->3) and skip
  every module. **No store of module 1 other than `BootOpening` exists in `main`.** Other writers of
  `0x1F0648`: `opening_transition_to_clock` (values 0, 2, 4, 5), `browser_exit_previous_module` (value from a
  browser variable `g_browser_module_transition_dest`; what values it takes was not traced), the clock handler
  (value 3). So in this build the intro is reached by `BootOpening` or by returning to module 4/1 from the
  modules above. **NOT DETERMINED:** whether anything stores 1 through the browser variable, and what the
  argument list of a real power-on contains (that is decided by the loader, outside these files).

### 1.2 Per-frame functions (opening scene, module 1)

All READ.

| Role | Function | Address |
|---|---|---|
| thread body | `module_opening_thread_proc` | 0x0021ABD0 |
| frame loop | `OpeningDoOpeningIllegal` | 0x0021ADA0 |
| update | `OpeningProcess` | 0x0021ACD8 |
| update core (state machine, camera, matrices) | `OpeningProcessInner` | 0x0021EF00 |
| scene dispatch, scene 0 | `OpeningDoOpening` | 0x00222180 |
| draw, scene 0 | `OpeningDrawOpeningScene` | 0x00221CB0 |
| scene dispatch, scene 1 | `OpeningDoIllegalDisc` | 0x00222E70 |
| draw, scene 1 | `OpeningDrawIllegalScene` | 0x00224578 |
| frame end | `OpeningDrawEnd` | 0x0021AD58 |
| vsync handshake | `OpeningDoWaitNextFrame` (in `graph/`, 0x0020BFA8) | 0x0020BFA8 |

Loop body, `OpeningDoOpeningIllegal` 0x0021ADC8..0x0021AE14:
`OpeningProcess` -> `switch (D_00370004)` {0: `OpeningDoOpening`, 1: `OpeningDoIllegalDisc`} -> `OpeningDrawEnd` ->
`D_00370004 = D_00370008` -> loop while `D_00370008 != 2`.

`OpeningDrawEnd` (0x0021AD58): `OpeningDoText` (0x0021DE88) -> if `D_00370014 != 0` `func_0021D6C0` (letterbox bars,
0x0021AD74) -> `OpeningDoWaitNextFrame` (`SignalSema(+0x30)` then `WaitSema(+0x38)` on the semaphore block at
`threadid_2AE5D8`) -> `D_00370000 += 1` (0x0021AD84..0x0021AD90). `D_00370000` is the module's frame counter.

### 1.3 Thread body, in order (`module_opening_thread_proc` 0x0021ABD0)

`SleepThread` -> `opening_thread_set_vars` (0x0021AE30, in `core/`) -> `opening_thread_set_vars_2` (0x0021AE78) ->
`OpeningInit` (0x0021AC50) -> `func_002118E0(D_00370004 != 0)` (writes `D_00392910`, a flag inside the CDVD
handler's block `unksema_392900+0x10`; see 2.6) -> `OpeningDoOpeningIllegal` -> `opening_transition_to_clock`
(0x0021AEE0, the hand-off) -> `func_002118E0(1)` -> `SignalSema(moduleFinishSema)` -> back to `SleepThread`.

### 1.4 Init path (`OpeningInit` 0x0021AC50)

`D_00370008 = D_00370004 = D_0037000C` (0x0021AC64, 0x0021AC6C) -> `OpeningInitRender` (0x0021B128) -> sets 0xE in
the low bits of two 64-bit words at 0x001F0AC0 and 0x001F0BB0 (0x0021AC70..0x0021AC9C, inside the double buffer
struct at 0x001F0A70 built by `InitDraw` 0x0020BD58; which GS register it is: NOT DETERMINED) ->
`OpeningInitAnimation` (0x0021EE48) -> `OpeningInitTowersFog` (0x00221D30) -> `func_00222E38` (0x00222E38; illegal-scene
static data: `func_00223368`, `func_0021E6C8`, `func_00222BE8`; also zeroes `D_003700E4`, `D_003700F4`, `D_00370100`)
-> `func_0021DE50` (text variables, in `graph/`) -> `StartFrame` -> `D_00370000 = evenOddFrame (0x1F0CA0)`.
So the frame counter starts at 0 or 1 and its low bit is the field parity.

`OpeningInitRender` (0x0021B128): `sceDevVif0/Vu0/Vif1/Vu1/GifReset`, `sceGsResetPath`, `memset(0x1100C000, 0, 0x4000)`
(VU1 data memory), `InitDMA`, `InitSPR`, `InitDoubleBuffer`, `gsInitAlloc`, `gsAllocExtraBuffers`,
tail-calls `OpeningInitTextures` (0x0021B208).

### 1.5 Call tree between the 70 files (READ from `jal`/`j` in each file)

```
module_opening_setup 0021AB38 -> func_00208408
module_opening_prepare 0021AAC8 -> CreateThread, StartThread
module_opening_thread_proc 0021ABD0
  OpeningInit 0021AC50
    OpeningInitRender 0021B128
      InitDMA 0021B2F8 (VIF1/GIF/SPR channel handles -> D_00370020/24/28)
      InitSPR 0021C010 (sprAlloc: D_00370058 = 0x280 bytes, D_0037005C = 0x240 bytes, D_00370060/64)
      InitDoubleBuffer 0021B570 (D_00370030 = 1.0, D_00370034 = D_0036F980/84)
      gsInitAlloc, gsAllocExtraBuffers (graph/)
      OpeningInitTextures 0021B208 -> OpeningInitTexture 0021C440 -> OpeningUploadImage 0021C1B0, GetResourceData
    OpeningInitAnimation 0021EE48
    OpeningInitTowersFog 00221D30 -> func_00220D60 (20x20 float table), func_0021DEA8 (fog mesh), func_0021CF38
    func_00222E38 -> func_00223368, func_0021E6C8, func_00222BE8 (-> func_002245C0 cube mesh)
    func_0021DE50
  OpeningDoOpeningIllegal 0021ADA0
    OpeningProcess 0021ACD8 -> OpeningProcessInner 0021EF00 (-> OpeningInitAnimation), vif1SetSCISSOR_1
    OpeningDoOpening 00222180
      OpeningInitOpeningScene 00221BB8 -> InitLightsCubes 002209E0 (-> func_002245C0), vif1SetAD
      OpeningDrawOpeningScene 00221CB0
        func_002214F8  towers (-> func_002210B0, 00221140, 002211B8, 00221248, 00221400, sceDmaSync, sceGsSyncPath)
        func_0021D140  full-screen overlay (graph/)
        func_0021CF38  copy to the extra buffer (graph/)
        OpeningDrawFog 0021E168
        [camera z < 73.0] OpeningDrawLightsAndCubes 00220CE8
            OpeningDrawLights 0021F5F8
            5 x func_00220450  one cube
                func_00224EB8 (-> func_00224BC0)  cube transform + light + clip
                module_opening_225728  copy frame buffer -> extra buffer (snapshot)
                func_00225380 (-> func_00225268)  pass state (frame, tex, alpha)
                func_002246C8 / func_00224B10 / func_00224938  pass shapes
                func_002254E0  faces loop, calls the per-vertex callback D_00370108 = D_0021FEB8
        func_00221A50  dive blur (-> func_0021D3D0)
        func_00221B00  fade to black (-> func_0021D848)
    OpeningDoIllegalDisc 00222E70
      OpeningInitIllegalScene 002244A0 -> func_0021EE98 (core/align_01FE98.s), func_0021CF38
      OpeningDrawIllegalScene 00224578
        first call only: D_003700E4 = 1
        func_002243F8 (-> func_0021CF38, func_0021D140, func_00223608, func_00223980, func_00223E48 (-> func_00223230 -> func_00222EE0))
        func_0021E950 (one rotating textured sprite)
        func_00222DD8 (5 x func_00222678 = cube, same structure as func_00220450; callback D_002221F0)
        func_002242C8 (fade, -> func_0021D848)
    OpeningDrawEnd 0021AD58 -> OpeningDoText 0021DE88 (-> func_0021DB50 logo, func_0021DD90 banner), func_0021D6C0, OpeningDoWaitNextFrame
  opening_transition_to_clock 0021AEE0
```

`D_0021FEB8` and `D_002221F0` are labelled data but are code (the per-vertex callbacks); `D_0021DEA4`, `D_0021E6C4`
are single `nop` alignment words. Files `module_opening_getdesc` (0x0021AAA8, returns 0x0036FFE8) and
`module_opening_getversion` (0x0021AAB8, returns the string `"1.20"` at 0x00370118) are descriptors only.

Several files in `opening/` are **shared GS helper libraries**, not opening logic: `InitDMA`, `InitSPR`,
`InitDoubleBuffer`, `OpeningUploadImage`, `OpeningInitTexture`, `vif1*`, `pkt*`, `spr*` (0x0021B2F8..0x0021CED8 in the
symbol list). The clock's text path and other modules also call `vif1Begin`/`vif1End`/`pktSetAD`
(counted by name in `clock/`, `graph/`, `core/`). See section 5.

---

## 2. State machine

### 2.1 Variables (all `0x0037xxxx` are gp-relative; READ)

| Address | Meaning | Writers (instruction) |
|---|---|---|
| `D_0037000C` | 1 when `var_current_module == 4` (illegal scene wanted) | 0x0021AE48/0x0021AE50 (`opening_thread_set_vars`) |
| `D_00370004` | scene id: 0 opening, 1 illegal, 2 end | 0x0021AC6C (`OpeningInit`, = `D_0037000C`); 0x0021AE14 (`OpeningDoOpeningIllegal`, = `D_00370008`) |
| `D_00370008` | next scene id | 0x0021AC64 (init, = `D_0037000C`); 0x002221E0 (`OpeningDoOpening`) and 0x00222ED0 (`OpeningDoIllegalDisc`): both write the value 2 |
| `D_00370010` | sub-state of the current scene: 0 = must init, 1 = running, 2 = leave | 0x0021ADBC (=0); 0x0021AD40 (`OpeningProcess`: +1 if `OpeningProcessInner` returned something other than `D_00370004`); 0x002221CC / 0x00222EBC (+1 after the scene init); 0x002221E4 / 0x00222ED4 (=0) |
| `D_00370000` | frame counter, starts at `evenOddFrame` | 0x0021ACC8 (init); 0x0021AD90 (+1 per frame) |
| `D_00370014` | letterbox bars on (aspect != 1) | 0x0021AE64 (=1 if `config_get_aspect_ratio() != 1`), 0x0021AE68 (=0) |
| `D_003DB850` (= `0x003DB800 + 0x50`) | **animation stage** 0..7 | 0x0021EE58 (`OpeningInitAnimation`: 0); 0x0021EEC0 (`func_0021EE98`: 4); 0x0021EF80 (generic +1, see 2.2); 0x0021F03C and 0x0021F0F4 (stage 1, +1) |
| `D_00370094` | "go" flag: decision allowed | 0x0021EEF8 / 0x0021EE94 (=0); 0x0021F02C, 0x0021F0E8, 0x0021F124 (=1) |
| `D_00370090` | decision pending; **initial data value 1** (read from the ELF) | 0x0021F204 (= -1 once the decision was taken) |
| `D_003700A0` | snapshot of the disc state `0x1F000C`; **initial 0** | 0x0021F190 (stage 2), 0x0021F2BC (stage 6); read by the hand-off 0x0021AF00.. |
| `D_003700F4`, `D_00370100` | end-of-scene sound done / its frame stamp | 0x0021F2DC.., 0x0021F2E8, 0x0021F330 (stage 6); cleared in `func_00222E38` 0x00222E5C..0x00222E64 |
| `D_00370098` | camera roll angle (radians) | `OpeningInitOpeningScene` 0x00221C2C (init = D_0036FA98 = -0.12); `OpeningInitIllegalScene` 0x00224504 (init 0); integrator 0x0021F4B0.. |

Stage-3 is the last stage the normal scene reaches (see 2.3); stages 4..7 are the illegal scene's range.

### 2.2 What advances a stage

`OpeningProcessInner` (0x0021EF00) at 0x0021EF4C..0x0021EF80, READ:

```
thr = D_002B0E08[stage]            // ints, read from the ELF: 16, 56, 104, 320, 672, 800, 1160, 1160
if ((float)thr < cameraZ) stage++  // cameraZ = D_002B0C68 (third float of the camera position at 0x002B0C60)
```

then `jump jtbl_00365400[stage]` (0x0021EF88..0x0021EFA4; 8 entries, read from the ELF):

| stage | target | what it does (READ) |
|---|---|---|
| 0 | 0x0021F378 | nothing; leaves at once to the integrator |
| 1 | 0x0021EFAC | waiting stage, see below |
| 2 | 0x0021F0F8 | decision stage, see below |
| 3 | 0x0021F260 | `s2 += 1` (return value = scene id + 1): **ends the scene** |
| 4, 5 | 0x0021F378 | nothing |
| 6 | 0x0021F268 | end sequence (illegal scene), see below |
| 7 | 0x0021F370 | `OpeningInitAnimation` and `s2 = 2` |

The function returns `s2` (`D_00370004` loaded at 0x0021EF78, possibly changed). `OpeningProcess` compares it with
`D_00370004` (0x0021AD34); a difference increments `D_00370010`, and the next `OpeningDoOpening` /
`OpeningDoIllegalDisc` call sees 2, sets `D_00370008 = 2` and the loop in `OpeningDoOpeningIllegal` ends.

Frame thresholds use `is_pal_vmode_p9_tgt()`: 60 in NTSC, 50 in PAL (the pattern `movn` at 0x0021EFD0, 0x0021F0C8,
0x0021F108). The integrator multiplies every step by `f22 = D_0036F9D0 = 1.2` in PAL, 1.0 in NTSC
(0x0021EF2C..0x0021EF3C), so the camera takes the same real time at 50 Hz.

**Stage 1 (0x0021EFAC)**, two branches:

- `is_hdd_boot_ready()` non-zero (0x0021EFAC..0x0021F078; "HDD OSD loading" hold, name taken from CrystalOSD):
  `B48 = D_0036F9D4 (0.0004)`; `B18 = D_0036F9D8 (-0.00014)` while `D_00370000 < 20*fps/6` (200 NTSC, 166 PAL), otherwise
  `D_0036F9DC (2.5e-5)`; if `get_hddboot_exec() != 0`: `B18 = D_0036F9E0 (0.003)`, `D_00370094 = 1`, stage++;
  else if the counter exceeds `20*fps` (1200 / 1000 frames) it clears the flag through `get_hdd_boot_ready_ptr()`.
- not HDD-ready (0x0021F07C): `B8 = D_0036F9E4 (4.0e-7)`; then a switch on the disc state `0x1F000C - 0x64`
  (`jtbl_00365420`, 17 entries): states **0x64, 0x6A..0x70, 0x72, 0x73, 0x74** go to 0x0021F0B8, states 0x65..0x69 and 0x71
  go to 0x0021F378. At 0x0021F0B8: if `D_00370000 > 2*fps` (120 NTSC, 100 PAL) then `D_00370094 = 1` and stage++.
  So with a recognised disc the intro leaves stage 1 after about 2 s; with no disc (0x65), tray open etc. it stays in
  stage 1 until the camera crosses `thr[1] = 56` by itself.

**Stage 2 (0x0021F0F8)**: if `D_00370000 > 10*fps` (600/500) then `D_00370094 = 1`. If `D_00370094 != 0`:

- `D_00370090 == 1` (first time): if `enter_clock_module() != 0` it queues sound `0x6140, 1` and sets `D_00370090 = -1`
  without touching `D_003700A0`. Else if `is_hdd_boot_ready() && get_hddboot_exec() == 1`: sound `0x6150, 0,0,0xF`.
  Else `D_003700A0 = 0x1F000C` and a switch on `disc-0x6A` (`jtbl_00365470`): 0x6A,0x6B,0x72,0x73 -> `0x6150,..,0xF`;
  0x6C,0x6D,0x6E -> `0x6140,7` then `0x6150,..,0x11`; 0x6F..0x71 and everything else -> `0x6140,1`.
  `D_00370090 = -1` afterwards (0x0021F204). The meaning of the sound command ids is NOT DETERMINED.
- every frame while the flag is set (0x0021F208..0x0021F258): zeroes B10, B14, B30, B34, and
  - HDD-ready or `hddboot_exec != 0`: `B8 = D_0036F9E8 (4e-4)`, `B38 = D_0036F9EC (8e-5)`;
  - otherwise: `B18 = D_0036F9F0 (0.0099)`, `B38 = D_0036F9F4 (1.95e-4)`.
  This is the dive: B8/B18 are the z acceleration/velocity, B38 an angular term (2.5, formulas below).

**Stage 6 (0x0021F268)**, normally unreachable in the opening scene (2.3). It zeroes B38, B20, B24, B28, B10, B14, B18,
B0, B4, B8, B30, B34 and `[0x3D7000]`, then **if `0x1F0008 != 0` leaves** (0x0021F290..0x0021F2A0; `0x1F0008` is set to 1
in `main` 0x0020DA2C when the MECHACON version `& 0xFFFFFF <= 0x203FF`, 0x0020DA0C..0x0020DA30; INFER: older consoles).
Otherwise `D_003700A0 = 0x1F000C` and a switch (`jtbl_003654A0`): states 0x64, 0x6A..0x70, 0x73 (0x0021F2DC): `D_003700F4 = 1`,
and the first time `sceSdRemote(1, 0x6150, 6, 0, 0xF)` and `D_00370100 = D_00370000`, after that `if D_00370000 > D_00370100 +
0x80` `s2 = 2` (ends); state 0x72 (CDDA) does the same only if `0x1F0D58 > 0`; states 0x65..0x69, 0x71, 0x74: if `D_003700F4 != 0`
and `D_00370000 > D_00370100 + 0x80` then `s2 = 2`. Meaning: after the long illegal-scene dive, wait 128 frames for the sound,
then leave.

### 2.3 The normal scene ends at stage 3

READ: stage 3's handler is `s2 += 1` (0x0021F260/0x0021F264). Stage becomes 3 when `cameraZ > 104`, i.e. `thr[2]`. Stages 4..7
need `cameraZ > 320` etc. and one stage is added per frame, so they are never reached in the opening scene because the loop
ends one frame after stage 3.

Initial state, READ: `OpeningInitOpeningScene` 0x00221BB8: camera position (0, 0, 16.0) (`D_002B0C60`, `0x41800000`
at 0x00221BDC), look direction `D_002B0C70 = (0,0,1,1)`, up `D_002B0C80 = (0,1,0,1)`, roll `D_00370098 = -0.12`;
`OpeningInitAnimation` 0x0021EE48: stage 0, `B28 = D_0036F9BC = 0.04`, `B48 = D_0036F9C0 = 0.001`, everything else 0.
Illegal scene, READ: `OpeningInitIllegalScene` 0x002244A0 + `func_0021EE98` (0x0021EE98): camera z = 672.0
(`0x44280000`), stage = 4, `B18 = D_0036F9C4 = -0.0178`, `B28 = D_0036F9C8 = 2.16`, `B48 = D_0036F9CC = 0.00462`.

INFER (my simulation of the integrator in 2.5, not measured; NTSC, `D_00370090 = 1`, no HDD): with a recognised disc the
camera crosses z = 104 after about **250 frames (~4.1 s)**; with no disc about **700 frames (~11.7 s)**; PAL with a disc about
207 frames. Treat these as order of magnitude; a live trace should replace them.

### 2.4 Skip and end conditions

READ:

- **No pad input is read anywhere in the 70 files.** No call to a pad function and no read of a pad global
  (searched all `0x1F....` and `D_...` references). A button cannot end the intro from this module.
- Disc present: stage 1 advances after 2 s when `0x1F000C` is in {0x64, 0x6A..0x70, 0x72..0x74} (2.2). The decision stage then
  chooses sounds and starts the dive.
- No disc: stage 2 sets `D_00370094` after 10 s even without a disc; the camera also reaches `thr[2]` by itself.
- `enter_clock_module_208378()` (0x00208378 returns `var == 0`; `should_enter_clock_module_2AD22C` is initialised to 1,
  `enable_...` writes 0, `disable_...` writes 1): when it returns non-zero (set at `main` 0x0020DAE4 if `config_first()`
  was non-zero or the argument `Initialize` set `oobe_forced`, 0x0020D8E0; cleared at 0x0022DBAC in `core/func_0022D828`) the
  decision stage plays sound `0x6140,1` and the hand-off forces the clock (2.6). `main` itself bypasses the opening completely
  in this case when `var_current_module == 0` (0x0020DF54..0x0020DF6C).
- HDD boot (`is_hdd_boot_ready`, `get_hddboot_exec`, names from CrystalOSD): holds in stage 1 up to 20 s, then clears.
- Boot arguments: `BootOpening` -> module 1, `BootWarning`/`BootIllegal` -> module 4, `BootClock`, `BootBrowser`,
  `BootCdPlayer`, `BootError` (sets 3). Arguments beginning with `Skip` are ignored by the module selection loop
  (0x0020DF04..0x0020DF14); `SkipSearchLater` is handled earlier (0x0020D8A8..0x0020D8C4: it only skips
  `do_load_hosdsys_110`). The strings `SkipMc`, `SkipHdd`, `SkipForbid` exist at 0x003469A0.. but no reference to them in
  `core/` or `opening/` was found by symbol. **`SkipMc`/`SkipHdd`: NOT DETERMINED** (probably arguments forwarded to a
  launched `osd110.elf`, the string after them in the table is `-x mc%d:/BIEXEC-SYSTEM/osd110.elf`).

### 2.5 Camera and motion formulas (operation order)

Where: `OpeningProcessInner` 0x0021F378..0x0021F5F0. Block `B = 0x003DB800`, run-time (zero in the file).
`k = 1.0` (NTSC) or `1.2` (PAL). Naming: `a = (B0,B4,B8)`, `v = (B10,B14,B18)`, `p = (B20,B24,B28)`, `w = B38`, `av = B48`,
`phi = D_00370098`, `C = (D_002B0C60, 0C64, 0C68)` camera position. READ, in this order:

```
av   += w * k                                   // B48
p.x  += (v.x + a.x/2) * k                       // B20, B24, B28 likewise with y, z
p.y  += (v.y + a.y/2) * k
p.z  += (v.z + a.z/2) * k
v.z  += a.z * k                                 // only z; v.x, v.y are only set by the stages
phi  += (av + w/2) * k
B40  += B30*k ; B44 += B34*k                    // not read again in the files I read
C.x  += (p.x + v.x/2) * k
C.y  += (p.y + v.y/2) * k
C.z  += (p.z + v.z/2) * k                       // uses the new v.z
if (phi > pi)  phi -= 2 pi                      // D_0036F9F8 = pi, D_0036F9FC = 2 pi
if (phi < -pi) phi += 2 pi                      // D_0036FA00 = -pi, D_0036FA04 = 2 pi
D_002B0C80 = (sinf(phi), cosf(phi), 0, 1)       // up vector: the camera rolls
sceVu0NormalLightMatrix(M+0x200, D_002B0C90, D_002B0CA0, D_002B0CB0)   // light directions, set in the scene init
sceVu0CameraMatrix(M+0x100, C, D_002B0C70 (view direction), D_002B0C80 (up))
sceVu0ViewScreenMatrix(M+0x140, scrz=1024.0, ax=D_00370030, ay=D_00370034,
                       cx=2048.0, cy=2048.0, zmin=1.0, zmax=16777215.0, nearz=1.0, farz=65536.0)
sceVu0MulMatrix(M+0xC0, M+0x140, M+0x100)       // world->screen
```

`M = D_00370058` (a 0x280-byte scratchpad block allocated by `InitSPR`, 0x0021C03C..0x0021C040). Float sources: 2048.0 =
`0x45000000`, 1024.0 = `0x44800000`, 65536.0 = `0x47800000` (all `lui`+`mtc1`, 0x0021F56C..0x0021F5A4); `ax = D_00370030`
is 1.0 and `ay = D_00370034` is `D_0036F980 = 0.52627` in PAL, `D_0036F984 = 0.45763` in NTSC (`InitDoubleBuffer`
0x0021B588..0x0021B5B0; `is_pal == 1` takes the first). Aspect/vertical proportion factors; they are the module's own,
the clock's scale `D_002B2170` is a different variable.

Constants of the dive (from the ELF): `D_0036F9E8 = 4e-4`, `D_0036F9EC = 8e-5`, `D_0036F9F0 = 0.0099`, `D_0036F9F4 = 1.95e-4`.
View direction stays `(0,0,1)` throughout (nothing else writes `D_002B0C70` in the scene); the camera translates along +z and rolls.

Object motion (READ, `OpeningDrawLights` 0x0021F5F8). For light `i` (0..3), with `t = D_00370000 + D_00370A74`:

```
A = (t + 17*i) * D_0036FA0C * (i + 10) * D_0036FA10      // 0x0021F668..0x0021F6D8; 0.01, 0.1
B = (t + 15*i) * D_0036FA14 * (i + 10) * D_0036FA18      // 0x0021F6E0..0x0021F768; 0.005, 0.1
centre.x = (10 - i) * cosf(A)
centre.y = (i + 3)  * sinf(B)
centre.z = 12 * cosf(A) + 88                              // 0x0021F790..0x0021F7F4 (constants 10.0, 3.0, 12.0, 88.0 are lui immediates)
```

`D_00370A74 = rand() % 0x929 + 0xD80` is set once in `InitLightsCubes` (0x00220CAC..0x00220CDC), so the phase differs per run. The centre is applied
through `sceVu0TransMatrix(M+0x80, ...)` and `MulMatrix(M+0x40, M+0xC0, M+0x80)` for the fourth sub-layer (`s2 == 3`) of each light; sub-layers 0..2 copy matrices
from `D_003DB8A0`/`D_003DB8E0` (history of earlier centres). How the four sub-layers differ was not reduced.
The light centres sit near z = 88 (76..100), in the same z band as the cubes (82..111): the camera starts at z = 16 and flies through them.

---

## 3. What it draws

Everything is the module's own code; the module does not call any of `func_002365D0`, `func_00236E20`,
`func_00237010`, `func_00233E70`, `func_002348A8`, `func_00234070`, `func_002342F0`, `func_002341C8` or `func_00233770`
(READ: none appear in the `jal` list of any of the 70 files). Its emitters are listed below.

### 3.1 Textures (READ)

Table `D_002AF870`: 21 entries of 0xF0 bytes; count `D_0036FFE4 = 21`. Fields: +0x04 resource id (passed to
`GetResourceData`, i.e. a `TEXIMAGE` resource), +0x0C load tag, +0x18/+0x1C size, +0x28 pixel format. Loading rule
`OpeningInitTextures` 0x0021B208..0x0021B2D4: tag 0 always; tag 1 only if `D_00370004 == 0`; tag 2 only if `D_00370004 == 1`;
tag 3 only if `D_00370004 == 1` and `idx == config_get_osd_language() + 13`. Values read from the ELF:

| idx | address | resource | size | psm | tag | used by (READ unless noted) |
|---|---|---|---|---|---|---|
| 0 | 0x002AF870 | 35 | 256x64 | 5 | 1 | logo, `func_0021D990` (0x0021DA30 binds it) |
| 1 | 0x002AF960 | 37 | 128x128 | 2 | 2 | illegal sprite, `func_0021E950` (0x0021EA00) |
| 2 | 0x002AFA50 | 29 | 64x64 | 2 | 1 | fog layers 2 and 5 |
| 3 | 0x002AFB40 | 34 | 64x64 | 2 | 1 | fog layers 1 and 4 |
| 4 | 0x002AFC30 | 38 | 64x64 | 2 | 1 | NOT DETERMINED |
| 5 | 0x002AFD20 | 30 | 64x64 | 2 | 1 | fog layers 0 and 3 |
| 6 | 0x002AFE10 | 26 | 256x256 | 2 | 1 | **towers** (`D_002B1BE0 = 6`, 0x00221628..0x0022165C, `vif1SetTextureMIP`) |
| 7 | 0x002AFF00 | 28 | 64x64 | 0 | 1 | NOT DETERMINED |
| 8 | 0x002AFFF0 | 36 | 64x64 | 0 | 1 | light sprites (0x0021F65C) |
| 9 | 0x002B00E0 | 33 | 128x128 | 2 | 2 | NOT DETERMINED (illegal-scene particles are the likely user) |
| 10 | 0x002B01D0 | 31 | 128x128 | 2 | 0 | NOT DETERMINED |
| 11, 12 | 0x002B02C0, 0x002B03B0 | 27, 32 | 64x64 | 4 | 0 | NOT DETERMINED (4 = 8-bit with palette) |
| 13..20 | 0x002B04A0.. | 23,19,20,25,21,22,18,24 | 512x128 | 20 | 3 | localized banner, `func_0021DBE0` (0x0021DC98..0x0021DCA8, entry `idx = language`) |

Fog layer textures come from the six words at `D_003653E8` = {5, 3, 2, 5, 3, 2} (0x0021E34C, 0x0021E358).

### 3.2 Opening scene, order of draw (`OpeningDrawOpeningScene` 0x00221CB0, READ)

1. **Towers** `func_002214F8` (0x002214F8). A grid of **14 rows x 9 columns = 126 cells** (loops `s4 < 0xE`, `s7 < 9` at 0x0022161C and
   0x002219E0). A cell is drawn when its flag word (`D_003DDCA0 + row*0x50 + col*4`) is non-zero and its distance entry is > 0
   (the first pass, 0x00221580..0x00221620, fills a 14x9 table `|dx| + |dy|` of tower position minus camera on the stack; the function
   switches Z-write and Z-test on with `vif1SetZWrite(1)` / `vif1SetZTest(1)`, 0x00221548..0x00221560, so towers write depth); per cell it builds a rotation matrix from `D_002B1C00` and `(D_00370000 % 360 - 180) * D_0036FA90 (pi/180)`
   (a per-frame sway: `sinf(...) * 10.0 * D_0036FA90`, 0x0022167C..0x0022169C), then DMAs a packet to **VU1**:
   `func_002210B0` copies three 4x4 matrices (M+0x80, +0xC0, +0x180) into the packet buffers `D_002A4EF0/4F30/4FB0`, `func_00221140` writes a
   GIF tag + `ALPHA_1 = 0x0000008000000044` and `PABE = 0` (A=Cs, B=Cd, C=As, D=Cd, FIX=0x80: plain `(Cs-Cd)*As + Cd`,
   0x002218EC..0x002218F8), `func_00221248` writes per-face parameters (height `D_003DF2F8`, brightness `D_003DE2E0`,
   `1/31` and `1/256` scale constants), `func_00221400` writes UV rows. Start of the transfer: DMA channel 1 (0x10009020/9030,
   `D_002A4EE0` chain, 0x00221978..0x002219C0). The **VU1 microprogram** (VIF code `0x4AE50000`: MPG, 229 instructions,
   address 0) is uploaded once by `OpeningInitTowersFog` through the chain at `D_002A47A0` (0x00221F10..0x00221F58).
   The microprogram itself and the tower mesh are **not decoded** (NOT DETERMINED).
2. **Feedback overlay** `func_0021D140(1, 2, 0x50, 0xFFFFFF, field)` (0x0021D140): a full-screen textured rectangle using the stored frame
   (`D_002B0C48`), `ALPHA` mode 2 (`(Cs-Cd)*FIX+Cd`, FIX = 0x50). **Copy** `func_0021CF38` (0x0021CF38): copy back with `vif1SetFramebuffer`
   and `vif1SetTexRect`. INFER: this pair is a frame-feedback ghost, 80/128 of the previous picture over the new one.
3. **Fog** `OpeningDrawFog` (0x0021E168): **6 layers**, each a 17x17 vertex mesh = **16x16 quads** (`D_003D80C0`, stride 0x110 per column,
   0x10 per row, built by `func_0021DEA8` 0x0021DEA8 at init: x = col*6 - 48 + 2*sin, y = row*6 - 48 + 2*cos, z = 134.0, w = 1.0, colours
   from a radial falloff, alpha 0x80). Per layer: texture index `D_003653E8[layer % 6]`, `pktSetAlphaBlend(1, 0, 20)` (mode 0 =
   `(Cs-0)*FIX+Cd`, FIX = 20: additive), Z-write off. The layer's z is lowered by `layer * 5.0` (0x0021E398). Texture scroll
   `D_003D80A0[layer] += (14 - layer) * D_0036F990 (1e-4) * (layer+1) * 0.5`, wrapping at 1.0 (0x0021E270..0x0021E2D8).
   Quads are transformed through `sprTransformVertex` with `M+0xC0` and clipped by `sceVu0ClipAll` (a culled quad is skipped).
4. **Glass cubes and light orbs**, only while `cameraZ < 73.0` (`0x42920000`, 0x00221CF8..0x00221D08):
   `OpeningDrawLightsAndCubes` (0x00220CE8) -> `OpeningDrawLights` (0x0021F5F8) then `vif1SetCLAMP_1` then **5 x `func_00220450`**.
   - **Light orbs**: 4 sources (`i < 4`, 0x0021FB1C). Each is a sprite of 4 vertices (`D_002B0EF0` UV corners) with texture idx 8,
     `pktSetAlphaBlend(1, 5, 0x80)` (mode 5 = `(Cs-0)*As+Cd`, additive weighted by source alpha), colours `D_002B0E30` =
     {32,128,0}, {128,32,64}, {128,0,0}, {64,32,128} (RGB, read from the ELF). Each also leaves a **128-entry position history** (ring buffer
     `D_003DBCA0 + i*0x800`, index `D_003700B0`, tail `D_003700AC`; 0x0021FB28..0x0021FB78) drawn as trail points (GIF A+D with
     RGBAQ and XYZ words) with a size/alpha falloff. INFER: the same "light spots that circle and leave tracks" idea the patent
     describes for the clock, here with 4 spots and a 128-step track.
   - **Cubes**: 5 (`i < 5`). Mesh = 8 vertices at +-`D_0036FA4C = 1.8` (`func_002245C0`, 0x002245C0, vertices at `D_002B20A0`,
     16 vertices at `D_002B2120`), centres `(3.5*X, 3.5*Y, 150 - 15*Z)` from `D_002B0F40` = (3.57,0.54,2.59), (-0.90,-1.12,3.80),
     (3.26,-2.65,4.11), (-3.73,-2.37,4.37), (-3.10,2.24,4.54) (`InitLightsCubes` 0x00220A98..0x00220B4C; the (x,y,z) mapping is
     READ from the `mul/add` there but I did not check the order of the unit translation matrices built at 0x00220C80). Each cube
     is drawn through `func_00220450` (0x00220450): `func_00224EB8` (transform/light/clip; skip if culled), then
     `module_opening_225728` copies the frame buffer to `gsExtraBuffers` (a `TEXRECT` snapshot, alpha mode 2 / `0x3B` TEXA), then
     **10 passes**, each `func_00225380` (frame/texture/alpha from a 0x80-byte descriptor array copied to the stack, selectors -1
     frame-parity buffer, -2 / -3 extra buffer or a texture index) + one of `func_002246C8` / `func_00224B10` / `func_00224938`
     + `func_002254E0` (faces; `a1` = 1 for the first five passes, 0 for the last five). INFER: a back-face group (5 passes) then a
     front-face group (5 passes), each with a base, two "rim" offsets (`D_0036FA38/3C = -+0.00375`, `D_0036FA44/48 = -+0.0075`) and shifts
     of -0.25 / +0.5 (`f20`, `f22`): the refraction/offset layering of a glass solid. `func_002254E0` calls the per-vertex callback
     `D_00370108 = D_0021FEB8` for every vertex: it builds S,T from the vertex normal (`n.x/1024`, `(n.y - 0.5 or 0)/256`, clamped
     0..0.875/0..0.9375), picks an RGBA from `sceVu0FTOI0Vector` of the light colour or a fixed 0x80, and clamps 0..0x80. That is
     "refract by normal" in the same sense as the clock; the exact UV/Z equations were not reduced.
5. **Dive blur** `func_00221A50` (0x00221A50): `level = clamp(int((z - 56)/12), 0, 3)`, then `func_0021D3D0(level, evenOddFrame, evenOddField)`
   (copies the frame to the extra buffer `level` times with a sub-pixel shift (`D_00365118`)). So the picture blurs progressively
   between z = 56 and z = 92.
6. **Fade to black** `func_00221B00` (0x00221B00): `func_0021D848(D_003700C8, 0x80)` for the first 2 frames (`D_00370000 < 2`);
   for `z > 72.0`: alpha = `(int)((z - 72) * 128 * 0.03125)` = `(z-72)*4` (0..128 at z = 104); for `z >= 320.0` alpha = 0x80. (`0x42900000` =
   72.0, `0x3D000000` = 0.03125, `0x43000000` = 128.0.) `func_0021D848` is a flat black rectangle with `vif1SetAlphaBlend(1, 4, 0)`.
7. In `OpeningDrawEnd`: **logo** `func_0021DB50` (0x0021DB50): starts when `z > 18.0` (`0x41900000`); the value `D_00370A68` runs +4 per frame up to
   0xF0 then -4 down to 0 (`D_00370088 = +-4`, written 0x0021DBA8, 0x0021DBB8); alpha passed to `func_0021D990` is `min(0x70, D_00370A68)`.
   `func_0021D990` draws two textured rectangles from texture idx 0 at (120,105) and (326,105), each 256x16, plus (120,120)/(326,120), 256x18
   (`D_00365158` words 120,105,256,16,326,105,256,16,120,120,256,18,326,120,256,18; +0x20 byte offset in PAL), blend `pktSetAlphaBlend(1,4,alpha)`.
   INFER: this is the logo text the user referred to; its pixels were not extracted here.
   Then **letterbox** `func_0021D6C0` if `D_00370014`.

Order summary (INFER from the call order): towers -> ghost/feedback -> fog -> orbs -> cubes (z < 73) -> dive blur -> fade -> logo -> bars.

### 3.3 Illegal scene (module 4)

Same machinery, own draw: `func_002243F8` (0x002243F8) sets `D_00370A78` from z (`(0x44390000 - (0x44910000 - z)) * 128 * D_0036FB58 / 0x44390000`), draws
three particle/sprite groups (`func_00223608` update with `cosf/sinf`, `func_00223980`, `func_00223E48`, which call
`sprTransformVertex`, `pktSetAD`, `vif1SetAlphaBlend`), then a flat overlay (`func_0021D140(1, 2, 0x70, 0xFFFFFF)`), then `func_0021CF38`.
`func_0021E950` (0x0021E950): a single rotating textured sprite (texture idx 1, `sceVu0RotMatrix/TransMatrix`, 4 vertices from
`D_003DAE00`/`D_003DA600`). `func_00222DD8` (0x00222DD8): 5 cubes through `func_00222678` (structure the same as `func_00220450`,
per-vertex callback `D_002221F0` set by `func_00222BE8`, cube half-size `D_0036FAD0 = 1.2`). `func_002242C8` (0x002242C8) fade: z < 800 fade
in/out; z between 1128 and 1160 fade to black. Banner text `func_0021DD90` (0x0021DD90) from z > 800.0: `D_00370A70` ramps up +1 per frame to 0x70
(or down by 1 if `D_003700F4` is set), `func_0021DBE0` draws texture idx `13 + language` (512x128) as a `TEXRECT`, blend `vif1SetAlphaBlend(1,5,alpha)`.

### 3.4 Data tables (addresses, ELF values; READ)

| Address | Content |
|---|---|
| `D_002B0E08` | 8 ints: 16, 56, 104, 320, 672, 800, 1160, 1160 (stage thresholds, z) |
| `D_002B0F90` | 21 x 6 pairs of u32 (row, column): tower cell assignment per history entry; covers all 14x9 = 126 cells once |
| `D_002B1C10` | 14 floats: 0.2, 0.4, 0.6, 0.8, then 1.0 x 10 (current scale, by level 0..13) |
| `D_002B1C48` | 14 floats: 0.1 x 5, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0 (target scale by level) |
| `D_002B13A0` | 14 x 9 vec4 raw tower positions (stride 0x90 per row), converted by `OpeningInitTowersFog` (0x00221FD0..0x0022201C): `x' = (x + D_0036FA9C) * 4`, `y' = (y - 6.5) * 4`, `z' = (z + 4) * 12 + 150`, `D_0036FA9C = 4.8` |
| `D_003DDCA0` | flags, 14 rows x 0x50 bytes (0x640 bytes cleared, 0x00221D4C) |
| `D_003DF4F0` / `D_003DF800` | current / target tower scale, 0x38 bytes per row |
| `D_003DF2F8` | tower height = `max(target * 30.0, 3.0)`; `D_003DF100` = `int((1 - cur) * 128)` or 0 if cur >= 1 (0x00222088..0x00222138) |
| `D_003DE2E0` | 20x20 float table (brightness), built by `func_00220D60` with a radial falloff and `((i+j)*j/(i+1)) % 11 - 5) * 10` noise, clamped to 32..220 (`0x42000000`, `0x435C0000`) |
| `D_003653E8` | fog texture indices 5,3,2,5,3,2 |
| `D_002B0CC0` | blend mode table, 16 bytes per mode (A,B,C,D): 0 `(Cs-0)*FIX+Cd`, 1 `(0-Cs)*FIX+Cd`, 2 `(Cs-Cd)*FIX+Cd`, 3 `(Cd-0)*FIX+Cs`, 4 `(Cs-Cd)*As+Cd`, 5 `(Cs-0)*As+Cd`, 6 `(0-Cs)*As+Cd`, 7 as 4, 8 `(Cs-0)*Ad+Cd`, 9, 10 |

History buffer (`0x001F0198`, 21 entries x 0x16 bytes; READ in `history_add_entry` 0x00208040 (memset 0x1CE = 21*22 at 0x00208088) and
`history_pick_slot` 0x002015D0): +0x00..0x0F title id (compared with `strncmp(..., 0x10)`), +0x10 level byte (+1 on every launch, capped at
0x7F; 0x00201740 stores 7 at the top case), +0x11 bit mask of the 6 cells in use, +0x12 index (0..5) of the active cell, +0x14 sequence/time stamp (s16).
`OpeningInitTowersFog` (0x00221D30..0x00221F14) skips entries equal to `D_003700D0` (an empty string, so entries with an empty title), and for each
of the 6 cells of the entry: the active cell (`+0x12 == t`) gets `cur = D_002B1C10[min]`, `tgt = D_002B1C48[min]` where
`min = level` if `level < 14` else `((level - 14) % 10) + 4`; other cells whose bit in `+0x11` is set get `cur = tgt = 1.0`; both set the flag word to 1.
(The earlier doc's "color index" naming is wrong for +0x10: it is the launch count.)

---

## 4. Camera and motion

READ, see 2.5 for the integrator and matrices:

- **Camera**: position `C` = `D_002B0C60`, direction `D_002B0C70`, up `D_002B0C80` (roll), all built in `OpeningInitOpeningScene` /
  `OpeningInitIllegalScene` and updated in `OpeningProcessInner`.
- **Matrices**: `M+0x100` camera, `M+0x140` view-screen, `M+0xC0` world-to-screen, `M+0x200` light matrix, `M = D_00370058`.
  `D_0037005C` (a second SPR block, 0x240 bytes) holds per-object scratch vectors (e.g. `sceVu0SubVector` of tower position minus camera,
  0x002215A8..0x002215B0; the light/view direction normalised at `D_0037005C + 0x50`, 0x00220D04).
- **Per-object matrices**: towers: `sceVu0RotMatrix(M+0x240, ..., D_002B1C00 + row/col offsets)` then `sceVu0TransMatrix(M+0x80, M+0x240, tower pos + D_002B1BF0 + camera)`
  and `MulMatrix(M+0x180, M+0x200, M+0x240)` (0x00221864..0x002218D4). Lights: `TransMatrix(M+0x80, ...)`, `MulMatrix(M+0x40, M+0xC0, M+0x80)` (0x0021F7F0..0x0021F808).
- **Motion**: dive = z acceleration (2.2 stage 2) with a slight roll (`av`, `w`); tower sway `(D_00370000 % 360 - 180) * pi/180` (frame-driven, 360-frame period);
  fog scroll and light orbits are frame-driven (`D_00370000`).
- **Camera and the clock's camera**: different variables (`D_002B0C60` block versus the clock's `0x00370A80` and `0x002B2170`). See 5.

---

## 5. Shared with the clock scene

READ unless stated.

- **Variables written by both modules: none found by name.** Opening-only: `D_002B0C60..0CB0` (camera, lights), `D_0037000x/001x/0020..0034/0058..0064/0090..00B8/00E4..0108/0A34..0A78`,
  `D_003D80A0..D_003DF800` (tower/fog/light tables). Clock-only (grep by name): `D_002B2170`, `D_00370A7C..A8C`, `D_00370AB0`, `D_00370AB4`, `D_00370A80`, `D_00370344`. The opening never reads or writes
  `0x00370A80`, `0x002B2170` or `0x00370AB4`. Fade ramps: the opening uses `D_003700C8` and `D_003700F0` (fade structs for `func_0021D848`); the clock does not call
  `func_0021D848` (0 callers outside `opening/`).
- **Variables read by both**: the disc state `0x001F000C` (clock copies it into `D_00370A7C`, `clock_input_check_handler` 0x002259F4..0x00225A04), `execute_app_type` `0x001F0010`,
  `0x001F0D58`, `var_current_module` / `0x001F064C`.
- **Hand-off flag the clock reads**: `0x001F064C` ("previous module"). `opening_transition_to_clock` writes 1 there when nothing was set to execute (0x0021B078..0x0021B080, also 0x0021AF30 in
  the forced-clock path). The clock handler checks `0x001F064C == 1` (0x00225A00): then it stores 0x64 in `D_00370A7C` (as if the disc state were "unknown") and skips
  `func_0022FEF8`. So the clock knows it follows the opening.
- **Shared code**: the GS packet helpers listed in section 1 (`vif1Begin/End`, `pktSetAD`, `pktSetAlphaBlend`, `vif1SetZTest/ZWrite`, `vif1SetXYOffset`, `vif1SetFramebuffer`,
  `vif1SetTexRect`, `sceVu0` matrix calls) are called from the clock's text functions (`clock_str_related`, `clock_timezone_str_related`, `do_show_timezone_info`, `func_00226300`) and
  from `graph/`. The clock's rod/orb/background emitters use different functions (`func_0023xxxx`).
- **Possible dependency (NOT DETERMINED, important):** `vif1End` (0x0021B6F0) reads `D_00370020` (the VIF1 DMA channel handle) and `D_00370A34` (packet pointer). `D_00370020` is written **only** in `InitDMA`
  (0x0021B318), and `InitDMA` is reached only from `OpeningInitRender`, reached only from `OpeningInit`. If the HDD OSD clock path really executes `vif1End`, this variable must be set by something
  I did not find (or by an earlier opening run). The facts say the clock runs in HDD OSD without the intro, so either that clock text path does not call `vif1End` or another writer exists.
  A live check (read `0x00370020` while the clock is on screen) settles it.
- **The camera offset 0x370A80 / scale 0x2B2170 / mode 0x370AB4**: not touched by the opening at all. The opening has its own constant projection (`ax = 1.0`, `ay = 0.5263/0.4576`, scrz 1024, cx = cy = 2048).

---

## 6. The hand-off to the menu / clock (READ)

`opening_transition_to_clock` (0x0021AEE0..0x0021B08C), called by the thread after the scene loop:

1. `execute_app_type (0x1F0010) = -1` (0x0021AEEC..0x0021AEF0).
2. If `enter_clock_module() != 0` (first start / `Initialize`) and not `is_hdd_boot_ready()` and `get_hddboot_exec() != 1`:
   `var_current_module = 2`, `0x1F064C = 1`, return (0x0021AF04..0x0021AF38). **This is the hand-off to the clock/menu**: the module value 2 is
   what `main` wakes next (table slot [1]).
3. Otherwise a switch on `D_003700A0 - 0x6A` (`jtbl_00364F60`, 11 entries, values read from the ELF):

   | `D_003700A0` | action (READ) | INFER (media; raw register mapping `main`/`cdvd_handler_proc_prechk` 0x00211D78) |
   |---|---|---|
   | 0x6A, 0x6B | `execute_app_type = 2` | PS1 CD / PS1 CDDA |
   | 0x6C, 0x6D | `execute_app_type = 1` | PS2 CD / PS2 CDDA |
   | 0x6E | `execute_app_type = 0` | PS2 DVD |
   | 0x6F | `execute_app_type = 5` | raw 0x20 |
   | 0x70 | `execute_app_type = 4` | raw 0x21 |
   | 0x71 | `var_current_module = 2` | raw 0x22 |
   | 0x72 | `var_current_module = 5` if `0x1F0D58 > 0` else 2 | audio CD |
   | 0x73 | `execute_app_type = 3` | DVD video / unknown media |
   | 0x74 | `var_current_module = 4` | illegal disc: the **illegal scene runs next** (same thread) |
   | anything else (including the initial 0) | `var_current_module = 2` | clock/menu |

4. Then, if `is_hdd_boot_ready()` and `get_hddboot_exec() == 1`: `var_current_module = 0`, `0x1F064C = 1`, `execute_app_type = 6` (0x0021B02C..0x0021B064).
5. At the end, if `execute_app_type == -1` still: `0x1F064C = 1` (0x0021B068..0x0021B084).

Control returns to `main` through `SignalSema(moduleFinishSema)` (0x0021AC40); `main` then boots the disc if `execute_app_type != -1`
(0x0020E120..0x0020E130 `Game_Boot_ExecuteDisc_p5_tgt`) or wakes the thread named by `var_current_module` (0x0020E30C).
So the hand-off is **a write to `var_current_module` (`0x1F0648`) / `execute_app_type` (`0x1F0010`) in `opening_transition_to_clock`**, not a call.
The scene itself fades to black by z = 104 (2.2 / 3.2) so the switch happens on a black frame.

Illegal scene (module 4): after the loop `D_003700A0` comes from stage 6 (2.2). With state 0x74 stage 6 does nothing (needs `D_003700F4`), the camera continues to stage 7 (z > 1160)
and ends; the hand-off sees 0x74 and sets `var_current_module = 4` again, so the red screen **repeats** until the disc state changes. If the state changes to a normal disc, stage 6
plays its sound and waits 128 frames, then the table above boots it. INFER from the code path; not seen running.

---

## NOT DETERMINED

1. Whether anything in a real power-on path selects module 1 (`BootOpening` is the only store in `main`; the browser's `g_browser_module_transition_dest` values were not traced); what arguments the loader passes.
2. `SkipMc`, `SkipHdd`, `SkipForbid`: their consumer (strings at 0x003469A0; no symbol reference found).
3. The tower VU1 microprogram (229 instructions, chain at `D_002A47A0`, start via `D_002A4EE0`) and the tower mesh. Per-face parameters (`func_00221248`) and UV rows (`func_00221400`) were read but not reduced.
4. The light-orb trail details (sub-layers 0..2, `D_002B0E70` quad geometry, how `D_002B0E30` colour is applied) and the cube placement order (`D_002B0F40` mapping and the unit/translation matrices built at 0x00220C80).
5. The exact UV / depth equations of the cube passes (`func_002246C8`, `func_00224B10`, `func_00224938`, `func_00224EB8`, `func_00225380` descriptors) and the alpha/test registers they write; whether they are the same equations as the clock's refraction.
6. Which draws use textures idx 4, 7, 9, 10, 11, 12 (idx 9 is probably the illegal-scene particles).
7. The illegal scene particle systems (`func_00223368` init, `func_00223608` update, `func_00223980`/`func_00223E48`/`func_00222EE0`/`func_00223230`) beyond their structure; `func_0021E6C8`.
8. Sound command semantics (`sound_handler_queue_cmd` ids 0x6140, 0x6150 and their arguments; `sceSdRemote(1, 0x6150, 6, 0, 0xF)`).
9. The meaning of `0x1F0AC0` / `0x1F0BB0` writes (value 0xE) in `OpeningInit`, `0x1F0D58`, `0x1F0008` beyond the MECHACON test, `D_00392910`/`unksema_392900+0x10` in the CDVD handler (it
   is 0 during the opening scene, 1 in the illegal scene and after the loop; INFER: it enables the disc-key/illegal evaluation).
10. Real durations: the 250 / 700 frame figures come from my simulation of the read formulas, not from a capture; the fade/blur/cubes z thresholds are READ and exact, the frame numbers are not.
11. Whether the clock path's use of `vif1End` needs `D_00370020` (see section 5).
12. The brightness/height tables' run-time content (`D_003DE2E0`, `D_003D80C0`, `D_003DE920`), the order/meaning of B30/B34/B40/B44 and the second `D_002B0C48` word (zero in the file image).
