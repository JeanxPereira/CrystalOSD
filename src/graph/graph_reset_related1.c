/* CrystalOSD — Graph subsystem: graph_reset_related1
 *
 * 0x0020CBE0
 * STUB — Ghidra decompiler output, needs manual cleanup
 */

#include "ghidra_types.h"

/* AUTO-GENERATED EXTERNS — do not edit manually */
extern int DAT_11004000;
extern int DAT_1100c000;





void * graph_reset_related1(void)

{
  void *pvVar1;
  
  sceDevVif0Reset();
  sceDevVu0Reset();
  sceDevVif1Reset();
  sceDevVu1Reset();
  sceDevGifReset();
  sceGsResetPath();
  sceDmaReset(1);
  memset(&DAT_11004000,0,0x1000);
  pvVar1 = memset(&DAT_1100c000,0,0x4000);
  return pvVar1;
}

