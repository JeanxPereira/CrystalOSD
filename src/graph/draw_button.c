typedef unsigned long long u64;

extern int thunk_config_get_osd_language(void);
extern void func_002341C8(int, int, int, int);
extern void Font_SetRatio(float);
extern int get_vidmode_with_fallback(void);
extern u64 get_lang_string_GetOSDString_hkdosd_p2_tgt(int);
extern void DrawIcon(int, int, int, int);
extern int func_00213EE8(u64 str);
extern void DrawNonSelectableItem(int x, int y, int colors, int height, u64 str);

extern float D_0036FB98;

extern int D_002B2178[];
extern int D_002B2300[];
extern int D_002B2318[];
extern int D_002B2470[];
extern int D_002B24F0[];
extern int D_002B2460[];

#define _evenOddFrame (*(int*)0x001F0CA0)
#define _screenW      (*(int*)0x001F0CB4)

/* 0x00226770 - draw_button_panel_hkdosd_p4_tgt */
/* decomp.me: https://decomp.me/scratch/1oQt8 — 77.5% match */
void draw_button_panel_hkdosd_p4_tgt(int type, int arg1, int arg2)
{
    int lang;
    int item_id;
    int *lang_offsets;
    int i;
    int *panel_ptr;
    int *icon_ptr;
    u64 str;
    int len;

    lang = thunk_config_get_osd_language();

    func_002341C8(0x1F0A70, _evenOddFrame, 0, D_002B2178[0]);

    Font_SetRatio(D_0036FB98);

    if (type != 8) {
        int vid = get_vidmode_with_fallback();
        int off_type = type * 20;
        int nz = vid != 0;
        int off_vid = nz * 160;
        panel_ptr = (int *)((int)D_002B2318 + off_type + off_vid);
    } else {
        panel_ptr = D_002B2300;
    }

    lang_offsets = (int *)((int)D_002B2470 + (lang << 4));
    i = 0;
    icon_ptr = D_002B24F0;

    do {
        item_id = *panel_ptr;
        if (item_id != 1) {
            if (i == 3) {
                register int total_len __asm__("$17");
                str = get_lang_string_GetOSDString_hkdosd_p2_tgt(item_id);
                len = func_00213EE8(str);
                total_len = len + 24;
                DrawIcon(D_002B24F0[3], _screenW - total_len - 28, arg2, arg1);
                str = get_lang_string_GetOSDString_hkdosd_p2_tgt(item_id);
                DrawNonSelectableItem(_screenW - total_len, arg2 + 1, (int)D_002B2460, arg1, str);
            } else {
                DrawIcon(*icon_ptr, *lang_offsets, arg2, arg1);
                str = get_lang_string_GetOSDString_hkdosd_p2_tgt(item_id);
                DrawNonSelectableItem(*lang_offsets + 28, arg2 + 1, (int)D_002B2460, arg1, str);
            }
        }
        i++;
        icon_ptr++;
        panel_ptr++;
        lang_offsets++;
    } while (i < 4);

    Font_SetRatio(1.0f);
}

#undef _evenOddFrame
#undef _screenW
