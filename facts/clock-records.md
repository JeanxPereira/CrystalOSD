# The rod record and the cube record

*Read* on **HDD OSD 1.10U** (`../CrystalOSD-Decomp-Legacy/asm/clock/`): `module_clock_22F5D0`, `module_clock_22F760`,
`module_clock_22F380`, `module_clock_2306B0`, `module_clock_230600`, `module_clock_2308F0`. *Measured* with
write watchpoints over five windows of one cold-boot session (`hddosd-1.10U-host`, argument
`SkipSearchLater`): `References/scripts/cold_record.mjs --route session2 --windows 120:175,245:256,372:392,440:455,700:712`
records `hddosd-110U-cold-records-session.writes.json`; `References/scripts/measure_cold_records.mjs` prints
every leaf with its ELF value, its value at frame 330 and every store with its function. The windows are the
clock's first frames (frames 121 to 176), counter about 100 (245 to 257), System Configuration opening with the
rods in (373 to 393), the list with its cubes (440 to 455) and Clock Adjustment (700 to 712); every stop of the
watchpoint was a decoded store.

## Two scratch records

`template` (`0x002B5490`, `0xE0` bytes, 41 leaves) is the record the clock fills before each rod and each orb
it draws; `cubeRecord` (`0x002B5AF0`, same layout) is the one filled before each cube of System Configuration.
Every leaf that a frame uses is stored by a draw function in that frame, so no start value of those leaves is
an input. The leaves are: `+0x00` number, `+0x04` faces, `+0x20..+0x5C` local matrix (4 x 4 floats), `+0x68`,
`+0x6C`, `+0x70` sx, sy, sz, `+0x80` base colour, `+0x90` strength, `+0xA0` textured colour, `+0xB0`, `+0xB4`
pair, `+0xB8` refraction, `+0xC0` reflection colour, `+0xD0` extra colour.

| Record | Leaves stored every frame it is drawn | Writer (HDD OSD 1.10U) | Leaves never stored (ELF value) |
|---|---|---|---|
| `template` | local matrix, 16 leaves | orbs: `module_clock_22F760` `sq` at `0x0022F8AC`, `0x0022F8B4`, `0x0022F8BC`, `0x0022F8C4`; rods: `module_clock_22F5D0` `sq` at `0x0022F674`, `0x0022F67C`, `0x0022F684`, `0x0022F68C` | faces, sx, sz, textured (4), pair (2), refraction, extra (4): 13 leaves |
| `template`, rods only | number (`sw` `0x0022F654`), sy (`swc1` `0x0022F664`), base (`sq` `0x0022F6A8`), strength (`swc1` `0x0022F6F4`, `0x0022F700`), reflection (`sq` `0x0022F6C4`): 11 leaves, stored in the windows where rods are drawn (373 on), not in the first two windows | `module_clock_22F5D0` | |
| `cubeRecord` | local matrix `sq` `0x00230824`, `0x0023082C`, `0x00230834`, `0x0023083C`; sx, sy, sz `swc1` `0x002306EC`, `0x002306F0`, `0x002306F8` (`module_clock_2306B0`); base (`sq` `0x00230A44` in `module_clock_2308F0`, `sw` `0x00230630`, `0x00230658`, `0x00230680`, `0x002306AC` in `module_clock_230600`); reflection[3] (`sw` `0x00230B2C`): 24 leaves | | number, faces, strength, textured (4), pair (2), refraction, reflection[0..2], extra (4): 17 leaves |

The leaves that are never stored hold the ELF value at frame 330 and at the end of the session (2466
frames). The orbs and the rods share `template`: the orb draw stores the matrix only, so the rod leaves
(number, sy, base, strength, reflection) keep their ELF values until the first rod is drawn.

## At the clock's first frame

`start-boot.json`, the capture of the cold boot's first frame (`hddosd-110U-whole-boot-opening`), holds the ELF
value in all 41 leaves of `template`; the start-up code (`module_clock_init_resources`) stores none of them
(no store in the first window before the first draw, frame 148; `start_origins.mjs --piece template`). The
main-menu capture (`hddosd-110U-whole3-menu`) holds the ELF value in all 41 leaves of `cubeRecord`; the first
store is in the list's first draw.
