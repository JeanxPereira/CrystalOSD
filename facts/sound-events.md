# Sound events: which code queues which command, and the queue itself

Builds: **HDD OSD 1.10U** (canon; every address is its unless "ROM" is written) and **ROM 2.30**.
Command ids pair by call site: HDD `0x6140` / `0x6150` / `0x6300` = ROM `0x5014` / `0x5015` / `0x5200`.
*Verified* means a script recomputes the statement from probed inputs (script and capture named); *measured* means seen in a
capture and not recomputed; *read* means taken from the disassembly (address range given). Reading: `References/readings/sound-senders-scout.md`.

What the EE side does with a sound: a sender calls `sound_handler_queue_cmd` (HDD `0x00200C00`, ROM `0x00200BE8`) with
`a0` = command, `a1`, `a2`, `a3`; the queue holds the four halfwords; once per vblank the drain sends each entry to the IOP with
`sceSdRemote(1, cmd, a1, a2, a3)`. The IOP's `0x6300` handler reads `a1` and `a2` and not `a3` (2.5).

The sender verifiers (sections 2 to 4) run in exact mode on HDD OSD 1.10U (`CLOCK_BUILD=hdd`); the queue verifier of section 1 runs on both builds. Each sender verifier predicts, frame by frame, the list of `(a0, a1, a2, a3, ra)`
a sender must queue, from state words and callee returns probed at the sender, and compares it with the enqueue probe at `0x00200C00`.
A queued command the model does not predict fails the verdict. The probed callee returns that are inputs and not recomputed:
`func_00232020` (checked true only while the System Configuration and Version page ramps are state 0; the function also needs the `func_0022D6A8` and `func_0022E300` ramps at 0 and `func_0022AAF0`'s value nonzero, *read* `0x00232054`..`0x00232094`), `callback_queue_submit`, the Version page gates (the slt at `0x0022A7E4`, read at its bnez `0x0022A7E8`, the row-free test at `0x0022A868`, the sub-row counts at `0x0022A81C` and `0x0022A944`), `func_0022FEF8`,
`func_0022FF28`, `func_0022FF98`, the mode word `D_00370AB4`, the two disc jump tables.

Captures named "written" were reached by a memory write (a stimulus), not by input. The recipe (which store is nopped, at which frame the word is written) is not recorded in the traces; each section lists the word whose effect the trace shows.

## 1. The queue, the drain, the dedup, the ramp

*Verified* by `verify_sound_ee_queue.mjs` with `References/model/sound_ee.mjs`, on `hddosd-110U-sound-ee-boot` (320 items equal),
`hddosd-110U-sound-ee-queue` (1828), `rom-0230A-sound-ee-boot` (696) and `rom-0230A-sound-ee-queue` (1829); the first drain of each capture seeds the model's ring from memory; from the second drain on the script compares the ring contents and counters, and for every drain the sends and the ramp enqueues.

- **Ring.** 128 entries of 8 bytes at HDD `0x001F0658` (ROM `0x001F05F8`): `a0` at +0, `a1` at +2, `a2` at +4, `a3` at +6, each stored as a
  halfword; the other argument registers are not stored. Head `0x001F0A60`, tail `0x001F0A5C`, busy word `0x001F0A58` (ROM head `0x001F0A00`,
  tail `0x001F09FC`, busy `0x001F09F8`). An entry goes to slot `head & 127`; the call is dropped when `head - tail >= 128`.
  Slot contents, head and tail match the model on every drain after the first of the four captures; the full-ring drop is *read* (HDD `0x00200C00`..`0x00200CF8`), not reached.
- **Address temporaries.** After a successful enqueue `a3 = 0x1F0658 + 8*s` and `a2 = 0x1F065C + 8*s`, `s = head & 127` at that call
  (*read*, HDD `0x00200CB4`, `0x00200CC0`). A call that follows another without reloading `a2` or `a3` queues the low 16 bits of these
  (`0x0658 + 8*s`, `0x065C + 8*s`; ROM base `0x05F8`). Section 2 (Square) and section 3 (clock set-up) rely on it.
- **Drain.** `sound_handler_exec_queue_cmd` (HDD `0x00200A80`, ROM `0x00200A98`) is called from
  `pad_sound_handler_thread_proc` (`0x0020CD20`, jal at `0x0020CD74`) once per wake, and not while `0x001F0D40` is nonzero (`0x0020CD68`..`0x0020CD74`); it returns without a drain and without the ramp while the busy word `0x001F0A58` is nonzero (`0x00200AB8`..`0x00200ABC`) (*read*); `vblankHandler` (`0x0020C950`) wakes the thread with `iWakeupThread`
  at `0x0020CA40` (*read*). *Measured*: the drain probe fires on every frame of all 18 captures of `verify_sound_menu_senders.mjs` (for example 126 of 126 frames). *Verified* (`verify_sound_chain.mjs`, `hddosd-110U-sound-chain`, 329 drains): the next drain is two frames after a drain that sent a `0x60D0` step and one frame after any other drain; the `sceSdRemote` of the step is still running when the next vblank wakes the thread, and the loop top (`CancelWakeupThread`, `0x0020CD58`) discards that wake (*read*; the IOP time of the call is not measured). One drain sends every entry between tail and head, in order, then sets tail = head. The send is at pc
  `0x00294738` (ROM `0x0026DA20`): `a0` = 1, command, `a1`, `a2`, `a3` (verified: all sends of the four captures).
- **Dedup, 0x6300.** Within one drain a `0x6300` entry whose `a2` equals the previous entry's `a2` is not sent; the first entry of a drain is
  always sent (verified, HDD: `hddosd-110U-sound-ee-queue` drops one; `0x00200B2C`..`0x00200B5C` *read*). Two sends in different frames are
  never compared. The model applies no dedup for ROM 2.30 (command `0x5200`); the ROM captures contain no pair with equal `a2`, so the ROM rule is not tested.
- **Ramp, 0x60D0.** After each drain `sound_handler_2009E0(15)` enqueues one `0x60D0, 1, v, v` while the counter `D_002AAF80` is below 15 and
  increments it: `v = trunc(trunc(0x9FFEC * counter / 0x7F) / 15)`, counter 0 to 14. The counter is zero at power-on and `sound_handler_2009E0` is its only writer (*read*, every store to `D_002AAF80` in the disassembly), so the ramp starts in the first drain after power-on whichever module runs and no later event restarts it. In the opening-first chain the steps are enqueued in emulator frames 128, 131, 133 ... 157 and sent in 129, 131 ... 157 (*verified*, `verify_sound_chain.mjs`: the counter at the n-th drain is `min(n, 15)`, every step value, one ramp call per drain). Fifteen enqueues in fifteen drains; the entry
  queued in drain N is sent in the next drain. Verified on `hddosd-110U-sound-ee-boot` (15 ramp steps, all enqueues equal). ROM 2.30 uses
  command `0x500D`, 60 steps and counter `0x0027A104`: verified on `rom-0230A-sound-ee-boot` (60 steps).
- **0x8070 is not EE-queued.** The S/PDIF push is a direct `sceSdRemote(1, 0x8070, 0xA, a3)` in `pad_sound_handler_thread_proc` at
  `0x0020CE2C`, after the drain, when the word `0x001F0114` is nonzero; it clears the word at `0x0020CE38`. `a3` by the word's value: `0x14` gives 0,
  `0x15` gives 2, `0x13` gives `0xF`, `0x12` gives 1. In the boot it is sent once, in the first drain pass (emulator frame 128, after that drain's sends), the frame after `main` stores `0x14` at `0x0020DD5C`, with `a3` = 0 (*verified*, `verify_sound_chain.mjs`); the other `a3` values of this list are *read*. It reaches the IOP 3 samples after a `0x6140` and 23 after a `0x6150` sent in the same pass (*measured*, `verify_sound_chain_timeline.mjs` output). Writers of the word: `main` (`0x0020DD5C`, `0x14` when `config_get_spdif_mode` is 0, else `0x15`)
  and `clock_config_change_cb_spdif_mode` (`0x00227DD8`) write it, and the Browser also stores it (`func_00254840` `0x002549C4`: `0x14` or `0x15`; `func_002552E8` `0x00255324`: `0x13` or `0x15`, the only writer of `0x13`; `func_00255358` `0x00255384`; `module_browser_24EB38` `0x0024EB7C`); it is zeroed at `main` `0x0020DCC4` and `func_00218318` `0x002183B8`. Any other value reaches the same send with `a3` read from the stack (`0x0020CDD0`, `0x0020CDEC`). *Read*; `verify_sound_clock_senders.mjs` excludes it from the queued list.
- Pad words the senders test (HDD, gp-relative): edge `0x00370334`, held `0x00370330`, repeat `0x0037033C` (`0x1000` and `0x4000` only). The pad update
  runs after the clock frame functions in `clock_orb_rendering_func`, so a sender sees the previous iteration's edge word. *Read.*

## 2. Menu senders (command 0x6300, a1 = 1)

*Verified* by `verify_sound_menu_senders.mjs` with `References/model/sound_senders.mjs` on `hddosd-110U-sound-menu-<suffix>`; the column "captures"
lists the suffixes. Presses are held 6 frames except the `dedup` and `rising` captures (1 frame). A sound is queued in the frame whose sender function
sees the edge word. The verifier compares, per frame, the list of sounds with their `a2` and `ra` in site order, reading the state words at the sender's entry; the "Lands on" columns (the state word stored before the queue call) are *read* from the disassembly, not verified.
`ra` is the return address recorded at `0x00200C00`: a tail-jumped sender shows the `ra` of the caller of the site; a nested jal and j pair shows the `ra` of the inner jal.
`a3` is never loaded at the `0x6300` sites: it is a carried register (observed values in 2.5), except the ring temporary of 2.3 and the move rule of 2.4.

### 2.1 Main menu (`menupos_p3_p8_tgt` `0x002322E0`)

Gate: items ramp `0x002B2E78` in state 2, `func_00232020` nonzero, `0x002B2174` == 0. Pad order: `0x1000` up, `0x4000` down, `0x20` confirm, `0x10` triangle.
The main menu has no cancel: circle queues nothing.

| Event | Command (a0, a1, a2) | Condition | `ra` | Lands on | Captures |
|---|---|---|---|---|---|
| Cursor move up or down | `0x6300, 1, 6` | up needs `selected - 1 >= 0`, down needs `selected + 1 < count`; no wrap, no sound at the ends | `0x00232388` | same frame, after `selected` (`0x002B2E70`) is stored | `cursor`, `cursor-ends`, `dedup`, `ramp-rising-write` |
| Confirm Browser (selected 0) | `0x6300, 1, 4` | mode word `D_00370AB4` == 0 (`func_00234B80`); nonzero queues nothing | `0x002323BC` | after ramp 2 to 3 (`func_00234AE0`) | `cross-browser`, `cross-mode-write` |
| Confirm System Configuration (selected 1) | `0x6300, 1, 4` | SysConfig ramp `0x002B2E04` in state 0 | `0x002323DC` | last: after `func_00234AC0` (rising) and the set-up calls | `cross-config` |
| Open Version (triangle) | `0x6300, 1, 4` | Version ramp `0x002B3000` state 0 and `callback_queue_submit` nonzero | `0x002323F4` | after `func_00234AC0` (rising) | `version`, `version-edges`, `version-rising` |

Written captures: `ramp-rising-write` (word `0x002B2E78` +0xC = 1 at frame 2; Down in state 1 queues nothing, Down in state 2 queues one) and
`cross-mode-write` (`D_00370AB4` = 2 at frames 6 and 7; Cross queues nothing).

### 2.2 System Configuration (dispatcher `func_00231C50`, list `func_002316B8`, in-entry `func_00231B38`)

Gate: list ramp `0x002B2E04` state 2, menu ramp `0x002B5780` state 0, level `0x002B2E00` 0 (list) or 1 (inside an entry).

| Event | Command | Condition | `ra` | Lands on | Captures |
|---|---|---|---|---|---|
| List up or down | `0x6300, 1, 5` | edge `0x1000` (tested first) or `0x4000`; wraps | `0x00232490` | after `selected` and both focus callbacks | `config-list`, `config-dedup` |
| Enter an entry | `0x6300, 1, 4` | edge `0x20`, level 0 | `0x00232490` | after the enter callback, level := 1 | `config-entry0`, `config-entry1` |
| Leave (circle) | `0x6300, 1, 0xA` | edge `0x40`, list ramp state 2; nothing queued while the list ramp falls | `0x00232490` | after `func_00234AE0` (ramp 2 to 3) | `config-circle` |
| In-entry confirm | `0x6300, 1, 4` | level 1, edge `0x20` | `0x00231BDC` | after the confirm callback, level := 2 or 0 | `config-entry0-confirm` |
| In-entry cancel | `0x6300, 1, 0xA` | level 1, edge `0x40` and not `0x20` | `0x00231C38` | after the cancel callback, level := 0 | `config-entry0`, `config-entry1` |
| Clock Adjustment field left or right | `0x6300, 1, 6` | edge `0x8000` / `0x2000`, field wraps by count | `0x00227994` / `0x002279C0` | before the new index is stored (`sw` at `0x002279CC`, after both sounds; *read*) | `config-entry0` |
| Clock Adjustment value up or down | `0x6300, 1, 6` | repeat word `0x1000` / `0x4000` | `0x00227A30` / `0x00227B14` | after the item changes | `config-entry0` |
| Entry with 2 or 3 values, left or right | `0x6300, 1, 6` | edge `0x8000` / `0x2000`, `valueIndex` wraps by `valueCount` | `0x002286C4` / `0x002286FC` | after `valueIndex` changes | `config-entry1` |

Enter, in-entry confirm and cancel and the callbacks queue nothing besides these (no sound in the enter, confirm, cancel or focus callbacks of an entry:
*read*, `0x6300` in `0x00226FD0`..`0x00228740`). Repeat timing for a held up or down is *read* (`func_00235EB0`, `0x00235F30`..`0x00235F74`), not measured: the counter `D_00370AD0` is 0 at the press, which sets the repeat word; counters 1 to 30 set nothing; from 31 the repeat bit is set when the counter is a multiple of 3, so the first repeat is at counter 33 (32 silent frames after the press), then every 3rd frame. Up and down together in one frame: `func_00227940` tests `0x4000` independently of `0x1000` (`0x00227A34`, *read*), which would queue two entries; no capture holds both and the model queues one (Open).

### 2.3 Square: hide and show the menu (`func_00230C80`, `func_00230CE8`)

Square is bit `0x80`. Each pair is queued in one call of one function, in the frame whose edge word carries the bit, not at a ramp end (`square-config`: hide pair at capture frame 7, show pair at frame 92, both with edge `0x80` in that frame). The show check (`module_clock_230DF0`) runs before the hide check
(`module_clock_231E48`) in a frame: a press in state 2 flips the ramp to 3 in the first, and the second then cannot hide. The second command of each pair is
a tail call whose `a3` is formed by the queue code: `0x0658 + 8*s` with `s` = `head & 127` at the first call (verified, e.g. `0x06F8` and `0x0708`).

| Event | Command | Condition | `ra` | `a3` |
|---|---|---|---|---|
| Hide, first | `0x6300, 1, 2` | list ramp state 2, menu ramp `0x002B5780` state 0, `0x002B2E00` == 0; in the list `0x1000`, `0x4000`, `0x20` clear and `0x80` set | `0x00230CC0` | carried (observed `0x180`) |
| Hide, second | `0x6300, 1, 3` | same call, right after the first | `0x00232490` | `0x0658 + 8*s` of the first call |
| Show, first | `0x6300, 1, 0` | menu ramp state 2 and edge `0x80`, after `func_00234AE0` (state 3) and the cubes ramp `0x002B5740` 0 to 1 | `0x00230D30` | carried (observed `0x8000`) |
| Show, second | `0x6300, 1, 1` | same call, right after the first | `0x00230DDC` | `0x0658 + 8*s` of the first call |

Capture: `square-config` (hide, then show 85 frames later: menu ramp state 1 from frame 8, state 2 from frame 57, state 3 from frame 93; 4 sounds). In the main menu (`square-menu`) the menu ramp is state 0 and Square queues nothing.
The two entries of a pair differ in `a2`, so the drain keeps both. A vblank between the two enqueue calls would split a pair; the window is a few instructions and not excluded.

### 2.4 Version page (`func_0022A298` open, `func_0022A7A8` moves, `func_0022A308` back, `func_00228F68` row enter)

Page state `0x002B3000`; record `D_002B2FE8` (+8 row count, +0x10 selected). `func_0022A7A8` returns when its ramp state is 0 (`0x0022A7C8`..`0x0022A7CC`) and reads input only in state 2 (`0x0022A84C`); two more gates are probed inputs: the slt of `func_0022A1D8()` against `func_00228F40()` (`0x0022A7E4`) and `func_00234A98(D_003701C0+0x1C, 0)` (`0x0022A868`). Both take the closing value in `version-edges` (the slt probe returns 1 on frames 123 to 129 with the page in state 2; the row-free probe returns 0 on frames 118 to 122), but only on frames with no press: no capture has a press while a gate is closed, so no capture shows a closed gate suppressing a sound (Open).

| Event | Command | Condition | `ra` | Lands on | `a3` |
|---|---|---|---|---|---|
| Open | `0x6300, 1, 4` | see 2.1 | `0x002323F4` | after `func_00234AC0` | carried (observed `0xF`) |
| Move up | `0x6300, 1, 6` | pad `0x1000`, new `selected >= 0` | `0x0022A8A4` | after `selected` is stored | `0x57` if the selected row has sub-rows, else 1 |
| Move down | `0x6300, 1, 6` | pad `0x4000`, `selected + 1 < count` | `0x0022A8FC` | after `selected` is stored | same rule |
| Row enter (row with sub-rows, triangle `0x10`) | `0x6300, 1, 4` | sub-row count at row+8 nonzero; `func_00234A98(D_003701C0+0x1C, 0)` | `0x00232488` | after `D_003701C0` and `func_00234AC0(row+0x1C)` | carried (observed `0x57`) |
| Back (circle `0x40`) | `0x6300, 1, 0xA` | page state 2 | `0x00232488` | after `func_00234AE0` | carried (observed `0x1` or `0x57`) |

The move `a3` is set by `movz a3, t0, v0` at `0x0022A820`; the verifier derives it from the sub-row count read at `0x0022A818` and compares it
(rows 0, 1, 2 of the capture). Captures: `version`, `version-edges` (edges, row enter), `version-rising` (Down while the page rises queues nothing; Circle queues one).
With a row sub-page in front the page's own gate (`func_00234A98(D_003701C0+0x1C, 0)`) is closed and these senders return first; the sub-page has its own sender, below.

Sub-page of a row (`func_00229520`, called every frame while it is open; the row record is `D_003701C0`, +8 sub-row count, +0x10 selected): gate `func_00234A98(row + 0x1C, 2)` (the return at `0x002295A0`); the pad edge word is `0x00370334`.

| Event | Command | Condition | `ra` | Captures |
|---|---|---|---|---|
| Back (circle `0x40`) | `0x6300, 1, 0xA` | gate true; tail j to `func_00228FD8`, which tests the gate again (return at `0x00228FF0`), calls `func_00234AE0` and queues from its own tail j | `0x00232480` (the caller's) | `version-subpage-probes` (*verified*, `verify_sound_menu_senders.mjs`) |
| Up (`0x1000`) | `0x6300, 1, 6` | gate true, `selected - 1 >= 0` | `0x002295DC` | *read* only |
| Down (`0x4000`) | `0x6300, 1, 6` | gate true, `selected + 1 < count` | `0x00229634` | *read*; with the one sub-row of the default list Down queues nothing (*verified*, `version-subpage-probes`, frame 55) |
| Cross (`0x20`) | `0x6300, 1, 4` | gate true and the sub-row has a callback | the caller's | *read* only; the model reports a Cross edge as unmodelled |

`version-subpage-probes`: Triangle (opens the page), Triangle on row 0 (row enter, `a3` `0x57`), Down (silent), Circle (sub-page back, `a3` 1), Circle (page back, `a3` `0x57`): 4 sounds, 414 items equal.

### 2.5 `a3` carried at the 0x6300 sites

No `0x6300` site sets `a3` except the ring temporary and the Version move rule above. Values observed at the enqueue (carried, not constants):
main menu move `0xF`; Browser `0xF`; SysConfig confirm `0x4`; Version open `0xF`; list `0x180` or `0x57`; enter `0x6` or `0x0`; circle `0x180`; in-entry confirm
`0x57` (the `0x6` seen at the same `a2` is the entry's Enter); in-entry cancel `0x9`; Clock Adjustment `0x180` or `0x6`; 2 or 3 values `0xFFFF`.

The IOP does not read `a3` of a `0x6300`. OSDSND's effect handler (module offset `0x7AD8`, IOP `0x00097C08`) takes the bank from the first argument word and the effect from the second; the SPU2 writes of every `0x6300` are recomputed from those two words alone, with the later words zeroed in the model, and equal the console's (*verified*, `verify_sound_effects.mjs` on `hddosd-110U-sound-boot-b`, `hddosd-110U-sound-fx-steal` and `hddosd-110U-sound-bad-effect`: 6, 27 and 6 commands whose `a3` takes 6, 27 and 5 values, among them `0x180`, `0x6F8`, `0x708`, `0xFFFF8000`, `0xF`, `0x5` and the run `0x100`..`0x119`). A difference in `a3` between a console command and the same command queued by another sender therefore changes no SPU2 write.

## 3. Clock senders (commands 0x6150, 0x6140)

*Verified* by `verify_sound_clock_senders.mjs` with `References/model/sound_senders.mjs` on `hddosd-110U-sound-clock-<suffix>`. `a3` is a literal immediate at the thread start (`daddu a3, zero, zero` at `0x00225D4C`), at the set-up first (`0x0023261C`, jal delay slot) and at each disc block (jal delay slot), so it is asserted; only the set-up second uses address temporaries.

### 3.1 Thread start and set-up

| Event | Command | Function, condition | `ra` | Captures |
|---|---|---|---|---|
| Clock thread start | `0x6150, 1, 0, 0` | `module_clock_thread_proc` `0x00225D30`, jal `0x00225D50`, once per thread creation, after the thread is woken; before the loop | `0x00225D58` | `boot` |
| Set-up, first | `0x6150, 6, 0, 0xF` | `func_002324C8` (called from `module_clock_init_resources`), when the word `0x002AD22C` is nonzero (`enter_clock_module_208378` returns 0) | `0x00232620` | `boot` |
| Set-up, second | `0x6140, 2, a2, a3` with `a2 = (0x065C + 8*s) & 0xFFFF`, `a3 = (0x0658 + 8*s) & 0xFFFF`, `s = head & 127` at the first call | `func_002324C8`, tail j `0x00232634`, immediately after the first | `0x00225E50` | `boot` |

All three come from a cold boot (`boot`: 3 sounds, 175 items equal with the manifest argument `sounds=3`); the `menu` and `config` states start after the wake. With the word
`0x002AD22C` at 0 (`boot-forced`, written) the start is queued and the set-up queues nothing (1 sound, 156 items equal with `sounds=1`).
The second command's `a2` and `a3` are asserted against the first call's ring head (`boot`: first call head 16, so `a2 = 0x06DC`, `a3 = 0x06D8`; in the opening-first chain the head is 18, so `a2 = 0x06EC`, `a3 = 0x06E8`: section 5). Entering Clock Adjustment from System Configuration
queues no `0x6150` or `0x6140` (`config-entry`, 0 sounds of this group).

The pair is queued 31 frames after the thread start is sent in the captures that hold the two (the opening-first chain of section 5 too, frames 376 and 407): `hddosd-110U-sound-clock-boot` (capture frames 124 to 155, *measured* by the timing report of `verify_sound_clock_senders.mjs`) and `hddosd-110U-sound-ee-boot` (the `0x6150, 1` send at frame 128, the pair at 159, *measured* from the send frames of the capture). The cause is the EE time of `module_clock_init_resources` (`0x00225E48`, through the handler): the pair is queued after `module_clock_225D98`, `clock_stuff1` and the loads, whose compute runs before the call (*read*). The native app queues the pair 31 frames after the thread start (`kClockInitFrames`), the measured duration.

### 3.2 Disc-state change (`clock_input_check_handler_p6_p7_tgt` `0x002259B8`)

One loop iteration per frame. Iteration N compares the live disc state `0x001F000C` with the last-seen `D_00370A7C` and, on an accepted change, stores the new state
and raises the flag `D_002B2174`; the sound is queued in iteration N+1, when the flag is set, `func_0022FEF8` returns 0 and the mode word is 0. With the mode nonzero the
sound waits and is queued the iteration the mode returns to 0 (`disc-mode-release`). The key of the sound table `jtbl_00365530` is `D_00370A7C` (the new state).
After the sound `func_00234C28(3)` sets mode 3 (*read*; the mode word is 3 on later branches in `disc-6c`): no further sound until the mode returns to 0. A change is accepted for states `0x6A` to `0x74`; `0x72` also needs `[0x1F0D58] > 0`
(else `D_00370A7C` is not updated and nothing is queued); states below `0x6A` or above `0x74` clear the flag. With the System Configuration list or Version page open
(`func_0022FF28` nonzero, `func_0022FEF8` 0) `D_00370A7C` is updated and the flag is not raised: no sound (`disc-6c-config`).

| Disc state (parenthesised states `0x6B`, `0x6D`, `0x6E`, `0x70`, `0x71`, `0x73`: derived from the probed jump table, not captured; `0x72` and `0x74` are captured) | Command | `ra` | Captures (`hddosd-110U-sound-clock-<suffix>`) |
|---|---|---|---|
| `0x6C` (`0x6D`, `0x6E`) | `0x6150, 2, 0, 0xE` | `0x00225B48` | `disc-6c`, `disc-mode-release` |
| `0x6A` (`0x6B`, `0x73`) | `0x6150, 2, 0, 0xF` | `0x00225B64` | `disc-6a` |
| `0x6F` (`0x70`, `0x71`, `0x72`, `0x74`) | `0x6150, 2, 0, 0` | `0x00225B80` | `disc-6f`, `disc-74`, `disc-72-d58` |
| `0x65` | none | | `disc-65` |
| `0x75` (outside the compare table on HDD) | none | | `disc-75` |
| `0x72` with `[0x1F0D58]` == 0 | none | | `disc-72` |

Written captures (the trace shows the effect, not the recipe): in every `disc-*` capture the disc word first differs from the last-seen value at capture frame 3 (`disc-6c`: 6C against 64); `disc-72-d58` also holds `0x1F0D58` at 1; in `disc-mode-held` the mode word is 2 on frames 4 to 44 (41 sound branches reached, nothing queued); in `disc-mode-release` it is 2 on frames 4 to 14 and 0 at frame 15; `disc-6c-config` is the `config` state; in `disc-6c-config-busy` `D_002B46D0` +0xC is 1 (nothing queued; the trace ends after 4 frames); in `disc-ff98` and `disc-74-ff98` `D_002B2E78` +0xC is 3 and +8 is 1.
`func_0022FF98` (that ramp state) raises the flag and sets `D_00370A7C = 0x270F` unless it is `0x74`: a `0x6150, 2, 0, 0` is queued with no disc change; `0x74` stays sticky. The block for `0x6B`, `0x6D`, `0x6E`, `0x70`, `0x71` and `0x73` is *derived* from the probed
jump table, not captured. The disc word's natural writer (`cdvd_handler_proc_prechk` `0x00211D78`, from the CDVD disc-type byte `0x1F40200F`) is *read* (`0x00211D98`..`0x00211FD0`), not reached by a disc.
The clock exits about 128 frames after this sound (*read*: `func_00234C28` weight `0x80`, `0x00225B90`..`0x00225CD4`); not captured.

## 4. Opening senders (commands 0x6150, 0x6140)

*Verified* by `verify_sound_opening_senders.mjs` with `References/model/sound_senders.mjs` on `hddosd-110U-sound-opening-<suffix>` (12 captures, CLOCK_BUILD=hdd). The counter is `D_00370000` at the
entry of the `OpeningProcessInner` call (+1 per frame); emulator frame = counter + 127 (HDD, NTSC). The opening has no pad abort path: no pad input is read anywhere in the module
(*read*, all 70 files of `asm/opening`; also stated in `opening.md`); the opening's sounds are the thread start and stage 2.

### 4.1 Thread start (`opening_thread_set_vars_2` `0x0021AE78`, from `module_opening_thread_proc` jal `0x0021ABF0`)

Once per module run, at emulator frame 127, before `OpeningInit` initialises the counter (`0x0021ACC8`): the start sounds have no counter value. Condition: the module word `0x001F0648`.

| Module `0x001F0648` | Command | `ra` | `a2`, `a3` | Captures |
|---|---|---|---|---|
| 1 (`BootOpening`) | `0x6140, 0` | `0x0021ABF8` | carried: unchanged from the function's entry registers (measured 0 and 0); tail j `0x0021AED0` | `intro` |
| 4 (`BootIllegal`, `BootWarning`) first | `0x6150, 2, 0, 0` | `0x0021AEB0` | literals 0, 0 | `illegal` |
| 4 second | `0x6140, 6, a2, a3` | `0x0021ABF8` | address temporaries: `a2 = 0x1F065C + 8s`, `a3 = 0x1F0658 + 8s`, `s` = head of the first call (measured `0x65C`, `0x658`, slot 0) | `illegal` |

Any other module value sends nothing (*read*, `0x0021AED8`).

### 4.2 Stage 2 of `OpeningProcessInner` (`0x0021F0F8`)

Chain, in order (*read*, `0x0021F0F8`..`0x0021F208`; the model reproduces it): `go` (`D_00370094`) is set when `D_00370000 > 10 * fps` (strict: counter 600 does not, 601 does; `go-wait`), or earlier by stage 1;
`go` == 0 leaves; `D_00370090` must be 1 (it is set to -1 right after the sound: one sound group per load); then
1. `enter_clock_module_208378()` nonzero (word `0x002AD22C` == 0): `0x6140, 1`.
2. else `is_hdd_boot_ready()` and `get_hddboot_exec() == 1`: `0x6150, 0, 0, 0xF`.
3. else the snapshot `D_003700A0` = `[0x1F000C]`, index = disc - `0x6A`; index >= 10 (unsigned): `0x6140, 1`; else `jtbl_00365470`: index 0, 1, 8, 9 to the `0xF` block, 2, 3, 4 to the `0x6140, 7` plus `0x6150, 0, 0, 0x11` block, 5, 6, 7 to `0x6140, 1`.

| Command | `ra` | `a2`, `a3` | Taken when | Counter | Captures |
|---|---|---|---|---|---|
| `0x6140, 1` | `0x0021F158` | `0xB800`, `0x8000` | clock forced | 122 | `forced` (written) |
| `0x6140, 7` then `0x6150, 0, 0, 0x11` | `0x0021F1BC`, then `0x0021F1D0` | 6140: `0xB800`, `0x8000`; 6150: 0, `0x11` | disc `0x6C`, `0x6D`, `0x6E`, not forced, not hdd exec | 122; `go-wait`: 601 | `disc-6c`, `disc-6e`, `go-wait` (written) |
| `0x6150, 0, 0, 0xF` | `0x0021F1EC` | 0, `0xF` | hdd ready and exec 1, or disc `0x6A`, `0x6B`, `0x72`, `0x73` | 122 (`disc-*`); `ready-b`: 19 | `ready-b`, `disc-6a`, `disc-72`, `disc-73` (written) |
| `0x6140, 1` | `0x0021F200` | `0xB800`, `0x8000` | disc `0x6F`, `0x70`, `0x71`, any state outside `0x6A`..`0x73`, including the idle state `0x64` | 122 | `intro` (no stimulus), `disc-6f`, `disc-74` (written) |

`a2` of the `0x6140` calls is the low 16 bits of `D_003DB800` (`addiu a2, s1, %lo(D_003DB800)` at `0x0021EF44`, not reloaded in stage 2; verified as a literal). `a3` is a carried register: the verifier asserts that it equals the value at the
stage-2 handler's entry (its callees do not write `a3`); `0x8000` is the value measured in every `0x6140` queue of the captures (printed by the verifier, not asserted), and where it comes from before the handler is not traced. The `0x6150` calls load `a3` as a literal in the delay slot. The sound is queued in the call that
finds the conditions true: emulator frame 249 for counter 122 (measured).

The counter is a property of when the condition holds, not of the code: the default path (idle disc `0x64`, nothing forced) reaches stage 2 at counter 122 (the stage-2 probe sees `go` set at counter 122; stage 1 sets it when `2*fps < counter`, *read* `0x0021F0B8`..`0x0021F0E8`: `sll` `0x0021F0D0`, `sltu` `0x0021F0D4`, store to `D_00370094` `0x0021F0E8`; not probed. The 10*fps test of stage 2 is at `0x0021F0F8`..`0x0021F11C`); in `ready-b` ready is 1 and exec 1 and it queues at counter 19; in `go-wait` ready is 1, exec 0, disc `0x6C`, `go` is 0 at the entry of counters 600 and 601 and it queues at 601. Written captures: `forced`, `ready-b`, `disc-*` and `go-wait` (recipes not recorded in the traces).

Trace lengths (vsync records in the capture trace): `intro` 276 frames, `illegal` 156, `go-wait` 747.

## 5. The boot chain from power-on

*Verified* by `verify_sound_chain.mjs` with `References/model/sound_chain.mjs` on `hddosd-110U-sound-chain` (power-on with `SkipSearchLater BootOpening`, 460 frames, EE probes; the frames below are emulator frames, counter = frame - 127) and, for the IOP side, by `verify_sound_chain_timeline.mjs` with `References/model/sound_timer.mjs` on `hddosd-110U-sound-chain-spu` and `hddosd-110U-sound-boot-a` (SPU2 trace with IOP probes).

| Frame | Event | Ring head before |
|---|---|---|
| 127 | opening start `0x6140, 0` (`ra 0x0021ABF8`); `main` has stored `0x14` in `0x001F0114` | 0 |
| 128 | first drain: sends the start, then the S/PDIF push; the ramp enqueues step 0 | 1 |
| 129 .. 157 | drains in 129, 131 ... 157 send steps 0 to 14; the steps are enqueued in 131, 133 ... 157 | 2 .. 15 |
| 249 | stage 2 `0x6140, 1` (counter 122) | 16 |
| 375 | `opening_transition_to_clock` (counter 248) and, in the same frame, the clock thread start `0x6150, 1, 0, 0` | 17 |
| 376 | the thread start is sent | |
| 407 | the set-up pair, `a2 = 0x06EC`, `a3 = 0x06E8` from head 18 | 18, 19 |

- The ring head at each enqueue equals the number of enqueues since power-on, including the 15 ramp steps (*verified*); the head 18 at the pair is 1 + 15 + 1 + 1.
- The clock thread start and the hand-off call are in one frame, the hand-off counter is 248 (*verified*). No `0x60D0` follows the thread start.
- The first EE command (`0x6140` or `0x6150`) reaches the IOP 15000.9 samples after the init command `0x6010` in `hddosd-110U-sound-chain-spu` and 15004.8 in `hddosd-110U-sound-boot-a`, and 6193.6 samples after the first tick call in both (*measured*, printed by `verify_sound_chain_timeline.mjs`). The ramp steps reach the IOP at 801.0 samples (one frame) after that command, then every 1601.3 samples.
- The OSDSND tick function (`0x000925A0`) is called first at IOP cycle 73971858 in every boot, 14 times at gaps of 299872 cycles, then with the regular gap of 599776 cycles (`TICK_CYCLES.ntsc`); single regular gaps are up to 6% long or short and the next one compensates, so the median gap is the period (*verified* by the timeline verifier on both captures; the 14 short gaps are not explained by code that was read).
- The SPU2 writes of the chain's 460 frames equal the model's (`verify_sound_scenario.mjs`, `verify_sound_ramp.mjs`, `verify_sound_trace.mjs` on `hddosd-110U-sound-chain-spu`).

## ROM 2.30 (read, not verified)

`0x5014` / `0x5015` / `0x5200` and the queue (section 1) are verified for the queue only. The senders differ from the HDD in what they send:
- Clock set-up: `func_002324C8` (ROM `0x0022E7A8`) sends one command, `0x5014, 2` (tail j `0x00200BE8` at `0x0022E904`); no counterpart of `0x6150, 6, 0, 0xF`. Thread start: `0x5015, 1, 0, 0` (jal `0x00200BE8` at `0x00221428`, so `ra` `0x00221430`).
- Opening start: module 4 sends only `0x5014, 6` (tail j at `0x0021648C`); module 1 sends `0x5014, 0`; no `0x5015, 2, 0, 0`. Stage 3 sends `0x5014, 1` forced and default; when the hard disk is ready (jal `0x00208398` at `0x0021A808`) it sends `0x5015, 0, 0, 0x11` (`0x0021A820`), else `0x5015, 0, 0, 0xF` (`0x0021A8B0`); the table block for `0x6C`..`0x6E` is `0x5014, 7`, `0x5015, 0, 0, 0x10` (not `0x11`) and a countdown that later sends `0x5015, 7, 0, 0x11`.
- Disc change: same algorithm, tables of 12 entries (state `0x75` exists, block `0xF`), ids `0x5015`; jals `0x002211C0`, `0x002211DC`, `0x002211F8`.
- Menu `0x5200`: move jal `0x0022E660` (a2 6 in the delay slot), Browser confirm `0x0022E694`, SysConfig confirm (jal `0x0022D040` at `0x0022E6B4`, so `ra` `0x0022E6BC`); list, in-entry and callback senders at the ROM addresses of `References/readings/sound-senders-scout.md`.

## Open

Not reached by any capture or verifier:
- **Set-up gap**: the 31 frames are a measured duration whose cause is EE compute time, not a code constant; a different build, load order or region can change it, and no capture on another build measures it.
- **Version sub-page** (the front page behind a row with sub-rows): Up, Down and Cross inside it (`func_00229520`, `func_002296D0`, `D_00229A90`) are read, not reached; a list with a multi-row sub-page and a callback is needed (2.4).
- **Options dialog** (System Configuration triangle, `0x6300, 1, 4` before the dialog starts) and its interior (`func_0022B8E8`, `func_0022BA10`, `func_0022BA78`, `func_0022BC80`, `func_0022BD60`, `func_0022AEB8`, the close functions): read, not captured. Script that would settle it: `verify_sound_menu_senders.mjs` on a capture with triangle on entry 0.
- **Slide-list entries** (`D_00228748`, ids `0x75`, `0x1D7`, `0x12E`; held-word left or right, `0x6300, 1, 6`) and **other System Configuration entries** (entries other than Clock Adjustment and the 2 or 3 value entry): read, not captured.
- **Disc values** `0x6B`, `0x6D`, `0x6E`, `0x70`, `0x71`, `0x73` on the clock thread: their block comes from the probed jump table only. For the opening's own table, `opening.md` lists the captures `hddosd-110U-opening3-disc6b`, `hddosd-110U-opening3-disc6d` and `hddosd-110U-opening3-disc70`, verified by `verify_opening3_stages.mjs`.
- **Two callback sounds in one frame** (Clock Adjustment up and down together): the asm would queue two, the model queues one; a capture with both held settles it with `verify_sound_menu_senders.mjs`.
- **Second clock wake**: the set-up pair sends again on every re-wake of the clock thread and `0x6150, 1` does not repeat; read, not captured. The forced branch (`boot-forced`) is the only wake reached.
- **ROM 2.30**: every sender above except the queue is read; the `0x5200` circle and Version circle sites, the ROM `0x5014, 2` `a2` and `a3` are not read, and the ROM `ra` values above come from the jal addresses, not from a probe; a ROM capture with the enqueue probe at `0x00200BE8` and the menu or clock verifier would settle them.
- **PAL**: no sound sender is verified in PAL; the stage-2 counter at 50 fps (`go` needs counter > 10 * fps) and the slide timer are read only.
- The value of `a3` at the stage-2 `0x6140` (`0x8000`) and at the `BootOpening` start (0, 0) is not traced to an instruction; the verifier asserts only that nothing between entry and enqueue changes it. A probe of the carrier at the opening's entry would settle it.
- Opening `ready=0, exec=1` (the other half of the stage-2 test) and the natural disc and mailbox writers: not reached; the stimuli write them.
- The IOP: the meaning of the ids `0x6140` and `0x6150` and of their arguments is not described here (`opening.md` lists it too); the `0x6300` arguments are in 2.5.
- Closed gates with a press: the Version page's slt term (`frame.early`, model line 119) and its row-free terms (lines 118) are never closed on a frame with an edge in any capture; `mutate.mjs verify_sound_menu_senders.mjs --captures 20 --limit 20` kills 16 of 20 and leaves them alive. A capture pressing Down or Triangle during frames 118 to 129 of the `version-edges` scenario would settle it.
- Other mutation survivors (`mutate.mjs`): `verify_sound_clock_senders.mjs` with `--captures 20` leaves 3 (lines 140, 142, 146: the `>>> 0` conversions of the two `func_0022FEF8` returns and of the mode word); `verify_sound_menu_senders.mjs` with the default captures and `--limit 20` kills 7 of 20 and leaves 13, among them line 114 (the `a3` of the sites other than ring and Version moves is recorded, not compared); `verify_sound_opening_senders.mjs` kills 7 of 7.
