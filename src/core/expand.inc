/**
 * @file expand.c
 * @brief OSDSYS LZ77-variant decompression (Expand family)
 *
 * Reconstructed from:
 *   - Ghidra decompilation of Expand/ExpandInit/ExpandMain
 *   - PS2 community wiki documented algorithm
 *   - Sony patent JP2001154772A references to OSDROM module loading
 *
 * Used to decompress embedded IOP modules, icons, fonts, and other
 * resources stored in compressed form within the OSDSYS ELF.
 *
 * Algorithm: LZ77-variant with 32-bit block descriptors
 *   - Each block descriptor controls 30 operations
 *   - 2 LSBs encode variable window/length parameters
 *   - Literal bytes or back-reference copies per operation
 */

#include <string.h>

/* Global state for decompression context */
static const unsigned char *g_expand_src;
static unsigned char *g_expand_dst;
static int g_expand_src_offset;
static int g_expand_dst_offset;
static int g_expand_length;

/**
 * ExpandInit - Initialize decompression state
 *
 * Reads the 4-byte little-endian decompressed size from the source
 * buffer header and sets up internal state for ExpandMain.
 *
 * @param src  Pointer to compressed data (starts with 4-byte LE length)
 * @param dst  Pointer to output buffer (must be pre-allocated)
 */
void ExpandInit(const unsigned char *src, unsigned char *dst)
{
    g_expand_src = src;
    g_expand_dst = dst;
    g_expand_src_offset = 4; /* skip the 4-byte length header */
    g_expand_dst_offset = 0;

    /* Read decompressed length (little-endian 32-bit) */
    g_expand_length = (int)(src[0] | (src[1] << 8) |
                            (src[2] << 16) | (src[3] << 24));
}

/**
 * ExpandMain - Perform the actual decompression
 *
 * LZ77-variant algorithm with block descriptors:
 * - Every 30 operations, reads a new 32-bit block descriptor (big-endian)
 * - The 2 LSBs of the descriptor encode 'state_n', which controls
 *   the split between match offset bits and match length bits
 * - Each bit in the descriptor (bits 2-31) indicates whether the
 *   corresponding operation is a literal (0) or back-reference (1)
 *
 * Back-reference encoding (16 bits):
 *   - state_shift = 14 - state_n  (length bits)
 *   - state_mask  = 0x3FFF >> state_n  (offset mask)
 *   - offset = (h & state_mask) + 1  (distance back from current pos)
 *   - length = (h >> state_shift) + 3  (minimum copy of 3 bytes)
 *
 * @param dst  Output buffer (same as passed to ExpandInit)
 * @return     Number of bytes written to dst
 */
int ExpandMain(unsigned char *dst)
{
    const unsigned char *src = g_expand_src;
    int src_off = g_expand_src_offset;
    int dst_off = g_expand_dst_offset;
    int length = g_expand_length;

    int run = 0;
    unsigned int block_desc = 0;
    int state_n = 0;
    int state_shift = 0;
    int state_mask = 0;

    while (dst_off <= length) {
        /* Read new block descriptor every 30 operations */
        if (run == 0) {
            run = 30;
            block_desc = 0;

            /* Read 32-bit block descriptor (big-endian) */
            block_desc  = (unsigned int)src[src_off++] << 24;
            block_desc |= (unsigned int)src[src_off++] << 16;
            block_desc |= (unsigned int)src[src_off++] << 8;
            block_desc |= (unsigned int)src[src_off++];

            /* Extract variable parameters from 2 LSBs */
            state_n     = block_desc & 3;
            state_shift = 14 - state_n;
            state_mask  = 0x3FFF >> state_n;
        }

        /* Check if this operation is literal (0) or back-reference (1) */
        if ((block_desc & (1u << (run + 1))) == 0) {
            /* Literal byte copy */
            dst[dst_off++] = src[src_off++];
        } else {
            /* Back-reference: read 16-bit match descriptor */
            unsigned int h;
            int copy_offset;
            int match_len;
            int i;

            h  = (unsigned int)src[src_off++] << 8;
            h |= (unsigned int)src[src_off++];

            copy_offset = dst_off - ((h & state_mask) + 1);
            match_len   = 2 + (h >> state_shift);

            /* Copy match_len + 1 bytes from back-reference */
            for (i = 0; i <= match_len; i++) {
                dst[dst_off++] = dst[copy_offset++];
            }
        }

        run--;
    }

    return dst_off;
}

/**
 * Expand - Top-level decompression entry point
 *
 * Wrapper that calls ExpandInit + ExpandMain.
 * Returns the decompressed size.
 *
 * @param src  Compressed data buffer
 * @param dst  Output buffer
 * @return     Decompressed size in bytes
 */
int Expand(const unsigned char *src, unsigned char *dst)
{
    ExpandInit(src, dst);
    return ExpandMain(dst);
}
