/* 0x0021B128 - OpeningInitRender */

extern void sceDevVif0Reset(void);
extern void sceDevVu0Reset(void);
extern void sceDevVif1Reset(void);
extern void sceDevVu1Reset(void);
extern void sceDevGifReset(void);
extern void sceGsResetPath(void);
extern void *memset(void *s, int c, unsigned int n);
extern void InitDMA(void);
extern void InitSPR(void);
extern void InitDoubleBuffer(void);
extern void gsInitAlloc(void);
extern void gsAllocExtraBuffers(void);
extern void OpeningInitTextures(void);

void OpeningInitRender(void)
{
    sceDevVif0Reset();
    sceDevVu0Reset();
    sceDevVif1Reset();
    sceDevVu1Reset();
    sceDevGifReset();
    sceGsResetPath();
    memset((void *)0x1100c000, 0, 0x4000);
    InitDMA();
    InitSPR();
    InitDoubleBuffer();
    gsInitAlloc();
    gsAllocExtraBuffers();
    OpeningInitTextures();
}
