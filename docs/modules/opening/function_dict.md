# Opening Module: Function Dictionary

> An exhaustive A-Z reference of the `opening` subsystem functions. This module is responsible for the boot animation, the memory card history towers, and rendering the Red Screen of Death.

---

## Initialization & Lifecycle

*   `module_opening_prepare`: Spawns the `module_opening_thread_proc` thread with priority 6.
*   `module_opening_setup`: Registers the Opening module in the VTable dispatcher system.
*   `module_opening_thread_proc`: The infinite loop thread that processes frame logic and signals VSync.
*   `module_opening_getdesc` / `module_opening_getversion`: Debug strings (e.g. `"Opening"`).

## Physics & State Machine

*   `OpeningInit`: Sets up the base GS paths and DMA channels before delegating to `OpeningProcess`.
*   `OpeningProcess`: Top-level update function.
*   `OpeningProcessInner`: The core state machine of the animation (States 0 through 7). Handles the camera dive depending on `_disc_type_1F000C` and triggers SPU2 sound effects at specific frames.
*   `OpeningInitAnimation`: Resets the camera velocities and positions to 0 to restart the animation loop.
*   `opening_thread_set_vars` / `opening_thread_set_vars_2`: Updates shared global matrices and rotation states used by the rendering subroutines.

## 3D Rendering (Towers & Clouds)

*   `OpeningInitRender`: Initializes the environment mapping and texture coordinates for the background clouds.
*   `OpeningInitTextures` / `OpeningInitTexture`: Bulk-uploads TIM2 image assets into GS VRAM via VIF DMA tags.
*   `OpeningUploadImage`: Helper to stream pixel data to the GS.
*   `OpeningInitTowersFog`: The memory card history parser. It iterates over `0x1F0198` (the 21-slot `SaveHistoryEntry` array) and computes the target heights and scales of the 3D towers.
*   `OpeningDrawLights`: Sets up the lighting normal vectors and color multipliers for the scene.
*   `OpeningDrawLightsAndCubes`: Dispatches the actual VIF/GIF packets to the VU1 to render the transparent tower meshes, applying fog based on their Z-depth.
*   `OpeningDrawFog`: Renders the fog planes that obscure the bottom of the towers.
*   `OpeningInitOpeningScene` / `OpeningDrawOpeningScene`: Wrappers to coordinate the drawing of the entire scene (clouds + towers + fog).

## Error Handling (Red Screen of Death)

*   `OpeningDoOpeningIllegal`: Intercepts the normal animation flow if `_disc_type_1F000C == 0x72` (Invalid Format/Region).
*   `OpeningDoIllegalDisc`: Halts the camera dive and locks the state machine to the error screen.
*   `OpeningInitIllegalScene`: Sets up the red color palettes and specific textures for the RSOD.
*   `OpeningDrawIllegalScene`: Renders the swirling red cubes and triggers the specific error drone sound.
*   `OpeningDoText`: Uses the OSD font engine to draw the localized text: *"Please insert a PlayStation or PlayStation 2 format disc."*

## Execution & Transitions

*   `OpeningDrawEnd`: Finalizes the frame drawing and calls `OpeningDoWaitNextFrame` to sync with the vertical blank.
*   `opening_transition_to_clock`: Evaluates if the animation has timed out (without a disc) and forces a transition to the Clock Module by updating `var_current_module`.
