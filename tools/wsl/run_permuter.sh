#!/usr/bin/env bash
# run_permuter.sh <func> [extra permuter args]
# Run decomp-permuter on an imported function in WSL. Import first with
#   tools/permuter_import.sh <func> src/<sub>/<func>.c   (AS=.../mips64r5900el-ps2-elf-as)
# Set PERMUTER_G=-G0/-G8 for the function's small-data threshold (default -G8).
set -e

FUNC="${1:?usage: run_permuter.sh <func> [extra permuter args]}"; shift || true
BIN=/home/jeanxpereira/ps2dev/ee/bin
VENV_PY=/home/jeanxpereira/cosd-venv/bin/python
REPO=/mnt/c/CodingProjects/Personal/CrystalOSD

# The permuter's scorer looks for mips-linux-gnu-objdump / mips64-elf-objdump; ours is
# mips64r5900el-ps2-elf-objdump. Symlink the expected names to it (idempotent).
ln -sf "$BIN/mips64r5900el-ps2-elf-objdump" "$BIN/mips-linux-gnu-objdump"
ln -sf "$BIN/mips64r5900el-ps2-elf-objdump" "$BIN/mips64-elf-objdump"

export PATH="$BIN:$PATH"
export PERMUTER_G="${PERMUTER_G:--G8}"

cd "$REPO/tools/decomp-permuter"
exec "$VENV_PY" ./permuter.py "nonmatchings/$FUNC" "$@"
