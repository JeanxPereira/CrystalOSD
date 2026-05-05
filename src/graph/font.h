#ifndef FONT_H
#define FONT_H

typedef struct {
    char pad[0x100C];
    float pitch;         /* 0x100C */
    char pad2[0x1024 - 0x100C - 4];
    float tv_ratio;      /* 0x1024 */
    float ratio;         /* 0x1028 */
    char pad3[0x1030 - 0x1028 - 4];
    float x;             /* 0x1030 */
    float y;             /* 0x1034 */
    char pad4[0x1040 - 0x1034 - 4];
    float color[4];      /* 0x1040: RGBA normalized */
    char pad5[0x1050 - 0x1040 - 16];
    int bg_color[4];     /* 0x1050: RGBA */
    char pad6[0x1090 - 0x1050 - 16];
    int ul_color[4];     /* 0x1090: RGBA */
    char pad7[0x10B4 - 0x1090 - 16];
    int flags;           /* 0x10B4 */
} FontContext;

extern FontContext D_003969B0;

#endif
