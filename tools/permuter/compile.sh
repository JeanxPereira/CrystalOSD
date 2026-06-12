#!/usr/bin/env bash
# CrystalOSD permuter compile script — compiles C -> .o with the MATCHING compiler
# (ee-gcc 2.9-991111), for decomp-permuter. The permuter invokes:
#     compile.sh <source.c> -o <output.o>
#
# Three WSL realities are handled here:
#  - Matching compiler is ee-gcc 2.9 (NOT modern ps2dev gcc — that won't byte-match).
#  - ee-gcc is a 32-bit 1999 binary; stat() EOVERFLOWs on the 9p /mnt/c mount, so we
#    copy the source to native ext4 (/tmp) and compile there.
#  - Small-data threshold (-G) is per-function; pass PERMUTER_G=-G0/-G8 (default -G8).
set -e

EE_GCC="${EE_GCC:-/home/jeanxpereira/ee-gcc2.9-991111/bin/ee-gcc}"
GFLAG="${PERMUTER_G:--G8}"

SRC=""; OUT=""; extra=()
while [ $# -gt 0 ]; do
  case "$1" in
    -o) OUT="$2"; shift 2 ;;
    *.c) SRC="$1"; shift ;;
    *) extra+=("$1"); shift ;;
  esac
done
[ -n "$SRC" ] || { echo "compile.sh: no source .c in args" >&2; exit 2; }
[ -n "$OUT" ] || { echo "compile.sh: no -o output" >&2; exit 2; }

W=$(mktemp -d /tmp/permc.XXXXXX)
trap 'rm -rf "$W"' EXIT
cp "$SRC" "$W/x.c"
# ee-gcc 2.9 rejects modern -Wno-int-* flags; keep the minimal matching set (as match_one.sh).
"$EE_GCC" -O2 "$GFLAG" -Wall -D_EE -mabi=eabi -mno-abicalls -fno-common -fno-exceptions \
  "${extra[@]}" -c "$W/x.c" -o "$W/x.o"
cp "$W/x.o" "$OUT"
