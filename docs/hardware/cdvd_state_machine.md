# CDVD State Machine

> Analyzes the `cdvd_handler_thread_proc` responsible for CD/DVD drive polling, disc detection, and hardware NVRAM/RTC writes.

## The CDVD Handler Thread

The CDVD handler thread (`cdvd_handler_thread_proc`) runs continuously at **priority 5**. It is responsible for polling the disc tray status and processing hardware config writes requested by UI modules.

```mermaid
flowchart TD
    START["cdvd_handler_thread_proc()"] --> WAIT["WaitSema(unksema_392904)"]
    WAIT -->|"-1"| EXIT["ExitDeleteThread()"]
    WAIT -->|"success"| DINTR["DIntr() / EIntr()<br/>Read DAT_00392920"]
    
    DINTR --> PRECHK["cdvd_handler_proc_prechk()"]
    
    PRECHK --> ADOUT{"Audio out check<br/>iRam001f1280 == 1?"}
    ADOUT -->|Yes| CTRLAD["sceCdCtrlADout(2)<br/>Check audio flags"]
    ADOUT -->|No| TOC
    
    TOC{"DAT_00392928 != 0?"}
    TOC -->|Yes| GETTOC["sceCdGetToc()<br/>SignalSema(unksema_392908)"]
    TOC -->|No| DISC
    
    DISC{"DAT_0039290c != 0?"}
    DISC -->|No| WAIT
    DISC -->|Yes| POWEROFF{"Poweroff requested?"}
    
    POWEROFF -->|Yes| TRAY["sceCdTrayReq(1)<br/>Open tray + shutdown"]
    POWEROFF -->|No| PERIODIC
    
    subgraph PERIODIC["Periodic Tasks"]
        CLOCK_DIRTY{"var_clock_is_dirty?"}
        CLOCK_DIRTY -->|Yes| WRITECLK["sceCdWriteClock()<br/>Flush to RTC"]
        
        CONFIG_DIRTY{"iRam001f0184 == 1?"}
        CONFIG_DIRTY -->|Yes| MODCFG["cdvd_cmd_modifyconfig()<br/>Write NVRAM"]
        
        DIAG{"var_diagnosis_is_dirty?"}
        DIAG -->|"!= -1"| ADJCTRL["cdvd_cmd_aadjustctrl()"]
        
        RCGAME{"var_rc_gameplay_is_dirty?"}
        RCGAME -->|"!= -1"| RCBYPASS["cdvd_cmd_rcbypassctl()"]
    end
    
    PERIODIC --> WAIT
```

## Dirty Flags and Hardware Synchronization

The CDVD thread is the *only* thread in the OSDSYS that writes directly to the hardware NVRAM and RTC via SIF RPC. The UI modules (like the Clock) do not execute RPC calls directly; instead, they set "dirty" flags in the `0x1F0000` low-memory region. 

The CDVD thread checks these flags periodically and executes the actual hardware writes:

| Flag Variable | Address | Written By | Action Executed by CDVD |
|---------------|---------|-----------|------------------------|
| `var_clock_is_dirty` | `0x1F0644` | Clock module | `sceCdWriteClock()` → RTC Update |
| `iRam001f0184` | `0x1F0184` | Config module | `cdvd_cmd_modifyconfig()` → Mechacon NVRAM |
| `var_diagnosis_is_dirty` | `0x1F1284` | Clock settings | `cdvd_cmd_aadjustctrl()` |
| `var_rc_gameplay_is_dirty` | `0x1F1288` | Clock settings | `cdvd_cmd_rcbypassctl()` |

The periodic idle check runs every `0x3C` (60) semaphore cycles. If no configuration is dirty and the system is idle, it calls `FUN_00200FC0()` (likely triggering HDD standby/spindown).
