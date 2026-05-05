/* CrystalOSD — Graph subsystem: Font_SetProp
 *
 * 0x00213A78
 * Sets font proportional spacing flag.
 * lui $v0, %hi(D_003979B4); sw $a0, %lo(D_003979B4)($v0)
 */
extern int D_003979B4;

void Font_SetProp(int val) {
    D_003979B4 = val;
}
