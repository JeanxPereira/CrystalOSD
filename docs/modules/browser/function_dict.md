# Browser Module: Function Dictionary

> An exhaustive A-Z reference of the `browser` subsystem functions. This module is the largest in the OSDSYS, responsible for managing the Virtual File System, rendering Memory Card icons, and parsing CD/DVD disc formats.

---

## 1. Icon & Save Parsing

*   `browser_handle_icon_sys_binary`: Parses the PS2 `icon.sys` file (magic `PS2D`), extracts title strings, and 3D lighting parameters into the `iconinfo_ptr` buffer.
*   `browser_handle_icon_sys_text`: Parses legacy PS1 text-based icon configs.
*   `browser_handle_ps2_icon` / `browser_handle_ps1_icon`: Main dispatchers for initializing the icon renderer depending on the save file architecture.
*   `browser_icon_sys_num_one_parse`, `browser_icon_sys_int_array_parse`, `browser_icon_sys_float_array_parse`: Helper functions used to parse vectors and scalars out of the `icon.sys` header.
*   `browser_get_icon_bytes`: Returns the raw byte payload of the parsed `.icn` 3D model to be DMA'd to the GS.

## 2. File Operations (Copy / Move / Delete)

*   `browser_copyentry_switchcase`: The core state machine driving atomic VFS transactions.
*   `browser_copyentry_0_open`: VFS Open descriptor state.
*   `browser_copyentry_1_read`: VFS Read chunk state.
*   `browser_copyentry_2_write`: VFS Write chunk state.
*   `browser_copyentry_3_close`: VFS Close descriptor state.
*   `browser_copyentry_5_setfileinfo`: Synchronizes modified dates, creation dates, and ownership metadata after a successful copy.
*   `browser_generate_folder_name`: Hashes/generates a strict collision-free folder name for copying saves into the HDD partitions.

## 3. UI, Strings & Menus

*   `browser_human_readable_size_str`: Converts raw byte sizes into localized "KB" or "MB" strings with thousand separators.
*   `browser_get_item_info`, `browser_get_hdd_item_info`, `browser_get_device_info`: Populates the text boxes with save metadata (Title, Size, Format) when hovering over an icon in the grid.
*   `browser_get_item_type_str_index`: Returns the ID for localized strings like "PlayStation 2 Format Data" or "PlayStation Format Data".
*   `browser_copy_menu`, `browser_rename_menu`, `browser_delete_menu`: Handles the prompt UI loops for file operations.
*   `browser_get_delete_message`: Fetches context-aware localized strings based on whether the target is a Memory Card or HDD (e.g. "Do not remove the memory card").
*   `browser_confirmation_menu`: A generic Yes/No popup handler used across the module.

## 4. Hardware Interaction & Rendering

*   `browser_device_icon_render`: Core render loop that issues VU1/GIF packets to spin the 3D icons on the X/Y axes.
*   `browser_mc_info_23C2B8`, `browser_mc_mtap_23C468`: Queries the IOP for Memory Card insertion status and Multitap topological state.
*   `browser_cdplayer_related`: Handles specific UI elements when a Music CD is inserted.
*   `return_to_browser`: Master reset function to re-initialize the browser grid after an app/game exits or after an error.
