/* ghidra_types.h — Compatibility typedefs for raw Ghidra decompiler output
 *
 * Maps Ghidra's pseudo-types to real C types so stubs can compile
 * with ee-gcc for Transmuter/decomp-permuter matching.
 *
 * Include this ONLY in src/stubs/ files. Never use in final src/ code.
 */

#ifndef GHIDRA_TYPES_H
#define GHIDRA_TYPES_H

/* Forward-declare common libc functions instead of including headers
 * to avoid conflicts with the project's own include/string.h */
typedef unsigned long size_t;
int printf(const char *, ...);
int sprintf(char *, const char *, ...);

typedef unsigned char       undefined;
typedef unsigned char       undefined1;
typedef unsigned short      undefined2;
typedef unsigned int        undefined4;
typedef unsigned long long  undefined8;

typedef unsigned char       byte;
typedef unsigned short      ushort;
typedef unsigned int        uint;
typedef unsigned long       ulong;
typedef unsigned long long  ulonglong;

typedef long long           longlong;

/* Ghidra trap() intrinsic — maps to MIPS break instruction */
#define trap(code) __builtin_trap()

#endif /* GHIDRA_TYPES_H */
