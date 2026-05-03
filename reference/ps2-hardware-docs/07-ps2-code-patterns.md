# Reference: PS2 Code & Hardware Patterns
> Use this when reading decompiled Ghidra output to recognize what a mysterious `sub_xxx` is actually doing based on memory addresses and loops.

If you don't know what a function does, look at the physical addresses it reads or writes. This is the biggest cheat code in PS2 reverse engineering.

## 1. The "Wait for DMA" Pattern
Games aggressively use the DMA Controller (DMAC) to send data from EE RAM to the GS or IOP.
If you see a loop waiting on an address starting with `0x1000A...`:
- `0x1000A000`: DMA Channel 0 (VIF0) - Sending data to VU0
- `0x1000A010`: DMA Channel 1 (VIF1) - Sending data to VU1 (Main Graphics Path)
- `0x1000A020`: DMA Channel 2 (GIF) - Sending data directly to GS (Textures usually)
- `0x1000A030`: DMA Channel 3 (from IPU)
- `0x1000A040`: DMA Channel 4 (to IPU)
- `0x1000A050`: DMA Channel 5 (SIF0) - IOP to EE
- `0x1000A060`: DMA Channel 6 (SIF1) - EE to IOP
- `0x1000A070`: DMA Channel 7 (SIF2)
- `0x1000A080`: DMA Channel 8 (from SPR)
- `0x1000A090`: DMA Channel 9 (to SPR)

**The Pattern:**
```cpp
// Start DMA transfer
*(uint32_t*)0x1000A010 = ...; 

// Spin until DMA CHCR bit 8 (START) clears (becomes 0)
while ( (*(uint32_t*)0x1000A010) & 0x100 ) { 
    // wait
}
```
If your recompilation hangs here, the runtime hasn't properly fired the DMA completion event.

## 2. The GS (Graphics Synthesizer) Kickoff Pattern
Addresses in the `0x12000000` range mean the EE is talking directly to the GS.
- `0x12000000`: GS_PMODE
- `0x12000080`: GS_DISPFB1
- `0x12001000`: GS_CSR (System Status - extremely common in loops)

**The V-SYNC Loop Pattern:**
Games wait for the V-BLANK (vertical sync) to swap buffers.
```cpp
// Spinning on GS_CSR waiting for the V-Sync flag
while ( (*(uint32_t*)0x12001000 & 8) == 0 ) {}
*(uint32_t*)0x12001000 = 8; // Clear the flag
```

## 3. Library / Module Loading (`SifLoadModule`)
The PS2 OS is distributed. The IOP handles peripherals. Games load `.irx` modules from the CD to the IOP.
When you see string constants like:
- `"rom0:SIO2MAN"` (Serial I/O Manager - Gamepads/Memcards)
- `"rom0:MCMAN"` (Memory Card Manager)
- `"cdrom0:\MODULE\IOPRP.IRX"`

And these strings are passed into a function inside a loop... that function is `SifLoadModule` or `SifLoadModuleBuffer`. This function uses the `SIF` (System Interface) to send the file to the IOP and execute it.
*PS2Recomp Strategy:* You MUST stub this function to return success (`1` or `>0`). Do NOT let the native game logic try to execute IOP modules in the recompiler; it will fail.

## 4. CD/DVD I/O Patterns
If you see a function taking strings like `\\SLUS_xxx.xx;1` or `DATA.BND;1`.
That function is calling `sceCdSearchFile` or `sceCdRead`.
You will recognize CD logic because it often involves the `cdvdman` RPC commands.
Usually, a CD read involves:
1. `sceCdSearchFile(name, &toc_entry)` → Gets sector start
2. `sceCdRead(lsn, sectors, ptr, mode)` → Kicks off background read
3. `sceCdSync(0)` → Waits for read to finish.

If the game hangs after calling a `sub_xxx` with a filename, it's stuck in `sceCdSync`. You must implement a C++ stub that synchronously reads the file from the PC and returns success, bypassing the hang.

## 5. Threading and Semaphores
Sony's SDK provides primitives for threading.
If you see a function taking strings like `"Main Thread"` or `"Load Thread"` and a priority number (usually around `64`), it's `CreateThread`.
If you see a structure initialized with an initial value of `1` and max `1`, it's `CreateSema` (Semaphore).
*PS2Recomp Strategy:* The `ps2xRuntime` hooks `SYSCALL` for `WaitSema` and `SignalSema`. If the game has wrapper functions around these syscalls (it usually does), you don't necessarily need to stub them, as the recompiler will successfully translate the `syscall` instruction inside the wrapper.
