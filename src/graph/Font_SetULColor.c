/* CrystalOSD — Graph subsystem: Font_SetULColor
 *
 * 0x00213A54
 */

typedef struct {
    int pad[1060];
    int r;   /* 0x1090 */
    int g;   /* 0x1094 */
    int b;   /* 0x1098 */
    int a;   /* 0x109C */
} FontContext;

extern FontContext D_003969B0;

void Font_SetULColor(int r, int g, int b, int a) {
    D_003969B0.a = a;
    D_003969B0.r = r;
    D_003969B0.g = g;
    D_003969B0.b = b;
}
