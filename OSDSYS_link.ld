/* CrystalOSD link script — handcrafted to match original layout
 *
 * Original ELF layout (from readelf -l):
 *   LOAD 0x1000 → 0x200000, FileSiz=MemSiz=0x3ae819 RWE
 *   Single PT_LOAD covering EVERYTHING (text+data+rodata+sdata+bss+module_storage)
 *   bss is materialized in file as zeros, NOT NOLOAD
 *
 * Section layout (vaddrs from splat segment offsets):
 *   0x200000 - 0x2A47A0   .text       (texttmp)
 *   0x2A47A0 - 0x3477E0   .data       (texttmp.data + datasect)
 *   0x3477E0 - 0x36F980   .rodata     (texttmp.rodata + rodatasect)
 *   0x36F980 - 0x3709A0   .sdata      (sdatasect)
 *   0x3709A0 - 0x370C98   .sbss       (sbsssect)
 *   0x370C98 - 0x50A780   .bss        (bsssect + texttmp.bss)  [HUGE — 1.6MB]
 *   0x50A780 - 0x5AE830   .module_storage
 */

INCLUDE undefined_syms_auto.txt
INCLUDE undefined_funcs_auto.txt

SECTIONS
{
    _gp = 0x377970;

    .main 0x200000 : SUBALIGN(8)
    {
        FILL(0x00000000);

        main_TEXT_START = .;
        build/asm/texttmp.s.o(.text)
        main_TEXT_END = .;

        main_DATA_START = .;
        build/asm/texttmp.s.o(.data)
        build/asm/data/datasect.data.s.o(.data)
        main_DATA_END = .;

        main_RODATA_START = .;
        build/asm/texttmp.s.o(.rodata)
        build/asm/data/rodatasect.rodata.s.o(.rodata)
        main_RODATA_END = .;

        main_SDATA_START = .;
        build/asm/data/sdatasect.sdata.s.o(.sdata)
        main_SDATA_END = .;

        main_BSS_START = .;
        build/asm/texttmp.s.o(.bss)
        build/asm/data/sbsssect.bss.s.o(.bss)
        build/asm/data/bsssect.bss.s.o(.bss)
        main_BSS_END = .;

        main_MODSTOR_START = .;
        build/asm/data/module_storage.s.o(.data)
        main_MODSTOR_END = .;
    }

    /DISCARD/ :
    {
        *(.MIPS.abiflags)
        *(.reginfo)
        *(.pdr)
        *(.gnu.attributes)
        *(.note*)
        *(.comment)
        *(.mdebug*)
    }
}
