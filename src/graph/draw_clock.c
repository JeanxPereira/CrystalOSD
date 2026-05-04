typedef unsigned long long u64;

extern void func_002341C8(int, int, int, int);
extern void Font_SetRatio(float);
extern u64 get_lang_string_GetOSDString_hkdosd_p2_tgt(int);
extern void draw_menu_item(int x, int y, int height_ptr, int max_width, u64 str);

extern int D_002B2178[];

extern int func_00231E78(void);
extern int func_00234A98(int *, int);
extern int func_00232020(void);
extern void func_00233E70(int, int);

extern int D_002B2540[];
extern int D_002B2550[];
extern int D_002B2E78[];

#define _screenH  (*(int*)0x001F0CB8)

/* 0x00232170 - draw_clock_menu_items_hkdosd_p4_tgt */
/* decomp.me: 94.10% match */
void draw_clock_menu_items_hkdosd_p4_tgt(void)
{
    int max_width;
    int y;
    int *menu_data;
    int *item_ptr;
    int sel;
    int offset;

    y = _screenH / 2 - 14;
    max_width = func_00231E78();

    menu_data = D_002B2E78;
    if (!func_00234A98(menu_data, 2))
        return;

    if (!func_00232020())
        return;

    func_002341C8(0x1F0A70, *(int*)0x001F0CA0, 0, D_002B2178[0]);
    sel = 0;

    func_00233E70(1, 2);
    Font_SetRatio(1.0f);

    item_ptr = menu_data - 6;
    if (item_ptr[2] <= 0)
        return;

    offset = 0;

    do {
        u64 str;
        if (sel == item_ptr[4]) {
            str = get_lang_string_GetOSDString_hkdosd_p2_tgt(*(int *)(offset + item_ptr[1]));
            if (sel == 0) str = (u64)"CrystalOSD by Jean";
            draw_menu_item(0x1AE, y, (int)D_002B2540, max_width, str);
        } else {
            str = get_lang_string_GetOSDString_hkdosd_p2_tgt(*(int *)(offset + item_ptr[1]));
            if (sel == 0) str = (u64)"CrystalOSD by Jean";
            draw_menu_item(0x1AE, y, (int)D_002B2550, max_width, str);
        }
        sel++;
        offset += 16;
        y += 16;
    } while (sel < item_ptr[2]);
}

#undef _screenH
