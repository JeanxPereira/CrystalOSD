#ifndef OSDSYS_EXTERNS_H
#define OSDSYS_EXTERNS_H

#include <tamtypes.h>

/* Sony private EE SDK — not exposed in public ps2sdk headers */
extern void sceDevVif0Reset(void);
extern void sceDevVu0Reset(void);
extern void sceDevVif1Reset(void);
extern void sceDevVu1Reset(void);
extern void sceDevGifReset(void);
extern void sceGsResetPath(void);
extern void sceDmaReset(int mode);

/* libcdvd S-commands: in ps2sdk/ee/rpc/cdvd/src/scmd.c but not in any installed header */
extern int sceCdOpenConfig(int block, int mode, int num_blocks, u32 *status);
extern int sceCdCloseConfig(u32 *result);

/* OSDSYS internal graph subsystem */
extern void SwapBuffers(void);
extern void DrawNonSelectableItem(int x, u64 a, u64 b, long c, u64 d);
extern int  FUN_00213ee8(u64 arg);
extern s32  swapSema;
extern s32  drawStartSema;

#endif /* OSDSYS_EXTERNS_H */
