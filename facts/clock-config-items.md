# The clock's configuration items

*Read* on **HDD OSD 1.10U** (`../CrystalOSD-Decomp-Legacy/asm/config/` and `clock/`): `config_load_clock_osd`
(`0x00234F88`), `config_save_clock_osd` (`0x002352D0`), `config_item_change_cb_clock_write_mechacon`
(`0x00235170`), `module_clock_get_config_item` (`0x00234F38`), `func_00235448`, in full.
*Measured* with write watchpoints from a cold boot (`hddosd-1.10U-host`, argument `SkipSearchLater`):
`References/scripts/cold_record.mjs` records, `References/scripts/measure_cold_config_items.mjs` reads
`hddosd-110U-cold-items-session.writes.json`.

## The block

The configuration items are the words of one block at `0x00409130` (`.bss`). `module_clock_get_config_item(n)`
returns `0x00409130 + 4n`. `config_load_clock_osd` fills it from the console's settings; `config_save_clock_osd`
writes it back to them (*read*). The entries of System Configuration name their item by the word at
entry `+0x0C`; the callbacks fetch the item through `module_clock_get_config_item`.

## Item 0, the aspect ratio

Two stores write item 0 (*measured*, `measure_cold_config_items.mjs hddosd-110U-cold-items-session`, 2464
frames from power-on, the main menu, System Configuration, Clock Adjustment confirmed, every other entry
changed, back and the clock alone; every stop of the watchpoint was a decoded store):

- `config_load_clock_osd` stores the result of `config_get_aspect_ratio` (`0x00203D98`) with
  `sw v0, -0x6ED0($s2)` at `0x00234FC4`, where `$s2` is `0x00410000` (`lui`). The address is never written as
  `%lo(D_00409130)`, which is why a search for stores to the block's address does not list it (*read*).
  1753 writes, one on every frame from frame 137 except while an entry is open (gaps of 74 to 135 frames),
  values 0 and 1 (1 once the Aspect entry has been changed).
- The value callback of the entries, `D_00228660` (`0x00228660`), stores the value the player chose through
  the item pointer: `sw a0, 0(v0)` at `0x00228718`, with `v0` from `module_clock_get_config_item(entry +0x0C)`
  and `a0` the first word of `valueTable[valueIndex]` (*read*); 72 writes, one per frame while the Aspect entry
  is open.

`config_save_clock_osd` reads item 0 back with `lw a0, -0x6ED0($s0)` for `config_set_aspect_ratio` (*read*).

## Items 5 and 12

Items 5 (`0x00409144`) and 12 (`0x00409160`) have no writer. *Read*: `config_load_clock_osd` stores offsets
`0x04`, `-0x6ED0`, `0x08`, `0x0C`, `0x10`, `0x18` to `0x2C`, `0x34` to `0x54`, `0x58` and beyond, and
neither `0x14` nor `0x30`; no constant index 5 or 12 is passed to `module_clock_get_config_item` (the
constants are 6 to 11, `0x0D`, `0x0E`, `0x10`, `0x13`); no System Configuration entry names them (entry
`+0x0C` holds 0, 0, 1, 2, 3, `0x1B`, `0x16`, `0x16`, `0x1C`); `config_save_clock_osd` reads neither offset.
*Measured*: no store to either word in the same 2464 frames, watched from the first frame. Both stay at the
`.bss` value 0. A cold start leaves them 0.

## What the load does every frame

`config_load_clock_osd` is not an initialisation: while `D_00370300` is 1 it re-reads the settings on every
frame (*measured*, item 0; the writes pause while an entry of System Configuration is open), and the time
items 6 to 11 on every call whatever `D_00370300` holds (*read*, `.L002350D4`). A cold start therefore only needs the settings, not a stored copy of the items.
