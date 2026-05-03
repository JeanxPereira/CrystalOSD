# CrystalOSD — PS2 OSDSYS Matching Decomp Makefile
# Requires: PS2 toolchain (ee-gcc, ee-as) from ps2dev/ps2toolchain
#
# Directory layout:
#   asm/          — per-subsystem .s files extracted from splat
#   src/          — our C reconstruction
#   build/target/ — assembled original .o (ground truth)
#   build/base/   — compiled our .o (what we're matching)

# ── Toolchain ──────────────────────────────────────────
# PS2 cross-compiler prefix
PREFIX  ?= mips64r5900el-ps2-elf-
CC      := $(PREFIX)gcc
AS      := $(PREFIX)as
LD      := $(PREFIX)ld
OBJCOPY := $(PREFIX)objcopy

# ── Compiler Flags ─────────────────────────────────────
# Match the original OSDSYS compilation flags as closely as possible
# Sony's ee-gcc was typically GCC 2.95.x/3.x with -O2
CFLAGS  := -O2 -G0 -mips3 -mgp32 -mabi=32 -Wall
CFLAGS  += -fno-common -fno-exceptions
CFLAGS  += -I include -I $(PS2SDK)/ee/include -I $(PS2SDK)/common/include
ASFLAGS := -march=r5900 -mabi=32 -G0

# ── Directories ────────────────────────────────────────
ASM_DIR     := asm
SRC_DIR     := src
TARGET_DIR  := build/target
BASE_DIR    := build/base
INCLUDE_DIR := include

# ── Subsystem mapping ─────────────────────────────────
# Each subsystem has:
#   asm/<subsystem>/<file>.s  → build/target/<subsystem>/<file>.o
#   src/<subsystem>/<file>.c  → build/base/<subsystem>/<file>.o

SUBSYSTEMS := config core graph sound browser clock opening cdvd history module

# ── Source files ───────────────────────────────────────
# Find all .s files in asm/ (target sources)
ASM_SRCS := $(shell find $(ASM_DIR) -name '*.s' 2>/dev/null)
ASM_OBJS := $(patsubst $(ASM_DIR)/%.s,$(TARGET_DIR)/%.o,$(ASM_SRCS))

# Find all .c files in src/ (base sources)
C_SRCS   := $(shell find $(SRC_DIR) -name '*.c' 2>/dev/null)
C_OBJS   := $(patsubst $(SRC_DIR)/%.c,$(BASE_DIR)/%.o,$(C_SRCS))

# ── Default target ─────────────────────────────────────
.PHONY: all clean target base dirs check-toolchain

all: check-toolchain dirs target base
	@echo "=== Build complete ==="
	@echo "Target objects: $(words $(ASM_OBJS))"
	@echo "Base objects:   $(words $(C_OBJS))"

# ── Toolchain check ───────────────────────────────────
check-toolchain:
	@which $(CC) > /dev/null 2>&1 || \
		(echo "ERROR: $(CC) not found. Install ps2toolchain:" && \
		 echo "  https://github.com/ps2dev/ps2toolchain" && \
		 echo "  or: brew install ps2dev/ps2dev/ps2toolchain" && \
		 exit 1)

# ── Create directories ────────────────────────────────
dirs:
	@$(foreach sub,$(SUBSYSTEMS), \
		mkdir -p $(TARGET_DIR)/$(sub) $(BASE_DIR)/$(sub);)

# ── Target: assemble original .s → .o ─────────────────
target: $(ASM_OBJS)

$(TARGET_DIR)/%.o: $(ASM_DIR)/%.s | dirs
	@mkdir -p $(dir $@)
	$(AS) $(ASFLAGS) -o $@ $<

# ── Base: compile our .c → .o ─────────────────────────
base: $(C_OBJS)

$(BASE_DIR)/%.o: $(SRC_DIR)/%.c | dirs
	@mkdir -p $(dir $@)
	$(CC) $(CFLAGS) -c -o $@ $<

# ── Per-unit targets (for objdiff) ─────────────────────
# objdiff calls: make build/target/config/osd_config.o
# These pattern rules handle that automatically

# ── Clean ──────────────────────────────────────────────
clean:
	rm -rf build/

# ── Progress report ────────────────────────────────────
.PHONY: progress
progress:
	@echo "=== CrystalOSD Progress ==="
	@echo "ASM files (target): $$(find $(ASM_DIR) -name '*.s' 2>/dev/null | wc -l | tr -d ' ')"
	@echo "C files (base):     $$(find $(SRC_DIR) -name '*.c' 2>/dev/null | wc -l | tr -d ' ')"
	@echo "Functions named:    1,675 (from symbol import)"
	@echo "Functions total:    ~2,000+"

# ── Help ───────────────────────────────────────────────
.PHONY: help
help:
	@echo "CrystalOSD Makefile"
	@echo "  make all       — Build target + base objects"
	@echo "  make target    — Assemble original .s → .o"
	@echo "  make base      — Compile our .c → .o"
	@echo "  make clean     — Remove build/"
	@echo "  make progress  — Show project stats"
	@echo ""
	@echo "For objdiff: objdiff -p ."
