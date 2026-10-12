# Browser ICOIMAGE: decode, parse, upload (re-scout, 2026-10-08)

Question: how browser_get_icon_bytes 0x24E770 / browser_icon_indices 0x2BD180 (62..77), container index 61 reach the GS;
the .ico layout as the EE reads it; what func_00256DE0 does; what a verifier probes. HDD OSD 1.10U first, ROM 2.30 second.
READ = instructions at the addresses given (D:/CodingProjects/CrystalOSD/asm/browser/*.s, core/*.s). MEASURED = my scripts on the
existing captures and resources (scratch scripts ico.mjs, tex.mjs, cmp.mjs, gs.mjs, bios.mjs in the session scratchpad). INFER is marked.

## 0. Corrections to the task premises
- func_00256DE0 (sceVif1PkRefLoadImage wrapper) is NOT the icon uploader. It is the generic image/CLUT uploader of the TEXB* textures
  (callers module_browser_256D20 0x256D20 via jal 0x256D8C/0x256DB8; D_00256F28 0x256FD0/0x257018; func_002571D8 0x25731C/0x257348; table D_002BD910, 28-byte entries).
  Icons are uploaded by the DMA chain kicked in func_0023A7F8 (section 4).
- The T&L entry 0x2567D0 does not receive a vertex pointer or count. It receives the SLOT (a0). The vertex packet and its size are in the
  slot DMA descriptor (4.3), written once by module_browser_23B130 at load time.


## 1. Where the bytes come from (READ + MEASURED)
- browser_get_icon_bytes 0x24E770: GetResourceData(browser_icon_indices[a0]); browser_icon_indices = 62..77 (MEASURED from the ELF: 62,63,...,77).
  GetResourceData 0x20BD28 = [osdsys_resource_info(0x2AD240) + 16*i + 4]. ELF rows (MEASURED): 61 = ICOIMAGE type 5; 62..77 = ICOBDISC..ICOBFFIL type 4; the dest word (+4) is 0 in the file, filled at run time.
- do_load_resources 0x20AB98: type 5 = sceOpen/sceRead the file to 0x680000, then the decrypting loop 0x20AFB4..0x20B124 (key from D_002AD970/978 = imageKey; only the first 64 of every 512 8-byte blocks), then romdir_get_offset. Type 4 = romdir_search_entry(curname) in that container and Expand(member, dest) (0x20AEC0..0x20AF0C). So GetResourceData(62+i) is the EXPANDED .ico in EE memory.
- MEASURED: sound_data.mjs decryptImage + romdirStart/romdirEntries + expand (tables from hddosd.elf via CIPHER_TABLES, key words at 0x2AD970) on resources/ICOIMAGE give a ROMDIR of 16 ICOB* members. Every member expands, magic 0x00010000, and parsing section 2 consumes the member to its last byte (0-4 bytes padding on some). Expanded sizes: DISC 25000, CDDA 36280, PS1M 13376, PS2M 40024, PKST 26152, PS1D 14912, PS2D 22624, DVDD 25440, YSYS 1688, FSCE 9944, FNOR 9984, FBRK 920, QUES 16184, FHDD 36568, FDIR 68824, FFIL 33688.
- ROM 2.30: the BIOS ICOIMAGE (ps2-0230a-20080220.bin, romdirStart(bios,0x100000)) is a plain ROMDIR member of 71853 bytes with only 13 members (DISC..QUES). All 13 expand byte-identical to the HDD OSD members (MEASURED, bios.mjs). FHDD, FDIR, FFIL exist only in HDD OSD.

## 2. The .ico layout as module_browser_23B130 reads it (READ; all 16 members parse to the end, MEASURED)
Little endian. Header, 5 words (0x23B184..0x23B2B8):
- 0x00 magic 0x00010000 (beq t3,v0 at 0x23B194, else return -1 at 0x23B19C).
- 0x04 shapes t2 in {1,2,4,6,8} (morph targets), stored to D_0041EEB0+4+4*slot (0x23B1F0); table 0x23B1C0..0x23B280, anything else fails.
- 0x08 flags t4: bit0 -> GS PRIM.IIP (andi 1 at 0x23B31C, shifted to bit 18), bit2 -> texture present and PRIM.TME (srl 2 at 0x23B314, shifted to bit 19), bit3 -> texture is RLE16 (srl 3 at 0x23B368); bit1 not read. Members: 3 (no texture: FBRK, QUES), 7 (raw), 15 (RLE).
- 0x0C float f, must be >= 0 (c.lt.s 0x23B21C); its bits are stored at D_002A8100+0xE0*slot+0x40 (sw 0x23B238). Values seen 0, 0.3, 1, 1.5.
- 0x10 vertex count n: n%3==0 (divu 0x23B2BC), n <= {shapes 1: 0x708, 2: 0x672, 4: 0x5DC, 6: 0x546, 8: 0x4B0} (0x23B240..0x23B290), n*(8*shapes+16) <= limit-0x14 where limit = a3 = 0x51000 (0x23B2F8).
Vertex records start at file offset 0x14, n records of 8*shapes+16 bytes each (array of structs, mult t3,t0,v0 at 0x23B2F8):
- rec+8*k (k < shapes), 8 bytes: position of morph target k, int16 x,y,z then int16 pad. lh, cvt.s.w, mul.s by 0x3A800000 = 2^-10 (0x23B4F0..0x23B54C); w := 1.0.
- rec+8*shapes, 8 bytes: normal int16 x,y,z, pad. mul by 0x39800000 = 2^-12 (0x23B5C0..0x23B62C); w := 1.0.
- rec+8*shapes+8, 4 bytes: uv int16 u,v. mul 2^-12, stored (u,v,1.0,0) (0x23B630..0x23B654).
- rec+8*shapes+12, 4 bytes: colour u8 r,g,b,a, cvt.s.w only, 0..255 (0x23B660..0x23B69C).
The converted floats go to the vertex packet as qwords per vertex: shapes position qwords, one normal qword, one uv qword, one colour qword. The position min/max over all shapes is accumulated by module_browser_23A450 (vmini/vmax) at D_00426D40+32*slot (min init (10,0,10,1), max init (-10,-20,-10,1), set by module_browser_23AFC8 0x23B05C..0x23B080) and is the bbox for the cull in 0x2567D0.
Packetisation (READ 0x23B2EC..0x23BA70, MEASURED against the capture): chunk size c = 3*floor(floor(0x1F0/(shapes+6))/3) vertices (shapes 1: 69), floor(n/c) full chunks then a remainder chunk. Each chunk = VIF qword [0,0,(first chunk: STCYCL 0x01000404, else 0),UNPACK V4-32 0x6C018000], a GIF tag qword [0x8000|count, 0x30418000|bit0<<18|bit2<<19 (first chunk also |0x4000), REGS 0x0412 = ST,RGBAQ,XYZF2, 0], the vertex data as UNPACKs 0x6C000000|offset|num<<16, and MSCNT 0x17000000. MEASURED: HDD trace frame 2008, xgkick GIF tags NLOOP 0x45,0x45,0x12 = 69+69+18 = 156 = ICOBFHDD vertex count; PS2M (300): 4x69+24.
Keyframe block, right after the vertices at 0x14+n*(8*shapes+16) (READ func_0023AA08 0x23AA08, word offsets from its a0):
- [0] track count, must be 1 (sltiu 2 and nonzero, 0x23AA2C..0x23AA3C).
- per track: [1] duration w0 (59, 99, 1440 or 1 seen), [2] float time scale, [3] start offset, [4] shape-track count k <= 8 (0x23AAF4).
- per shape track: shape index (<= shapes, check 0x23AB38), key count (<= 10, 0x23AB50), then key count x (float,float).
- stored at D_0041EF64+0x2D8*slot (+8, +0x2D0 per track, +0x58 per shape track). All 16 members: 1 track, 1 shape track, 1 key. Consumed by func_0023ACC0 0x23ACC0 (tick*[track+4], plus offset, modulo w0, key evaluation func_0023AEB8).
Texture (READ 0x23BAA0..0x23BC5C): present iff flag bit2. Raw: 0x8000 bytes (128x128 PSMCT16) after the keyframes, copied by the ld/sd loop 0x23BBAC. RLE16 (bit3): u32 compressed size then func_0023BDC8 0x23BDC8: int16 n; n>0 repeats the next uint16 n times; n<0 copies -n uint16 literals; n==0 skips; the output must be 0x8000 bytes (checked 0x23BC14). MEASURED: my decoder gives exactly 0x8000 for all 12 textured members.


## 3. Which ICOB a device row uses (READ func_0025A070 0x25A070, func_0025A120 0x25A120, func_00249AB8 0x249AB8; draws MEASURED)
- Row builder func_0025A120(row, class, type) stores class at row+0x690, type at row+0x694 and kind = func_0025A070(class,type) at row+0xB0. The icon is requested by func_00253F90(kind) 0x253F90 (kind if kind<16 else 11) -> browser_osdpic_icon_related(idx, row+0x140) 0x23F970 -> browser_get_icon_bytes(idx) -> resource 62+idx. Literal kinds: 0xF = FFIL and 0x10 -> 11 = FBRK (browser_icon_handler 0x24AE34, 0x24AE88), 0xE = FDIR (browser_icon_handler2 0x25B7F8).
- func_0025A070, HDD: class 0xA (disc): type-0x6A in 0..9 -> jtbl_003665B0 = [5,5,6,6,7,0,0,0,0,7] (PS1D, PS1D, PS2D, PS2D, DVDD, DISC x4, DVDD), other types -> 0. class 1 -> 13 FHDD. class >= 0xC -> 14 FDIR. Otherwise (memory-card slot rows, class 2..9 built in func_00249AB8 at 0x249B8C, a1 = s0+2; type = status word at D_002BB938+0x42C+4*slot): type 2 or 6 -> 3 PS2M, type 3 or 7 -> 4 PKST, else 2 PS1M. INFER: type is the sceMcGetInfo card type (1 PS1, 2 PS2, 3 PocketStation).
- ROM 2.30 0x253540 (disasm; diff_rom shows 30 words differ): class 1 is the disc class with a 12-entry jump table at 0x2C5800 = [5,5,6,6,7,0,0,0,0,7,0,7]; there is no HDD class; other types as HDD.
- Slot cache: browser_osdpic_icon_related formats OSDPIC%d (string 0x365D50) with idx; func_0025B108 -> func_0025A810 finds or allocates a slot (0..43); on a miss module_browser_23AFC8(slot, icon bytes, 0x51000) loads it; func_00256770 sets D_004DA780[slot] = 1 (the T&L entry draws only when set).
- MEASURED in hddosd-110U-trans-return (Browser, no disk): 3 icon draws per frame; the texture packets match the decoded ICOBFHDD (slot 2, 1 per frame) and ICOBPS2M (slot 3, 2 per frame) byte for byte: 92 frames x 3 = 276 uploads, 0 unmatched (cmp.mjs). ROM rom-0230A-trans-return: 184 draws = 2 per frame, GS memory holds PS2M (section 5). So with no disk the HDD row is ICOBFHDD (HDD build only) and the two unformatted card rows are ICOBPS2M.
- Open: idx 8 YSYS, 9 FSCE, 10 FNOR, 12 QUES come from the save/system-data paths (browser_handle_system_data 0x23E6C8 atoi of a field; browser_cdplayer_related 0x246A54 with a table at D_00310B28). Not read here.

## 4. Upload and draw (READ + MEASURED)
4.1 Load: module_browser_23AFC8(slot, bytes, limit) 0x23AFC8 calls module_browser_23B130(a0 = 0xB5C000 + 0x48000*slot, a1 = 0x9D0000 + 0x9000*slot, a2 = bytes, a3 = limit, t0 = slot, t1 = &vertex_packet_words, t2 = &texture_packet_words) at 0x23B084. The bases are D_0037082C = 0xB5C000 and D_00370830 = 0x9D0000, set by module_browser_256728 0x256760. Slots < 0x2C.
4.2 Texture packet at a1 (READ 0x23BAB0..0x23BC5C, matches the trace): qword0 = [0,0,0,VIF DIRECTHL 0x51000804]; GIF tag A+D NLOOP 2 EOP at a1+0x10; A+D (0, reg 0x3F TEXFLUSH) at +0x20; (0, reg 0x53 TRXDIR = 0) at +0x30; GIF tag IMAGE NLOOP 0x800 EOP (0x8800, 0x08000000) at +0x40; the 0x8000 texture bytes at a1+0x50. Total 0x2014 words = 0x805 qwords. Trace: kind directhl size 0x8040 at a1+0x10, packets of 48 and 32784 bytes.
4.3 Descriptor per slot = DMA chain at 0x2A5A80+0x50*slot (pointer table 0x426C84+4*slot, filled by module_browser_23BED8 at 0x23BF78; static content read from the ELF):
- qw0 REF to the texture packet: word0 = 0x30000000|0x805, word1 = a1 & 0xFFFFFFF (0x23BC68..0x23BC98); length 0 when there is no texture.
- qw1 REF to the VU1 program/constants for the shape count: the two words copied from D_002BA120, which module_browser_23BED8 fills from static descriptors 0..4 for shapes 1,2,4,6,8 (0x23BCA8..0x23BD64).
- qw2 REF of 0xE qwords at 0x2A80B0+0xE0*slot (matrix and parameter block).
- qw3 REF to the vertex packet: word0 = 0x30000000|(s3>>2) = qwc, word1 = a0 & 0xFFFFFFF (0x23BD88, 0x23BD8C). So vertex pointer = [desc+0x34], vertex qwc = [desc+0x30] & 0xFFFF.
- qw4 END (0x70000000).
4.4 Draw func_002567D0 (HDD 0x2567D0): a0 slot; a1 = 4x4 float matrix copied by func_0023A898 into the slot block (0x2A80B8+0xE0*slot); a2 = 4x4 float matrix copied by func_0023A478 to D_002A7F38 followed by a DMA of D_002A5A40; a3 = animation tick (signed; negative handled as unsigned to float, 0x23ADB8); t0 = animation offset. Order: flag D_004DA780[slot] (0x256814); func_0023B0C0 bbox; sceVu0MulMatrix + sceVu0RotTransPersN of the 8 bbox corners and cull unless every x,y <= 0xFFFF and z <= 0xFFFFFFF (0x256910..0x25694C); func_0024C200(1,2); func_0023A708(0x3A98) (literal at 0x25695C); func_0023A478; func_0023A898; func_0023ACC0 (weights); tail call func_0023A7F8, which sets TADR = [0x426C84+4*slot] and writes CHCR 0x145 at 0x23A878. The ROM 2.30 version (0x24FF30, disasm 0x24FF30..0x24FFEC) has no bbox cull: flag, 0x245BF0(1,2), 0x236D48(0x3A98), 0x236AB8, 0x236ED8, 0x237300, j 0x236E38.
Caller seen in the trace: func_00259240 at 0x2593E4 passes a0 = [s0+0x684], a1 = s0+0x20, a2 = D_002BB360, a3 = D_00370698, t0 = [s0+0x94].
4.5 GS side (MEASURED, trace and GS dump): func_0023A708 sends by A+D BITBLTBUF = 0x02023A9800000000 (DBP 0x3A98, DBW 2, DPSM 2 = PSMCT16), TRXPOS = 0, TRXREG = 0x80 x 0x80, and TEX0_1 = 0x1DC20BA98 (TBP0 0x3A98, TBW 2, PSM 2, TW 7, TH 7). The DIRECTHL image then fills DBP 0x3A98 (128x128 PSMCT16 = 0x8000 bytes = 8 pages). The same DBP is overwritten at EVERY draw, so after a frame the GS memory holds only the last icon drawn.

## 5. Verifying against GS memory
- Reading GS memory: the .gs dump holds the 4 MB (extract_textures.mjs: start = 8+headerSize+stateSize-TAIL-MEM, TAIL = (16+4)*4+4, MEM = 0x400000); watson_gs_read({path}) writes the same memory live (flow_buffers_sends.mjs:116, facts/clock-transitions.md:388). extract_textures.mjs only knows PSMCT32. The PSMCT16 address below matched with 0 differing bytes against the decoded ICOBPS2M texture in BOTH hddosd-110U-trans-return.gs and rom-0230A-trans-return.gs (a first try with an 8x4 block table gave 12996 differing bytes):
  BLOCK16 = [[0,2,8,10],[1,3,9,11],[4,6,12,14],[5,7,13,15],[16,18,24,26],[17,19,25,27],[20,22,28,30],[21,23,29,31]], index [(y>>3)&7][(x>>4)&3]
  CW = [[0,1,4,5,8,9,12,13,0,1,4,5,8,9,12,13],[2,3,6,7,10,11,14,15,2,3,6,7,10,11,14,15]], index [y&1][x&15]
  word = (dbp + ((x>>6) + (y>>6)*dbw)*32 + BLOCK16[..][..])*64 + ((y>>1)&3)*16 + CW[y&1][x&15]; byte = word*4 + ((x&15) >= 8 ? 2 : 0); dbp 0x3A98, dbw 2, x,y < 128.


## 6. ROM 2.30 addresses (diff_rom.mjs and disasm_rom.py on References/dumps/rom-0230A-clock-ee-00100000.bin, base 0x100000)
- func_002567D0 T&L 0x2567D0 -> ROM 0x24FF30. NOT the same code: no bbox cull. Trace entries (MEASURED, rom-0230A-trans-return): call sites pc 0x24FF80, 0x24FF88, 0x24FF90, 184 draws in frames 2307..2398.
- func_0023A7F8 0x23A7F8 -> ROM 0x236E38 (1 word differs); CHCR write 0x23A878 -> ROM 0x236EB8 (measured origin pc).
- func_0023A708 0x23A708 -> 0x236D48 (3 words differ). func_0023A478 -> 0x236AB8 (3), func_0023A898 -> 0x236ED8 (2), func_0023ACC0 -> 0x237300 (3), func_0023AA08 -> 0x237048 (2), module_browser_23A450 -> 0x236A90 (8 words differ, not checked further).
- func_0023BDC8 (RLE16) 0x23BDC8 -> 0x238218, 0 words differ.
- module_browser_23AFC8 0x23AFC8 -> 0x237608 (55 words differ, register allocation; it calls 0x2376B8 at 0x237678).
- module_browser_23B130 0x23B130 -> 0x2376B8 (frame 0xE0 against 0x170; not word-comparable). Same constants: 0x708 0x672 0x5DC at 0x2377CC.., 0x2014 at 0x2380BC, 0x51000804 at 0x2380D8, 0x6C018000 near 0x237950.
- module_browser_23BED8 0x23BED8 -> 0x238328 (5 words differ). ROM module_browser_256728 equivalent at 0x24FEB0: vertex base 0xBDC000 (lui 0xbd, ori 0xc000), texture base 0xA50000 (lui 0xa5) (disasm 0x24FEDC..0x24FEF0).
- func_0025A070 0x25A070 -> 0x253540 (NOT the same, section 3).
- ROM tables: texture indices 0x2AD6D8 = 60..67 (get_texture_bytes 0x247BE8, diff_rom 1 word differs); icon indices 0x2AD6F8 = 69..81 then 0 (13 entries). ROM browser_get_icon_bytes itself was NOT located (no addiu with 0xD6F8 in the dump), so 0x247C18 is not it (it is GetResourceData(0x68)).
- ROM resource table (0x27B478, rows {name, dest, size, type}) is pre-filled: ICOIMAGE row 68 (type 2), ICOBDISC 69 dest 0x1DC0530 size 0x61A8 (= 25000, the expanded size of 1), ICOBQUES 81 size 0x3F38 (= 16184). The ROM slot-name format is "OSDPIC%02d" (string at 0x2C5368/0x2C5369), HDD is "OSDPIC%d".

## 7. Probes a verifier needs
HDD OSD 1.10U (pc, registers):
- 0x23AFC8 entry: a0 = slot, a1 = ICO bytes pointer, a2 = 0x51000. The pointers are run-time: probe the resource rows (range 0x2AD240+16*62, 0x100: the dest word at +4 of each row) or read $5 at each call; second pass with fixed ranges for the ICO bytes (max expanded size 0x10C58).
- 0x23B08C (instruction after jal 23B130 at 0x23B084): $2 = 0 ok / -1 fail; [sp+0] = vertex packet words, [sp+4] = texture packet words (t1 = sp, t2 = sp|4 at 0x23B054..0x23B060 inside 23AFC8). Ranges: vertex packet 0xB5C000+0x48000*slot (4*words), texture packet 0x9D0000+0x9000*slot (0x8050). Slots seen: FHDD slot 2 (tex packet 0x9E2000, descriptor 0x2A5B20), PS2M slot 3 (0x9EB000, 0x2A5B70).
- Draw: 0x2567D0 entry (a0 slot, a1/a2 matrices, a3 tick, t0 offset); 0x23A878 (CHCR write: the chain starts; descriptor [0x426C84+4*slot], range 0x2A5A80+0x50*slot length 0x50); 0x23A7C0 (BITBLTBUF/TEX0 A+D send, measured origin pc).
- GS: after the capture DBP 0x3A98 holds the LAST icon drawn (formula in 5). The per-draw texture bytes are in the trace as kind directhl records (MEASURED matching).
ROM 2.30: T&L entry 0x24FF30 (same argument registers), A+D send 0x236E00 (measured origin pc), CHCR write 0x236EB8, 23AFC8-equivalent 0x237608, parser 0x2376B8 (its return in 0x237608 is after the jal at 0x237678).

## 8. Reaching the Browser in a capture
- Existing and enough for the upload/GS side: hddosd-110U-trans-return (frames 2008..2099, Browser with the HDD error dialog) and rom-0230A-trans-return (frames 2307..2398). Both draw icons every frame. No existing capture contains a load (no origin stack has 0x23AFC8 or 0x23B130, MEASURED over both) and none has probes inside Browser functions.
- hddosd-110U-sound-menu-cross-browser: trace header frame 1622, pad record "5:6:cross" (cross pressed at capture frame 5 for 6 frames), from the state menu (watson.json build hddosd-1.10U-host, states menu/config/clock; file ../Watson/Runtime/states/hddosd-1.10U-host-menu.p2s). facts/clock-transitions.md section 2 (line 140): cross on the first item at P (HDD P = 1622, ROM P = 2010), code 9999 at P+3, mode 3 at P+4, clock thread ends at P+131. trans-return starts at 2008 = P+386 and already shows the icons.
- capture.mjs flags (References/scripts/capture.mjs header): --state menu, --pad '[{"frame":0,"press":["cross"],"frames":6}]' (applied at the capture frame, recorded as pad records), --presses '[["cross",6,N]]' (before the capture, then N frames advanced), --hold, --writes, --mode exact|trace|fast, --navigate fast, --build hdd|rom, --verifiers. The recipe of trans-return is not recorded anywhere I found; its trace has no pad record, so its presses were --presses before the capture.
- PROPOSAL (not run): to catch the icon LOAD, capture from --state menu with the cross pad above and probes only at 0x23AFC8 and 0x23B08C over a window that covers P+131 .. P+400 (HDD), find the frame of the first hit, then repeat with --presses so that the capture starts just before it and add the fixed ranges of section 7.

## 9. Positive controls
- Grep of facts/ and run_all.manifest.json for 2567D0, 23A7F8, 23B130, 24E770, 0x3A98: no hits; the same grep for ICOIMAGE hits facts/hddosd-boot.md, so the grep works. These addresses are new to the fact set.
- The decrypt/expand/parse pipeline finds known things: 16 members, magic 0x00010000 in all, textures decode to exactly 0x8000 bytes, 276/276 uploads of the HDD capture equal a decoded member, the GS dumps of both builds equal the decoded PS2M texture, vertex counts 156 and 300 equal the xgkick packet sums.
- The ROM function matches are checked by diff_rom (few differing words) except 23B130 (constants) and the T&L (call sequence), stated above.

## 10. Open
1. Run-time addresses of the 16 ICO buffers (probe the resource rows or $5 at 0x23AFC8).
2. Vertex packet bytes were never compared with a captured memory range (no memory probe exists); vertex counts and chunking were. The float conversions in section 2 are READ only.
3. Meaning of the header float (stored at D_002A8100+0xE0*slot+0x40, consumed by the VU1 program which was not read).
4. ROM: get_icon_bytes address, the icon rows beyond the 13 members, rows that use ICOBFHDD/FDIR/FFIL (none in the ROM image).
5. Which code gives idx 8, 9, 10, 12 (system data, save icons).
6. The 16 Browser icon rows in other states (formatted card, disc, HDD present) need captures with those devices; no host image is formatted (spec line 74).
7. Public PS2 icon format documentation was NOT consulted; all of this is from the instructions and the data.
