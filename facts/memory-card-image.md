# Memory card image: the raw format the OSD's Format writes, and the host reader and writer

Build: **HDD OSD 1.10U** (canon). The oracle is the card image the OSD produces when the Browser's Format dialog is answered Yes: capture `hddosd-110U-browser-format-yes` (its `.ps2` is the instance card the OSD formatted; its `.png` shows "Formatting completed." and "7,998 KB Free"). The recorder is `tools/mc/capture_format.mjs`.
*Verified* means `verify_mc_image.mjs` recomputes the statement from the oracle (`node References/scripts/verify_mc_image.mjs <capture>.ps2`: 53 items compared, 0 different, verdict FOUND); *measured* means seen in a capture and not recomputed; *read* means taken from a public document. Public documents and what comes from the OSD instead: `References/readings/mc-format-sources.md` (clean room: no emulator source). The image is what the OSD writes through the memory card library of the emulator that ran it; it is not measured on a card formatted by real hardware. Code: `tools/mc/ecc.mjs`, `tools/mc/read_card.mjs` (reader), `tools/mc/make_card.mjs` (writer). The Format dialog's text and sounds are in `facts/browser-devices.md`.

## 1. Raw image

- 16384 pages of 528 bytes (512 data + 16 spare), 8,650,752 bytes. *Verified* (`verify_mc_image.mjs`, `hddosd-110U-browser-format-yes`).
- The blank card is 0xFF throughout (*measured*: the four instances' card files all hash the same as `blankImage()`); the reader calls it unformatted (no magic). `tools/mc/make_card.mjs` `blankImage()` produces it; `verify_mc_image.mjs` compares an instance card to it when given a second path.

## 2. Superblock (data of page 0)

*Verified* on `hddosd-110U-browser-format-yes` by `verify_mc_image.mjs`:

| Field | Value |
|---|---|
| magic (0x00) | `Sony PS2 Memory Card Format ` |
| version (0x1C) | `1.2.0.0` |
| page length / pages per cluster / pages per block | 512 / 2 / 16 |
| clusters per card | 8192 |
| alloc offset / alloc end | 41 / 8135 |
| root directory cluster | 0 |
| backup blocks | 1023, 1022 |
| indirect FAT list | [8] (entry 1 is 0) |
| bad block list (0xD0, 32 words) | all 0xFFFFFFFF |
| card type (0x150) / flags (0x151) | 2 / 0x2B |

Field offsets and the default values are *read* from the public documents; the flags 0x2B and the words after 0x152 are not in them and come from the OSD image (*verified* equal to the oracle by the page diff of `formattedEmpty`): 0x154 = 0x400, 0x158 = 0x100, 0x15C = 8, 0x160 = 0xFFFFFFFF, 0x170 = 8001, 0x17C = 0xFFFFFFFF.

## 3. FAT and root directory

*Verified* by `verify_mc_image.mjs` on `hddosd-110U-browser-format-yes`:

- Indirect FAT cluster 8; FAT clusters 9..40; 8192 entries. Entry rule (*read*): most significant bit clear is a free cluster, set is the next cluster, 0xFFFFFFFF is the last cluster.
- Entry 0 (the root directory) is 0xFFFFFFFF; entries from 8135 on are 0xFFFFFFFF (unallocatable); 8134 entries are free (0x7FFFFFFF).
- Clusters are numbered from the alloc offset: the root directory is at cluster 41 (pages 82 and 83). Its entries are 512 bytes: `.` (mode 0x8427, length 2) and `..` (mode 0xA426, length 0); first cluster, directory entry and attribute are 0 for both.
- created = modified for both entries = the host clock when the format ran (the oracle's is 2026-10-03 01:15:33; `timeOf` in `tools/mc/make_card.mjs` converts a date, checked in the verifier). Time bytes: +1 sec, +2 min, +3 hour, +4 day, +5 month, +6 year (16-bit).

## 4. ECC and the formatter's layout

- ECC (*verified*, `verify_mc_image.mjs`): 3 bytes per 128-byte chunk (column parity byte, then two line parity bytes; initial 0x77 0x7F 0x7F), four chunks give 12 bytes, followed by 4 zero bytes in the spare. All 112 programmed pages of the oracle match `tools/mc/ecc.mjs`; a flipped data bit is reported as exactly that page.
- The Hamming split is *read* from the documents; the placement of the six column parities on bits 0, 1, 2, 4, 5, 6 (as c1, c3, c5, c0, c2, c4) is fitted to the OSD image and checked against all 112 pages.
- What the formatter writes (*verified*): blocks 0..5 programmed completely, where an erased page carries the ECC of 0xFF chunks (spare `77 7F 7F` three times over four chunks, then 4 zero bytes); block 1023 is a copy of block 0 (data and spare); block 1022 stays 0xFF.
- The writer `formattedEmpty(time)` in `tools/mc/make_card.mjs` reproduces the oracle byte for byte (0 differing pages, `verify_mc_image.mjs`; controls: one changed byte is that page and no other).

## 5. The reader and the free count

- `info(image)` in `tools/mc/read_card.mjs` gives: `none` (no image), `unformatted` (no magic), or `formatted` with the free clusters counted from the FAT (entries with the most significant bit clear, below alloc end), the cluster size (2 x 512 = 1 KB), free KB, the root entry count (the length of `.`) and the entry names. On the oracle: 8134 free clusters, 8134 KB, names `.` and `..` (*verified*, `verify_mc_image.mjs`, with controls: an allocated entry is one free cluster fewer; a free entry beyond alloc end is not counted; a two-cluster root lists four entries; a root directory at cluster 1 is read from there). It is the rule of the card image itself (what a reader that parses the file reports); it is not the number the Browser shows for the same image (next item).
- What the Browser displays is not this count. The scan calls `sceMcGetInfo` and passes type and free count to `isfirstslot` (HDD `0x2493A8`; type 2 gives max(free - 2, 0), *verified* for the captured calls; type 6 shares the branch, *read*, `References/readings/browser-devices-scout.md`). On the formatted image the call receives type 2 and free 8000 and returns 7998, the "7,998 KB Free" of the screenshot (*measured*; the `isfirstslot` return is *verified* by `verify_browser_devices.mjs`, section `scan.kb`, `CLOCK_BUILD=hdd`, capture `hddosd-110U-browser-devices-formatted`: verdict FOUND).
- How the library arrives at 8000 from the image is not known. See Open.

Mutation of the reader, the writer and the verifier (`tools/mc/mutate_card.mjs`): the surviving mutants are equivalent (loop bounds read past the end into empty pages, constants whose change the controls tolerate) or concern control data only.

## Open

- How `sceMcGetInfo` derives free = 8000 from this image. The FAT count within alloc end is 8134 and does not fit. The superblock word 0x170 = 8001 minus the root cluster fits 8000 and is an untested hypothesis. It would be settled by a capture of `sceMcGetInfo` on an image whose 0x170 or FAT differs, read through `verify_browser_devices.mjs` section `scan.kb`.
- The library's free-count rule beyond this one image.
- Write paths: copy, delete, save; saves and `icon.sys`.
- Multitap slots.
- Timestamps from a fixed clock (the root entries carry the host clock at format time).
- Cards of other sizes.
- The failed-format path (state 5 of the dialog, `References/readings/browser-devices-format-scout.md`).
