# Browser Module: The `icon.sys` Format (PS2D)

> A technical dissection of the PlayStation 2 Memory Card `icon.sys` header file. This file acts as the primary metadata descriptor for a save folder, dictating the localized title and the 3D rendering parameters of the save icons.

---

## 1. File Structure Overview

When a game creates a save folder on a Memory Card (or HDD), it includes an `icon.sys` file. The OSDSYS Browser module uses the `browser_handle_icon_sys_binary` function to parse this file.

The standard PS2 `icon.sys` file is exactly `964` bytes (`0x3C4`), but the header and critical fields are packed into the first `0x1A4` bytes.

### The PS2D Header Layout

| Offset | Size | Type | Description |
|--------|------|------|-------------|
| `0x000` | 4 bytes | `char[4]` | Magic Header: `"PS2D"` |
| `0x004` | 2 bytes | `u16` | Title Line Break 1 (Character offset to break the title) |
| `0x006` | 2 bytes | `u16` | Title Line Break 2 (Optional second line break) |
| `0x008` | 4 bytes | `u32` | Background Transparency (Used as `BgColor` alpha/padding) |
| `0x00C` | 4 bytes | `u32` | Background Color (`BgColor` RGB) |
| `0x010` | 16 bytes | `vec4` | Light 1 Direction (`X, Y, Z, W` floats) |
| `0x020` | 16 bytes | `vec4` | Light 2 Direction |
| `0x030` | 16 bytes | `vec4` | Light 3 Direction |
| `0x040` | 16 bytes | `vec4` | Light 1 Color (`R, G, B, A` floats) |
| `0x050` | 16 bytes | `vec4` | Light 2 Color |
| `0x060` | 16 bytes | `vec4` | Light 3 Color |
| `0x070` | 16 bytes | `vec4` | Ambient Light Color |
| `0x080` | 64 bytes | `char[64]` | Title Name (SJIS string, up to 64 bytes). Displayed in the Browser UI. |
| `0x0C0` | 64 bytes | `char[64]` | Reserved / Secondary Title Buffer |
| `0x104` | 32 bytes | `char[32]` | Normal Icon Filename (e.g. `"icon.icn"`) |
| `0x124` | 32 bytes | `char[32]` | Copying Icon Filename (Displayed when moving the save) |
| `0x144` | 32 bytes | `char[32]` | Deleting Icon Filename (Displayed when deleting the save) |

---

## 2. Parsing Logic (`browser_handle_icon_sys_binary`)

The `browser_handle_icon_sys_binary` is a strict parser:
1.  **Magic Check**: It immediately verifies the `PS2D` magic bytes. If it fails, the folder is marked as "Corrupted Data".
2.  **Pointer Injection**: It writes the parsed light vectors (`0x10` through `0xB8`) directly into a global `iconinfo_ptr` heap structure.
3.  **Strings**: It buffers the 3 icon filenames (`Normal`, `Copy`, `Delete`). If any of the filename strings are null (`\0`) at the first byte, it aborts the read, preventing a crash if the 3D `.icn` file cannot be loaded.

---

## 3. 3D Icon Rendering (`.icn`)

Once the `icon.sys` points to a valid `.icn` filename, the engine loads it.
*   The `.icn` format contains the actual 3D vertex data, normals, and UV maps.
*   The OSDSYS Browser applies the **Lighting Parameters** (Colors and Directions) extracted from `icon.sys` to the GS (Graphics Synthesizer) registers.
*   This is why some saves have a bright, glowing icon (strong Ambient Color), while others are dark and moody—the game developer baked the light scene directly into the `icon.sys` header!
