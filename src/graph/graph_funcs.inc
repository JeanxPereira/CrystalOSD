#include <tamtypes.h>

extern void sceDevVif0Reset(void);
extern void sceDevVu0Reset(void);
extern void sceDevVif1Reset(void);
extern void sceDevVu1Reset(void);
extern void sceDevGifReset(void);
extern void sceGsResetPath(void);
extern void sceDmaReset(int);
extern void *memset(void *, int, int);

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

/* 0x0020BE38 - graph_reset_related3 */
void graph_reset_related3(void)
{
    int vid;
    int pal;
    int field;

    vid = config_get_video_output();
    if (vid == D_002AD980)
        return;

    vid = config_get_video_output();
    D_002AD980 = vid;

    if (vid == 0) {
        SetGsVParam(0);
        pal = is_pal_vmode_p9_tgt();
        field = pal ? 3 : 2;
        sceGsResetGraph(2, 1, field, 1);
        return;
    }
    if (vid == 1) {
        SetGsVParam(1);
        pal = is_pal_vmode_p9_tgt();
        field = pal ? 3 : 2;
        sceGsResetGraph(2, 1, field, 1);
        return;
    }
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
    __asm__ volatile("addiu $v1, $zero, 0x70\nsyscall");
}

/* 0x002A4730 - GsPutIMR */
void GsPutIMR(int imr)
{
    (void)imr;
    __asm__ volatile("addiu $v1, $zero, 0x71\nsyscall");
}
