/* CrystalOSD — Config subsystem: config_get_timezone_offset
 *
 * 0x00203EE8
 * STUB — Ghidra decompiler output, needs manual cleanup
 */

#include "ghidra_types.h"



int config_get_timezone_offset(void)

{
  return (var_mechacon_config_param_1 << 0xc) >> 0x15;
}

