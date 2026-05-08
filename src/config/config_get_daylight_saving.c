/* CrystalOSD — Config subsystem: config_get_daylight_saving
 *
 * 0x00203FC8
 * STUB — Ghidra decompiler output, needs manual cleanup
 */

#include "ghidra_types.h"



uint config_get_daylight_saving(void)

{
  return var_mechacon_config_param_1 >> 0x1d & 1;
}

