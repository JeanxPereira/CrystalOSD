# CrystalOSD

Clean-room reconstruction of the PlayStation 2 **OSDSYS** — the iconic system menu with its crystalline towers, floating orbs, and memory card browser.

Built by analyzing the binary in [Ghidra](https://ghidra-sre.org/) and cross-referencing against [PS2SDK](https://github.com/ps2dev/ps2sdk) and [PCSX2](https://github.com/PCSX2/pcsx2) source.

## Status

![progress](https://decomp.dev/JeanxPereira/CrystalOSD/HDDOSD_110U.svg?mode=shield&label=progress)

| Metric | Count |
|--------|-------|
| Total Functions | 2,008 |
| Named in Ghidra | 894 (44.5%) |
| Reconstructed | 0 (0%) |

## Building

### PS2 (native ELF — byte-perfect rebuild)
```bash
# Requires ps2dev toolchain at $HOME/ps2dev (see CLAUDE.md for install)
export PATH=$HOME/ps2dev/ee/bin:$PATH

make split    # run splat → asm/, OSDSYS_A.ld, undefined_*.txt
make elf      # link → build/OSDSYS.elf
make verify   # cmp build/OSDSYS.elf == OSDSYS_A_XLF_decrypted_unpacked.elf
```

`make verify` succeeds — rebuild is byte-identical to original 3,864,601-byte ELF.

### objdiff matching
```bash
make all      # compiles src/*.c and asm/<subsys>/*.s for diff
objdiff -p .  # GUI for diffing target vs base objects
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
