/* CrystalOSD — Graph subsystem: Tim2CalcBufSize
 *
 * 0x00266BD0
 * Calculate GS buffer size in 64-byte pages.
 */
int Tim2CalcBufSize(int unused, int w, int bpp) {
    w = w * bpp;
    return w / 64;
}
