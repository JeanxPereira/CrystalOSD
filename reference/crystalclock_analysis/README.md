# CrystalClockVK Analysis Archive

Migrated from `/Users/jeanxpereira/CodingProjects/CrystalClockVK/docs/` — prior work on
PS2 OSDSYS clock rendering pipeline analysis.

## Files

| File | Source | Description |
|------|--------|-------------|
| `rod_analysis.md` | `ghidra_analysis/` | **Master reference**: 5-pass pipeline, rod struct (0x160 bytes), VU0 math chain, scale formula |
| `vu0_decode.md` | `ghidra_analysis/` | VU0 COP2 instruction decode results — axis-angle rotation via VOPMSUB |
| `decode_vu0.py` | `ghidra_analysis/` | Python tool to decode COP2/VU0 upper instructions from Ghidra hex |
| `full_comparison.md` | `docs/` | Raylib vs Vulkan vs OSDSYS — 12 critical differences identified |
| `vu_pcsx2_notes.txt` | `clock_patent/` | cottonvibes' VU precision documentation (guard bits, denormals) |

## Key Findings (Summary)

### Rod Structure: 0x160 bytes per rod
- Two disjoint groups at `0x375250` (Group A) and `0x377e50` (Group B)
- Selection flag at `+0x150` controls which passes render each rod
- Y-scale at `+0x60` is per-rod, index-dependent, widescreen-aware

### 5-Pass Rendering Pipeline
1. **Pass 1**: Base transparent glass (alpha blend, unselected rods)
2. **Pass 2**: Additive specular highlights (same angle for both rotation params)
3. **Pass 3**: Offset shimmer (TWO DIFFERENT angles from clock state struct)
4. **Pass 4**: Selected rod highlight (same as P1 but only selected rods)
5. **Pass 5**: Selected rod reverse-alpha fill (0xFF alpha override)

### VU0 Math Pipeline
```
rotation_build(angleA, angleB)  →  43 VU0 instructions (axis-angle via VOPMSUB)
projection_build(fov, halfW)    →  92 VU0 instructions (GS-native, far=2048)
matrix_multiply(proj, rot)      →  18 VU0 instructions
```

### Globals to Extract
- `fGpffff832c` / `fGpffff8330` — angle step per pass
- `fGpffff8c28` — FOV
- `fGpffff8488` — near plane
- `fGpffff8480` / `fGpffff8484` — half-width (standard/widescreen)

## Original Source
Full originals remain at: `/Users/jeanxpereira/CodingProjects/CrystalClockVK/docs/`
Patent PDF: `US6693606.pdf` (30 pages, clock display method patent)
