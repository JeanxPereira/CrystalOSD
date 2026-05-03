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

typedef struct {
    char pad[0x34];
    int sema_swap;
    int sema_done;
} graph_thread_data_t;

extern graph_thread_data_t threadid_2AE5D8;

/**
 * graph_reset_related1 - Reset GS and vector units
 * 
 * Perfect match (0/2800) on decomp.me
 * https://decomp.me/scratch/oMHm2
 */
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

/**
 * graph_swap_frame_thread_proc - Background thread that swaps GS buffers
 * 
 * Symbol-only match (10/1400, 99.3%) on decomp.me
 * https://decomp.me/scratch/p0ITM
 */
void graph_swap_frame_thread_proc(void)
{
    while (1) {
        WaitSema(threadid_2AE5D8.sema_swap);
        SwapBuffers();
        SignalSema(threadid_2AE5D8.sema_done);
    }
}

/**
 * draw_menu_item - Renders a centered, non-selectable menu item
 * 
 * Perfect match (0/4000) on decomp.me
 * https://decomp.me/scratch/urkFn
 */
void draw_menu_item(int x, int y, void *height_ptr, int max_width, void *str)
{
    int len;

    if (max_width < 16)
        return;
    len = func_00213EE8(str);
    DrawNonSelectableItem(x - len / 2, y, height_ptr, max_width, str);
}
