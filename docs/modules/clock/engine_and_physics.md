# Clock Module: Engine & Physics

> A deep dive into the inner workings of the `module_clock` subsystem, focusing on its 3D rendering pipeline, the physics simulation of the background glass orbs, and how it handles user input and configuration synchronization.

## 1. Clock Module Overview

The Clock module is the default "idle" state of the PS2. When the user drops out of the Opening animation or exits the Browser, the system transitions here. The module operates entirely inside `module_clock_thread_proc` (Priority 6).

```mermaid
flowchart TD
    THREAD["module_clock_thread_proc()"] --> QUEUESOUND["sound_handler_queue_cmd(0x6150)<br/>Play ambient drone"]
    QUEUESOUND --> INIT_STATE["module_clock_23A068()<br/>module_clock_225D98()"]
    
    INIT_STATE --> LOOP
    
    subgraph LOOP ["Frame Loop"]
        direction TB
        DRAW["clock_stuff1()<br/>Render Frame"]
        INPUT["clock_input_check_handler_p6_p7_tgt()<br/>Process Input & Transitions"]
        VSYNC["SignalSema(moduleFinishSema)<br/>SleepThread()"]
        
        DRAW --> INPUT --> VSYNC
    end
```

## 2. The Rendering Pipeline (Graphics & Physics)

The Clock module runs at 60 FPS (NTSC) or 50 FPS (PAL), synchronized to the VBlank interrupt. The entire visual state of the module is driven by a hierarchy of math subroutines.

```mermaid
flowchart TD
    THREAD["module_clock_thread_proc()"] --> STUFF1["clock_stuff1()"]
    
    subgraph "Render Setup"
        STUFF1 --> RESET["sceGsResetPath()<br/>sceDmaReset(1)"]
        RESET --> ORB_RENDER["clock_orb_rendering_func()"]
    end
    
    subgraph "Orb Physics Engine"
        ORB_RENDER --> CAM["module_clock_225F38()<br/>Setup VU0 Camera Matrix"]
        ORB_RENDER --> TRANSFORM["module_clock_226000()<br/>Screen Bounds & Culling"]
        ORB_RENDER --> DISPATCH["module_clock_22FE98()<br/>Orb Dispatcher"]
        
        DISPATCH --> INIT["module_clock_22F298()<br/>Init Orbs (if needed)"]
        DISPATCH --> UPDATE["module_clock_22F5D0()<br/>Update Velocities & Scales"]
        DISPATCH --> DRAWLOOP["module_clock_22FCA8()<br/>Iterate Active Orbs"]
        
        DRAWLOOP --> DRAW1["module_clock_22F908()<br/>Draw Type 1 Orb"]
        DRAWLOOP --> DRAW2["module_clock_22FC88()<br/>Draw Type 2 Orb"]
    end
    
    subgraph "Clock UI & Menu"
        ORB_RENDER --> CLOCK_HANDS["module_clock_232458()<br/>Draw Clock Hands"]
        ORB_RENDER --> MENU_ROOT["module_clock_234E70()"]
        
        MENU_ROOT --> MENU_RENDER["draw_clock_menu_items_hkdosd_p4_tgt()"]
        MENU_RENDER --> STR_FETCH["get_lang_string_GetOSDString()"]
        MENU_RENDER --> DRAW_ITEM["draw_menu_item()"]
    end
```

## 3. The Floating Orbs (Physics Simulation)

The background of the clock screen features 12 floating, transparent spheres. These "orbs" are rendered using VU0 macro mode and feature complex collision and refraction physics.

### Physics State
The state of the 12 orbs is updated continuously by `module_clock_22F5D0()`. The system tracks 12 physical entities stored in a contiguous array in the `0x00404000` memory region.

| Property | Size | Description |
|----------|------|-------------|
| ID | 4 bytes | Index 0–11 |
| Position | 16 bytes (vec4) | Current 3D position `(x, y, z, w)` |
| Velocity | 16 bytes (vec4) | Current momentum |
| Rotation | 16 bytes (vec4) | Spin matrix components |
| Scale | 4 bytes | Size of the orb |

The update loop applies velocity vectors, handles screen-edge boundary collisions (bouncing), and applies scaling rules:
*   **Focus Orb** (index 0): Scaled to `0x43480000` (200.0f).
*   **Background Orbs**: Scaled to `0x43200000` (160.0f).

### Refraction rendering
Because the PS2 lacks programmable pixel shaders, the "glass" refraction effect of the orbs is achieved using **environment mapping**. The VU1 calculates UV coordinates based on the vertex normal reflected against the camera vector, mapping a blurry environment texture onto the spheres to simulate light bending.

## 4. Input & Transitions

The input polling and transition logic lives in `clock_input_check_handler_p6_p7_tgt()`.

```mermaid
stateDiagram-v2
    [*] --> Polling: clock_input_check_handler_p6_p7_tgt()
    
    state Polling {
        direction LR
        CheckDisc --> CheckPad
    }
    
    Polling --> DiscAutoBoot: _disc_type_1F000C changed
    Polling --> ToggleMenu: Triangle Pressed
    Polling --> ExitToBrowser: X Pressed (Menu Closed)
    
    state DiscAutoBoot {
        [*] --> opening_transition_to_clock
        opening_transition_to_clock --> SetAppType: execute_app_type = X
    }
    
    state ToggleMenu {
        [*] --> config_load_clock_osd: Load RAM mirrors
        config_load_clock_osd --> MenuActive
    }
    
    state ExitToBrowser {
        [*] --> browser_str_related: Load icons
        browser_str_related --> SetModule: var_current_module = 3
    }
```

*   **Disc Auto-Boot**: If a disc is inserted, the CDVD Handler updates `_disc_type_1F000C`. The Clock module detects this change, breaks its render loop, and signals the main dispatcher to boot the disc.
*   **Browser Transition**: Pressing `X` initiates a transition to the Browser module by setting `var_current_module = 3`.

## 5. Configuration Sync Pipeline

When the user changes a setting in the Clock menu, the Clock module does **not** write to the NVRAM directly. It uses an asynchronous sync pipeline.

```mermaid
sequenceDiagram
    participant User as User (Gamepad)
    participant UI as Clock Input Handler
    participant CB as Config Callback
    participant RAM as RAM Mirror
    participant CDVD as CDVD Handler Thread
    participant HARDWARE as Mechacon / RTC
    
    User->>UI: Presses D-Pad (Change Language)
    UI->>CB: clock_config_change_cb_osd_language()
    
    CB->>RAM: module_clock_get_config_item()
    CB->>CB: Compare with thunk_config_get_osd_language()
    
    alt Value Changed
        CB->>RAM: Update Local Mirror
        CB->>RAM: config_mark_dirty() -> iRam001f0184 = 1
    end
    
    Note over CDVD: Runs asynchronously (Priority 5)
    
    CDVD->>CDVD: cdvd_handler_proc_prechk()
    CDVD->>RAM: Check iRam001f0184 == 1
    
    alt Dirty Flag Set
        CDVD->>HARDWARE: cdvd_cmd_modifyconfig()<br/>Write to NVRAM
        CDVD->>RAM: iRam001f0184 = 0
    end
```

This asynchronous design ensures that the GS rendering loop (Clock thread) never blocks waiting for slow I2C bus communications with the RTC or EEPROM chips.

### Time Change & BCD
If the user alters the time/date, the callback `config_item_change_cb_clock_write_mechacon` converts the UI's decimal values into **BCD (Binary-Coded Decimal)** format. It stages this buffer and sets `_var_clock_is_dirty = 1`, prompting the CDVD thread to execute `sceCdWriteClock`.
