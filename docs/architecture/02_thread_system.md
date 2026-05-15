# Thread & Synchronization Architecture

> Detailed mapping of the EE core threads, synchronization semaphores, async file I/O framework, and callback queues.

## Complete Thread Priority Map

```text
Priority 1  ████████████████████████████████  Graph Swap (framebuffer flip)
Priority 3  ████████████████████████████      Pad/Sound Handler (input+audio)  
Priority 5  ██████████████████████████        CDVD Handler / File Ops
Priority 6  ████████████████████████          Module Threads (Opening/Clock/Browser)
Priority 30 ████████████                      Main Thread (module dispatcher)
Priority 40 ████████                          Callback Queue (deferred ops)
```

Lower number = higher priority. The design ensures:
- **Framebuffer flips** never miss VSync (priority 1).
- **Input** is always responsive (priority 3).
- **Disc detection** and I/O run before UI logic (priority 5).
- **UI modules** consume the bulk of idle CPU time (priority 6).
- **Main dispatcher** only runs when modules yield (priority 30).
- **Deferred callbacks** execute when nothing else needs CPU (priority 40).

## Core Thread Architecture

```mermaid
flowchart TB
    subgraph "EE Core (MIPS R5900)"
        MAIN["Main Thread<br/>Priority: 30<br/>Module Dispatcher"]
        GRAPH["Graph Swap Thread<br/>Priority: 1<br/>Framebuffer flip"]
        PAD["Pad/Sound Handler<br/>Priority: 3<br/>Input + Sound Queue"]
        
        subgraph "Module Threads (Priority: 6)"
            OPEN["Opening Thread"]
            CLOCK["Clock Thread"]
            BROWSER["Browser Thread"]
        end
        
        SOUND["Sound Thread<br/>SPU2 DMA"]
        CDVD["CDVD Handler<br/>Priority: 5<br/>Disc Detection"]
    end
    
    subgraph "IOP (R3000)"
        SIF["SIF RPC"]
        SPU2["SPU2 Hardware"]
        CDVD_HW["CD/DVD Drive"]
        HDD["HDD (ATA)"]
    end
    
    MAIN -->|WakeupThread| OPEN
    MAIN -->|WakeupThread| CLOCK
    MAIN -->|WakeupThread| BROWSER
    OPEN -->|SignalSema| MAIN
    CLOCK -->|SignalSema| MAIN
    BROWSER -->|SignalSema| MAIN
    
    PAD -->|queue_cmd| SOUND
    SOUND -->|sceSdRemote| SIF
    SIF --> SPU2
    CDVD -->|sceCdInit| SIF
    SIF --> CDVD_HW
    GRAPH -->|GS Packets| GS["GS (Graphics)"]
```

## Hardware Synchronization Semaphores

### Rendering Semaphore Chain
The Graph Swap thread (`priority 1`) ensures framebuffer flips happen instantly without tearing.

| Semaphore | Signaled By | Waited By | Purpose |
|-----------|------------|-----------|---------|
| `swapSema` | Module thread | Graph swap thread | "Frame ready to display" |
| `drawStartSema` | Graph swap thread | Module thread | "Buffer swapped, draw next" |
| `drawEndSema` | VBlank handler | Module thread | "GS finished drawing" |
| `waitFrameSema` | VBlank handler | `OpeningDoWaitNextFrame()` | "VSync occurred" |

### Main Execution Semaphores
| Semaphore | Signaled By | Waited By | Purpose |
|-----------|------------|-----------|---------|
| `moduleFinishSema` | Any Module Thread | Main Dispatcher | Signals that the module has finished its work (e.g., transition triggered) |

## File Operations Framework

The `fileops` subsystem provides async file I/O via a dedicated thread (`Priority 5`), managing up to 5 concurrent Memory Card slots and 3 HDD file handles.

```mermaid
flowchart TD
    subgraph "Caller Thread"
        REQ["fileops_cmd_read/write/mount/umount()"]
        REQ --> SIGNAL["SignalSema(fileops_sema1)"]
        SIGNAL --> BLOCK["WaitSema(fileops_sema2)<br/>Block until complete"]
    end
    
    subgraph "File Ops Thread (Priority 5)"
        WAIT["WaitSema(fileops_sema1)"]
        WAIT --> DISPATCH{"var_fileops_operation"}
        DISPATCH -->|read| READ["sceRead()"]
        DISPATCH -->|write| WRITE["sceWrite()"]
        DISPATCH -->|mount| MOUNT["sceMount()"]
        DISPATCH -->|umount| UMOUNT["sceUmount()"]
        READ --> DONE["SignalSema(fileops_sema2)"]
        WRITE --> DONE
        MOUNT --> DONE
        UMOUNT --> DONE
        DONE --> WAIT
    end
```

### File Handle Pools
| Pool | Count | Purpose |
|------|-------|---------|
| MC Slots | 5 | `mc0:/BADATA-SYSTEM/`, `mc1:/`, etc. |
| HDD Slots | 3 | `pfs0:`, `pfs1:`, partition mounts |

Each slot maintains: a file descriptor, operation state, last error code, and a 48-byte path buffer.

## Callback Queue System

The callback queue (`callback_queue_prepare`) provides deferred execution for operations that cannot safely run inside an interrupt context.

```text
callback_queue_thread (Priority 40, Stack 16KB)
  └─ WaitSema(unksema_396944)
     └─ Execute queued callback
     └─ SignalSema(unksema_396948)
```

This is used heavily for HDD operations triggered from CDVD interrupts. Since `sceCdPOffCallback` fires inside a hardware interrupt, it queues the power-off work for this thread instead of blocking the EE core.
