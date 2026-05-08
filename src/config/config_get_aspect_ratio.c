/* CrystalOSD — Config subsystem: config_get_aspect_ratio
 *
 * 0x00203D30
 * STUB — Ghidra decompiler output, needs manual cleanup
 */

#include "ghidra_types.h"



uint config_get_aspect_ratio(void)

{
  uint uVar1;
  
  uVar1 = var_mechacon_config_param_1 >> 1 & 3;
  if (2 < uVar1) {
    uVar1 = 0;
  }
  return uVar1;
}

