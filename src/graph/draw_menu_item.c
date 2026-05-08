/* CrystalOSD — Graph subsystem: draw_menu_item
 *
 * 0x00226C00
 * STUB — Ghidra decompiler output, needs manual cleanup
 */

#include "ghidra_types.h"



void draw_menu_item(int param_1,undefined8 param_2,undefined8 param_3,long param_4,
                   undefined8 param_5)

{
  int iVar1;
  
  if (0xf < param_4) {
    iVar1 = FUN_00213ee8(param_5);
    DrawNonSelectableItem(param_1 - iVar1 / 2,param_2,param_3,param_4,param_5);
    return;
  }
  return;
}

