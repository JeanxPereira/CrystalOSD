#!/bin/bash
# permuter_import.sh — Import a function into decomp-permuter for matching
#
# Usage:
#   ./tools/permuter_import.sh <func_name> <src_file>
#
# Example:
#   ./tools/permuter_import.sh gsAllocBuffer src/graph/gs_util.c
#
# This creates a directory in tools/decomp-permuter/nonmatchings/<func_name>/
# containing the .c, .o (target), .sh (compile script), and .toml (settings).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PERMUTER_DIR="$PROJECT_ROOT/tools/decomp-permuter"

if [ $# -lt 2 ]; then
    echo "Usage: $0 <func_name> <src_file>"
    echo ""
    echo "Example: $0 gsAllocBuffer src/graph/gs_util.c"
    exit 1
fi

FUNC="$1"
SRC="$2"

# Find ASM file — check subsystem dirs
ASM_FILE=$(find "$PROJECT_ROOT/asm" -name "${FUNC}.s" -type f 2>/dev/null | head -1)

if [ -z "$ASM_FILE" ]; then
    echo "❌ ASM file not found for function: $FUNC"
    echo "   Searched in: asm/*/${FUNC}.s"
    exit 1
fi

if [ ! -f "$PROJECT_ROOT/$SRC" ]; then
    echo "❌ Source file not found: $SRC"
    exit 1
fi

echo "📦 Importing $FUNC into decomp-permuter..."
echo "   ASM: $(realpath --relative-to="$PROJECT_ROOT" "$ASM_FILE")"
echo "   SRC: $SRC"

# Create nonmatchings directory
FUNC_DIR="$PERMUTER_DIR/nonmatchings/$FUNC"
mkdir -p "$FUNC_DIR"

# 1. Build target .o from ASM
echo "   → Assembling target .o..."
AS="${AS:-mips64r5900el-ps2-elf-as}"
"$AS" -march=r5900 -mabi=eabi -G0 -I "$PROJECT_ROOT/include" \
    -o "$FUNC_DIR/target.o" "$ASM_FILE"

# 2. Copy source file
cp "$PROJECT_ROOT/$SRC" "$FUNC_DIR/base.c"

# 3. Create compile script
cat > "$FUNC_DIR/compile.sh" << 'COMPILE_EOF'
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
bash "$SCRIPT_DIR/../../permuter/compile.sh" "$@"
COMPILE_EOF
chmod +x "$FUNC_DIR/compile.sh"

# 4. Create settings
cat > "$FUNC_DIR/settings.toml" << SETTINGS_EOF
compiler_type = "gcc"
SETTINGS_EOF

echo "✅ Imported! Run permuter with:"
echo "   cd tools/decomp-permuter"
echo "   python3 ./permuter.py nonmatchings/$FUNC -j8"
