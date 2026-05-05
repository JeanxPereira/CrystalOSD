/* CrystalOSD — Graph subsystem: Font_SetLocate
 *
 * 0x00212698
 */

extern struct {
    float x;
    float y;
} D_003969B0;

void Font_SetLocate(int x, int y) {
    D_003969B0.x = (float)x;
    D_003969B0.y = (float)y;
}
