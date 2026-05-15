# EE Memory Map & Data Layout

> A high-level overview of the static memory layout for the CrystalOSD (HDDOSD 1.10U) uncompressed binary running on the Emotion Engine (MIPS R5900).

## Memory Map

```text
0x00200000 ┌──────────────────────────┐
           │ .text (code)             │  Entry: 0x200008
           │ 670 KB executable        │  GP: 0x377970
0x00348000 ├──────────────────────────┤
           │ .data (initialized)      │  Strings, vtables, constants
0x00370000 ├──────────────────────────┤
           │ .sdata (small data)      │  GP-relative globals
           │ Module state vars        │  var_current_module, etc.
0x00377970 ├─ ─ ─ ─GP─ ─ ─ ─ ─ ─ ─ ─┤
           │ .sbss (small bss)        │
0x00380000 ├──────────────────────────┤
           │ .bss (uninitialized)     │  Thread stacks, buffers
           │ Resource info tables     │  romdir entries
0x0050A780 ├──────────────────────────┤
           │ .module_storage          │  Embedded IRX modules
           │ 2.6 MB of IOP binaries   │  (usbd, pfs, hdd, etc.)
0x005AE830 ├──────────────────────────┤
           │ (end of binary)          │
           └──────────────────────────┘

0x00600000 ┌──────────────────────────┐  (Runtime buffers)
           │ Sound resource area      │
0x00680000 ├──────────────────────────┤
           │ Staging buffer           │  Temp for decompress/decrypt
0x018F0000 ├──────────────────────────┤
           │ Asset destination area   │  Textures, fonts, etc.
           └──────────────────────────┘

0x001F0000 ┌──────────────────────────┐  (Low memory / kernel area)
           │ Shared state variables   │
           │ 0x1F0010: execute_app_type
           │ 0x1F0648: var_current_module
           │ 0x1F000C: disc_type      │
           └──────────────────────────┘
```

## Significance of `0x1F0000`
The memory region starting at `0x1F0000` acts as a crucial bridge for cross-module communication. Because the UI modules (Opening, Clock, Browser) are completely decoupled from each other and the background hardware threads (CDVD, Pad), they read and write bitflags into this global region rather than sending IPC messages.

Key variables mapped here:
- **`0x1F000C`**: `disc_type` (Updated by CDVD thread, read by Opening to trigger transitions).
- **`0x1F0010`**: `execute_app_type` (Tells the main loop what ELF to boot).
- **`0x1F0184`**: `config_dirty` flag.
- **`0x1F0644`**: `var_clock_is_dirty` flag.
- **`0x1F0648`**: `var_current_module` (The index of the UI module currently active).
- **`0x1F0CBC`**: Pad Input states (Written by Pad handler, read by Clock/Browser).
