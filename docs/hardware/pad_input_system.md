# Pad Input & Sound Subsystem

> Details the `pad_sound_handler_thread_proc` responsible for polling controllers, IR remotes, and managing the audio queue for the SPU2.

## Input Handling System

The `pad_sound_handler_thread_proc` runs at **priority 3** (every VBlank), polling all 8 pad ports (Multitap included) and the IR remote.

```mermaid
flowchart TD
    START["pad_sound_handler_thread_proc()"] --> SLEEP["SleepThread()"]
    SLEEP --> SOUND["sound_handler_exec_queue_cmd()<br/>Process queued sound commands"]
    
    SOUND --> SPDIF{"SPDIF mode change?<br/>iRam001f0114 != 0"}
    SPDIF -->|Yes| SDREMOTE["sceSdRemote(0x8070)<br/>Set optical output mode"]
    SPDIF -->|No| PADS
    
    PADS["Poll 8 pad ports"] --> PADLOOP["for port 0..7"]
    PADLOOP --> PORTSTATE{"Port connected?"}
    PORTSTATE -->|No| CLOSE["scePadPortClose2()"]
    PORTSTATE -->|Yes| OPEN["scePadPortOpen()<br/>Assign buffer at 0x38AD80"]
    
    OPEN --> READ["scePadGetState() + scePadRead()"]
    READ --> COMBINE["Combine button masks<br/>DAT_002AE5D2/D3"]
    
    COMBINE --> REMOTE["rm2_related_201160()<br/>Check IR remote"]
    REMOTE --> REMAP{"Remote active?"}
    REMAP -->|Yes| IRMAP["Map IR buttons<br/>to pad buttons"]
    REMAP -->|No| PADRATE["Set repeat rate<br/>(PAL: 20/25, NTSC: 24/30)"]
    
    PADRATE --> VIDMODE{"L1+R1 remap?<br/>get_vidmode_with_fallback()"}
    VIDMODE -->|Yes| SWAPLR["Swap L2↔L1, R2↔R1"]
    VIDMODE -->|No| OUTPUT
    
    OUTPUT["Write to shared state:<br/>0x1F0CBC-0x1F0CBF"] --> HDDCHK["pad_handler_hddboot_check()"]
    HDDCHK --> PADEND["pad_handler_211860()"]
    PADEND --> SLEEP
```

## Input Data Format (Shared Memory)

The final parsed pad state is written to shared memory at `0x1F0CBC`, where the UI modules read it.

| Offset | Size | Content |
|--------|------|---------|
| `0x1F0CBC` | 1 | `DAT_002AE5D0` — pad mode |
| `0x1F0CBD` | 1 | `DAT_002AE5D1` — pad ID |
| `0x1F0CBE` | 1 | Button mask high (inverted: 0=pressed) |
| `0x1F0CBF` | 1 | Button mask low (inverted: 0=pressed) |
| `0x1F0CDC` | 4 | Input type (0=none, 6=pad/remote) |

## PAL vs NTSC Key Timing

Because the pad polling is tied to the VBlank rate, the OSDSYS uses different frame counters for key-repeat rates to maintain identical physical timings across 50Hz and 60Hz regions:

| Parameter | NTSC (60Hz) | PAL (50Hz) |
|-----------|------|-----|
| Key repeat start | 24 frames | 20 frames |
| Key repeat rate | 30 frames | 25 frames |
| Remote repeat start | 38 frames | 31 frames |
| Remote repeat rate | 54 frames | 45 frames |

---

## Sound Subsystem

The sound system handles audio queue commands pushed from the UI modules.

```mermaid
flowchart TB
    subgraph "EE Side"
        SINIT["sound_init()"]
        SQUEUE["sound_handler_queue_cmd()"]
        STHREAD["sound_thread_proc"]
    end
    
    subgraph "IOP Side (via SIF RPC)"
        SDREMOTE["sceSdRemote()"]
        SPU2_DRV["SPU2 Driver"]
    end
    
    subgraph "Sound Banks"
        BOOT["sndboots (0x42 entries)"]
        TUNNEL["sndtnnls (0x2A entries)"]
        CLOCK_S["sndcloks (0x2D entries)"]
        TM30["sndtm30s (0x1B entries)"]
        TM60["sndtm60s (0x1B entries)"]
        LOGO["sndlogos (0x1B entries)"]
        WARN["sndwarns (0x36 entries)"]
        RCLK["sndrclks (0x36 entries)"]
    end
    
    SINIT -->|"sceSdRemoteInit()"| SDREMOTE
    SINIT -->|"load_sound_resources()"| SPU2_DRV
    SINIT -->|"sceSdRemote(0x6060)"| BOOT
    SINIT -->|"sceSdRemote(0x6090)"| TUNNEL
    SINIT -->|"sceSdRemote(0x6090)"| CLOCK_S
    SINIT -->|"sceSdRemote(0x6090)"| TM30
    SINIT -->|"sceSdRemote(0x6090)"| TM60
    SINIT -->|"sceSdRemote(0x6090)"| LOGO
    SINIT -->|"sceSdRemote(0x6090)"| WARN
    SINIT -->|"sceSdRemote(0x6090)"| RCLK
    
    SQUEUE --> STHREAD --> SDREMOTE
```

The system uses 8 sound banks loaded into IOP memory via `sceSdRemote()`. Each bank contains sequenced audio data. The `sndosddh` bank at offset `0x6000` handles the signature OSDSYS ambient drone sound.
