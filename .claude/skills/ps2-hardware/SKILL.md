---
name: ps2-hardware
description: PS2 hardware architecture reference — GS registers, VIF pipeline, EE syscalls, IOP RPC. Auto-invoked when analyzing rendering, sound, or system-level OSDSYS functions.
---

# PS2 Hardware Reference

## Emotion Engine (EE) — MIPS R5900
- Main CPU, 128-bit SIMD registers
- Syscalls via `syscall(N)` instruction
- Key syscalls in OSDSYS:
  - `0x3C` → FlushCache
  - `0x3D` → Unknown (post-cache-flush)
  - `EI()` → Enable Interrupts
  - `Exit()` → Transfer control to loaded ELF

## Graphics Synthesizer (GS)
- Fixed-function rasterizer, 4MB eDRAM
- No programmable shaders — all state set via 64-bit registers
- Register reference: `gs_gp.h` in PS2SDK (`common/include/gs_gp.h`)
- Key registers used by OSDSYS:
  - `GS_REG_SCISSOR (0x40)` → Clipping rectangle
  - `GS_REG_TEST (0x47)` → Alpha/Z-buffer test
  - `GS_REG_CLAMP (0x08)` → Texture wrap mode
  - `GS_REG_FRAME (0x4C)` → Framebuffer config
  - `GS_REG_ZBUF (0x4E)` → Z-buffer config
  - `GS_REG_FOGCOL (0x3D)` → Fog color (towers effect)
  - `GS_REG_TEX0 (0x06)` → Texture base/format
  - `GS_REG_PRIM (0x00)` → Primitive type

## GS Register Macros (PS2SDK)
```c
GS_SET_SCISSOR(X0, X1, Y0, Y1)
GS_SET_TEST(ATE, ATST, ATREF, ATFAIL, DATEN, DATMD, ZTEN, ZTMETH)
GS_SET_CLAMP(WMS, WMT, MINU, MAXU, MINV, MAXV)
GS_SET_FRAME(FBA, FBW, PSM, FMSK)
GS_SET_TEX0(TBP, TBW, PSM, TW, TH, TCC, TFNCT, CBA, CPSM, CSM, CSA, CLD)
GS_SET_PRIM(PRIM, IIP, TME, FGE, ABE, AA1, FST, CTXT, FIX)
GS_SET_FOGCOL(R, G, B)
```

## Rendering Pipeline (Path 1)
```
EE CPU → VIF1 (unpack) → VU1 (vertex transform) → GIF → GS (rasterize)
```
- VIF1 unpacks data into VU1 memory
- VU1 runs microprogram to transform vertices
- VU1 "kicks" primitives to GS via GIF
- OSDSYS uses this for the 3D towers/orbs

## VIF1 Commands
- Data sent via DMA channel 1 (VIF1)
- VIF codes: UNPACK, STCYCL, MSCAL, FLUSH
- PCSX2 reference: `pcsx2/Vif.h`, `Vif1_Dma.cpp`

## IOP Communication (SIF/RPC)
- IOP is a separate MIPS R3000 processor
- Communicates via SIF (Subsystem Interface)
- RPC calls for: controllers, memory cards, CDVD, sound
- OSDSYS sound uses `sceSdRemote()` for SPU2 access
- PS2SDK abstracts this entirely — use `ee/rpc/` modules

## Scratchpad (SPR)
- 16KB of fast on-chip SRAM at 0x70000000
- OSDSYS uses `sprInitAlloc` / `sprAllocChains` for DMA chain building
- Used for temporary rendering data before DMA to VIF1/GIF
