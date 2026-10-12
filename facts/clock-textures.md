# The clock's textures

Recorded 2026-10-02. *Read* on **HDD OSD 1.10U**: `clock_load_texture`, `func_002347D8`,
`func_002344F8`, `GetResourceData`, the resource table `osdsys_resource_info` (`0x002AD240`).
*Verified* on **ROM 2.30**: `References/scripts/extract_rom_textures.mjs` takes the ten
pictures out of the BIOS ROM file and they equal, byte for byte, what
`References/scripts/extract_textures.mjs` finds in the GS memory saved at the start of a GS
dump of the clock (`Watson/Runtime/captures/rom-0230A-clock-placement.gs`).

The pictures are the console maker's; `$CRYSTALOSD_DATA/textures/` is not in the repository. Anyone
with a BIOS image gets them by running the script.

## Where they come from

The BIOS ROM is a directory of named files. One of them, `TEXIMAGE`, is itself such a
directory, and holds the pictures by name. Each is packed with the scheme psdevwiki gives for
OSDSYS: a 32-bit length, then groups of 30 items led by a big-endian descriptor word whose low
two bits set how a 16-bit back-reference splits into offset and length, and whose other bits
say, item by item, literal byte or back-reference.

When the clock is set up, `clock_load_texture` takes resources `0x2B` to `0x34` and
`func_002347D8(n)` turns resource `n` into 32-bit pixels (`func_002344F8`, one of five forms)
and uploads it; the first goes at `screen width × screen height × 5` words of GS memory and
the others follow. Nothing is uploaded again while the clock runs (*measured: the dumps hold
no image transfer*).

| n | Name | Size | Stored as | Becomes | `TBP0` on ROM 2.30 | Picture |
|---|---|---|---|---|---|---|
| 0 | `TEXCFLOW` | 64 × 64 | 1 byte, grey | `(g, g, g, 127)` | `0x2bc0` | stone wall with one bright light |
| 1 | `TEXCKABE` | 128 × 128 | 3 bytes, a 64 × 64 quarter | the quarter tiled 2 × 2, alpha 127 | `0x2c00` | pale blue mottle |
| 2 | `TEXCBUMP` | 64 × 64 | 1 byte, grey | `(g, g, g, 127)` | `0x2d00` | grain, dark |
| 3 | `TEXCBINV` | 64 × 64 | 1 byte, grey | `(g, g, g, 127)` | `0x2d40` | the same grain, inverted |
| 4 | `TEXCSMOK` | 64 × 64 | 1 byte, alpha | `(255, 255, 255, a)` | `0x2d80` | a soft cloud |
| 5 | `TEXCREFA` | 64 × 64 | 1 byte, grey | `(g, g, g, 127)` | `0x2dc0` | darker stone wall with one light |
| 6 | `TEXCNAVI` | 64 × 64 | 1 byte, alpha | `(255, 255, 255, a)` | `0x2e00` | a hard disc |
| 7 | `TEXCBLUR` | 64 × 64 | 1 byte, alpha | `(255, 255, 255, a)` | `0x2e40` | a round glow |
| 8 | `TEXCSTSL` | 64 × 64 | 2 bytes, grey and alpha | `(g, g, g, a)` | `0x2e80` | a rectangle and a triangle |
| 9 | `TEXCMARU` | 64 × 64 | 4 bytes | as stored | `0x2ec0` | square, triangle, cross, circle |

## What each one is for

*Measured on HDD OSD 1.10U:* one GS dump of each of three screens (main menu, System
Configuration, the clock alone), counting the draws per frame that use each texture.

| Texture | Menu | Configuration | Clock | What draws with it |
|---|---|---|---|---|
| `TEXCKABE` | 1 | 1 | 1 | the background, behind everything (*read: a tube seen from inside, `References/readings/frame-rest.md`*) |
| `TEXCFLOW` | 0 | 24 | 24 | the rods' reflection pass (`clock-extra-passes.md`) |
| `TEXCBUMP` | 0 | 60 | 36 | the rods' grain, and in Configuration the menu's cubes |
| `TEXCBINV` | 0 | 12 | 12 | the rods' grain in the extra passes |
| `TEXCREFA` | 0 | 5 | 0 | the five cubes of the Configuration menu |
| `TEXCNAVI` | 14 | 14 | 14 | the disc at each orb's head, to two targets |
| `TEXCBLUR` | 14 | 14 | 14 | the glow at each orb's head, to two targets |
| `TEXCMARU` | 2 | 7 | 1 | the pad symbols of the button hints |
| `TEXCSMOK` | 0 | 0 | 0 | not drawn in these three screens |
| `TEXCSTSL` | 0 | 0 | 0 | not drawn in these three screens |

The names fit: *kabe* is wall, *maru* is circle, `BINV` is `BUMP` inverted, `REFA` a
reflection. The font is a 4-bit texture after them (512 × 512 at `0x2f04` on HDD OSD,
256 × 512 at `0x2f05` on ROM 2.30) and was not extracted.

## Not settled

- Where `TEXCSMOK` and `TEXCSTSL` are drawn (*read: `TEXCSTSL` is bound by the icon drawing
  function, index 8*).
- The font.

HDD OSD's own pictures are settled: the ten it loads from its installed `TEXIMAGE` are, in GS
memory, byte for byte the ten of ROM 2.30 (`hddosd-boot.md`).
