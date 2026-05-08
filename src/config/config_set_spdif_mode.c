/* CrystalOSD — Config subsystem: config_set_spdif_mode
 *
 * 0x00203D08
 * STUB — Ghidra decompiler output, needs manual cleanup
 */

#include "ghidra_types.h"



uint config_set_spdif_mode(uint param_1)

{
  var_mechacon_config_param_1 = var_mechacon_config_param_1 & 0xfffffffe | param_1 & 1;
  return param_1 & 1;
}

