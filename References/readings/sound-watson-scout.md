# Sound: what Watson can measure (scout reading, 2026-10-03)

Reading, not fact. Sources read: `D:\CodingProjects\Watson\Emulator\{hooks.patch,DebugServer.cpp,GifTrace.cpp}`,
`D:\CodingProjects\pcsx2\pcsx2\SPU2\{spu2.cpp,spu2sys.cpp,Mixer.cpp,Wavedump_wav.cpp,ADSR.cpp,ReverbResample.cpp}`
(pcsx2 HEAD 8f49597, not Watson's pinned 81526d4 — diff the SPU2 folder before relying on lines).

## Exists
- No SPU2/audio hook in Watson (`hooks.patch` touches no SPU2 file).
- `read_memory` with `cpu="iop"` reads IOP RAM through `r3000Debug` (DebugServer.cpp:498-520, cap 65536 bytes).
  Open: whether the MCP `watson_read_memory` schema passes `cpu` (Server/src/index.ts:176).
- IOP breakpoints/watchpoints exist (`BREAKPOINT_IOP`, DebugServer.cpp:310), depth unchecked.
- `frame_advance` (exact N frames then pause), save/load state files; SPU2 likely in the state (`SPU2freeze`), untested.

## Missing
- SPU2 register-write trace (`SPU2write`, spu2.cpp:440, logs only under PCSX2_DEVBUILD).
- SPU2 RAM read (`_spu2mem`, s16[0x100000], spu2sys.cpp:23) — not reachable by `read_memory`.
- Voice state (`Cores[].Voices[]`), mixed-output capture, sceSd RPC trace.

## PCSX2 already has
- WAV dump per mix stage (`Wavedump_wav.cpp`, enabled by `EmuConfig.SPU2.WaveLog`), called from Mixer.cpp
  (dry/wet 459-460, pre/post reverb 508/514, final output 582).
- Mixer driven by `SPU2async` every 768 IOP cycles (IopCounters.cpp:485); `TimeUpdate` on every write and DMA:
  output should be deterministic from a state (inference).

## Oracle caveat
PCSX2's SPU2 is SPU2-X, not hardware-verified: "bit for bit" can only mean "equal to PCSX2's model" unless a
real-console recording exists. Reverb has reference/SSE/AVX paths — compare against the reference one.

## Smallest hook set
- `SpuTrace.cpp` beside `GifTrace.cpp`: log (frame, IOP cycle, address, value) in `SPU2write` (and any fast
  path that bypasses it), and (cycle, TSA, size, data hash) in `SPU2writeDMA4Mem` / `SPU2writeDMA7Mem`.
- A command returning `_spu2mem` (2 MB) and voice state at a frame boundary.
- Output: `WaveLog=1` + `frame_advance` (no patch), or a hook at Mixer.cpp:582 logging (frame, sample, L, R).
