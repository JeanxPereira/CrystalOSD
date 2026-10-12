# Which code writes the menu's state

*Read* on **HDD OSD 1.10U** (`../CrystalOSD-Decomp-Legacy/asm/`): `func_00227F08`, `func_00228228`, `func_002282F0`,
`func_00227940`, `D_00228660`, `func_002283C0`, `D_00228748`, `func_002316B8`, `func_00231B38`,
`menupos_p3_p8_tgt`, `func_002324C8`. *Measured* with write watchpoints over one cold-boot session
(`hddosd-1.10U-host`, argument `SkipSearchLater`): `References/scripts/cold_record.mjs --route session2`
records `hddosd-110U-cold-menu-session.writes.json`; `References/scripts/measure_cold_menu_leaves.mjs`
prints, for each of the 150 leaves, the ELF value, the value at frame 330 and every store with its
function. The session: power-on, main menu down and up, System Configuration, Clock Adjustment edited and
confirmed, each of the seven entries changed, the Options dialog, back, the clock alone (2464 frames).

## The three records

- **Entry list** `0x002B2BF0`, nine entries of `0x38` bytes: `+0x00` id, `+0x04` valueCount, `+0x08`
  valueIndex, `+0x0C` item (the index into the configuration items, `clock-config-items.md`), `+0x10`
  valueTable, `+0x14` enter, `+0x18` stringCallback, `+0x1C` frameCallback, `+0x20` confirm, `+0x24` cancel,
  `+0x28` focus, `+0x2C..+0x34` three zero words.
- **Page** `0x002B2DE8`, fourteen words: `+0x08` count, `+0x0C` titleWidth, `+0x10` selected, `+0x18` level,
  `+0x1C..+0x28` the ramp (length, counter, changed, state), `+0x34` glow.
- **Main menu** `0x002B2E60`, ten words: `+0x08` count, `+0x10` selected, `+0x18..+0x24` the ramp.

## Result

Of the 150 leaves, 90 are never stored to and keep the ELF value from the first frame to the last (the
script's class *constant*), 43 are written only at frame 138, when `module_clock_init_resources` runs, 17 are written by input or by
the frames.

**Entries 0 to 3** (Clock Adjustment, Aspect, the next two): every leaf is constant, the ELF values, except
`valueIndex` (`+0x08`), which starts at the ELF's 0 and is written by input only:

| Entry | writer of valueIndex | rule |
|---|---|---|
| 0 | `func_00227940` `0x002279CC` | right adds 1 and wraps to 0 at valueCount (the field being edited) |
| 1, 2 | `D_00228660` `0x002286E4` (right) | adds 1, wraps to 0 at valueCount; left subtracts 1 |
| 3 | `func_002283C0` `0x00228400`, `0x00228434` (set from the item); `D_00228660` `0x002286E4`, `0x002286E8` | |

**Entries 4 to 6** are built by `func_00227F08` in that init (copies of the templates `D_002B2E88`,
`D_002B2EC0`, `D_002B2EF8`, `D_002B2F30` with `sdl`/`sdr` pairs), then fixed up by `func_002282F0` (entry 4:
valueCount `+0x04` 7, valueTable `+0x10` `0x002B2610`) and `func_00228228` (entry 6: valueCount 9, valueTable
`0x002B2970`); both choose by `get_vidmode_with_fallback`, so they depend on the video mode. Their
`valueIndex` starts at 0 and is written by input: `D_00228748` `0x00228924` (entries 4 and 6), `func_002283C0`
and `D_00228660` (entry 5). Entries 7 and 8 are constant, the ELF values.

**Page**: `count` is stored by `func_00227F08` (`0x0022818C`, 7 entries here); `selected` starts at 0, the
ELF value (`func_00227F08` leaves it when the entry at `selected` keeps its id), and is written by `func_002316B8`
(`0x002317C8` down, `0x00231720`); `titleWidth` by `browser_str_related2` (`0x0023282C`) at every draw;
`level` by `func_002324C8` (`0x002325B0`, 0 at start), `func_002316B8`, `func_00231B38`, `func_00230FD8`;
`ramp.length` by `func_002324C8` (`0x002325CC`, 90), `StartSysConfig` (`0x00230F04`) and `func_00230F48`; the ramp's counter, changed and state
by the ramp helpers `func_00234AC0`, `func_00234AE0`, `func_00234B10`; `glow` by `func_00230FD8`
(`0x00231170`), `func_00231B38`, `clock_config_get_initial_value`. The other six words are constant.

**Main menu**: `selected` starts at 0, the ELF value, and is written only by `menupos_p3_p8_tgt`
(`0x002322E0`): down (pad bit `0x4000`) stores `selected + 1` at `0x0023236C` while it is below `count`,
up (`0x1000`) stores `selected - 1` at `0x00232340` while it is not below 0 (*read*; no wrap); both play
sound command `0x6300` (*read*). `ramp.length` is stored by `func_002324C8` (`0x002325D8`, 10); the ramp's
other words by the ramp helpers.

No leaf of these three records differs from the ELF without a store: the script's verdict is `FOUND` only
then.
