# Running HDD OSD 1.10U in the emulator

Recorded 2026-10-02. *Read* on **HDD OSD 1.10U**: `main`, `do_load_resources`,
`do_exec_stockosd_blob`. *Measured* with Watson (PCSX2 v2.9.94, BIOS `0230AC20080220`).

## Why it would not start

Started from its ELF, the program runs for about a second and then executes `rom0:OSDSYS`,
the console's own menu. Three things decide that, all in its code:

1. **`main` looks at `argc`.** With no argument it loads its drivers and calls
   `do_exec_stockosd_blob` at once. With at least one argument it goes on to start itself.
   PCSX2 hands the ELF no argument unless told to (`-gameargs`).
2. **`do_load_resources` needs six files**: `FNTOSD`, `JISUCS`, `SNDIMAGE`, `TEXIMAGE`,
   `ICOIMAGE`, `SKBIMAGE`. When its own path (`argv[0]`) is on `hdd`, it reads them from
   `pfs0:` beside itself; otherwise from `rom0:`. The BIOS ROM has only `SNDIMAGE`, `TEXIMAGE`
   and `ICOIMAGE` (none of the 53 images in `$CRYSTALOSD_DATA/bios/megadump` has the other three).
   The first file missing sends it to `do_exec_stockosd_blob` (the call at `0x0020BCB0`).
3. **The installed files are encrypted containers.** Five of the six start with the same 24
   bytes and hold no directory in the clear. On the `hdd` path the program switches each
   container's entry in its resource table from type 2 to type 5, the reader that decrypts;
   on the `rom0:` path it does not, because the ROM's containers are plain.

*Measured: breakpoints at `main`, at `do_exec_stockosd_blob` and at `0x0020BCB0`, where the
path being opened was read from the stack.*

## How it starts here

`watson_launch { build: "hddosd-1.10U-host", args: "SkipSearchLater" }`, or one of its saved
states: `menu`, `config`, `clock`.

- The argument makes `main` take its own path; `SkipSearchLater` skips the search for a newer
  copy on the disk.
- The six resource files come from a dump of a console's hard disk with HDD OSD 1.10U installed
  (`__system/osd100`).
- The ELF is a copy with two changes to its **data** and none to its code, made by
  `References/scripts/make_hddosd_host.mjs`: the device prefix `rom0:` (at `0x003486B8`)
  becomes `host:`, the emulator's window onto the folder the ELF is in; and the five container
  entries of the resource table get type 5, as the program itself sets them on the hard disk.
- Watson turns the emulator's host filesystem on.

Neither the copy nor the installed files are in the repository.

*Measured:* the main menu with its text ("Browser", "System Configuration", "Enter",
"Version") 700 frames after power-on; down, cross: System Configuration; square: the crystal
clock alone, with date, time and the "Display" hint. No fallback and no bad read in the log.
The code at `0x00225E80` is HDD OSD's own. Loading the `clock` state after a restart shows the
clock again.

## What this is and is not

- The program, its code, its data and its resource files are HDD OSD 1.10U's.
- It does not run from a hard disk: the hard disk drivers find no disk, and whatever HDD OSD
  does only with a disk present (its browser's hard disk entries, updates) is not exercised.
- Time zone, language and the rest of the configuration are the emulator's defaults.

## What it settles

- **The clock's ten textures are the same in both builds**: what HDD OSD loaded from its own
  `TEXIMAGE` equals, byte for byte, what ROM 2.30 loads from the ROM
  (`extract_textures.mjs` on a dump of each; `extract_rom_textures.mjs` against HDD OSD's GS
  memory).
- The registers that differ between the builds are measured on both (`clock-gs-state.md`).
- Every verifier run on ROM 2.30 can now be run on the canon build, with its own addresses.

## The intro (*measured 2026-10-02*)

`watson_launch { build: "hddosd-1.10U-host", args: "SkipSearchLater BootOpening" }` starts with
the opening module: at frame 210 "Sony Computer Entertainment" over glass cubes, light orbs with
trails and blue fog; black at frame 362; the main menu at frame 816, with `0x001F0648` (current
module) 2 and `0x001F064C` (previous module was the opening) 1. Snapshots:
`hddosd-110U-opening-{200,350,500,800}.png`. Without `BootOpening` the intro is skipped, which
is why no earlier boot showed it. The module itself is only read:
`References/readings/opening-map.md`.
