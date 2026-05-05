/* CrystalOSD — Graph subsystem: psmToBppGS
 *
 * 0x0021C170
 */
#include <tamtypes.h>

int psmToBppGS(u32 psm) {
    int bpp = 0;

    switch (psm) {
        case 0:
        case 1:
        case 3:
        case 4:
        case 5:
        case 0x1B:
        case 0x24:
        case 0x2C:
            bpp = 32;
            break;
        case 2:
            bpp = 16;
            break;
        case 0x13:
            bpp = 8;
            break;
        case 0x14:
            bpp = 4;
            break;
    }

    return bpp;
}
