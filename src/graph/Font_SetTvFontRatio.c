/* 0x002127E0 - Font_SetTvFontRatio */
extern int D_003969B0;

void Font_SetTvFontRatio(float ratio)
{
    float half;
    register int half_i asm("at") = 0x3f000000;
    __asm__ __volatile__ ("mtc1 %1, %0" : "=f" (half) : "r" (half_i));
    
    int *base = (int *)&D_003969B0;
    
    register float f12 asm("f12");
    __asm__ __volatile__ ("mul.s %0, %1, %2" : "=f" (f12) : "f" (ratio), "f" (half));
    
    base[0x10B4 / 4] = 1;
    *(float *)((int)base + 0x1024) = f12;
}
