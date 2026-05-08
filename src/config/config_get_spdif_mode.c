/* CrystalOSD — Config subsystem: config_get_spdif_mode
 *
 * 0x00203CF8
 * STUB — Ghidra decompiler output, needs manual cleanup
 */

#include "ghidra_types.h"



uint config_get_spdif_mode(void)

{
  return var_mechacon_config_param_1 & 1;
}

