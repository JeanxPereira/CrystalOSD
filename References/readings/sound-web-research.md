# PS2 OSDSYS sound and SPU2: public-source research

Scope: what public sources say. Nothing here is a CrystalClockVK fact (not verified on the builds in `facts/`).
Method: web search plus page fetches on 2026-10-03. Fetches return model-summarised excerpts, so exact numbers must be re-read at the source before use.

Confidence tags: [DOC] stated by a reference page; [DERIVED] inferred from names or structure, unconfirmed; [GAP] not found.

## Access limits of this pass

- psdevwiki.com (OSDSYS, SNDIMAGE pages) returned HTTP 403. Its content is known only through search-result snippets.
- ps2tek (psi-rockin.github.io/ps2tek) was fetched, but the summary reported no ADPCM/ADSR/reverb detail for the SPU2 page. Re-read it directly in a browser.
- psx-spx per-section pages (ADSR tables, reverb formula, Gaussian table) were only reached at index level; the formulas below are NOT transcribed here.
- Nothing was found that documents the OSD sound resource layouts byte for byte. That is the main gap.

## 1. OSDSYS sound resources

### ROM contents [DOC]
Source: https://gist.github.com/AKuHAK/db60caf94425654864d0a5d60f323294 (also mirror https://gist.github.com/uyjulian/25291080f083987d3f3c134f593483c5). Community listing of rom0: files.

- `SNDIMAGE`: "Sound image. Contains sounds for the OSDSYS of the SCPH-18000 and newer." It is a ROM-directory image holding the sub-files below.
- Sub-files named in the listing and by the unpacker (see below): `SNDBOOTH`, `SNDBOOTB`, `SNDBOOTS`, `SNDTNNLS`, `SNDCLOKS`, `SNDTM30S`, `SNDTM60S`, `SNDOSDDH`, `SNDOSDDB`, `SNDLOGOS`, `SNDWARNS`, `SNDRCLKS`.
- `OSDSND`: "OSD sound library... the tentative sound driver, which is called 'librspu2' in the Sony SDK". The browser uses OSDSND, not LIBSD. Newer than the contemporaneous SDK release.
- `TESTSPU`: used by TESTMODE to test the SPU.
- The listing gives no format details and no sizes.

