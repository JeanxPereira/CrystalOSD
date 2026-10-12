# Browser ICOIMAGE and .ico scout, second reading (Task 7)

Independent second scout of the same question; written to this file because `browser-ico-scout.md` was being written by another run at the same time. Where both agree the claim is doubly read. Read-only, 2026-10-08. Every address names its build: HDD = HDD OSD 1.10U (canon), ROM = ROM 2.30 (`rom-0230A-clock-ee-00100000.bin`, EE RAM 0x100000..0x300000 only).
Status words: READ = instructions or bytes read; MEASURED-OFFLINE = computed from the files here, no emulator; INFER = my inference; OPEN = not closed, with the probe.
Scratch scripts (not committed): `lab/scout/ico_lib.mjs`, `lab/scout/ico_layout.mjs`, `lab/scout/ico_romtbl.mjs`.

## Corrections to the inventory and the plan (read first)

1. `func_00256DE0` (the `sceVif1PkRefLoadImage` wrapper) is NOT the icon texture path. Its callers are `0x256D20`, `0x256F28`, `0x2571D8`. The icon draw path (`func_002567D0` -> `0x23A708`, `0x23A478`, `0x23A898`, `0x23ACC0`, `0x23A7F8`) never calls it.
2. `func_002567D0` (0x2567D0) is NOT a T&L that receives the vertex buffer. It receives (slot, matrixA*, matrixB*, time, offset), culls with a bounding box (`sceVu0MulMatrix` + `sceVu0RotTransPersN`, n = 8 box corners) and then starts the VU1 draw. Vertices are never transformed on the EE: `0x23B130` converts the .ico streams to float quadwords and VIF1 UNPACK (`0x6C018000`) loads them into VU1. A VU1 microprogram exists: the static DMA chain at HDD `0x2A5A40` refs 0x3C qwords at `0x2A6B10`.
3. ROM 2.30 has no cull: ROM `0x24FF30` is the same call sequence without `sceVu0RotTransPersN`.
4. ROM 2.30 has 13 members (no ICOBFHDD, ICOBFDIR, ICOBFFIL).

## 1. Container, decrypt, ROMDIR, Expand, member selection

### Resource table (READ)
- Table `osdsys_resource_info` HDD `0x2AD240`, 16 bytes per entry: +0 name pointer, +4 dest (EE address, 0 = allocate), +8 size, +12 flags (low 3 bits = type). From `hddosd.elf`: index 61 ICOIMAGE type 5; 62..77 ICOBDISC, ICOBCDDA, ICOBPS1M, ICOBPS2M, ICOBPKST, ICOBPS1D, ICOBPS2D, ICOBDVDD, ICOBYSYS, ICOBFSCE, ICOBFNOR, ICOBFBRK, ICOBQUES, ICOBFHDD, ICOBFDIR, ICOBFFIL type 4; 78 SKBIMAGE type 5.
- `GetResourceData` HDD `0x20BD28` (`core/GetResourceData.s`): v0 = word at +4 of (table + (a0 shifted left 4)) = the member's dest pointer. ROM `0x2072A8`, table ROM `0x27B478`, same body.
- `browser_get_icon_bytes` HDD `0x24E770`: GetResourceData(browser_icon_indices[n]), `browser_icon_indices` HDD `0x2BD180` = words 62..77 (ELF). The texture getter before it is HDD `0x24E740` with table `0x2BD160` = 53..60 (TEXBNAV1..TEXBICHI).
- ROM has one getter, ROM `0x247BE8`, table ROM `0x2AD6D8` = 60 61 62 63 64 65 66 67 69 70 71 72 73 74 75 76 77 78 79 80 81 (8 TEXB, then 13 ICOB; ROM ICOIMAGE = 68 is skipped). The ROM callers pass n + 8 (ROM `0x23B824`: `addiu a0, s0, 8` before `jal 0x247BE8`; the other caller is ROM `0x250194`). ROM resource table (ROM `0x27B478`): 68 ICOIMAGE type 2, 69..81 ICOBDISC..ICOBQUES type 4.

