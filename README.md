# CrystalOSD

[![Build Status]][actions] [![DOL Progress]][Progress] [![REL Progress]][Progress]

[<img src="https://decomp.dev/JeanxPereira/CrystalOSD.svg?w=512&h=256" width="512" height="256">][Progress]

[Build Status]: https://github.com/JeanxPereira/CrystalOSD/actions/workflows/progress.yml/badge.svg
[actions]: https://github.com/JeanxPereira/CrystalOSD/actions/workflows/build.yml
[Progress]: https://decomp.dev/JeanxPereira/CrystalOSD
[DOL Progress]: https://decomp.dev/JeanxPereira/CrystalOSD.svg?mode=shield&measure=code&category=dol&label=DOL
[REL Progress]: https://decomp.dev/JeanxPereira/CrystalOSD.svg?mode=shield&measure=code&category=modules&label=REL

Clean-room reconstruction of the PlayStation 2 **OSDSYS**! the iconic system menu with its crystalline towers, floating orbs, and memory card browser.

Built by analyzing the binary in [Ghidra](https://ghidra-sre.org/) and cross-referencing against [PS2SDK](https://github.com/ps2dev/ps2sdk) and [PCSX2](https://github.com/PCSX2/pcsx2) source. The goal: a fully buildable, byte-identical ELF that can serve as a foundation for PS2 homebrew, custom system menus, and preservation efforts.

Inspired by [Theseus](https://github.com/MrMilenko/Theseus), which did the same for the original Xbox Dashboard.

---

## Status

`make verify` passes — the rebuild is byte-identical to the original 3,864,601-byte ELF.

What's been reconstructed:

- Boot sequence — towers, fog, transitions (`opening`)
- Memory card file browser (`browser`)
- Clock and settings UI (`clock`)
- Language, timezone, and video mode config (`config`)
- SPU2 audio via IOP RPC (`sound`)
- GS packets, VIF1 rendering, framebuffer (`graph`)
- Disc detection and application launch (`cdvd`)
- Play history tracking (`history`)
- Dynamic module system (`module`)

## Building

### PS2 (native ELF — byte-perfect rebuild)

Requires the ps2dev toolchain at `$HOME/ps2dev`. See [CLAUDE.md](CLAUDE.md) for install instructions.

```bash
export PATH=$HOME/ps2dev/ee/bin:$PATH
make split    # run splat → asm/, OSDSYS_A.ld, undefined_*.txt
make elf      # link → build/OSDSYS.elf
make verify   # cmp build/OSDSYS.elf == OSDSYS_A_XLF_decrypted_unpacked.elf
```

### objdiff matching

```bash
make all      # compiles src/*.c and asm/<subsys>/*.s for diff
objdiff -p .  # GUI for diffing target vs base objects
```

### Desktop (planned)

```bash
# SDL2 + OpenGL port — not yet available
make desktop
```

## Architecture

The OSDSYS is organized into subsystems, each mapping to a directory under `src/`:

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

## Contributing

Contributions are welcome — whether it's matching functions on [decomp.dev](https://decomp.dev/JeanxPereira/CrystalOSD), improving documentation, or helping with the future desktop port.

If you're new to PS2 decompilation, the tooling is EE (MIPS R5900) + ps2dev + objdiff. The `CLAUDE.md` has environment setup details. Feel free to open an issue or reach out on Discord.

## References

- [Theseus](https://github.com/MrMilenko/Theseus) — Xbox dashboard reconstruction (direct inspiration)
- [ps2re/osdsys_re](https://github.com/ps2re/osdsys_re) — OSDSYS reverse engineering notes
- [OSDSYS-Unpack](https://github.com/JaCzekanski/osdsys-unpack) — Extracts and decompresses OSDSYS modules from BIOS
- [PS2SDK](https://github.com/ps2dev/ps2sdk) — Open-source PS2 SDK, used as reference
- [PCSX2](https://github.com/PCSX2/pcsx2) — PS2 emulator, used as reference for hardware behavior
- [FreeMcBoot](https://github.com/AKuHAK/FreeMcBoot-Installer) — PS2 homebrew exploit (hooks into OSDSYS)

## License

MIT — see [LICENSE](LICENSE) for details.
