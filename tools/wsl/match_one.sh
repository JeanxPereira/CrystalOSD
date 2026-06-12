#!/usr/bin/env bash
# match_one.sh <subsys>/<func>
# Compile src/<subsys>/<func>.c (ee-gcc 2.9) + assemble asm/<subsys>/<func>.s (target),
# compare instruction-for-instruction. Prints "MATCH" or a unified diff (target < vs base >).
# Decomp inner-loop verifier. LF script — run via: wsl.exe -d Ubuntu -- bash <path> <arg>
set -euo pipefail

TARGET="${1:?usage: match_one.sh <subsys>/<func>}"
REPO=/mnt/c/CodingProjects/Personal/CrystalOSD
PS2DEV=/home/jeanxpereira/ps2dev
PREFIX="$PS2DEV/ee/bin/mips64r5900el-ps2-elf-"
EEGCC=/home/jeanxpereira/ee-gcc2.9-991111/bin/ee-gcc

cd "$REPO"
sub="${TARGET%%/*}"; fn="${TARGET##*/}"
C="src/$sub/$fn.c"; S="asm/$sub/$fn.s"
[ -f "$S" ] || { echo "NO TARGET ASM: $S"; exit 2; }
[ -f "$C" ] || { echo "NO C FILE: $C  (write your reconstruction there first)"; exit 2; }

W=$(mktemp -d /tmp/m1.XXXXXX)
trap 'rm -rf "$W"' EXIT
cp "$C" "$W/x.c"
cp -r include "$W/include" 2>/dev/null || true

# target asm -> target.o
"${PREFIX}as" -march=r5900 -mabi=eabi -G0 -I include -o "$W/target.o" "$S" 2>/dev/null

# Normalize: drop the address+raw-bytes columns, keep mnemonic+operands+relocations.
norm() { "${PREFIX}objdump" -dr --no-show-raw-insn "$1" \
  | sed -nE 's/^[[:space:]]+[0-9a-f]+:[[:space:]]+//p' \
  | sed -E 's/[[:space:]]+/ /g; s/[[:space:]]+$//'; }
norm "$W/target.o" > "$W/t.txt"

# Small-data threshold (-G) varies per function (gp-relative vs absolute global access).
# Try the plausible values; MATCH if any produces identical instructions.
best=""; bestn=99999
for G in -G0 -G8; do
  if ! ( cd "$W" && "$EEGCC" -O2 $G -Wall -D_EE -mabi=eabi -mno-abicalls -fno-common -fno-exceptions \
          -I include -c x.c -o base.o ) 2>"$W/cc.err"; then
    echo "COMPILE ERROR ($G):"; sed 's#^x\.c#'"$C"'#' "$W/cc.err" | head -30; exit 1
  fi
  norm "$W/base.o" > "$W/b.txt"
  if diff -q "$W/t.txt" "$W/b.txt" >/dev/null; then
    echo "MATCH ✅  ($(grep -c . "$W/t.txt") instrs/relocs)  [flags: -O2 $G]"; exit 0
  fi
  d=$(diff "$W/t.txt" "$W/b.txt" | grep -c '^[<>]') || true   # diff exits 1 on differences
  if [ "$d" -lt "$bestn" ]; then bestn=$d; best="$G"; cp "$W/b.txt" "$W/best.txt"; fi
done
T=$(grep -c . "$W/t.txt"); B=$(grep -c . "$W/best.txt")
echo "NO MATCH  (closest -O2 $best: $bestn differing lines; target=$T base=$B)  — '<' target, '>' base:"
diff "$W/t.txt" "$W/best.txt" | head -50
