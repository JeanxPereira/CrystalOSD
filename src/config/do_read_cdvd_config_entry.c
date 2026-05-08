#include "osd_config.h"

extern s32 sceCdOpenConfig(s32 a, s32 b, s32 c, u32 *d);
extern s32 sceCdReadConfig(void *a, u32 *b);
extern s32 sceCdCloseConfig(u32 *a);

void do_read_cdvd_config_entry(void *param_1)
{
  s32 lVar1;
  u32 auStack_30 [4];
  
  do {
    do {
      lVar1 = sceCdOpenConfig(1,0,2,auStack_30);
    } while ((auStack_30[0] & 0x81) != 0);
  } while (lVar1 == 0);
  do {
    do {
      lVar1 = sceCdReadConfig(param_1,auStack_30);
    } while ((auStack_30[0] & 0x81) != 0);
  } while (lVar1 == 0);
  do {
    do {
      lVar1 = sceCdCloseConfig(auStack_30);
    } while ((auStack_30[0] & 0x81) != 0);
  } while (lVar1 == 0);
}