### How the member is found and decoded (READ, `core/do_load_resources.s`, HDD `0x20AB98`, loop at `0x20ABF0`)
- Per entry: dest (+4) = 0 -> ((bump + 15) >> 4) << 4 when bump != 0 (0x20ABFC..0x20AC1C). Type = flags & 7, dispatched through `jtbl_003486C0` (rom0: path, entered at 0x20AC40) or `jtbl_003486E0` (hdd path, entered at 0x20B168 after `check_device_name("hdd")`). Jump tables read from the ELF: jt1 = 20ac5c 20ace8 20adb8 20ae78 20aec0 20af18, jt2 = 20b228 20b2b8 20b384 20b43c 20b488 20b4e0. After each entry (0x20BCBC..0x20BCDC): unless type == 2, size is stored at +8 and bump = dest + size.
- Type 4 (member): `romdir_search_entry(&curname_in_romdir 0x386BF8, name, &out)`, then Expand(out[1] = data pointer, dest); `ExpandGetSize` must equal Expand's return, else -1 (HDD 0x20B488..0x20B4D4; rom0 path 0x20AEC0..0x20AF0C). `Expand` HDD `0x200EE8` (ROM `0x200ED0`), same code.
- Type 5 (HDD container on disk): file read to `0x680000`, key = ((D_002AD978 xor 0x2CBADB31CCCB12F6) - 5) - D_002AD970, `decryption_xommon1` (0x293D08) key schedule, and of every 512 8-byte blocks only the first 64 are decrypted (`decryption_common2..6`), then `romdir_get_offset(0x680000, 0x682000, &curname)` makes this container the one the following type-4 entries search. Type 2 is promoted to 5 on the hdd path (0x20B1D4..0x20B1F4), as `facts/hddosd-boot.md` says.
- Key words in the ELF at `0x2AD970..0x2AD97F` (LE words): 3ebcdb15 87f95c7f 61237516 d7744445, so low = 0x87F95C7F3EBCDB15, high = 0xD774444561237516.
- ROM: ICOIMAGE is plain: BIOS ROMDIR entry ICOIMAGE size 71853 (`ps2-0230a-20080220.bin`), table type 2.

### MEASURED-OFFLINE
- `decryptImage` (`References/model/sound_data.mjs`) with that key and `CIPHER_TABLES` read from `hddosd.elf` turns `References/dumps/hddosd-host/ICOIMAGE` into a valid container: ROMDIR at 0, entries RESET 0, ROMDIR 320, EXTINFO 212 + 16 ICOB* (packed sizes: DISC 11397, CDDA 5712, PS1M 2893, PS2M 4557, PKST 8118, PS1D 4185, PS2D 8591, DVDD 11572, YSYS 584, FSCE 5261, FNOR 5064, FBRK 173, QUES 3197, FHDD 2946, FDIR 19163, FFIL 11074).
- `resources/ICOIMAGE` (main checkout) decrypts to bytes identical to the dump's copy.
- Every member Expands. For the 13 members in both builds, HDD-decrypted + Expanded bytes equal the BIOS's plain ICOIMAGE + Expand byte for byte (13/13). The ROM ROMDIR lists DISC CDDA PS1M PS2M PKST PS1D PS2D DVDD YSYS FSCE FNOR FBRK QUES only.
- Expanded sizes: DISC 25000, CDDA 36280, PS1M 13376, PS2M 40024, PKST 26152, PS1D 14912, PS2D 22624, DVDD 25440, YSYS 1688, FSCE 9944, FNOR 9984, FBRK 920, QUES 16184, FHDD 36568, FDIR 68824, FFIL 33688.

