# OSDSYS Wiki Knowledge Base
> Extracted from PS2 community wiki for CrystalOSD reconstruction

## Overview
OSDSYS is the ROM-resident program showing:
- Opening screen ("Sony Computer Entertainment")
- Clock display
- Browser menus

## Command Line Parameters
| Parameter | Description | ROM? |
|-----------|-------------|------|
| BootBrowser | Skip opening, enter browser | ✅ |
| BootCdPlayer | Skip opening, enter CD player | ✅ |
| BootClock | Skip opening, enter clock | ✅ |
| BootDvdVideo | Run DVD player | ❌ |
| BootError | Skip opening, show error (checks "dvdplayer.elf") | ✅ |
| BootHddApp | Run HDD app on specified partition | ❌ |
| BootIllegal | Skip opening, show illegal disc screen | ✅ |
| BootOpening | Force enter opening | ✅ |
| BootPs1Cd | Run PS1DRV | ❌ |
| BootPs2Cd | Run PS2LOGO | ❌ |
| BootPs2Dvd | Run PS2LOGO | ❌ |
| BootWarning | Skip opening, show disc warning | ✅ |
| DnasPs1Emu | Run dnasload | ❌ |
| DnasPs2Hdd | Run dnasload | ❌ |
| DnasPs2Native | Run dnasload | ❌ |
| Initialize | Enable OOBE process | ✅ |
| SkipFsck | Skip FSCK | ❌ (except DESR) |
| SkipSearchLater | Skip update check | ❌ (except DESR) |
| SkipMc | Skip MC update check | ✅ |
| SkipHdd | Skip HDD update check | ✅ |
| SkipForbid | Skip sceCdForbidDVDP | ✅ |

### RE Implications
- Parameters marked ❌ (Not on ROM OSDSYS) = **HDDOSD-specific features**
- Our target (HDDOSD 1.10U) has ALL of these including HDD boot
- `BootHddApp` + partition param = core HDD browser functionality
- `SkipFsck`, `SkipSearchLater` = DESR (PSX DVR) specific
- Parameter parsing is in `main()` → look for string comparisons

## Decompression Algorithm
Used for decompression of most modules and resources within OSDSYS.
This matches the `Expand*` family of functions in symbol_addrs.txt.

```python
def decompress_osdsys(src, dst):
    run = 0
    src_offset = 0
    dst_offset = 0
    state_length = 0
    state_block_desc = 0
    state_n = 0
    state_shift = 0
    state_mask = 0

    state_length = int.from_bytes(src[src_offset:src_offset + 4], byteorder="little")
    src_offset += 4

    while dst_offset <= state_length:
        if run == 0:
            run = 30
            state_block_desc = 0
            for i in range(4):
                state_block_desc <<= 8
                state_block_desc |= src[src_offset]
                src_offset += 1
            state_n = state_block_desc & 3
            state_shift = 14 - state_n
            state_mask = 0x3FFF >> state_n

        if (state_block_desc & (1 << (run + 1))) == 0:
            # Literal byte copy
            dst[dst_offset] = src[src_offset]
            dst_offset += 1
            src_offset += 1
        else:
            # Back-reference copy (LZ77-style)
            h = src[src_offset] << 8
            src_offset += 1
            h |= src[src_offset]
            src_offset += 1
            copy_offset = dst_offset - ((h & state_mask) + 1)
            m = 2 + (h >> state_shift)
            for i in range(m + 1):
                dst[dst_offset] = dst[copy_offset]
                dst_offset += 1
                copy_offset += 1

        run -= 1
```

### Algorithm Analysis
- **Type**: LZ77-variant with block descriptors
- **Block size**: 30 operations per block descriptor (32-bit)
- **Descriptor bits**: 2 LSBs encode `state_n` (variable window/length params)
- **Match encoding**: 16-bit (2 bytes) with variable split between offset and length
  - `state_shift = 14 - state_n` → length bits
  - `state_mask = 0x3FFF >> state_n` → offset mask
- **Literal**: 1 byte copied directly
- **Back-ref**: offset from current position, length = 2 + extracted_value (min 3 bytes)

### C Reconstruction Target
This maps to functions like:
- `ExpandData` / `Expand` in symbol list
- Used to decompress embedded IOP modules, icons, fonts, etc.

## Sony Patents (OSDSYS Related)

### JP2001154772A — Display Method (Clock UI)
**Key for**: Clock/Browser 3D visualization system
- Describes the block-based clock display used in OSDSYS
- Inner ring (12 blocks) = hours, coloring amount = minutes
- Outer ring (12 blocks) = 5-min intervals, coloring = seconds
- Blocks are transparent hexagonal columns with refraction
- Rotation: inner ring 1 rev/60min, outer ring 1 rev/60sec
- Light point group orbits pseudo-sphere inside rings
- Menu system: transparent cubes represent items, selected = blue tint
- Background blur when menu is active (pixel-shift + alpha blend)

### JP2001148032A — Image Plotting (Refraction Rendering)
**Key for**: 3D rendering pipeline used in clock/browser
- Fast refraction rendering without ray tracing
- Draws back faces first, then front faces
- Each face uses background image as texture
- UV mapping calculated via Snell's law at each vertex
- Incident/exit angles determine texture coordinate offsets
- Applied to transparent cube objects in OSDSYS UI

### Architectural Insights from Patents
1. **OSDROM** stores compressed object data, textures, programs
2. **Rendering pipeline**: MPU12 → VU16 (geometry) → GIF22 → Rendering Engine 70
3. **Image memory 74**: Unified memory (texture + framebuffer same area)
4. **320×240 or 640×480** output at 60fps
5. **Multitask**: Menu display + clock display run as concurrent tasks
6. **RTC integration**: Real-time clock 28 drives all time-based animation
