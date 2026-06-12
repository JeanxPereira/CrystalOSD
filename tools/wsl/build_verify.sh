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

echo "=== [3/6] restore committed code asm (keep the freshly regenerated linker script) ==="
# Only restore code asm (configure.py regenerates it lossily). Do NOT restore OSDSYS_A.ld:
# configure.py regenerates+postprocesses it from splat_config every run, so the fresh one
# is authoritative — restoring the committed copy would discard splat_config changes
# (e.g. an asm->c subsegment flip).
git checkout -- asm
echo "committed asm files: $(git ls-files asm | wc -l); on disk: $(find asm -name '*.s' | wc -l)"

echo "=== [4/6] patch missing data labels (glabel + D_ aliases) ==="
python3 tools/wsl/patch_data_labels.py | tail -1

echo "=== [5/6] compile C subsegments with ee-gcc 2.9 (matching compiler) ==="
# Compile every C object the linker script references. ee-gcc 2.9 is a 32-bit 1999 binary:
# stat() on the 9p /mnt/c mount EOVERFLOWs, so compile from native ext4 (/tmp).
# -G (small-data threshold) is PER-FUNCTION: globals in .sdata/.sbss need gp-relative (-G8),
# others use absolute (-G0). Map known exceptions; default -G0.
ee_g_for() { case "$1" in graph/pktSetAD) echo "-G8";; *) echo "-G0";; esac; }
for obj in $(grep -oE 'build/src/[A-Za-z0-9_./-]+\.c\.o' OSDSYS_A.ld | sort -u); do
  rel="${obj#build/}"; rel="${rel%.o}"          # src/<sub>/<fn>.c
  key="${rel#src/}"; key="${key%.c}"            # <sub>/<fn>
  G=$(ee_g_for "$key")
  mkdir -p "build/$(dirname "$rel")"
  T=$(mktemp -d /tmp/cosd.XXXXXX); cp "$rel" "$T/x.c"
  ( cd "$T" && "$EEGCC" -O2 $G -c -o x.o x.c )
  cp "$T/x.o" "$obj"; rm -rf "$T"
  echo "  $key  [$G]"
done

echo "=== [6/6] link + verify byte-perfect ==="
make PREFIX="$PREFIX" PS2SDK="$PS2SDK" MATCH_CC="$EEGCC" -j"$(nproc)" elf >/tmp/cosd_elf.log 2>&1 || {
  echo "LINK FAILED:"; grep -aiE "error|undefined|multiple|overflow|cannot" /tmp/cosd_elf.log | grep -av "march=r5900" | head; exit 1; }

if cmp -s build/OSDSYS.elf OSDSYS_A_XLF_decrypted_unpacked.elf; then
  echo "RESULT: BYTE-PERFECT-MATCH ✅"
else
  echo "RESULT: DIFFERS ❌"; cmp build/OSDSYS.elf OSDSYS_A_XLF_decrypted_unpacked.elf | head -1 || true
fi
echo "sha1-built:    $(sha1sum build/OSDSYS.elf | awk '{print $1}')"
echo "sha1-expected: $(awk '{print $1}' config/build.sha1)"
