/**
 * @file romdir.c
 * @brief ROMDIR — ROM Directory Search Functions
 *
 * Reconstructed from Ghidra decompilation of romdir_get_offset and
 * romdir_search_entry.
 *
 * ROMDIR is the directory structure at the beginning of the PS2 ROM
 * that indexes all embedded modules. Each entry is 16 bytes:
 *
 *   struct romdir_entry {
 *       char    name[10];    // Module name (null-terminated, padded)
 *       u16     ext_size;    // Extension info size
 *       u32     file_size;   // Module file size
 *   };
 *
 * The first entry is always "RESET" with file_size indicating the
 * total ROMDIR table size. Entries are 16-byte aligned.
 *
 * The OSDSYS uses these functions to find and load embedded IOP modules,
 * fonts, icons, and other resources from the ROM image.
 */

#include <tamtypes.h>
#include <string.h>

/**
 * ROM directory context — tracks ROM base and ROMDIR table location
 */
typedef struct {
    u32 *rom_base;      /* Base address of ROM image */
    u32 *romdir_start;  /* Pointer to first ROMDIR entry */
    u32 *extinfo_base;  /* Base of extension info area */
} romdir_ctx_t;

/**
 * ROM search result
 */
typedef struct {
    u32 *romdir_entry;  /* Pointer to the matching entry */
    u32  data_offset;   /* Offset to module data from ROM base */
    u32  extinfo_off;   /* Offset into extension info (0 if none) */
} romdir_result_t;

/**
 * romdir_get_offset — Find the ROMDIR header in a ROM image
 *
 * Searches for the "RESET" entry which marks the beginning of the
 * ROMDIR table. The "RESET" entry's file_size field contains the
 * cumulative offset used to validate the entry is at the expected position.
 *
 * @param rom_start  Start of ROM image to search
 * @param rom_end    End boundary of ROM image
 * @param result     Output: ROM context (base, romdir start, extinfo base)
 * @return           result pointer on success, 0 on failure
 *
 * Ghidra: romdir_get_offset @ 0x001fe930
 */
romdir_ctx_t *romdir_get_offset(u32 *rom_start, u32 *rom_end, romdir_ctx_t *result)
{
    u32 cumulative_size = 0;
    u32 *entry = rom_start;

    while (entry < rom_end) {
        /* Check for "RESET" signature:
         * entry[0] = 0x45534552 = "RESE" (little-endian)
         * entry[1] = 0x00000054 = "T\0\0\0"
         * entry[2] low 16 bits = 0 (ext_size == 0)
         * entry[3] file_size (aligned to 16) must match cumulative offset
         */
        if (entry[0] == 0x45534552 &&   /* "RESE" */
            entry[1] == 0x54 &&          /* "T\0\0\0" */
            (short)entry[2] == 0 &&      /* No extension info */
            ((entry[3] + 0xF) & 0xFFFFFFF0) == cumulative_size) {
            /* Found valid ROMDIR header */
            int extinfo_offset = entry[7]; /* From ROMDIR entry at +0x1C */
            result->rom_base     = rom_start;
            result->romdir_start = entry;
            result->extinfo_base = (u32 *)((u8 *)entry + extinfo_offset);
            return result;
        }

        entry += 4;  /* Next 16-byte slot */
        cumulative_size += 0x10;
    }

    result->rom_base = 0;
    return 0;
}

/**
 * romdir_search_entry — Find a module by name in the ROMDIR
 *
 * Iterates through the ROMDIR table looking for an entry whose name
 * matches the given string. Returns the entry pointer, data offset,
 * and extension info offset.
 *
 * @param ctx     ROM context (from romdir_get_offset)
 * @param name    Module name to search for (max 10 chars, padded internally)
 * @param result  Output: entry pointer, data offset, ext offset
 * @return        result pointer on success, 0 if not found
 *
 * Ghidra: romdir_search_entry @ 0x001fe9c8
 *
 * Notes:
 * - Names are compared as 3 x 32-bit words (12 bytes, padded with zeroes)
 * - Module data starts at rom_base + cumulative_size of preceding entries
 * - Each entry's file_size is aligned to 16 bytes for the next offset
 */
romdir_result_t *romdir_search_entry(romdir_ctx_t *ctx, const char *name, romdir_result_t *result)
{
    u32 name_words[3];
    u32 *entry;
    u32 data_offset;
    u32 ext_offset;
    int i;
    u32 file_size;

    /* Pad name into 3 words (12 bytes) */
    name_words[0] = 0;
    name_words[1] = 0;
    name_words[2] = 0;

    for (i = 0; i < 12; i++) {
        char c = name[i];
        if (c <= ' ') break;  /* Stop at space or control char */
        ((char *)name_words)[i] = c;
    }

    /* Iterate ROMDIR entries */
    entry = (u32 *)ctx->romdir_start;
    data_offset = 0;
    ext_offset = 0;

    while (entry[0] != 0) {  /* Null entry name = end of ROMDIR */
        if (entry[0] == name_words[0] &&
            entry[1] == name_words[1] &&
            (short)entry[2] == (short)name_words[2]) {
            /* Name matches */
            result->romdir_entry = entry;
            result->data_offset  = ctx->rom_base[0] + data_offset;  /* Absolute? */
            result->extinfo_off  = 0;

            /* If ext_size != 0, compute extension info offset */
            if (*(short *)((u8 *)entry + 10) != 0) {
                result->extinfo_off = (u32)ctx->extinfo_base + ext_offset;
            }

            return result;
        }

        /* Accumulate offset for next entry */
        file_size = entry[3];
        ext_offset += *(short *)((u8 *)entry + 10);
        data_offset += (file_size + 0xF) & 0xFFFFFFF0;  /* Align to 16 */
        entry += 4;  /* Next 16-byte entry */
    }

    return 0;
}