### Format of the sub-files
- SNDIMAGE is itself a ROM-style directory image: the unpacker output lists `RESET`, `ROMDIR`, `EXTINFO` first, i.e. the standard BIOS ROMDIR layout (16-byte entries: 10-byte name, 2-byte extinfo size, 4-byte file size). Source for the listing: search result citing the unpacker, below. ROMDIR layout itself: https://gist.github.com/AKuHAK/db60caf94425654864d0a5d60f323294 context and ps2dev BIOS threads such as https://forums.ps2dev.org/viewtopic.php?t=3743. [DERIVED for SNDIMAGE; the ROMDIR layout is a long-standing community-documented fact]
- Name suffix pattern [DERIVED, forum-level speculation]: `...H` = header, `...B` = body, `...S` = sequence/score. Pairs seen: `SNDBOOTH/B/S`, `SNDOSDDH/B`. This matches Sony's SD-library convention (HD = bank header with programs/tones, BD = sample body in PS-ADPCM, SQ = sequence), but no source found states that the SND* files are exactly HD/BD/SQ. Check by opening the files: HD files begin with the ASCII tag `SCEIVers` then `SCEIHead`, `SCEIVagi`, `SCEIProg`, `SCEISmpl` chunks per vgmstream/vgmtrans (see below); SQ files begin `SEQp` (SMF-like). [DERIVED]
- The SD-library file triple is supported by public tools for games:
  - vgmstream: "Sony HD+BD header" (`.hd .hbd + .bd`, PSX ADPCM codec), "Sony HD3+BD3", "Sony SSHD". https://github.com/vgmstream/vgmstream/blob/master/doc/FORMATS.md [DOC]
  - vgmstream release notes: HD+BD added for Parappa the Rapper 2; cavia `.hd2+.bd` for Drakengard. https://github.com/vgmstream/vgmstream/releases [DOC]
  - VGMTrans handles `.hd/.bd` (PS2 SF2 export issues #111, #166). https://github.com/vgmtrans/vgmtrans/issues/111 and https://github.com/vgmtrans/vgmtrans/issues/166 [DOC that support exists; export had bugs]
  - PS2-Audio-Extractor (ports vgmstream formats, 110 formats): https://github.com/4574130823/PS2-Audio-Extractor [DOC]

### Extraction tools and rips
- `ps2bios_unpacker.exe`: unpacks BIOS and a SNDIMAGE into the sub-files above. Link given in a forum/search result: http://brokensword.narod.ru/ps2bios_unpacker.zip (may be dead; unverified). [DOC via search snippet]
- Sounds Resource rip of "System BIOS" sound effects: https://sounds.spriters-resource.com/playstation_2/systembios/asset/430102/ [rip exists; method not stated]
- Soundboard and sample pack: https://www.101soundboards.com/boards/37119-ps2-bios-sounds, https://eike10101.gumroad.com/l/ps2_bios. Outputs only, no format information.
- The Cutting Room Floor PS2 page: https://tcrf.net/PlayStation_2 (appeared in results; its sound content was not fetched). [GAP]
- No public analysis found of the Crystal Clock screen audio, the boot "opening" sound structure, or which SQ drives the menu ambience. [GAP]

## 2. IOP sound driver stack

Sources: ps2sdk repo https://github.com/ps2dev/ps2sdk (`iop/sound/`), BIOS listing gist above, ps2dev forum https://forums.ps2dev.org/viewtopic.php?t=6121.

- ps2sdk `iop/sound/` holds: `ahx`, `audsrv`, `clearspu`, `libsd`, `libsnd2`, `libspu2`, `ps2snd`, `rspu2drv`, `sdhd`, `sdrdrv`, `sdsq`. [DOC] https://github.com/ps2dev/ps2sdk/tree/master/iop/sound
  - `libsd` = IOP library exposing `sceSd*` (core/voice/reverb/transfer API); freesd is the open reimplementation, which also supports old Japanese PS2s that lack libsd in ROM. Per search snippet; the ps2sdk README was not read. [DOC, secondary]
  - `sdrdrv` = IOP RPC server so the EE can call libsd; EE side is `sceSdRemote*` (`sceSdRemoteInit`, `sceSdTransToIOP`...). [DOC]
  - `sdhd`/`sdsq`/`libsnd2`: open reimplementations of Sony's SD/SND libraries (HD bank parse, SQ sequence playback). Not verified in detail. [DERIVED from names]
- BIOS listing: `SDRDRV` "enables the EE to access SPU2 remotely through libsd"; `MODHSYN` is part of CSL (Core Sound Library) with per-console variants; `MODSESQ` is a CSL sequencing module. Source: the uyjulian gist. [DOC]
- Games load LIBSD, SDRDRV, MODHSYN, MODMIDI, etc. on the IOP. libsd and sdrdrv must come from the same disc; SDRDRV <=2.0 was reported working in one homebrew case, 4.01 not. Source: https://github.com/Sinan-Karakaya/DQ8-Recompiled/pull/1 and https://forums.ps2dev.org/viewtopic.php?t=6121 [DOC, anecdotal]
- How OSDSYS maps EE commands to the SPU2: through OSDSND (librspu2-like), not through sdrdrv. The mechanism (RPC id, command numbers) is not documented publicly. [GAP]. This is a candidate for our own disassembly (`D:\CodingProjects\CrystalOSD\asm\`).

## 3. SPU2 hardware

### Overview facts [DOC]
- 2 cores x 24 ADPCM voices = 48, at 48 kHz; 2 MB sound RAM; core 1 receives core 0 output plus external inputs. Sources: PCSX2 SPU2 article https://pcsx2.net/blog/2010/spu2-is-more-than-just-sound/ and https://wiki.pcsx2.net/PCSX2_Documentation/SPU2_is_more_than_just_sound! , ps2tek https://psi-rockin.github.io/ps2tek/
- Register blocks: core 0 at `0x1F900000`, core 1 at `0x1F900400` (ps2tek). Per voice: VOLL/VOLR, PITCH, ADSR1/ADSR2, start/loop/next addresses; per core: KON/KOFF, ENDX, master and effect volumes, core1 external input volumes. [DOC]
- Official Sony `SPU2_Overview_Manual.pdf` exists; a copy is referenced from https://github.com/ninjadynamics/PS2Docs . Licence is proprietary leaked Sony documentation: treat as reading material only, and cite it as the legal risk it is. [DOC existence; content not read]

### PS1 basis (psx-spx, nocash) [DOC, structure confirmed, formulas not transcribed]
Index: https://psx-spx.consoledev.net/ps1/spu/soundprocessingunitspu/ (also https://problemkaputt.de/psx-spx.htm). Sections: ADPCM Samples, ADPCM Pitch, Volume and ADSR Generator, Voice Flags, Noise Generator, Control/Status, Memory Access, Interrupt, Reverb Registers, Reverb Formula, Reverb Examples.
- BRR ADPCM: 16-byte blocks = shift/filter byte + flag byte + 14 data bytes = 28 samples.
- 4-point Gaussian interpolation, 8-bit index from the pitch counter, over 4 consecutive decoded samples (table of 512 entries on PS1).
- ADSR: attack linear/exponential, shift 0-31, step 0-3; envelope phases A/D/S/R.
- Reverb: PS1 runs at 22050 Hz (half rate), Schroeder structure with comb and all-pass filters, L/R on alternate cycles.
- Differences on SPU2: SPU2 envelope/volume ranges and reverb register set differ from PS1 and are NOT covered by these pages. [GAP; need ps2tek full SPU2 page, PCSX2 source, or the Sony manual]
- Unknown from public text: whether SPU2 reverb runs at 48 kHz full rate or 24 kHz, and exact SPU2 Gaussian/ADSR bit widths. PCSX2 behaviour should settle it (see below), then confirm with a hardware or Watson probe.

### SPU2-specific behaviour from the PCSX2 article [DOC]
- Reverb uses multiple overlapping read and write-back buffers in SPU RAM; 24 IRQ-address tests per core during a reverb pass.
- Write-back areas (mixed output stored to RAM) and free-running silent voices can trigger SPU IRQs, which games use as a timer. A faithful reimplementation of OSD timing must reproduce these.

## 4. Existing projects

- vgmstream, VGMTrans: decode the HD/BD banks (above). Reading HD parsers is useful for the bank layout.
- ps2sdk (`iop/sound`): open IOP sound libraries (libsd/freesd, sdrdrv, audsrv, sdhd, sdsq). https://github.com/ps2dev/ps2sdk
- OSDMenu (pcm720): patches OSDSYS/HDD OSD binaries (FMCB 1.8 based); not a reimplementation and no sound-resource work found. https://github.com/pcm720/OSDMenu
- PCSX2 SPU2: emulates the hardware; the best behavioural reference. https://github.com/PCSX2/pcsx2 (see `pcsx2/SPU2/`; older SPU2-X plugin had ADSR.cpp, Mixer.cpp, Reverb.cpp). Wiki: https://wiki.pcsx2.net/SPU2-X
- pcsx-redux SPU rewrite (PS1): https://github.com/grumpycoders/pcsx-redux/pull/2077
- VibeStation PR with PS2 "SPU2 audio and OSDSND timer fix": https://github.com/mappazinho/VibeStation/pull/1 . It shows OSDSND depends on SPU2 timing. Not inspected further.
- A clean OSDSYS sound reimplementation or decomp was not found. [GAP]

## 5. Licences and how to use each source

Safe to read as spec (documentation, no code copied):
- psx-spx / nocash (problemkaputt.de, consoledev.net mirror): documentation, free to read. Check the page for reuse terms before quoting any table.
- ps2tek (psi-rockin): documentation by an emulator author; read freely, cite, and re-derive. Licence of text not confirmed.
- PCSX2 blog/wiki articles: documentation, read freely.
- psdevwiki, TCRF, ROM contents gist: community docs, read freely.

Behavioural reference only (do not copy code or tables verbatim):
- PCSX2 SPU2 (GPL-3.0; SPU2-X shipped GPL/LGPL files). Reading to understand behaviour is fine; do not transcribe code into a non-GPL reimplementation.
- ps2sdk (AFL-2.0, Academic Free License, per its repo; the `iop/sound` README gave no separate licence). Some modules in it are reverse-engineered from Sony's libraries; permissive but not guaranteed clean. Licence not re-checked in this pass.
- vgmstream (ISC-style licence for the core; some third-party parts differ) and VGMTrans (zlib/MIT-like): not confirmed in this pass; read as format references.
- OSDMenu/FMCB patches: GPL-ish homebrew; reference only.

Do not use:
- Sony SDK headers, leaked Sony manuals (`SPU2_Overview_Manual.pdf`), and the ROM audio samples themselves in our repo; derive from our own measurement of the HDD OSD 1.10U / ROM 2.30 builds.

## 6. Suggested next steps

1. Fetch the ps2tek SPU2 page and the PCSX2 `pcsx2/SPU2/` source in a browser to fill the SPU2-vs-PS1 gaps (reverb rate, envelope widths).
2. Run a SNDIMAGE sub-file through a hex viewer to test the HD/BD/SQ guess (look for `SCEIVers`, `SEQp`, PS-ADPCM block pattern).
3. In our disassembly, find OSDSND's EE-to-IOP RPC and command table; that is where the "how commands reach the SPU2" answer lives and no public source has it.
