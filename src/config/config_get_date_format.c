/* CrystalOSD — Config subsystem: config_get_date_format
 *
 * 0x00204048
 * STUB — Ghidra decompiler output, needs manual cleanup
 */

#include "ghidra_types.h"



uint config_get_date_format(void)

{
  uint uVar1;
  
  uVar1 = DAT_0037181c & 3;
  if (2 < uVar1) {
    uVar1 = 0;
  }
  return uVar1;
}

