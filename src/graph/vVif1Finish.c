/* CrystalOSD — Graph subsystem: vVif1Finish
 *
 * 0x0021CCE8
 * Debug stub that prints message and returns 0.
 */
extern int scePrintf(const char *, ...);

int vVif1Finish(void) {
    scePrintf("vVif1Finish\n");
    return 0;
}
