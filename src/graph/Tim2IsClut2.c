/* CrystalOSD — Graph subsystem: Tim2IsClut2
 *
 * 0x00266C00
 * lbu $v0, 0x11($a0); sltiu $v0, $v0, 1; jr $ra
 */
int Tim2IsClut2(void *pic) {
    unsigned char type = *(unsigned char *)((int)pic + 0x11);
    return type < 1;
}
