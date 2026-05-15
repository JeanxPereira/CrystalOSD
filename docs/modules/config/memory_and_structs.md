# Config Module: Memory & Struct Definitions

> A low-level technical reference detailing the memory structures, INI schema, and bitwise packing formats used by the `config` subsystem to persist data on the HDD and Mechacon NVRAM.

---

## 1. Mechacon NVRAM Storage (`osd_config.h`)

The PlayStation 2 Mechacon chip stores small amounts of global configuration. The OSDSYS reads this 0x15-byte block and unpacks it into two 32-bit registers for fast in-memory access.

### `var_mechacon_config_param_1` (0x00371818)
| Bits | Mask | Field Name | Description |
|------|------|------------|-------------|
| 0 | `0x00000001` | `spdif_mode` | Optical Audio Out (0=Off, 1=On) |
| 1-2 | `0x00000006` | `aspect_ratio` | Screen Type (0=4:3, 1=Full, 2=16:9) |
| 3 | `0x00000008` | `video_output` | (0=RGB, 1=Component) |
| 4-8 | `0x000001F0` | `osd_language` | Menu Language (1=JP, 2=EN, 3=FR, 4=SP, 5=DE, 6=IT, 7=NL, 8=PT) |
| 9-19 | `0x000FFE00` | `timezone_offset` | 11-bit signed integer for UTC offset |
| 20-28 | `0x1FF00000` | `timezone_city` | 9-bit city index (0-127). If > 127, uses `g_extended_timezone_city`. |
| 29 | `0x20000000` | `daylight_saving` | DST active (0=Standard, 1=Summer) |
| 30 | `0x40000000` | `time_format` | (0=24h, 1=12h) |
| 31 | `0x80000000` | `osdInit` | Factory init flag (Preserved during factory reset) |

### `var_mechacon_config_param_2` (0x0037181C)
| Bits | Mask | Field Name | Description |
|------|------|------------|-------------|
| 0-1 | `0x00000003` | `date_format` | (0=YYYY/MM/DD, 1=MM/DD/YYYY, 2=DD/MM/YYYY) |
| 2 | `0x00000004` | `unk_204DD8` | Likely an Out-of-Box-Experience (OOBE) flag |
| 3 | `0x00000008` | `rc_gameplay` | Remote Control Game Mode Enabled |
| 4 | `0x00000010` | `dvdp_remote_control` | DVD Player Remote Control Enabled |
| 5 | `0x00000020` | `dvdp_progressive` | DVD Player Progressive Scan Support |

---

## 2. PS1 Driver Configuration (`var_ps1drv_config`)

The PS1 emulation settings (Disc Speed, Texture Smoothing, etc.) are allocated **15 bytes** inside the Mechacon. However, the OSDSYS uses aggressive bit-packing to store **two 3-bit variables per byte**, giving a total of 30 logical fields.

*   **Low Nibble**: `var_ps1drv_config[idx] & 0x07`
*   **High Nibble**: `(var_ps1drv_config[idx] >> 4) & 0x07`

When the settings menu opens, `config_load_clock_osd()` loops backward through these 15 bytes and unpacks them into a 30-word 32-bit integer array (`var_config_ps1drv_low` and `var_config_ps1drv_hi`) for the UI to mutate safely.

---

## 3. HDD Configuration (`osdmain.ini`)

Unlike system-level features, USB peripherals (Keyboard and Mouse) are saved as plain text on the internal Hard Drive, parsed at boot by `config_hdd_prepare()`.

*   **File Path**: `pfs1:/conf/system.ini` (Mapped to `g_hdd_ini_filename`)
*   **Fallback Path**: `pfs1:/conf/system.ini.tmp` (Used for atomic writes)

### INI Schema
Based on the extracted `.data` segment strings, the file is structured with the following sections and keys:

```ini
[keyboard]
type=1        ; 1=US, 2=JP, 3=FR, 4=SP, 5=DE, 6=IT, 7=NL, 8=UK, 9=PT
repeatw=1     ; Delay Until Repeat
repeats=1     ; Repeat Rate

[mouse]
speed=1       ; Cursor Speed
dblclk=1      ; Double Click Speed
lr=1          ; 0=Left-Handed, 1=Right-Handed

[atok]
mode=0        ; Japanese IME Mode
bind=1        ; Japanese IME Keybindings

[softkb]
softkb_onoff=1 ; On-Screen Keyboard Enabled
softkb_qwert=0 ; 0=Alphabetical, 1=QWERTY
```
