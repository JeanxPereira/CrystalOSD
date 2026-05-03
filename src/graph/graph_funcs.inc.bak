#include <tamtypes.h>

extern void sceDevVif0Reset(void);
extern void sceDevVu0Reset(void);
extern void sceDevVif1Reset(void);
extern void sceDevVu1Reset(void);
extern void sceDevGifReset(void);
extern void sceGsResetPath(void);
extern void sceDmaReset(int);
extern void *memset(void *, int, unsigned int);

extern int func_00213EE8(void *str);
extern void DrawNonSelectableItem(int x, int y, void *colors, int height, void *str);

extern int WaitSema(int);
extern int SignalSema(int);
extern void SwapBuffers(void);

extern int config_get_video_output(void);
extern void SetGsVParam(int mode);
extern int is_pal_vmode_p9_tgt(void);
extern void sceGsResetGraph(int mode, int interlace, int field, int out);

extern int screenW;
extern int screenH;
extern int gsAllocBuffer(u32 psm, int *params);

typedef struct {
    char pad[0x34];
    int sema_swap;
    int sema_done;
} graph_thread_data_t;

extern graph_thread_data_t threadid_2AE5D8;
extern int D_002AD980;
extern u64 gsExtraBuffers[2];

void graph_reset_related3(void)
{
    int vid;
    int pal;

    vid = config_get_video_output();
    if (D_002AD980 == vid)
        return;

    vid = config_get_video_output();
    D_002AD980 = vid;

    if (vid == 0)
        goto case_0;
    if (vid == 1)
        goto case_1;
    return;

case_0:
    SetGsVParam(0);
    pal = is_pal_vmode_p9_tgt();
    return sceGsResetGraph(2, 1, pal ? 3 : 2, 1);

case_1:
    SetGsVParam(1);
    pal = is_pal_vmode_p9_tgt();
    return sceGsResetGraph(2, 1, pal ? 3 : 2, 1);
}

/* 0x0020CBE0 - graph_reset_related1 */
void graph_reset_related1(void)
{
    sceDevVif0Reset();
    sceDevVu0Reset();
    sceDevVif1Reset();
    sceDevVu1Reset();
    sceDevGifReset();
    sceGsResetPath();
    sceDmaReset(1);
    memset((void *)0x11004000, 0, 0x1000);
    memset((void *)0x1100C000, 0, 0x4000);
}

/* 0x0020BFD8 - graph_swap_frame_thread_proc */
void graph_swap_frame_thread_proc(void)
{
    while (1) {
        WaitSema(threadid_2AE5D8.sema_swap);
        SwapBuffers();
        SignalSema(threadid_2AE5D8.sema_done);
    }
}

typedef struct {
    char pad[0xCB4];
    int w;
    int h;
} ScreenDims;

#define screenDims ((ScreenDims *)0x001F0000)

/* 0x0021B1A8 - gsAllocExtraBuffers */
void gsAllocExtraBuffers(void)
{
    int params[4];

    params[0] = 0;
    params[1] = 0;
    params[2] = screenDims->w;
    params[3] = screenDims->h;
    gsExtraBuffers[0] = gsAllocBuffer(0, params);
    gsExtraBuffers[1] = gsAllocBuffer(0, params);
}

extern int thunk_config_get_osd_language(void);
extern void func_002341C8(int, int, int, int);
extern void Font_SetRatio(float);
extern int get_vidmode_with_fallback(void);
extern u64 get_lang_string_GetOSDString_hkdosd_p2_tgt(int);
extern void DrawIcon(int, int, int, int);

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
            draw_menu_item(0x1AE, y, (int)D_002B2540, max_width, str);
        } else {
            str = get_lang_string_GetOSDString_hkdosd_p2_tgt(*(int *)(offset + item_ptr[1]));
            draw_menu_item(0x1AE, y, (int)D_002B2550, max_width, str);
        }
        sel++;
        offset += 16;
        y += 16;
    } while (sel < item_ptr[2]);
}

#undef _screenH

/* 0x00226C00 - draw_menu_item */
void draw_menu_item(int x, int y, void *height_ptr, int max_width, void *str)
{
    int len;

    if (max_width < 16)
        return;
    len = func_00213EE8(str);
    DrawNonSelectableItem(x - len / 2, y, height_ptr, max_width, str);
}

/* 0x002A4720 - GsGetIMR */
int GsGetIMR(void)
{
    __asm__ volatile("addiu $3, $0, 0x70\n\tsyscall");
}

/* 0x002A4730 - GsPutIMR */
void GsPutIMR(int imr)
{
    __asm__ volatile("addiu $3, $0, 0x71\n\tsyscall");
}
