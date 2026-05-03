# EE GCC 2.9-ee-991111 Compiler Quirks

The OSDSYS binary (PS2 BIOS) was compiled with early PS2 SDK compilers, specifically **`EE GCC 2.9-ee-991111`**.
This compiler behaves significantly differently from later SDKs (2.95.x and 2.96).

When decompiling and matching OSDSYS functions, adhere to the following discovered patterns:

## 1. Compiler and Flags
- **Compiler:** `EE GCC 2.9-ee-991111`
- **Flags:** `-O2 -G0`
- Do not use 2.96 (which introduces aggressive pointer caching via `addiu`) or standard 2.95.2 (which has different register allocation and less aggressive optimizations).

## 2. Pointer Re-Use (No Pointer Caching)
Unlike 2.96, the `991111` compiler does **not** cache global struct pointers into registers using `addiu`. Instead, it reuses the `%hi` portion in a register (like `v0`, `v1`, `a2`, or `a3`) and continuously uses `%lo` offsets.
- **Rule:** Do not use `volatile` hacks to force pointer reloads. Write standard C code; the compiler naturally maps it correctly.

## 3. Bitwise Constants and Masks
When masking an integer with a negative constant (e.g., `-7` / `~6`), the compiler normally generates `lui` and `ori` for the 32-bit constant (e.g., `0xfffffff9`).
- **Rule:** To force the compiler to emit a single `li` instruction (e.g., `li a0, -7`), you MUST cast the variable being masked to a signed 32-bit integer `(s32)` **before** the bitwise AND operation.
- **Example:**
  ```c
  // BAD: Generates lui 0xffff / ori 0xfff9
  var = var & -7; 
  
  // GOOD: Generates li a0, -7
  var = ((s32)var & -7);
  ```

## 4. Delay Slot Optimization (Instruction Hoisting)
The `991111` compiler aggressively hoists instructions into branch delay slots.
- **Rule:** If the original assembly has a data operation (like `andi v0, a0, 3`) in the delay slot of a branch, it means the C code evaluated that expression *after* some earlier conditions were met, so that the register was freed up.
- **Example:** To force `temp = arg0 & 3` into a delay slot and use `v0` instead of a new register like `a2`, declare and initialize `temp` **after** the initial conditional checks that consume `v0`.
  ```c
  s32 temp;
  if (condition) { ... }
  // Now v0 is free! The compiler will use v0 for temp
  // and hoist this into the branch's delay slot.
  temp = arg0 & 3; 
  ```

## 5. Sub-byte Struct Bitfields
When dealing with bitfields that fit within a single byte, the compiler will aggressively optimize 32-bit `lw` instructions into 8-bit `lbu` instructions.
- **Rule:** If the target assembly uses 32-bit `lw` and bitwise arithmetic (`srl`, `andi`) instead of `lbu`, the original C code did **not** use C struct bitfields. You must use standard bitwise math on a `u32` or `s32`.
