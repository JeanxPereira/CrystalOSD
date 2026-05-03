#include <tamtypes.h>

extern int psmToBppGS(int psm);
extern int screenW;
extern int screenH;

static int g_gs_vram_ptr;
static u32 g_gs_current_psm;

/* 0x0021C360 - GetTexExponent */
u32 GetTexExponent(int dimension)
{
    u32 result = 0;

    if (1 < dimension) {
        int one = 1;
        int exp = 1;
loop:
        if (exp < 11) {
            if ((one << exp) < dimension) {
                exp++;
                goto loop;
            }
            result = exp;
        }
    }

    return result;
}

/* 0x0021C3A8 - gsAllocBuffer */
int gsAllocBuffer(u32 psm, int *params)
{
    int start_page = g_gs_vram_ptr;
    int bpp;
    int total_bytes;
    int pages;

    bpp = psmToBppGS(psm);
    g_gs_current_psm = psm;

    total_bytes = ((params[2] + 63) & ~63) * params[3] * bpp;
    pages = (total_bytes + 31) / 32;
    pages = (pages + 63) / 64;
    g_gs_vram_ptr += pages;

    return start_page;
}

/* 0x0021CDB8 - gsInitAlloc */
void gsInitAlloc(void)
{
    int n;

    g_gs_current_psm = (u32)-1;
    n = screenW * screenH;
    g_gs_vram_ptr = (n / 64) * 3;
}
