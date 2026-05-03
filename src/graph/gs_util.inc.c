/**
 * @file gs_util.c
 * @brief GS (Graphics Synthesizer) Utility Functions
 *
 * Reconstructed from Ghidra decompilation of GS-related helper functions.
 * These handle VRAM allocation, pixel format conversion, and texture
 * parameter computation for the PS2 GS hardware.
 *
 * GS VRAM is organized in 256-byte pages (8KB blocks).
 * Width alignment depends on pixel format (PSM):
 *   - PSMCT32: 64 pixels per row
 *   - PSMCT16: 64 pixels per row
 *   - PSMT8:   128 pixels per row
 *   - PSMT4:   128 pixels per row
 */

#include <tamtypes.h>

/* GS VRAM allocation pointer (in 256-byte pages) */
/* 0x gp-0x7874 */ static int g_gs_vram_ptr;

/* Current pixel storage mode */
/* 0x gp-0x7870 */ static u32 g_gs_current_psm;

/**
 * GetTexExponent — Calculate texture dimension exponent (log2 ceiling)
 *
 * Returns the smallest n such that 2^n >= dimension.
 * Used to compute TW/TH fields for GS TEX0 register.
 *
 * GS TEX0 expects texture dimensions as power-of-two exponents:
 *   TW = GetTexExponent(width)   → TEX0[29:26]
 *   TH = GetTexExponent(height)  → TEX0[33:30]
 *
 * @param dimension  Texture width or height in pixels
 * @return           Exponent (0-10), 0 if dimension <= 1
 *
 * Ghidra: GetTexExponent @ 0x002079c0
 *
 * Max supported: 2^10 = 1024 pixels (GS hardware limit)
 */
u32 GetTexExponent(int dimension)
{
    u32 exp;

    if (dimension <= 1) {
        return 0;
    }

    for (exp = 1; exp < 11; exp++) {
        if ((1 << exp) >= dimension) {
            return exp;
        }
    }

    return 0; /* Shouldn't reach here for valid textures */
}

/**
 * gsAllocBuffer — Allocate VRAM pages for a framebuffer or texture
 *
 * Computes the number of 256-byte GS pages needed for a buffer of
 * the given dimensions and pixel format, then advances the VRAM
 * allocation pointer.
 *
 * @param psm     Pixel storage mode (stored for later reference)
 * @param params  Buffer parameters struct:
 *                  [+0x08] = width (pixels)
 *                  [+0x0C] = height (pixels)
 * @return        Starting page offset in VRAM (before allocation)
 *
 * Ghidra: gsAllocBuffer @ 0x00207a08
 *
 * Notes:
 * - Width is aligned to 64-pixel boundary (& ~63)
 * - BPP is determined by PSM via psmToBppEE lookup
 * - Total bytes = aligned_width * height * bpp
 * - Result is in 256-byte pages (>> 5) then 8KB blocks (>> 6)
 */
int gsAllocBuffer(u32 psm, int *params)
{
    int start_page = g_gs_vram_ptr;
    int bpp;
    int total_bytes;
    int pages;

    bpp = psmToBppEE(psm);
    g_gs_current_psm = psm;

    /* Width aligned to 64, times height, times bytes-per-pixel */
    total_bytes = ((params[2] + 63) & ~63) * params[3] * bpp;

    /* Convert to 256-byte pages, then to 8KB blocks (64 pages) */
    pages = total_bytes + 31;
    if (pages < 0) pages = total_bytes + 62;
    pages >>= 5;

    pages += 63;
    if (pages < 0) pages += 126;
    pages >>= 6;

    g_gs_vram_ptr += pages;

    return start_page;
}
