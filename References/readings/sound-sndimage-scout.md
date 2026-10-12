# Sound: SNDIMAGE (scout reading, 2026-10-03)

Reading, not fact. HDD OSD 1.10U addresses unless marked ROM 2.30. "READ" = read in the disassembly or bytes;
"INFERRED" = not checked.

## Container (READ)
- SNDIMAGE is a ROMDIR-style archive ({name[10], extinfo u16, size u32}). ROM 2.30 copy: BIOS offset 0x1F2210,
  0x63614 bytes, extracted to `lab/scout/SNDIMAGE.rom230` (lister `lab/scout/romdir.py`). HDD copy:
  `References/dumps/hddosd-host/SNDIMAGE`, 407,188 bytes (1,152 more than ROM; unexplained).
- Members (ROM), resource indices 5..0x10, flag 4: SNDBOOTH 610, SNDBOOTB 350087, SNDBOOTS 283, SNDTNNLS 228,
  SNDCLOKS 1213, SNDTM30S 116, SNDTM60S 116, SNDOSDDH 262, SNDOSDDB 52053, SNDLOGOS 116, SNDWARNS 1190, SNDRCLKS 228.
- Each member is compressed with the OSD's `Expand` (0x00200EE8; `ExpandInit` 0x00200D10: first u32 = decompressed
  size). LZ format not read.
- Literals inside the streams: "SShd" (SNDBOOTH, SNDOSDDH), "SSsq" (the S members). INFERRED: Sony libsd HD
  (bank header/programs/ADSR), BD (PS-ADPCM body), SQ (sequence). Two banks: BOOT and OSDD.

## Loading (READ)
- `do_load_resources` 0x0020AB98, table `osdsys_resource_info` 0x002AD240 (16-byte {name*, dest, size, flags}).
  Flag 5 (HDD path) = encrypted container read to 0x680000, 8-byte blocks through a 16-round Feistel
  (`decryption_common2..6`, DES-like INFERRED), key from 0x002AD970 / 0x002AD978. Flag 4 = ROMDIR search + Expand
  into a bump allocator from 0x018F0000.
- `load_sound_resources` 0x00200258: IOP heap 0x10000 (`sound_iop_ptr` 0x002AAF84).
  - BD bodies via `sound_handle_bd` 0x00200138 in 0x10000 chunks: EE→IOP DMA, then `sceSdRemote(1, 0x61A0, iop_buf,
    spu2_dst, size)` and `sceSdRemote(1, 0x6070)`. SNDBOOTB → SPU2 RAM 0x5010, SNDOSDDB → 0x85010.
  - HD/SQ members DMA'd to IOP heap slots `sound_iop_ptr + N*0x1000` (BOOTH +0, BOOTS +1, TNNLS +2, CLOKS +3,
    TM30S +4, TM60S +5, OSDDH +6, LOGOS +7, WARNS +8, RCLKS +9 ×0x1000).

## Open
Expand's LZ; HD/SQ/BD layouts (ADSR, pitch, reverb); IOP meaning of 0x61A0/0x6070; the reverb setup; the ROM's own
loader (not located); the HDD container's decrypted content; the key words' writers.
