# Module System Architecture

> Details the dynamic VTable-based module loading system, the individual module lifecycles, and the complex state machine dictating transitions between them.

## Module Registration (VTable)

Each UI module follows a VTable pattern registered via `FUN_00208408()` / `FUN_00208450()`:

```c
typedef struct {
    void* (*prepare)(void);    // Create thread, return thread_id
    void* reserved;
    char* (*getdesc)(void);    // Human-readable name
    char* (*getversion)(void); // Version string
    char* (*option_str)(void); // Optional: boot option string
    void* (*pathrelated)(void);// Optional: path resolver
    void* reserved2;
} ModuleVtable;
```

### Registered Modules

| Index | Module | Setup Address | Prepare | Thread Proc |
|-------|--------|--------------|---------|-------------|
| 0 | Opening | `0x0021AB38` | `module_opening_prepare` | `module_opening_thread_proc` |
| 1 | Clock | `0x00225900` | `module_clock_prepare` | `module_clock_thread_proc` |
| 2 | Browser | `0x0024E840` | `module_browser_prepare` | `module_browser_thread_proc` |
| 3 | Machine | `0x00209438` | `module_machine_prepare` | (inline) |
| 4 | CD Player | `0x00209790` | `module_cdplayer_prepare` | (inline) |
| 5 | PS1DRV | `0x00209DE0` | `module_ps1drv_prepare` | (inline) |
| 6 | DVD Player | `0x0020A780` | `module_dvdplayer_prepare` | (inline) |
| 7 | SMAP | `0x0020A938` | `module_smap_prepare` | (inline) |

## The `var_current_module` State

The main loop utilizes `var_current_module` (at `0x1F0648`) to decide which thread to wake up.

| Value | Target |
|-------|--------|
| 0 | Opening (boot animation) |
| 1 | Opening (replay) |
| 2 | Clock/Settings |
| 3 | Browser (memory card) |
| 4 | Warning/Illegal disc screen |
| 5 | CD Player (HDD app launch) |

## Module Lifecycle

Each UI module (Opening, Clock, Browser) strictly follows the same sleeping/waking lifecycle:

```mermaid
stateDiagram-v2
    [*] --> Sleeping: CreateThread + StartThread
    Sleeping --> Active: WakeupThread (from main)
    Active --> Running: Module init
    Running --> Running: Frame loop
    Running --> Done: Transition triggered
    Done --> Sleeping: SignalSema(moduleFinishSema)
    Sleeping --> Active: Next dispatch cycle
```

## Cross-Module Communication

Communication occurs entirely through shared global variables located in the `0x1F0000` (low memory) region. There are no message queues or direct RPCs between modules.

```mermaid
flowchart TB
    subgraph "Shared State (Low Memory 0x1F0000)"
        EAT["execute_app_type<br/>0x1F0010"]
        VCM["var_current_module<br/>0x1F0648"]
        DISC["disc_type<br/>0x1F000C"]
        INPUT["pad_state<br/>0x1F0CBC"]
        CLOCKD["var_clock_is_dirty<br/>0x1F0644"]
        CFGD["config_dirty<br/>0x1F0184"]
    end
    
    subgraph "Modules"
        OPEN["Opening"]
        CLK["Clock"]
        BROW["Browser"]
    end
    
    subgraph "Services"
        CDVD_S["CDVD Handler"]
        PAD_S["Pad Handler"]
        MAIN_S["Main Dispatcher"]
    end
    
    OPEN -->|"set"| VCM
    OPEN -->|"set"| EAT
    CLK -->|"set"| CLOCKD
    CLK -->|"set"| CFGD
    CLK -->|"set"| VCM
    BROW -->|"set via globals"| VCM
    BROW -->|"set via globals"| EAT
    
    CDVD_S -->|"update"| DISC
    CDVD_S -->|"read+clear"| CLOCKD
    CDVD_S -->|"read+clear"| CFGD
    PAD_S -->|"write"| INPUT
    
    MAIN_S -->|"read"| VCM
    MAIN_S -->|"read"| EAT
    
    OPEN -.->|"read"| DISC
    CLK -.->|"read"| DISC
    CLK -.->|"read"| INPUT
    BROW -.->|"read"| INPUT
```

## Module Transitions

Transitions are governed by `opening_transition_to_clock()` and user actions in the Clock/Browser.

```mermaid
stateDiagram-v2
    direction LR
    
    [*] --> Opening: Cold Boot<br/>(var_current_module = 0)
    
    Opening --> Clock: opening_transition_to_clock()<br/>Normal flow
    Opening --> ExecuteDisc: Disc detected<br/>(execute_app_type set)
    Opening --> Browser: Browser forced<br/>(var_current_module = 3)
    Opening --> Warning: Illegal disc<br/>(var_current_module = 4)
    
    Clock --> Browser: User navigates<br/>to file browser
    Clock --> ExecuteDisc: User launches app
    Clock --> Opening: Return to opening
    
    Browser --> Clock: User returns<br/>to clock
    Browser --> ExecuteDisc: User launches<br/>MC app/game
    Browser --> Warning: Error state
    
    ExecuteDisc --> Browser: Boot error<br/>(result default)
    ExecuteDisc --> Warning: Boot warning<br/>(result = 3)
    ExecuteDisc --> Browser: DVD error<br/>(result = 5)
    
    Warning --> Browser: After display
```

### Disc Type → `execute_app_type` Mapping
From `opening_transition_to_clock()`:

| `DAT_003700A0` | Disc Type | `execute_app_type` |
|----------------|-----------|-------------------|
| `0x6A`, `0x6B` | DVD Video | 2 |
| `0x6C`, `0x6D` | PS1 Disc | 1 |
| `0x6E` | PS2 Disc | 0 |
| `0x6F` | CD Player | 5 |
| `0x70` | Warning | 4 |
| `0x73` | CDDA | 3 |

## Opening Animation Engine Details

The Opening module renders the PS2 boot sequence: crystalline towers, fog, and floating lights. It operates via a two-level state machine.

| Variable | Address | Purpose |
|----------|---------|---------|
| `DAT_00370004` | Current state | 0=Opening, 1=Illegal, 2=Exit |
| `DAT_00370008` | Next state | Written to trigger transitions |
| `DAT_0037000C` | Initial state | Copied to both on init |
| `DAT_00370010` | Sub-state | 0=InitScene, 1=Drawing, 2=Done |

```mermaid
stateDiagram-v2
    [*] --> Init: WakeupThread
    
    Init --> OpeningInit
    
    state OpeningInit {
        [*] --> InitRender: OpeningInitRender()
        InitRender --> InitAnim: OpeningInitAnimation()
        InitAnim --> InitTowers: OpeningInitTowersFog()
        InitTowers --> StartFrame: StartFrame()
    }
    
    OpeningInit --> SceneLoop: OpeningDoOpeningIllegal()
    
    state SceneLoop {
        [*] --> CheckState
        
        CheckState --> Opening: state == 0
        CheckState --> Illegal: state == 1  
        CheckState --> Exit: state == 2
        
        state Opening {
            [*] --> InitScene: OpeningInitOpeningScene()
            InitScene --> DrawScene: OpeningDrawOpeningScene()
            DrawScene --> DrawScene: frame loop
            DrawScene --> Done: transition triggered
        }
        
        state Illegal {
            [*] --> DrawIllegal: OpeningDoIllegalDisc()
        }
    }
    
    SceneLoop --> Transition: opening_transition_to_clock()
    Transition --> SignalDone: SignalSema(moduleFinishSema)
    SignalDone --> [*]: SleepThread
```
