/* CrystalOSD — Config subsystem: config_get_video_output
 *
 * 0x00203D98
 * STUB — Ghidra decompiler output, needs manual cleanup
 */

#include "ghidra_types.h"



uint config_get_video_output(void)

{
  return var_mechacon_config_param_1 >> 3 & 1;
}

