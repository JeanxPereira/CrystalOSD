/* CrystalOSD — Config subsystem: config_get_time_format
 *
 * 0x00204008
 * STUB — Ghidra decompiler output, needs manual cleanup
 */

#include "ghidra_types.h"



uint config_get_time_format(void)

{
  return var_mechacon_config_param_1 >> 0x1e & 1;
}

