/* 0x0020BFD8 - graph_swap_frame_thread_proc */

#include <kernel.h>
#include "osdsys_externs.h"

void graph_swap_frame_thread_proc(void)
{
  do {
    WaitSema(swapSema);
    SwapBuffers();
    SignalSema(drawStartSema);
  } while (1);
}

