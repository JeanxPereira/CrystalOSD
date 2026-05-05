#!/bin/bash
# run_batch_transmuter.sh — Run Transmuter on all Ghidra stubs in src/stubs/
# Usage: ./tools/run_batch_transmuter.sh [subsystem]
#   No args = process all subsystems
#   With arg = process only that subsystem (e.g., "graph")

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STUBS_DIR="$PROJECT_ROOT/src/stubs"
TRANSMUTER="$PROJECT_ROOT/tools/transmuter/packages/cli/dist/index.js"

# Toolchain setup
export PATH="/Users/jeanxpereira/ps2dev/ee/bin:/Users/jeanxpereira/ps2dev/iop/bin:/Users/jeanxpereira/ps2dev/dvp/bin:$PATH"
export PS2DEV="/Users/jeanxpereira/ps2dev"
export PS2SDK="$PS2DEV/ps2sdk"

if [ ! -d "$STUBS_DIR" ]; then
    echo "ERROR: $STUBS_DIR not found. Run BatchExportToC.java in Ghidra first."
    exit 1
fi

if [ ! -f "$TRANSMUTER" ]; then
    echo "ERROR: Transmuter CLI not found at $TRANSMUTER"
    echo "Make sure tools/transmuter is built (cd tools/transmuter && npm install && npm run build)"
    exit 1
fi

SUBSYSTEM="${1:-}"
PROCESSED=0
FAILED=0
SKIPPED=0

process_stub() {
    local file="$1"
    local subsys="$2"
    local func
    func=$(basename "$file" .c)

    # Skip files that are clearly not function stubs
    if [[ "$func" == *.inc ]] || [[ "$func" == *.h ]]; then
        return
    fi

    local target="$PROJECT_ROOT/build/target/$subsys/$func.o"

    # Skip if no target object exists (not yet built)
    if [ ! -f "$target" ]; then
        echo "  [$subsys] $func — SKIP (no target .o)"
        SKIPPED=$((SKIPPED + 1))
        return
    fi

    echo "  [$subsys] $func"

    if node "$TRANSMUTER" match "$file" --target "$target" --function "$func" 2>/dev/null; then
        PROCESSED=$((PROCESSED + 1))
    else
        echo "    WARN: Transmuter failed for $func"
        FAILED=$((FAILED + 1))
    fi
}

if [ -n "$SUBSYSTEM" ]; then
    # Process single subsystem
    subsys_dir="$STUBS_DIR/$SUBSYSTEM"
    if [ ! -d "$subsys_dir" ]; then
        echo "ERROR: Subsystem '$SUBSYSTEM' not found in $STUBS_DIR"
        exit 1
    fi
    echo "=== Processing subsystem: $SUBSYSTEM ==="
    for file in "$subsys_dir"/*.c; do
        [ -f "$file" ] || continue
        process_stub "$file" "$SUBSYSTEM"
    done
else
    # Process all subsystems
    echo "=== Batch Transmuter: Processing all stubs ==="
    for subsys_dir in "$STUBS_DIR"/*/; do
        [ -d "$subsys_dir" ] || continue
        subsys=$(basename "$subsys_dir")
        echo ""
        echo "--- Subsystem: $subsys ---"
        for file in "$subsys_dir"*.c; do
            [ -f "$file" ] || continue
            process_stub "$file" "$subsys"
        done
    done
fi

echo ""
echo "========================================="
echo "  Batch Transmuter Complete"
echo "  Processed: $PROCESSED"
echo "  Skipped:   $SKIPPED"
echo "  Failed:    $FAILED"
echo "========================================="
