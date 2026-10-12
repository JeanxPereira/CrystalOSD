# Sound: the IOP driver (scout reading, 2026-10-03)

Reading, not fact: static disassembly only, no capture. Extracted files under `lab/scout/` (`ioprp.mjs`,
`osdrp.img`, `LIBSD.irx`, `OSDSND.irx`, `osdsnd.txt`).

## HDD OSD 1.10U
- `main` reboots the IOP with an IOPRP image embedded in the ELF (`osdrp_img_bytes` 0x0050B800..0x0058A0A5,
  `sceSifRebootIopWithRawImage` at 0x0020D530 / 0x0020D6B8). IOPBTCONF: `SIO2MAN MTAPMAN MCMAN MCSERV PADMAN LIBSD
  OSDSND SMAPMAC`.
- LIBSD "PsIIlibsd 2419"; OSDSND "sdr_driver", "SDR driver version 2.0.0", "sd driver module version 0.6.0":
  an OSD-specific SDR driver, RPC id 0x80000701 (bind 0x6F4, handler 0x738). Own threads ("sce_osd_sdr_loop",
  callback thread), 0x44-byte channel records. Drives SPU2 through libsd. No `_Ss` sequencer strings.
- EE `sceSdRemote(mode, cmd, p1..p4)` 0x00294738 (init 0x002945F8): 6 words to 0x0050A680, `sceSifCallRpc`;
  0x8130..0x8170 special-cased.
- Dispatch on `cmd & 0xFFF0` (OSDSND 0x774..0xC44): 0x8xxx = libsd pass-through (0x8010 SetParam, 0x8070
  SetCoreAttr, 0x8130..0x8170 transfer/callbacks — names inferred). 0x6xxx handled in OSDSND:
  6010→0x5EF8, 6020→0x609C, 6030→0x2470, 6050→0x6170, 6060→0x63B8 (open bank: iop buffer + SPU address → handle),
  6090→0x66B8 (load sequence/sound → sound id), 60D0→0x6B08 (master ramp), 6120→0x6E74 (core volume), 6130→0x6EF0,
  6140→0x7174 (channel reset/stop, inferred), 6150→0x7298 (per-channel state machine, mode 0..3: 0/1 play, 2 stop
  or fade, inferred), 6300→0x7AD8 (sound effect), 6310→0x80B8.
- `sound_init` 0x002004C0: `sceSdRemoteInit`, 6010, `load_sound_resources`, 8070, 8010(0x801, 0xFFF),
  6060 × 2 (BOOT bank iop+0 → SPU 0x5010; OSDD bank iop+0x6000 → SPU 0x85010), 6090 per sequence (ids kept at
  0x002AAF8C..0x002AAF9A: sndboots, sndtnnls, sndcloks, sndtm30s, sndtm60s, sndlogos, sndwarns, sndrclks),
  then 6130(id, 0x42, 0x2A, 0x2D, 0x1B, 0x36…), 6310(sndosddh, 0x1C), 6120(core, 0x3FFF, 0x3FFF), 6200.

## ROM 2.30
- OSDSND is a different module: "rspu2_driver" with libspu2 ("PsIIlibspu2") and libsnd's sequencer (`_SsNoteOn`,
  `_SsSndTempo`, `_SsSndCrescendo`), RPC 0x80000601 / 0x80000603. LIBSD "PsIIlibsd 2070".
- EE remote 0x0026DA20 (init 0x0026DCE8); ids 0x5000..0x52E0. ROM 0x5015 / 0x5200 are not the same functions as
  HDD 0x6150 / 0x6300: the second witness plays the same data through different code.
- The ROM IOPBTCONF lacks OSDSND/LIBSD: how they load is open.

## Consequence
Mixing and sequencing live on the IOP in both builds; the EE only queues short commands and ramps the master
volume. Measuring the sound means probing the IOP (OSDSND dispatch, its channel records, libsd calls) and the SPU2.

## Open
Each 0x6xxx handler's exact meaning; the HDD sequencer's tick (thread bodies not read); OSDSND's IOP load address;
how ROM loads its modules; ROM↔HDD id mapping by function.
