/* CrystalOSD — Config subsystem: do_read_cdvd_config_entry
 *
 * 0x002038B0
 * STUB — Ghidra decompiler output, needs manual cleanup
 */

#include "ghidra_types.h"



void do_read_cdvd_config_entry(undefined8 param_1)

{
  long lVar1;
  uint auStack_30 [4];
  
  do {
    do {
      lVar1 = sceCdOpenConfig(1,0,2,auStack_30);
    } while ((auStack_30[0] & 0x81) != 0);
  } while (lVar1 == 0);
  do {
    do {
      lVar1 = sceCdReadConfig(param_1,auStack_30);
    } while ((auStack_30[0] & 0x81) != 0);
  } while (lVar1 == 0);
  do {
    do {
      lVar1 = sceCdCloseConfig(auStack_30);
    } while ((auStack_30[0] & 0x81) != 0);
  } while (lVar1 == 0);
  return;
}

