# CrystalClockVK — 1:1 Strategy (seed doc)

> Goal: a robust, replicable Vulkan reimplementation of the PS2 OSDSYS **visual layer only**
> (clock / opening / UI), 1:1 *perceptually* identical, driven by the decompiled C as spec.
> NOT a PS2 emulator; NOT CDVD/config/sound — just the look.

## 1. VU verdict (investigated 2026-06-12) — the big de-risk

**Clock & Opening use ZERO VU1 microprograms and ZERO VU0 micro mode.**
- clock: `sceVu0*` library calls in 12 files; **0 COP2-inline, 0 vcallms**.
- opening: 17 files; **0, 0**. graph: 4 files; 0, 0.
- The only `vcallms` is in `sceDevVu0Exec` (debug). `sceVu1*` render calls = **0**;
  `sceDevVu1*` is a debug lib called by exactly one browser function (not the clock).
- `micropt_1` (0x3ddca0) is data, not microcode.

**Consequence:** there is **no opaque VU1 microcode to disassemble** for the UI. The "VU"
work is just the **`sceVu0*` macro math library (42 functions)** — standard, documented
PS2SDK semantics, fully decompilable. The hard part is NOT the VUs; it's the **GS**.

## 2. Where the "style" actually lives (why naive VK fails)

The distinctive look is the **GS rasterizer**, which Vulkan's fixed-function pipeline does
NOT reproduce by default:
- GS alpha blend: `(A-B)*C/128 + D` (8-bit precision, specific clamping/COLCLAMP).
- Ordered dithering + 16/24/32-bit color precision.
- Refraction/crystal = render-to-texture of the background + distorted resampling (framebuffer feedback).
- Glow = additive blending of overlapping translucent quads.
- 12.4 fixed-point vertex coords (subpixel positioning) via `sceVu0FTOI*`.

These are **encoded in the decomp C** — specifically in the GS-packet builders:
`pktSetAlphaBlend` (blend mode), `pktSetTEST_1` (alpha/Z test), `pktSetAD`, `pktSetSCISSOR_1`,
`pktSetCLAMP_1`, `sceGsPutDrawEnv`/`PutDispEnv` (GS environment). Decompile these → you
**read** the exact blend/test/env state → replicate it **in shaders** (not fixed-function).

You do NOT need a full GS emulator — OSDSYS uses a small subset of GS features. The decomp
tells you exactly which. Build a thin "GS-state → VK shader" translator for that subset.

## 3. Function inventory (the VK port surface)

| Group | Funcs | Decomp'd | Role |
|-------|-------|----------|------|
| `sceVu0*` math lib | 42 | (port these) | transforms/clip/light — known PS2SDK semantics |
| graph/ (GS+VIF1) | 171 | 8 | GS packet builders = the style spec (pktSet*, gsAlloc*, sceGs*) |
| opening/ | 66 | 17 | towers, fog, 128 animated alpha quads (func_0021E950 = reference) |
| clock/ | 190 | 14 | crystal clock, rods (rod struct 0x160), 5-pass pipeline |

Key sceVu0 to port first: `RotTransPers(N)` (projection), `ClipScreen/ClipAll`,
`LightColorMatrix`/`NormalLightMatrix` (lighting/glow), `ApplyMatrix`, `Camera/ViewScreenMatrix`,
`FTOI*/ITOF*` (the 12.4 fixed-point that drives subpixel look).
Key GS builders: `pktSetAlphaBlend`, `pktSetTEST_1`, `pktSetAD`, `sceGsPutDrawEnv`.

## 4. PRECISION / ground truth — solving the "can't compare by photo" problem

Photos are lossy and unautomatable. Replace them with machine-readable ground truth:

1. **PCSX2 GS dump (`.gs`/`.gsdump`)** — records EVERY GIFtag/register write + primitive for
   a frame. Parse it directly (documented format) → the exact, programmatic spec of what the
   GS draws. Cross-reference each packet with the decomp C that produced it. **This is the
   single highest-value artifact** — it is the style, machine-readable.
2. **PCSX2 software renderer** — bit-accurate to real PS2 hardware. Render OSDSYS with it →
   reference frames that ARE the real PS2 output → **numeric pixel-diff** your VK output
   against them (objective, automatable, no "does it look right?").
3. **RenderDoc on the VK app** — inspect YOUR draws (blend state, shaders, vertex buffers,
   pixel history) to debug divergence from the reference.

### MCP feasibility (high value)
- **pcsx2-mcp**: PCSX2 exposes PINE/IPC — an MCP can read live EE/VU/GS memory + registers
  and trigger GS dumps. Buildable; gives precise live state.
- **renderdoc-mcp**: RenderDoc has a full Python API — an MCP can query captures (draws,
  pipeline state, textures, pixel history). Buildable.
- **Lowest-effort first win:** a **GS-dump parser** (no emulator/MCP needed) → the logical
  ground truth immediately. Then add the MCPs for live inspection.

## 5. Recommended architecture (thin, replicable)

```
decomp C (visual fns)  ──►  EE-logic layer (ported C/Rust: builds the same data + GS packets)
                                   │  emits a GS command stream (the GIF packets it would send)
                                   ▼
                       GS→VK translator (small): maps the SUBSET of GS state OSDSYS uses
                       to VK pipelines + shaders that replicate GS blend/test/dither/feedback
                                   ▼
                            Vulkan renderer  ──► validate vs PCSX2 SW-render frames (pixel diff)
                                                  + RenderDoc to debug
```
Stub inputs: feed system time to the clock, fixed UI state. No CDVD/config/sound.

## 6. Feasibility verdict
- "100% interpret the VUs": YES for the UI — nothing is a black box (VU0 macro = known lib).
- "1:1": *perceptually* 1:1 is achievable by replicating GS behavior in shaders; bit-exact GS
  is emulator territory and not the goal.
- The OSDSYS decomp (this repo) is the correct foundation — the visual fns + GS setups ARE the spec.

## 7. First steps in the new repo
1. Build the GS-dump parser; capture an OSDSYS frame in PCSX2 → list every GS state + primitive.
2. Port the `sceVu0*` subset actually used by clock/opening (decompile + reimplement).
3. Reimplement `pktSetAlphaBlend`/`pktSetTEST`/draw-env → derive the VK blend/shader equivalents.
4. Render one element (e.g. the opening alpha quads from func_0021E950) → pixel-diff vs SW renderer.
5. Iterate outward (fog → crystal/refraction → rods).
