#!/bin/bash
# CrystalOSD permuter compile script
# Used by decomp-permuter to compile C → .o for MIPS R5900 (PS2 EE)
#
# Usage (by permuter): bash compile.sh -c source.c -o output.o
#
# The permuter passes: compile.sh <file.c> -o <file.o>
# ee-gcc needs -c for compilation-only, which we inject.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Toolchain — use absolute path (~/ps2dev may not expand in all envs)
EE_GCC="${EE_GCC:-/Users/jeanxpereira/ps2dev/ee/bin/mips64r5900el-ps2-elf-gcc}"
PS2SDK="${PS2SDK:-/Users/jeanxpereira/ps2dev/ps2sdk}"

# CI override: if EE_GCC_PATH is set, use that
if [ -n "$EE_GCC_PATH" ]; then
    EE_GCC="$EE_GCC_PATH"
fi

exec "$EE_GCC" -O2 -G0 -mabi=eabi -mno-abicalls \
    -fno-common -fno-exceptions \
    -Wno-implicit-function-declaration -Wno-int-to-pointer-cast -Wno-int-conversion \
    -I "$PROJECT_ROOT/include" \
    -I "$PS2SDK/ee/include" \
    -I "$PS2SDK/common/include" \
    -c "$@"
