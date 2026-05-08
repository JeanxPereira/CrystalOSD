/* CrystalOSD — Core subsystem: sceSdCallBack
 *
 * 0x00294728
 * STUB — Ghidra decompiler output, needs manual cleanup
 */

#include "ghidra_types.h"



/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

undefined4 sceSdCallBack(undefined4 param_1)

{
  undefined4 uVar1;
  
  uVar1 = ram0x00347068;
  ram0x00347068 = param_1;
  return uVar1;
}

