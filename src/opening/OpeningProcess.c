/* 0x0021ACD8 - OpeningProcess */

typedef struct {
    int x1;
    int y1;
    int dx;
    int dy;
} ScissorRect;

extern int OpeningProcessInner(void);
extern void vif1SetSCISSOR_1(ScissorRect *rect);

extern int D_00370004;
extern int D_00370010;

void OpeningProcess(void)
{
    ScissorRect dst;
    ScissorRect src;
    int *a0;
    int v0;

    a0 = (int *)0x1F0000;
    src.x1 = 1;
    src.y1 = 1;
    src.dx = a0[0xCB4 / 4] - 2;
    src.dy = a0[0xCB8 / 4] - 2;
    dst = src;

    v0 = OpeningProcessInner();

    if (v0 != D_00370004) {
        D_00370010 = D_00370010 + 1;
    }

    vif1SetSCISSOR_1(&dst);
}
