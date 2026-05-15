# OSDSYS Architecture — Clock Module Function Dictionary

> A comprehensive, structured dictionary detailing the exact purpose of every function within the Clock Module.

## 1. Module Lifecycle & Core Handlers

Functions responsible for initializing the module, managing its thread, and handling external transitions.

| Function | Description |
| :--- | :--- |
| **`module_clock_prepare`** | Module interface function (VTable). Allocates a 16KB stack, creates the `module_clock_thread_proc` thread with priority 6, and starts it. |
| **`module_clock_setup`** | Registers the Clock module's VTable (prepare, getdesc, getversion) into the master OSDSYS module array. |
| **`module_clock_thread_proc`** | The main infinite execution loop for the module. It orchestrates drawing frames, reading input, and waiting for the VSync semaphore. |
| **`module_clock_getdesc`** | Module interface function (VTable). Returns the descriptive string name `"Clock"`. |
| **`module_clock_getversion`** | Module interface function (VTable). Returns the module version string `"1.00"`. |
| **`module_clock_init_resources`** | Decompresses and allocates VRAM for visual assets, including the TIM2 textures for the clock hands and UI fonts. |
| **`clock_input_check_handler_p6_p7_tgt`** | The "Input Brain". Runs every frame to poll gamepad states. Handles transitions: Triangle (open menu), X (transition to Browser), and auto-boot events if a disc is inserted. |
| **`opening_transition_to_clock`** | Evaluates the post-boot state. If a game disc is present, sets `execute_app_type = 0`. Otherwise, it routes the transition to either the Clock or the Browser. |
| **`disable_enter_clock_module_208388`** | Sets an internal flag to `0`. Prevents the system from booting into the Clock module, forcing a direct transition to the Browser (Memory Card manager). |
| **`enable_enter_clock_module_208398`** | Sets an internal flag to `1`. Forces the system to enter the Clock module during initial boot (e.g., during Out-Of-Box Experience / Factory Reset). |
| **`enter_clock_module_208378`** | Returns the boolean flag indicating whether the Clock module is the designated boot target. |

## 2. Configuration Callbacks & Sync

Functions responsible for syncing UI settings with the global system RAM and triggering hardware NVRAM writes.

| Function | Description |
| :--- | :--- |
| **`clock_config_change_cb_aspect_ratio`** | UI callback triggered when the 4:3 / 16:9 setting is changed. Flags configuration as dirty if modified. |
| **`clock_config_change_cb_clock`** | UI callback triggered when the 12h/24h clock format is changed. |
| **`clock_config_change_cb_diagnosis`** | UI callback triggered when toggling Diagnosis Mode. |
| **`clock_config_change_cb_dvdp_reset_progressive`** | UI callback triggered to clear DVD Player Progressive Scan settings. |
| **`clock_config_change_cb_hddini`** | UI callback triggered to mark the HDD `__sysconf` partition settings as dirty. |
| **`clock_config_change_cb_osd_language`** | UI callback triggered when changing the system language. |
| **`clock_config_change_cb_ps1drv`** | UI callback triggered when modifying PS1 backward compatibility settings (Texture Smoothing / Fast Disc Speed). |
| **`clock_config_change_cb_rc_gameplay`** | UI callback triggered when toggling Remote Control permissions during gameplay. |
| **`clock_config_change_cb_spdif_mode`** | UI callback triggered when switching optical audio output between PCM and Bitstream. |
| **`clock_config_change_cb_video_output`** | UI callback triggered when switching video output mode between YPbPr and RGB. |
| **`config_item_change_cb_clock_write_mechacon`** | Converts the decimal UI time into Binary-Coded Decimal (BCD), writes it to the staging buffer, and sets `_var_clock_is_dirty` to notify the CDVD hardware thread. |
| **`config_load_clock_osd`** | Memory synchronizer. Pulls settings from the global system EEPROM mirrors into the Clock module's temporary RAM. |
| **`config_save_clock_osd`** | Memory synchronizer. Pushes the modified UI settings from the temporary RAM back to the global system mirrors. |
| **`module_clock_config_ps1drv_get_value`** | Extracts the specific PS1 driver settings from its 15-byte configuration buffer. |
| **`module_clock_get_config_item`** | Returns a pointer to the currently requested configuration struct for UI population. |
| **`clock_config_get_initial_value`** | Fetches the current value of a setting from NVRAM to correctly highlight the active option when the user opens the menu. |
| **`var_clock_is_dirty`** | Global flag (`0x1F0644`). When set to `1`, it signals the asynchronous CDVD IOP thread to execute `sceCdWriteClock`. |