### Which ICOB the device row uses (READ)
- Loader `browser_osdpic_icon_related(n, entry)` HDD `0x23F970`: sprintf "osdpic%d", slot id s1 = `func_0025B108(name, &flag)`, `func_00256788(slot)` (frees the slot if `D_004DA780[slot] == 1`), `browser_get_icon_bytes(n)`, `module_browser_23AFC8(slot, bytes, 0x51000)`, then `func_00256770(slot)` (sets `D_004DA780[slot] = 1`). Callers pass n = `func_00253F90(kind)` = (kind < 0x10 ? kind : 0xB) (`core/align_054F8C.s`).
- The kind is chosen by `func_0025A070(a0 = device kind, a1 = id)` HDD `0x25A070`, called from `func_0025A120` HDD `0x25A120` (stores kind at +0xB0, then `func_00253F90`, then `browser_osdpic_icon_related`), which `func_00249AB8` (HDD `0x249AB8`, root device list builder) calls per tile:
  - header (current directory): `func_0025A120(D_00370840[idx], [s3+0x124], [s3+0x128])` (0x249B08); at root kind 0, id 6 (the inventory's "PS2" id 6) -> n = 3 ICOBPS2M.
  - HDD tile `func_0025A120(s1, 1, 0)` (0x249B3C) -> `0x25A070(1, 0)` = 0xD ICOBFHDD, always at root.
  - for slot i in 0..7 with word `D_002BB938+0x42C+4*i` nonzero: `func_0025A120(s1, i + 2, value)` (0x249B90). In `0x25A070`, for a0 not in {1, 0xA} and a0 < 0xC: id 2 or 6 -> 3 ICOBPS2M; id 3 or 7 -> 4 ICOBPKST; anything else -> 2 ICOBPS1M.
  - disc `func_0025A120(s1, 0xA, word at D_002BB938+0x1098)` (0x249BF4), only when (that word - 0x6A) < 8 or it is 0x72/0x73. `0x25A070(0xA, id)`: (id - 0x6A) through `jtbl_003665B0` (ELF: 25a0ac 25a0ac 25a0a4 25a0a4 25a0b4 25a0bc 25a0bc 25a0bc 25a0bc 25a0b4): ids 0x6A, 0x6B -> 5 ICOBPS1D; 0x6C, 0x6D -> 6 ICOBPS2D; 0x6E, 0x73 -> 7 ICOBDVDD; 0x6F..0x72 -> 0 ICOBDISC; out of range -> 0.
  - a0 >= 0xC -> 0xE ICOBFDIR (folders). Other callers: `browser_icon_handler` 0x24AD88 (kinds 0xF -> ICOBFFIL, 0x10 -> 0xB ICOBFBRK), `browser_icon_handler2` 0x25B758 (0xE, 0x10), `browser_cdplayer_related*` (CD player), `func_002586E8`, `func_002609D8` (kind 0xC), `func_002622B8`. Not traced further.
  - INFER: the words at `D_002BB938+0x42C+4*i` are the `sceMcGetInfo` card types (1 PS1, 2 PS2, 3 PocketStation) with 4 added under a multitap (`func_0024BC90` 0x24BCF4..0x24BD30 adds or subtracts 4 against `D_00370350`). A blank PS2 card -> id 2 -> ICOBPS2M. OPEN: the value stored for the instance's blank cards (probe below).
- ROM: `func_0025A070` is ROM `0x253540` (disc is kind 1 in ROM, no HDD kind; card ids identical: 2/6 -> 3, 3/7 -> 4, else 2). ROM disc jump table at ROM `0x2C5800` (12 entries, read): idx 0,1 -> 5; 2,3 -> 6; 4 -> 7; 5..8 -> 0; 9 -> 7; 10 -> 0; 11 -> 7. ROM `func_0025A120` is `0x2535D0`. The ROM's `browser_osdpic_icon_related` is inlined in a function with frame > 0xC04 (call at ROM `0x23B824`).

## 2. The .ico format as the EE code reads it

Parsed in `module_browser_23B130` HDD `0x23B130` (size 0xC94; ROM `0x2376B8`, same header checks and limits ladder at ROM 0x237730, 0x2377CC..0x237804). Animation block by `func_0023AA08` HDD `0x23AA08` (ROM `0x237048`, 2 words differ), RLE by `func_0023BDC8` HDD `0x23BDC8` (ROM `0x238218`, identical), interpolation by `func_0023AEB8` HDD `0x23AEB8` (ROM `0x2374F8`, identical). Chain: `module_browser_23AFC8` HDD `0x23AFC8` (ROM `0x237608`) calls `0x23B130(a0 = buf0, a1 = buf1, a2 = icon data, a3 = max size, t0 = slot, t1 = &outWords, t2 = &outBytes)`.

Offsets are from the start of the expanded member (= the pointer `GetResourceData` returns = a2). Table columns: offset, size, field, how the EE reads it (HDD addresses).

| offset | size | field | how the EE reads it |
|---|---|---|---|
| 0x00 | u32 | magic 0x00010000 | lw t3,0(s7); beq t3, 0x10000 at 0x23B194, else return -1 |
| 0x04 | u32 | shape count S (1, 2, 4, 6, 8) | sltiu <9 at 0x23B1A8; stored to D_0041EEB0+4+4*slot (0x23B1F0); only 1,2,4,6,8 accepted (0x23B238..0x23B27C) |
| 0x08 | u32 | texture type T | bit0 shifted left 18 into a GIF-tag word (0x23B320..0x23B330); bit2 = has texture (0x23B314, also shifted left 19, 0x23B348); bit3 = RLE (0x23B368). Seen: 3 (no texture), 7 (raw), 15 (RLE). Bit1 is never tested |
| 0x0C | f32 | header float | c.lt.s f0,0 at 0x23B21C: negative -> fail; else stored to D_002A8100 + slot*0xE0 + 0x40 (0x23B238). Seen: 0, 0.3 (0x3E99999A), 1.0, 1.5 |
| 0x10 | u32 | vertex count V | V mod 3 == 0 (0x23B2BC); V <= 0x708 (S=1), 0x672 (2), 0x5DC (4), 0x546 (6), 0x4B0 (8) (0x23B240..0x23B290); V*(8S+16) <= remaining (0x23B2F8) |
| 0x14 | V*(8S+16) | vertex records | below |
| 0x14 + V*(8S+16) | anim block | below | func_0023AA08(a0 = s7) at 0x23BA80 |
| after anim | texture | 0x8000 bytes raw (T=7), or u32 csz + RLE (T=15); none for T=3 | branch on bit3 of T at 0x23BB24 |

Vertex record (stride 8S + 16, V times; code 0x23B4F0..0x23B9FC):
- S shape positions, 8 bytes each: lh x, lh y, lh z at +0, +2, +4 (+6 never read), cvt.s.w times 0x3A800000 (2^-10) (0x23B4F8), stored as a float quadword (x, y, z, 1.0) (w = 0x3F800000, 0x23B54C). Per position `module_browser_23A450` (vmini/vmax) folds it into the box at `D_00426D40 + slot*32` (min) / +0x10 (max); the initial box is written by `23AFC8` (0x23B058..0x23B084) at `D_0041EEB0 + 0x7E90 + slot*32`: min (10, 0, 10, 1), max (-10, -20, -10, 1). `func_0023B0C0` copies the two vectors out for the cull.
- normal, 8 bytes at offset 8S: lh x, y, z times 0x39800000 (2^-12) (0x23B5C4), quad (x, y, z, 1.0).
- uv, 4 bytes at offset 8S + 8: two halfwords times 2^-12, quad (u, v, 1.0, 0) (0x23B630..0x23B654).
- colour, 4 bytes at offset 8S + 12: lbu r, g, b, a -> floats 0..255, quad (r, g, b, a) (0x23B660..0x23B6A0).
- So VU1 gets S + 3 quadwords per vertex. Chunking: vertices per UNPACK packet = 3 * floor(floor(0x1F0 / (S + 6)) / 3) (0x23B30C..0x23B3A0; 69 for S = 1), plus a remainder packet (0x23B714). Packet words 0x6C018000 | ..., 0x01000404, 0x17000000 (read, not fully decoded).

Animation block (`func_0023AA08`), words from a0:
- +0x00 u32 animation count: must be 1 (sltiu <2 and non-zero, 0x23AA2C..0x23AA3C).
- per animation: +0x04 u32 frame length -> [t6+0]; +0x08 f32 speed -> [t6+4]; +0x0C u32 play offset -> [t6+8]; +0x10 u32 frame count F, must be <= 8 (0x23AAF4) -> [t6+0xC].
- per frame from +0x14: u32 shape id (must be <= S, 0x23AB34), u32 key count K (must be <= 10, 0x23AB50), then K pairs (f32 time, f32 value). Frame record = 8 + 8K bytes (0x58 bytes max in the table).
- The consumed word count is written through the output pointer (sw t8, 0(s3) at 0x23ABE4); s7 advances by it (0x23BAA4). Parsed table: `D_0041EF64 + 0x2D8*slot`.
- Runtime: `func_0023ACC0` HDD `0x23ACC0` (ROM `0x237300`, 3 words differ): t = ((time * speed) + playOffset + offset) mod frameLength, then per frame weight[shapeId] = `func_0023AEB8(keys, K, t)` (linear between keys, clamps to first/last) into `D_002A8100 + slot*0xE0`.

Texture:
- T=7: 0x8000 raw bytes copied into the packet (0x23BB48..0x23BB94, or an aligned ld/sd loop 0x23BBAC..0x23BBD8). 128 x 128 PSMCT16 (INFER from 0x8000 bytes and the TEX0 set-up, section 3).
- T=15: u32 csz, then csz bytes of RLE: `func_0023BDC8(src + 4, csz, dest, &outBytes)` (0x23BC04) and the result must be exactly 0x8000 (0x23BC10 beq v1, 0x8000), else the slot is released. RLE (READ, 0x23BDC8..0x23BEA0) on signed halfwords n: n > 0 -> the next u16 repeated n times; n < 0 -> |n| literal u16 follow; n == 0 -> one u16 skipped. Input length is csz / 2 halfwords.
- MEASURED-OFFLINE (`lab/scout/ico_layout.mjs`): all 11 compressed members decode to exactly 32768 bytes consuming exactly csz/2 halfwords; every member's layout (header, vertex block, animation block of 1 animation / 1 frame / 1 key, texture) ends within 0..6 bytes of its expanded size (4-byte padding). Per member (T, V, vertexEnd, animEnd): DISC 15,288,6932,6968; CDDA 7,144,3476,3512; PS1M 15,396,9524,9560; PS2M 7,300,7220,7256; PKST 15,726,17444,17480; PS1D 15,288,6932,6968; PS2D 15,288,6932,6968; DVDD 15,288,6932,6968; YSYS 15,36,884,920; FSCE 15,36,884,920; FNOR 15,36,884,920; FBRK 3,36,884,920; QUES 3,672,16148,16184; FHDD 7,156,3764,3800; FDIR 7,1500,36020,36056; FFIL 7,36,884,920. All have S = 1. Animation frame length: DISC 59, PS1D/PS2D/DVDD 59, FSCE/FNOR/FBRK 1440, FHDD/FDIR/FFIL 1, others 99; speed 1.

## 3. Texture size, PSM, GS address

`func_00256DE0` HDD `0x256DE0` (ROM equivalent not confirmed): args (a0 DBP u16, a1 PSM u8, a2 DBW u16, a3 src, t0 bytes, t1 dsax, t2 dsay, t3 rrw, stack 0xB0 rrh). FlushCache(0), VIF1 packet with `sceVif1PkRefLoadImage` (call 0x256E9C, bytes/16 qwords), `sceDmaSync`, `sceDmaSend` (0x256EE0) on the channel in `D_003706A0`. `sceVif1PkRefLoadImage` HDD `0x27DCC8` (`core/`): GIF A+D BITBLTBUF(0x50) = DBP at bit 32, DBW at bit 48, PSM at bit 56; TRXPOS(0x51) = dsax at bit 32, dsay at bit 48; TRXREG(0x52) = rrw | rrh at bit 32; TRXDIR(0x53) = 0; then REF chunks of at most 0x7FFF qwords with 0x51000001 DIRECTHL words. It serves other textures, not the icons.

The icon texture path (READ):
- The icon texture is re-uploaded on every draw, inside the draw chain; it is not loaded once.
- Texture-state packet: `func_0023A708(dbp)` HDD `0x23A708` (ROM `0x236D48`, 3 words differ), called as `func_0023A708(0x3A98)` from `func_002567D0` at 0x256960 (`addiu a0, zero, 0x3A98` in the delay slot; ROM `0x24FF84`). It overwrites two qwords of a static GIF A+D chain at HDD `0x2A8010..0x2A80B0` (ROM `0x277190`; chain NLOOP 7: ALPHA(0x42), TEXFLUSH(0x3F), TEX0_1(0x06), TEX1_1(0x14), BITBLTBUF(0x50), TRXPOS(0x51)=0, TRXREG(0x52)=0x80 | 0x80 at bit 32; ELF words at 0x2A8010..0x2A80AC):
  - `D_002A8050` (TEX0_1 data) = (0x1C208000 or dbp) or (0xE000 shifted left 17): TBP0 = dbp, TBW = 2, PSM = 2 (PSMCT16), TW = 7, TH = 7 (128 x 128).
  - `D_002A8070` (BITBLTBUF data) = dbp at bit 32 | 0x8080 shifted left 42: DBP = dbp, DBW = 2, DPSM = 2.
  - It starts DMA1 (CHCR = 0x145 at 0x10009000) and polls CHCR bit 8.
  - So DBP = 0x3A98 (15000) for every icon draw. 15000 mod 32 = 24: not page aligned. 128 blocks = 0x8000 bytes, bytes 0x3A9800..0x3B1800 of GS memory.
- The image data: `0x23B130` builds, for textured slots, a packet at buf1 (buf1 = D_00370830 + slot*0x9000, HDD 0x9D0000 + slot*0x9000; offsets from buf1): +0x0C VIF word 0x51000804 (DIRECTHL imm 0x804); +0x10 GIF tag (0x8002, 0x10000000, 0xE: NLOOP 2, EOP, A+D); +0x20 A+D TEXFLUSH(0x3F); +0x30 A+D TRXDIR(0x53) = 0; +0x40 GIF IMAGE tag (0x8800, 0x08000000: NLOOP 0x800, EOP, FLG 2); texture bytes at buf1 + 0x50 (0x8000 bytes, packet total 0x8050). The slot's DMA table (`D_0041EEB0 + 0x7DD4 + 4*slot` holds a pointer to it): tag 0 = REF with QWC 0x805 ((0x2014 >> 2) or 0x30000000) and ADDR buf1 & 0x0FFFFFFF for textured icons, QWC 0 otherwise (0x23BC68..0x23BC98); tag 1 at entry +0x30 = REF of buf0 with QWC = words/4 (0x23BD68..0x23BD88). Entry +0x10/+0x14 is copied from `D_002BA120` (qword pair chosen by S; zero in the ELF file image, so written at run time: OPEN).
- Draw kick: `func_0023A7F8(slot)` HDD `0x23A7F8` (ROM `0x236E38`, 1 word differs): needs word `D_0041EEB0+4+4*slot` nonzero, TADR = word at `D_0041EEB0+0x7DD4+4*slot` & 0x0FFFFFFF, CHCR = 0x145 (0x23A870), `sceGsSyncPath`. This is when the texture reaches the GS.
- Camera/projection: `func_0023A478(matrixB)` HDD `0x23A478` (ROM `0x236AB8`, 3 words differ) copies 16 floats to `D_002A7F38` (ROM `0x2770B8`), points TADR at the static chain `D_002A5A40` (REF 5 qw at 0x2A7F30, REF 9 qw at 0x2A7F80, REF 0x3C qw at 0x2A6B10 = VU1 microprogram, REF 0xE qw at 0x2A80B0), starts DMA1 (0x23A540..0x23A560), syncs. `func_0023A898(slot, matrixA)` HDD `0x23A898` (ROM `0x236ED8`) copies 16 floats to `D_002A80B8 + slot*0xE0` (ROM `0x277238`).

Draw entry `func_002567D0` HDD (ROM `0x24FF30`): checks `D_004DA780[slot] != 0` (ROM flags `0x2AEDD0`). HDD only: `func_0023B0C0(slot, sp)` (box), `sceVu0MulMatrix(sp+0x20 = B x A)`, `sceVu0RotTransPersN(sp+0x60, sp+0x20, D_004DA700, 8, 0)`; if any of the 8 results is outside the window tested at 0x256910..0x256948 it returns without drawing. Then `func_0024C200(1, 2)` (ROM `0x245BF0`), `0x23A708(0x3A98)`, `0x23A478(B)`, `0x23A898(slot, A)`, `0x23ACC0(slot, time, offset)`, `0x23A7F8(slot)`. Callers of `0x2567D0` (HDD): `0x241B30` (3 sites), `0x258F38`, `0x259240`, `browser_cdplayer_related7`.

## 4. What a verifier must probe

Constants: HDD slot table `D_0041EEB0 = 0x41EEB0` (ROM `0x38AE80`); slot flags `D_004DA780` (ROM `0x2AEDD0`); 44 slots (slot < 0x2C). buf0 = D_0037082C + slot*0x48000 with D_0037082C = 0xB5C000; buf1 = D_00370830 + slot*0x9000 with D_00370830 = 0x9D0000 (both set by `module_browser_256728`, HDD `0x256728`: lui 0xB5 / ori 0xC000, lui 0x9D). The ROM buffer bases are gp-relative words (ROM `lw v1,-0x7164(gp)` and `lw v0,-0x7160(gp)` at ROM `0x237660` / `0x237664`); their values are not read: OPEN.

Probes (HDD first, then ROM):
1. Icon load: pc `0x0023AFC8` / `0x00237608`. a0 = slot, a1 = pointer returned by the getter (the expanded member in EE RAM), a2 = max size (HDD 0x51000; the ROM caller uses `lui a2,5` = 0x50000). Ranges: the resource table slice HDD `0x2AD630` (= 0x2AD240 + 16*62), 0x100 bytes; ROM `0x27B8B8` (= 0x27B478 + 16*69), 0xD0 bytes, so the verifier can recompute dest. The member bytes need a FIXED address (probe ranges are fixed addresses): capture once with the table range, read dest, then pin range(dest, expandedSize) and assert the same trace's table gives that dest. OPEN: dests. An allocator model from bump = 0x18F0000 disagrees with the sound verifier's data window (HDD 0x1C72A10), so I give no predicted dests.
2. Builder entry: pc `0x0023B130` / `0x002376B8`: a0 buf0, a1 buf1, a2 icon data, a3 size, t0 slot (HDD: moved to t7; ROM: stored at 0x20($sp)). Compare the header words, V, S and stream sizes with the member.
3. Builder exit: pc `0x0023BD94` (epilogue `ld ra`; v0 = 0 ok / -1 fail) / ROM `0x002381E8`. Ranges: buf0 for words*4 bytes (s3 at exit = words), the slot table entry at D_0041EEB0 + 0x7DD4 + 4*slot (ROM 0x38AE80 + 0x7DD4 + 4*slot), and buf1 for 0x8050 bytes on textured icons. Expected: the quadword stream of section 2; the texture bytes at buf1 + 0x50 equal the member's raw bytes or its RLE-decoded 0x8000 bytes.
4. Draw entry (the "T&L entry"): pc `0x002567D0` / `0x0024FF30`: a0 slot, a1 -> matrix A (16 floats, on the stack), a2 -> matrix B (stack), a3 time (signed int), t0 offset. The vertex pointer and count are NOT here (correction 2). The matrices are stack pointers, so probe them after the copies: pc `0x0023A550` / ROM `0x00236B90` (after FlushCache in 0x23A478; ROM = 0x236AB8 + (0x23A550 - 0x23A478)), range `D_002A7F38` 0x40 bytes (ROM `0x2770B8`); and pc `0x0023ACC0` / `0x00237300` (entry of the animation function, which runs after 0x23A898), range `D_002A80B8` 0x2680 bytes (44 slots, stride 0xE0; ROM `0x277238`). The weights written by the animation function are at `D_002A8100 + slot*0xE0` (ROM `0x277280`).
5. Texture state: pc `0x0023A7B0` (after the FlushCache call and its delay-slot store in 0x23A708) / ROM `0x00236DF0` (= 0x236D48 + 0xA8), range HDD `0x2A8010`, 0xA0 bytes (ROM `0x277190`). Expected: the TEX0 qword at 0x2A8050 and the BITBLTBUF qword at 0x2A8070 as in section 3; a0 at the entry of 0x23A708 / 0x236D48 = 0x3A98.
6. GS result: after the frame, the block at DBP 0x3A98, PSMCT16, DBW 2, 128 x 128. OPEN: the PSMCT16 swizzle with a non-page-aligned DBP (`extract_textures.mjs` has only the PSMCT32 and 4-bit address functions). A cheaper exact check: compare probe 3's IMAGE data (buf1 + 0x50, or the DMA data records of a `--mode trace` capture) with the decoded member; use GS memory as a second witness.

GS memory read mechanisms:
- `watson_gs_read` with a path argument writes the raw 4 MB of GS local memory to that path (stability loop in `References/scripts/flow_buffers_sends.mjs:116-125`; the capture skill says: pause at a breakpoint under the recompilers, then watson_gs_read).
- A `.gs` dump (`Watson/Runtime/captures/<name>.gs`) holds the 4 MB at the start of its state block: headerSize = u32 at offset 4, stateSize = u32 at offset 12, memory = bytes [8 + headerSize + stateSize - TAIL - 0x400000, 8 + headerSize + stateSize - TAIL), TAIL = (16+4)*4 + 4 = 84 (`extract_textures.mjs:20-28`). It is the GS memory at the dump's first frame, not at the end.

## 5. Reaching the Browser in a capture (corrected after checking the trace)

- Existing captures DO contain Browser frames. `hddosd-110U-trans-return` is a trace + .gs covering frames 2008..2464 (MEASURED, frame keys of the trace). Per `facts/clock-transitions.md:94` the clock restarts 99 frames after the second Circle (T0 = 2105), so frames 2008..~2104 are the Browser (HDD-error dialog up, device row behind). `rom-0230A-trans-return` (frames 2307..) likewise. I first wrote the opposite; that was wrong.
- MEASURED in the HDD trace: DIRECTHL data records of size 32832 (= 0x8040: GIF IMAGE tag + 0x8000 bytes, the packet from buf1 + 0x10), at EE addresses 10362896 = 0x9E2010 (slot 2: 0x9D0000 + 2*0x9000 + 0x10) and 10399760 = 0x9EB010 (slot 3), and a `packet` record on path 2 whose bytes start `00880000 00000008 ...` (IMAGE tag 0x8800 / 0x08000000) followed by the texture. This confirms the packet layout of section 3 (tag at buf1 + 0x10, texture at buf1 + 0x50) and the slot buffers of section 4. The other scout's reading (`browser-ico-scout.md`) matched these uploads to the decoded ICOBFHDD (slot 2) and ICOBPS2M (slot 3) 276 of 276 times; I did not repeat that comparison.
- `hddosd-110U-sound-menu-cross-browser` is trace-only, frames 1622..1698 (header pad 5:6:cross), the start of the leave only; it contains no Browser frames. Manifest: only trans-return entries (`run_all.manifest.json` lines 111, 132, 5563, 6274, 6288, 6360, 6402).
- Entering the Browser (capture skill, `capture.mjs` header, `facts/clock-transitions.md:94,96,436`, plan Task 2): `capture.mjs --mode exact --build hdd --state menu --frames N --verifiers ... --presses` with a JSON array of [button, heldFrames, waitFrames] triples starting with cross on the first main-menu item; on HDD OSD the HDD-error dialog shows first, Circle dismisses it, a second Circle returns to the clock; ROM goes straight to the Browser and one Circle returns. Other flags: `--mode exact|trace|fast`, `--navigate fast`, `--pad`, `--writes`, `--hold`, `--state menu|config|clock`, `--build hdd|rom`. The plan's BootBrowser state is not in `Watson/Runtime/states`.
- No existing capture contains a load (the other scout checked the origin stacks for 0x23AFC8 and 0x23B130 over both traces); the loads happen between P + 131 and the first frame of trans-return, so a new capture from --state menu is needed for probe 1 and probe 2 of section 4.

## Positive controls
- Container/Expand: 13/13 members equal the BIOS's plain ICOIMAGE after Expand; `resources/ICOIMAGE` equals the dump's after decrypt; the ROM ROMDIR is parsed with the same functions.
- Capture: the packet layout read in `0x23B130` predicts the traced DIRECTHL records (size 0x8040 from buf1 + 0x10, slots 2 and 3 at 0x9E2010 and 0x9EB010).
- ROM search: `find_in_rom.mjs` finds known functions (23bdc8 16/16; 23aeb8, 23acc0, 23aa08, 23a7f8 15/16) and `diff_rom.mjs` confirms them with 0..3 words differing. `0x23B130`, `0x23AFC8`, `0x2567D0`, `0x23F970` show only 2..5/16 heads (different code layout), so I located them by constants and call graph: ROM `0x2376B8` has the same header checks as HDD `0x23B130`; ROM `0x24FF30` is the only function calling ROM 0x236D48, 0x236AB8, 0x236ED8, 0x237300, 0x236E38 in sequence.
- Not-found claims: (a) `func_00256DE0` is not in the icon path: the grep over `asm/browser` finds its 4 callers (and finds `func_002567D0`'s callers the same way), none inside 0x23A4xx..0x23BDxx or 0x2567D0; (b) the ROM string "osdpic" is not found: the dump covers only 0x100000..0x300000 (the same scan finds the resource names via the table in that range).

## Open
- The dest EE addresses of the members (runtime table, probe 1) and the ROM buffer bases (gp words).
- `D_002BA120` contents at run time; the exact UNPACK packet words of the vertex stream (partly read); the VU1 microprogram at HDD `0x2A6B10`.
- Whether the HDD tile and header icons are loaded before the dialog (the trans-return draws show FHDD and PS2M only); the word at `D_002BB938+0x42C+4*i` for the blank cards.
- PSMCT16 address mapping for DBP 0x3A98 when reading GS memory (the other reading gives a BLOCK16 table in its section 5).
- Which callers load ICOBYSYS (8), ICOBFSCE (9), ICOBFNOR (10), ICOBQUES (12), ICOBCDDA (1); not on the device row.
- ROM equivalent of `func_00256DE0` and the other ROM call sites of the getter.
