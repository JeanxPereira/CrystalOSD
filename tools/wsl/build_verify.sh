#!/usr/bin/env bash
# Canonical CrystalOSD byte-perfect build for WSL2. Run: bash tools/wsl/build_verify.sh
# Reproduces the byte-identical ELF from the committed repo state. LF script (avoids
# wsl.exe interop CRLF/quoting issues). See docs/SETUP_WSL.md for toolchain install.
set -euo pipefail

REPO=/mnt/c/CodingProjects/Personal/CrystalOSD
PS2DEV=/home/jeanxpereira/ps2dev
PREFIX="$PS2DEV/ee/bin/mips64r5900el-ps2-elf-"
EEGCC=/home/jeanxpereira/ee-gcc2.9-991111/bin/ee-gcc
PS2SDK="$PS2DEV/ps2sdk"
VENV_PY=/home/jeanxpereira/cosd-venv/bin/python
cd "$REPO"

echo "=== [1/6] toolchain ==="
"${PREFIX}as" --version | head -1
"$EEGCC" --version | head -1

echo "=== [2/6] regenerate gitignored splat outputs (asm/data, undefined_*.txt) ==="
# configure.py runs splat. It also rewrites the committed code asm (lossily: ~4271 of the
# 5337 files) and OSDSYS_A.ld — so we restore those from git right after. asm/data and
# undefined_*.txt are gitignored and are the artifacts we actually want regenerated.
# -c is REQUIRED: it clears .splache + build/ so undefined_*.txt regenerates consistently
# with the committed code asm. Without it, a stale cache yields undefined `$L*` locals.
"$VENV_PY" configure.py -c >/tmp/cosd_cfg.log 2>&1 || { tail -5 /tmp/cosd_cfg.log; exit 1; }

echo "=== [3/6] restore committed code asm + linker script ==="
git checkout -- asm OSDSYS_A.ld
echo "committed asm files: $(git ls-files asm | wc -l); on disk: $(find asm -name '*.s' | wc -l)"

echo "=== [4/6] patch missing data labels (glabel + D_ aliases) ==="
python3 tools/wsl/patch_data_labels.py | tail -1

echo "=== [5/6] compile the one C subsegment with ee-gcc 2.9 (matching compiler) ==="
# ee-gcc 2.9 is a 32-bit 1999 binary: stat() on the 9p /mnt/c mount EOVERFLOWs. Compile
# from native ext4 (/tmp), then copy the .o back.
mkdir -p build/src/core
TMPC=$(mktemp -d /tmp/cosd.XXXXXX)
cp src/core/sceGsGetGParam.c "$TMPC/"
( cd "$TMPC" && "$EEGCC" -O2 -G0 -c -o sceGsGetGParam.c.o sceGsGetGParam.c )
cp "$TMPC/sceGsGetGParam.c.o" build/src/core/sceGsGetGParam.c.o
rm -rf "$TMPC"

echo "=== [6/6] link + verify byte-perfect ==="
make PREFIX="$PREFIX" PS2SDK="$PS2SDK" -j"$(nproc)" elf >/tmp/cosd_elf.log 2>&1 || {
  echo "LINK FAILED:"; grep -aiE "error|undefined|multiple|overflow|cannot" /tmp/cosd_elf.log | grep -av "march=r5900" | head; exit 1; }

if cmp -s build/OSDSYS.elf OSDSYS_A_XLF_decrypted_unpacked.elf; then
  echo "RESULT: BYTE-PERFECT-MATCH ✅"
else
  echo "RESULT: DIFFERS ❌"; cmp build/OSDSYS.elf OSDSYS_A_XLF_decrypted_unpacked.elf | head -1 || true
fi
echo "sha1-built:    $(sha1sum build/OSDSYS.elf | awk '{print $1}')"
echo "sha1-expected: $(awk '{print $1}' config/build.sha1)"
