# CrystalOSD

Clean-room reconstruction of the PlayStation 2 **OSDSYS** — the iconic system menu with its crystalline towers, floating orbs, and memory card browser.

Built by analyzing the binary in [Ghidra](https://ghidra-sre.org/) and cross-referencing against [PS2SDK](https://github.com/ps2dev/ps2sdk) and [PCSX2](https://github.com/PCSX2/pcsx2) source.

## Status

| Metric | Count |
|--------|-------|
| Total Functions | 2,008 |
| Named in Ghidra | 894 (44.5%) |
| Reconstructed | 0 (0%) |

## Building

### PS2 (native ELF)
```bash
# Requires ps2toolchain installed
make
```

### Desktop (future)
```bash
# SDL2 + OpenGL port
make desktop
```

## Architecture

The OSDSYS is organized into subsystems:

| Module | Description |
|--------|-------------|
| `browser` | Memory card file browser |
| `opening` | Boot sequence — towers, fog, transitions |
| `clock` | Clock and settings UI |
| `config` | Language, timezone, video mode |
| `sound` | SPU2 audio via IOP RPC |
| `graph` | GS packets, VIF1 rendering, framebuffer |
| `cdvd` | Disc detection and application launch |
| `history` | Play history tracking |
| `module` | Dynamic module system |

## Related Projects

- [Theseus](https://github.com/MrMilenko/Theseus) — Xbox dashboard reconstruction (inspiration)
- [ps2re/osdsys_re](https://github.com/ps2re/osdsys_re) — OSDSYS reverse engineering (community)
- [CrystalClock](https://github.com/) — PS2 clock rewrite with raylib
- [FreeMcBoot](https://github.com/) — PS2 homebrew exploit (uses OSDSYS hooks)

## License

MIT — see [LICENSE](LICENSE) for details.
