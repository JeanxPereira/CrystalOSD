# Memory card image: sources

The PS2 memory card file system in `tools/mc/` (ECC, superblock, FAT, directory, formatted-empty image) is written from public format documentation and from the OSD's own output. No emulator source was opened, read or quoted: not PCSX2's, not any other emulator's.

## Public documents used

1. Ross Ridge, "The PlayStation 2 Memory Card File System" (the format description shipped with mymc), https://csclub.uwaterloo.ca/~rridge/mymc/ps2mcfs.html . Fields and offsets of the superblock (magic, version, page length, pages per cluster, pages per block, clusters per card, alloc offset, alloc end, root directory cluster, backup blocks, indirect FAT list, bad block list, card type and flags), the FAT entry rule (most significant bit clear: free; set: next cluster; 0xFFFFFFFF: last cluster), the 512-byte directory entry (mode, length, created, first cluster, directory entry, modified, attribute, name), and the error correction code (a 20-bit Hamming code per 128-byte chunk, three bytes, four chunks and four unused bytes in the 16-byte spare area of a 528-byte raw page).
2. "PlayStation 2 Memory Card File System", ps2savetools, https://ps2savetools.com/ps2memcardformat.html (a summary of its tables): the same layout, the initial map of a standard 8 MB card (superblock page 0; indirect FAT at cluster 8; FAT from cluster 9; allocatable clusters from cluster 41; backup blocks at the end), the default values 8192 / 41 / 8135 / 1023 / 1022 and the raw page size of 528 bytes.

## Facts that come from the OSD, not from the documents

The OSD (HDD OSD 1.10U, `Format`, the Yes path) writes a formatted image that is console output and serves as the oracle (`verify_mc_image.mjs`, `References/fixtures/mc/osd-formatted-raw.ps2`). Where a document leaves a choice open, the oracle decides and the verifier lists it:

- the column-parity bit layout of the ECC byte (0x77 start value; the six parities land on bits 0, 1, 2, 4, 5, 6 as c1, c3, c5, c0, c2, c4 of the standard Hamming split), fitted to the 112 programmed pages of the oracle and then checked against all of them;
- card flags 0x2B, and the superblock words after 0x152 (0x154 = 0x400, 0x158 = 0x100, 0x15C = 8, 0x160 = 0xFFFFFFFF, 0x170 = 8001, 0x17C = 0xFFFFFFFF), which the documents do not describe;
- the formatter programs blocks 0 to 5 completely (erased pages carry the ECC of 0xFF chunks, 0x77 0x7F 0x7F, and four zero trailer bytes) and writes a copy of block 0 into block 1023;
- the timestamps of the two root entries are the host clock when the format ran.
