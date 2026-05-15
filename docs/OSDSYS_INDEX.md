# OSDSYS Architecture Wiki

Welcome to the reverse engineering documentation for the PlayStation 2 HDDOSD (Browser 1.10U / CrystalOSD target). This wiki maps the entire boot sequence, module lifecycle, and hardware interfaces of the PS2 dashboard.

## 🏛️ System Architecture
* [01. Boot Pipeline & Initialization](architecture/01_boot_pipeline.md) - The 5-phase boot sequence from `main()` to the infinite module dispatch loop.
* [02. Thread & Synchronization System](architecture/02_thread_system.md) - EE thread priorities, semaphores, and the async file operations framework.
* [03. Module System Architecture](architecture/03_module_system.md) - The dynamic VTable-based module loading system and `var_current_module` state transitions.
* [04. EE Memory Map](architecture/04_memory_map.md) - Static memory layout and the critical `0x1F0000` shared state region.

## ⚙️ Hardware Interfaces
* [CDVD State Machine](hardware/cdvd_state_machine.md) - Disc polling, auto-boot detection, and hardware NVRAM/RTC writes.
* [Pad & Sound System](hardware/pad_input_system.md) - 8-port controller polling, NTSC/PAL timing differences, and the SPU2 audio queue.

## 🧩 UI Modules
### Clock Module
The default idle state of the PS2, handling the settings menu and 3D background.
* [Engine & Physics](modules/clock/engine_and_physics.md) - The 3D rendering pipeline, VU0/VU1 matrix math, and the physics simulation of the 12 floating glass orbs.
* [Memory & Struct Definitions](modules/clock/memory_and_structs.md) - Reverse-engineered C `struct` layouts for the physics arrays and `OrbRenderNode` linked-lists, plus physics *Magic Numbers*.
* [Function Dictionary](modules/clock/function_dict.md) - Exhaustive A-Z reference of every decompiled Clock function.

### Configuration Module
The abstraction layer for persistent console settings.
* [Storage & NVRAM](modules/config/storage_and_nvram.md) - Mechacon bitfields, HDD `__sysconf` parsing, and hardware read/write RPCs.
* [Memory & Struct Definitions](modules/config/memory_and_structs.md) - Deep dive into `osdmain.ini` schema, `var_mechacon_config_param_2`, and the 15-byte `var_ps1drv_config` bit-packing layout.
* [Function Dictionary](modules/config/function_dict.md) - Exhaustive A-Z reference of every decompiled Config function.

---
### Opening Module
The iconic PS2 boot sequence, rendering the save data towers and handling invalid disc states.
* [Engine & State Machine](modules/opening/engine_and_states.md) - The camera animation progression, RSOD rendering, and frame timing.
* [Tower History (Save Data)](modules/opening/tower_history.md) - How the system translates the `SaveHistoryEntry` struct from the Memory Card into 3D transparent meshes.
* [Function Dictionary](modules/opening/function_dict.md) - Exhaustive A-Z reference of every decompiled Opening function.

### Browser Module
The largest subsystem, managing the Virtual File System, HDD saves, and 3D Icon rendering.
* [The `icon.sys` Format (PS2D)](modules/browser/iconsys_format.md) - Deep dive into the metadata format used to control the lighting, title, and animations of 3D Memory Card icons.
* [File Operations & UI](modules/browser/file_operations.md) - The VFS state machine for atomic copying/deleting, and the heuristics behind localized size formatting (KB vs MB).
* [Function Dictionary](modules/browser/function_dict.md) - Exhaustive A-Z reference of over 100 decompiled Browser functions.
