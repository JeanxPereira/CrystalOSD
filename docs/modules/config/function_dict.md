# Config Module: Function Dictionary

> An exhaustive A-Z reference of the `config` subsystem functions. This module is primarily responsible for parsing the `osdmain.ini` on the HDD, communicating with the Mechacon NVRAM, and synchronizing global state with the local UI mirrors.

---

## Initialization & Lifecycle

*   `config_first`: The primary entry point called during the boot pipeline. It initializes the HDD INI parser, queries the Mechacon for parameters, maps the 15-byte PS1DRV block, and snapshots the original variables for later diffing.
*   `config_set_default_main`: Reverts the `var_mechacon_config_param_1` and peripheral variables to their factory defaults (e.g., setting the "magic number" `0x3343800`).
*   `config_mark_dirty`: Sets `var_config_dirty = 1`, triggering the async background save mechanism.

## NVRAM Accessors (Param 1 & 2)

These getters/setters manipulate the bitfields inside the 32-bit packed registers.

*   `config_get_aspect_ratio` / `config_set_aspect_ratio`: Manipulates bits 1:2 of Param 1 (`0x00371818`).
*   `config_get_video_output` / `config_set_video_output`: Manipulates bit 3 of Param 1.
*   `config_get_osd_language` / `config_set_jpn_language`: Extracts the 5-bit language ID. Contains fallback logic depending on whether the console is running a Japanese proto-kernel or US/EU retail BIOS.
*   `config_get_timezone_offset` / `config_set_timezone_offset`: Handles the sign-extension of the 11-bit UTC offset.
*   `config_get_date_format` / `config_set_date_format`: Manipulates bits 0:1 of Param 2 (`0x0037181C`).
*   `config_get_dvdp_remote_control`, `config_get_dvdp_support_clear_progressive`: Handles DVD Player related capability flags.

## HDD Storage (INI Parser)

Functions responsible for reading and writing peripheral settings to the `pfs1:/conf/system.ini` file.

*   `config_hdd_prepare`: Opens the `.ini` file and cascades through all known keys (like `keyboard`, `mouse`, `atok`). If it fails, applies defaults via `config_hdd_set_uninit()`.
*   `config_hdd_write_keys`: Iterates over the cached `g_orig_*` snapshot variables. If any value differs from the live memory, it calls `config_hdd_write_single_key` to save it back to disk.
*   `config_hdd_open_read_ini` / `config_hdd_close_ini`: File descriptor management wrapping standard `fileops_cmd_open`.
*   `config_hdd_do_get_key`: The core string parser. Interprets string values as hex (`0x`), octal (`0`), or decimal integers with sign support.

## Memory Mirrors (Clock / UI Bridge)

*   `config_load_clock_osd`: Called when the user opens the settings menu. It reads all global `var_mechacon_*` and `var_hddsys_*` values and copies them into the local Clock memory region (`var_config_*`). Unpacks the 15-byte PS1DRV block into a 30-word integer array for the UI.
*   `config_check_timezone_city`: Performs a linear search on a hardcoded 0x18-byte stride table to map a City ID to a country/region format.
*   `config_set_langtbl`: Swaps the global string-table pointer to support dynamic language changes without rebooting the console.
