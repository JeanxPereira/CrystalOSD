# Clock Module: Memory & Struct Definitions

> A low-level technical reference detailing the exact memory layouts, C `struct` definitions, and magic numbers (physics constants) used internally by the Clock Module. This information is derived from deep decompilation of the `.data` and `.bss` segments, and is essential for achieving a byte-perfect C match.

---

## 1. Global Array Layout (`0x00404000` region)

The physics state for the 12 floating glass orbs is not stored inside the rendering linked-list. Instead, it is stored in a series of contiguous arrays in the BSS section (around `0x00404F00`).

The update loop (`module_clock_22F5D0`) iterates 12 times, using a stride of `0x30` (48 bytes) to access the vectors for each orb.

```c
typedef struct {
    float x, y, z, w;
} vec4;

// Size: 0x30 (48 bytes)
// Alignment: 16-bytes (to map directly to VU0 vector registers)
typedef struct {
    vec4 position;   // +0x00
    vec4 velocity;   // +0x10
    vec4 rotation;   // +0x20
} OrbPhysicsState;
```

*   `DAT_00404F80` acts as the base pointer for the `OrbPhysicsState[12]` array.
*   The "Focus" orb (the largest one in the center) is always processed at logical index 0, where its scale is forcefully set to `0x43480000` (200.0f).
*   The 11 background orbs are scaled to `0x43200000` (160.0f).

---

## 2. Rendering Linked-List (`OrbRenderNode`)

While physics are computed in flat arrays, the actual rendering is dispatched via a linked-list of nodes (starting at `DAT_00405230`). The draw functions (`module_clock_22F908` and `module_clock_22FC88`) receive a pointer to one of these nodes.

Based on the memory accesses in `module_clock_22FC88`, the node structure is at least 276 bytes (`0x114`) long.

```c
// Size: >= 0x114 (276 bytes)
typedef struct OrbRenderNode {
    struct OrbRenderNode* next; // +0x00: Pointer to the next node in the list
    int node_type;              // +0x04: (Guessed) Used by dispatcher to route to 22F908 or 22FC88
    int pad1, pad2;             // +0x08, +0x0C
    
    vec4 world_pos;             // +0x10: Extracted from Physics array and translated to world space
    
    // ... [0x20 to 0xF3] Unknown rendering metadata / matrix caches ...
    
    float scale;                // +0xF4: Float scale (200.0f or 160.0f)
    int pad3[3];                // +0xF8, +0xFC, +0x100
    
    vec4 color;                 // +0x100: RGBA / Lighting color multiplier
    
    float unk_110;              // +0x110: Unknown float parameter passed to GS tag builder
} OrbRenderNode;
```

### The Render Dispatcher
The dispatcher (`module_clock_22FCA8`) iterates through this linked list. If `node[0x3C] == 1`, it calls `22F908` (Type 1 render, possibly for the clock hands or background panels). Otherwise, it calls `22FC88` (Type 2 render, the actual glass orbs).

---

## 3. Microcode & GS Packet Builder (`module_clock_237A28`)

The function `module_clock_237A28` is responsible for building the actual VIF (Vector Interface) and GIF (Graphics Interface) tags that stream the 3D geometry of the orbs to the VU1 processor.

It takes the `scale` (`+0xF4`), `unk_110` (`+0x110`), `world_pos` (`+0x10`), and `color` (`+0x100`) from the `OrbRenderNode`.

### Packet Generation Flow
1.  **Transformations:** Uses `FUN_00237010` to apply matrix transformations on the fly.
2.  **Environment Map Context:** Prepares the environment map UV coordinates, using constants from `.data` (`DAT_0036fc58`, `DAT_0036fc5c`) to determine the refraction/reflection strength.
3.  **VIF Uploads:** Loads 16-byte aligned vector blocks (`uStack_190` through `uStack_154`) into VU1 memory. These blocks represent the world-to-screen matrices.
4.  **GIF Draw Kicks:** It loops (`do...while(iVar14 < iVar10)`) issuing `FUN_00236988` calls, which act as the final GS kick (likely sending the `GIF_SET_TAG` primitive for triangle strips).

---

## 4. Physics Constants (Magic Numbers)

The simulation relies on specific float constants to dictate the speed and size of the objects. These reside in the `.data` and `.sdata` sections.

| Hex Value | Float Value | Purpose | Location |
|-----------|-------------|---------|----------|
| `0x43480000` | `200.0f` | Focus Orb Scale (Foreground) | Hardcoded instruction |
| `0x43200000` | `160.0f` | Background Orb Scale | Hardcoded instruction |
| `0x3f800000` | `1.0f` | Base Scale / Math Identity | `DAT_0036FC5C` |
| `0x3C000000` | `0.0078125f` | 1/128 (Color / Rotation scalar) | Used in `22F908` |
| `0x41D00000` | `26.0f` | Time scalar / animation step | Hardcoded inside `237A28` |

*(Note: The exact camera FOV and Z-clipping distances are passed directly as immediate values to `sceVu0ViewScreenMatrix` in `module_clock_225F38`: Near Z = `0x44000000`, Far Z = `0x3f800000`).*
