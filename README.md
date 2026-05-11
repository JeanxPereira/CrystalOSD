# CrystalOSD

[![Build Status]][actions] [![ELF Progress]][Progress]

[<img src="https://decomp.dev/JeanxPereira/CrystalOSD.svg?w=512&h=256" width="512" height="256">][Progress]

[Build Status]: https://github.com/JeanxPereira/CrystalOSD/actions/workflows/progress.yml/badge.svg
[actions]: https://github.com/JeanxPereira/CrystalOSD/actions/workflows/build.yml
[Progress]: https://decomp.dev/JeanxPereira/CrystalOSD
[ELF Progress]: https://decomp.dev/JeanxPereira/CrystalOSD.svg?mode=shield&measure=code&label=ELF

Clean-room reconstruction of the PlayStation 2 **OSDSYS**! the iconic system menu with its crystalline towers, floating orbs, and memory card browser.

Built by analyzing the binary in [Ghidra](https://ghidra-sre.org/) and cross-referencing against [PS2SDK](https://github.com/ps2dev/ps2sdk) and [PCSX2](https://github.com/PCSX2/pcsx2) source. The goal: a fully buildable, byte-identical ELF that can serve as a foundation for PS2 homebrew, custom system menus, and preservation efforts.

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

## How It Works

The project uses [splat](https://github.com/ethteck/splat) to split the original
binary into per-function assembly files. Community symbols from
[ps2re/osdsys_re](https://github.com/ps2re/osdsys_re) provide 6,372 named
addresses via `symbol_addrs.txt`.

```
splat_config.yml → configure.py → asm/*.s + OSDSYS_A.ld → make elf → byte-perfect ELF
```

As functions are reverse-engineered, assembly stubs in `asm/` are replaced by
C reconstructions in `src/`, verified to produce identical machine code via
[decomp.me](https://decomp.me/) and objdiff.

> **Note**: Many functions in the OSDSYS binary come from Sony's SDK (linked statically).
> Matching these has multiplier value for the broader PS2 decomp community.

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

Contributions are welcome — whether it's matching functions on [decomp.dev](https://decomp.dev/JeanxPereira/CrystalOSD) or improving documentation.

If you're new to PS2 decompilation, the tooling is EE (MIPS R5900) + ps2dev + objdiff. The `CLAUDE.md` has environment setup details. Feel free to open an issue or reach out on Discord.

## References

- [decomp.me](https://decomp.me/) — Collaborative decompilation matching platform
- [ps2re/osdsys_re](https://github.com/ps2re/osdsys_re) — OSDSYS reverse engineering notes
- [OSDSYS-Unpack](https://github.com/JaCzekanski/osdsys-unpack) — Extracts and decompresses OSDSYS modules from BIOS
- [PS2SDK](https://github.com/ps2dev/ps2sdk) — Open-source PS2 SDK, used as reference
- [PCSX2](https://github.com/PCSX2/pcsx2) — PS2 emulator, used as reference for hardware behavior
- [FreeMcBoot](https://github.com/AKuHAK/FreeMcBoot-Installer) — PS2 homebrew exploit (hooks into OSDSYS)

## Special Thanks

- **Ethanol** (decomp.dev Discord) — for valuable feedback regarding compiler mismatch and project scope.

## License

MIT — see [LICENSE](LICENSE) for details.
