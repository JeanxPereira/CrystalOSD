# Opening Module: Tower History (Save Data)

> A low-level breakdown of how the PlayStation 2 translates the save data history from the Memory Card into the iconic 3D transparent towers rendered during the system boot sequence.

---

## 1. The History Buffer (`0x1F0198`)

The PS2 maintains a global "history buffer" in the `0x1F0000` low-memory region, starting specifically at `0x1F0198`. This buffer contains metadata about the most recently saved games across all inserted Memory Cards.

The Opening Module reads this buffer during `OpeningInitTowersFog` to spawn the 3D towers.

### History Entry Layout
The buffer is an array of exactly **21 entries** (loop `0` to `0x14`). Each entry is **22 bytes** (`0x16`) long.

```c
// Size: 0x16 (22 bytes)
typedef struct {
    char title_id[16];     // +0x00: The game's Title ID string (e.g. "BASC-12345")
    u8   color_index;      // +0x10: Determines the color/texture of the tower
    u8   height_flag;      // +0x11: Used for height/scale calculation
    u8   position_seed;    // +0x12: Used to place the tower in the 3D grid
    u8   pad[3];           // +0x13: Unused/Padding
} SaveHistoryEntry;
```

---

## 2. Tower Generation Logic (`OpeningInitTowersFog`)

When the PS2 boots, the function `OpeningInitTowersFog` parses this array to populate the 3D scene.

### A. Validating Entries
The function loops 21 times. For each entry, it calls `strcmp` against a blank string (`DAT_003700d0`). If the `title_id` is blank, the slot is ignored.

### B. Tower Color and Textures
If a valid string is found, it reads the `color_index` (`+0x10`):
*   If `color_index < 14 (0xE)`: It maps directly to one of the 14 base tower textures stored in ROM.
*   If `color_index >= 14`: It calculates `((color_index - 14) % 10 + 4) * 4` to loop back and reuse specific textures, preventing out-of-bounds memory access.

### C. Tower Height and Physics
The height of the tower is not static. The PS2 animates them rising from the fog.
The function writes target values into two massive arrays:
*   `DAT_003df4f0` (Current Scale/Height)
*   `DAT_003df800` (Target Scale/Height)

```c
// Decompiled logic determining height mapping
if (((unk_11 >> (uVar11 & 0x1F)) & 1) != 0) {
    // If specific bits are set in unk_11, the tower is forced to max height
    target_height = 0x3f800000; // 1.0f
    current_height = 0x3f800000; // 1.0f
}
```

The rendering loop later interpolates the `current_height` towards the `target_height`, which is why you see the towers "grow" smoothly out of the ground before the camera dives into them.

---

## 3. Rendering the Towers

The actual drawing of the towers is dispatched by `OpeningDrawLightsAndCubes`.
*   The towers are drawn using a **fog multiplier**. The deeper a tower is placed in the Z-axis, the more it blends into the black background.
*   Because the towers are transparent, they are rendered *after* the opaque background elements (the blue clouds) to ensure proper alpha blending without Z-buffer artifacts.
