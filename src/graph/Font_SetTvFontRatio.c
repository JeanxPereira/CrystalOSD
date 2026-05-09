/* 0x002127E0 - Font_SetTvFontRatio */
extern int D_003969B0;

void Font_SetTvFontRatio(float ratio)
{
    int *base = (int *)&D_003969B0;
    float result = ratio * 0.5f;

    base[0x10B4 / 4] = 1;
    *(float *)((int)base + 0x1024) = result;
}
