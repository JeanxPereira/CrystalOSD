# Sound: which event sends what (scout reading, 2026-10-03)

Reading, not fact: every row read from the HDD OSD 1.10U disassembly, none measured live.

## Queue (READ)
- `sound_handler_queue_cmd` HDD 0x00200C00 / ROM 0x00200BE8: ring of 128 × 8 bytes at 0x1F0658 ({cmd, a1, a2, a3}
  halfwords), head 0x1F0A60, tail 0x1F0A5C; dropped when full.
- Drain `sound_handler_exec_queue_cmd` 0x00200A80 (only caller: `pad_sound_handler_thread_proc` 0x0020CD20):
  `sceSdRemote(1, cmd, a1, a2, a3)` per entry; within one drain a `0x6300` with the same a2 as the previous entry
  is skipped; then `sound_handler_2009E0(0xF)`.
- `sound_handler_2009E0`: while D_002AAF80 < 0xF sends `0x60D0, 1, v, v` with v = ((0x9FFEC·cnt)/0x7F)/0xF
  (cnt·344, 0..4816), then increments: a 15-step ramp per drain. Meaning of 0x60D0 open.
- `sound_handler_215450(mode, a1)`: master volume params 0x980/0xA80 = 0x3FFF|0xA000 (modes 0, 2) or 0|0x8000
  (1, 3); mode 0 also zeroes the 48 voice volumes. Bit 15 = SPU2 sweep (hardware slide).
- `sound_init` 0x00200518: 6010, 8070, 8010(0x801, 0xFFF), 60C0, 6060, 60A0, 6090 × many.
- Build ids: HDD 0x6140 / 0x6150 / 0x6300 ↔ ROM 0x5014 / 0x5015 / 0x5200 (paired by call site, not by table).

## Sound effects: `0x6300, 1, N` (N = effect, inferred)
| N | Event |
|---|---|
| 6 | cursor move (main menu, pages, dialogs; Browser up/down) |
| 5 | System Configuration list up/down; one page's move |
| 4 | confirm / enter (main menu, System Configuration, pages, first-run intro, Browser) |
| 0xA | cancel / back (Circle closes System Configuration, pages, Browser) |
| 2 then 3 | Square hides the menu (clock alone) |
| 0 then 1 | Square again, menu back |
| 7–9, 0xB–0xD, 0x12, 0x16, 0x19, 0x24–0x26 | Browser only (`sound_handle_queue_cmd_auto` 0x0024E090, 102 callers) |

## Sequences / scenes: 0x6140, 0x6150 (meaning open)
- Opening stage 2 (`OpeningProcessInner` 0x0021F150..0x0021F320): 6140,1; 6140,7 then 6150,(0,0,0x11);
  6150,(0,0,0xF); 6150,(6,0,0xF), by disc state.
- Opening start/abort (0x0021AEA8..): 6150,(2,0,0) then 6140,6; or 6140,0.
- Clock thread starts (`module_clock_thread_proc` 0x00225D50): 6150,(1,0,0).
- Disc-state change on the clock (0x00225B40..): 6150,(2,0,0xE / 0xF / 0) via `jtbl_00365530`.
- Clock set-up (`func_002324C8`): 6150,(6,0,0xF) then 6140,(2,0,0xF).
- No continuous ambience command on the EE: loops/music run inside the IOP.

## Probes
Enqueue pc 0x00200C00 (a0..a3, ra); wire pc 0x00294738 (a0..a3, t0); ramp pc 0x002009E0 + word 0x002AAF80;
ring 0x1F0658..0x1F0A60. ROM wire pc unresolved (derive from the ROM drain's jal).
