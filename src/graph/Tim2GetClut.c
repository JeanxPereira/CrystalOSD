/* CrystalOSD — Graph subsystem: Tim2GetClut
 *
 * 0x00266C04
 * ASM: lhu $v0,0xE($a0); bnel $v0,$zero,.L; lhu $v0,0xC($a0);
 *      jr $ra; daddu $v0,$zero,$zero;
 * .L:  lw $v1,0x8($a0); addu $v0,$a0,$v0; jr $ra; addu $v0,$v0,$v1
 */
#include <tamtypes.h>

typedef struct {
    int pad0;
    int pad1;
    u32 data_offset;   /* 0x08 */
    u16 image_size;    /* 0x0C */
    u16 clut_colors;   /* 0x0E */
} Tim2Pic;

void *Tim2GetClut(Tim2Pic *pic) {
    if (pic->clut_colors == 0) {
        return 0;
    }
    return (void *)((u32)pic + pic->image_size + pic->data_offset);
}
