# Browser Module: File Operations & UI

> Documents the Virtual File System (VFS) operations managed by the Browser Module, including size formatting, copying, moving, and deleting saves between the Memory Card and the HDD.

---

## 1. Human-Readable Size Formatting

The PlayStation 2 OSDSYS uses a specific heuristic to display save file sizes to the user, calculated by `browser_human_readable_size_str()`.

### The Algorithm
The function accepts a byte size (`param_2`) and formats it into a localized string buffer.

*   **Error States**:
    *   If `size == -1`: Returns *"?"* (Unknown Size).
    *   If `size < 0`: Returns localized error string.
*   **Kilobytes (KB)**:
    *   If `size < 10,000` (10KB), it formats exactly in KB.
    *   If `size < 1,000`, it uses format string `0x40` (e.g. `"%d KB"`).
    *   Otherwise, it formats with a thousands separator (e.g. `"%d,%03d KB"`).
*   **Megabytes (MB)**:
    *   If `size >= 10,000` (10KB), the system shifts the size to represent Megabytes.
    *   It adds a rounding bias: `(size + 0x7fe) >> 10`.
    *   The result is displayed as Megabytes (`MB`), again using thousand separators if the value exceeds 999.

---

## 2. File Operations (Copy / Move / Delete)

The VFS transaction logic is handled by a state-machine driven switch case (`browser_copyentry_switchcase`).

### The State Machine
When a user selects "Copy" or "Delete", the browser enters an atomic operation mode to prevent memory card corruption.

1.  **`browser_copyentry_0_open`**: Opens the source file descriptor and creates a `.tmp` file on the destination (if copying).
2.  **`browser_copyentry_1_read`**: Reads chunks of the `.icn` or save payload into a safe EE RAM buffer.
3.  **`browser_copyentry_2_write`**: Writes the buffer chunk to the destination file.
4.  **`browser_copyentry_3_close`**: Closes both descriptors.
5.  **`browser_copyentry_5_setfileinfo`**: Copies the exact timestamp, attributes, and ownership metadata from the source to the destination.

### Icon Animations During Operations
During these states, the Browser renderer swaps the displayed 3D icon based on the `icon.sys` descriptors:
*   Normal viewing uses `icon.icn`.
*   During `copyentry` states, it uses the "Copying Icon" (e.g., the character running or a spinning disc).
*   During deletion, it uses the "Deleting Icon" (e.g., the character crying or an exploding cube).

### HDD Folder Generation
For HDD saves, `browser_generate_folder_name` is used to create deterministic folder names based on the Title ID and Partition string to prevent collisions across multiple installed games.