## 3. UI Formatting & Draw Calls

Functions responsible for extracting string text, formatting timestamps, and issuing basic 2D draw commands.

| Function | Description |
| :--- | :--- |
| **`clock_config_get_item_str`** | Takes an integer value (e.g., `2`) and returns the localized string ID (e.g., `"16:9"`) to display on the UI. |
| **`clock_str_related`** | String utility that concatenates and formats dates and times based on the chosen 12h/24h format. |
| **`clock_timezone_str_related`** | String utility specific to formatting Timezone offsets (calculating the correct +/- hour string). |
| **`draw_clock_menu_items_hkdosd_p4_tgt`** | Iterates over the active menu list and draws the text strings on-screen, highlighting the currently selected item. |

## 4. Graphics & Orb Physics Math

Functions managing the Graphic Synthesizer (GS), camera perspective, and the complex physics/refraction engine of the background glass spheres (Orbs).

| Function | Description |
| :--- | :--- |
| **`clock_stuff1`** | Frame initialization sequence. Resets the GS path (`sceGsResetPath`), resets DMA channels, and prepares screen boundaries based on PAL/NTSC output modes. |
| **`clock_orb_rendering_func`** | The master rendering function. Manages the execution pipeline of VU0 matrix setup, physics updates, and DMA packet submission for the glass orbs. |
| **`clock_load_texture`** | Manages the DMA upload (VIF1) of TIM2 texture assets from main RAM to VRAM. |
| **`get_clock_should_render_orbs`** | Returns the boolean flag determining if the background 3D orbs should be rendered. |
| **`module_clock_set_anim_offset`** | Shifts the rotation and background position of the 3D world matrix to visually reflect the configured Timezone and Daylight Saving Time (DST) offsets. |
| **`module_clock_225D98` - `225F38`** | Calculates the perspective camera projection matrix using `sceVu0ViewScreenMatrix`, setting up the 3D viewport. |
| **`module_clock_22F298`** | Physics initialization. Zeros out the internal arrays containing the position and rotation vectors of the 12 glass orbs. |
| **`module_clock_22F5D0`** | The Physics Update Loop. Iterates through the 12 active orbs, applies velocity vectors to positions, handles boundary collision bounces, and assigns scaling (200.0f for the primary orb, 160.0f for background orbs). |
| **`module_clock_22FCA8`** | The Render Loop. Iterates through the linked list of active orbs and issues VIF DMA tags, commanding the VU1 to render the glass meshes with environment mapping (simulated refraction). |
| **`module_clock_232458`** | Sub-renderer specifically tasked with drawing the 3D clock face and rotating hands in the center of the screen. |
| **`module_clock_234E70`** | Sub-renderer specifically tasked with drawing the 2D user interface, including the sliding background menu panels. |

## 5. Hardware RPC (Remote Procedure Calls)

Direct communication with the I/O Processor (IOP).

| Function | Description |
| :--- | :--- |
| **`sceCdReadClock`** | Low-level SIF RPC call. Sends a command to the CDVD IOP driver to read the current time from the hardware RTC (Real-Time Clock) chip. |
| **`sceCdWriteClock`** | Low-level SIF RPC call. Takes an 8-byte buffer of Binary-Coded Decimal (BCD) formatted time and flushes it to the Mechacon hardware to permanently update the console's clock. |
