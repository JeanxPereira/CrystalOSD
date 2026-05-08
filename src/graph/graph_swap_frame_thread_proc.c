/* CrystalOSD — Graph subsystem: graph_swap_frame_thread_proc
 *
 * 0x0020BFD8
 * STUB — Ghidra decompiler output, needs manual cleanup
 */

#include "ghidra_types.h"



void graph_swap_frame_thread_proc(void)

{
  do {
    WaitSema(swapSema);
    SwapBuffers();
    SignalSema(drawStartSema);
  } while( true );
}

