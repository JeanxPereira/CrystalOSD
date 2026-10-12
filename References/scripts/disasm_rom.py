"""Disassemble a range of an EE memory dump (MIPS R5900, little endian).

capstone does the MIPS part; it does not know the R5900's COP2 (VU0 macro mode) instructions,
nor lqc2/sqc2, so those are decoded here.

python disasm_rom.py <dump.bin> <dump base hex> <start hex> <end hex>
"""
import struct
import sys

import capstone

BC = "xyzw"
SPECIAL1 = {0x1c: "vmulq", 0x1d: "vmaxi", 0x1e: "vmuli", 0x1f: "vminii", 0x20: "vaddq", 0x21: "vmaddq", 0x22: "vaddi",
            0x23: "vmaddi", 0x24: "vsubq", 0x25: "vmsubq", 0x26: "vsubi", 0x27: "vmsubi", 0x28: "vadd", 0x29: "vmadd",
            0x2a: "vmul", 0x2b: "vmax", 0x2c: "vsub", 0x2d: "vmsub", 0x2e: "vopmsub", 0x2f: "vmini"}
SPECIAL1_BC = {0x00: "vadd", 0x04: "vsub", 0x08: "vmadd", 0x0c: "vmsub", 0x10: "vmax", 0x14: "vmini", 0x18: "vmul"}
SPECIAL2 = {0x10: "vitof0", 0x11: "vitof4", 0x12: "vitof12", 0x13: "vitof15", 0x14: "vftoi0", 0x15: "vftoi4",
            0x16: "vftoi12", 0x17: "vftoi15", 0x1c: "vmulaq", 0x1d: "vabs", 0x1e: "vmulai", 0x1f: "vclip",
            0x20: "vaddaq", 0x21: "vmaddaq", 0x22: "vaddai", 0x23: "vmaddai", 0x24: "vsubaq", 0x25: "vmsubaq",
            0x26: "vsubai", 0x27: "vmsubai", 0x28: "vadda", 0x29: "vmadda", 0x2a: "vmula", 0x2c: "vsuba",
            0x2d: "vmsuba", 0x2e: "vopmula", 0x2f: "vnop", 0x30: "vmove", 0x31: "vmr32", 0x38: "vdiv", 0x39: "vsqrt",
            0x3a: "vrsqrt", 0x3b: "vwaitq"}
SPECIAL2_BC = {0x00: "vadda", 0x04: "vsuba", 0x08: "vmadda", 0x0c: "vmsuba", 0x18: "vmula"}
REGS = ["zero", "at", "v0", "v1", "a0", "a1", "a2", "a3", "t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7",
        "s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "t8", "t9", "k0", "k1", "gp", "sp", "fp", "ra"]


def dest(word):
    bits = (word >> 21) & 15
    return "".join(c for i, c in enumerate(BC) if bits & (8 >> i))


def vu(word):
    """Text for an lqc2/sqc2 or COP2 instruction, or None."""
    op = word >> 26
    rs, rt, imm = (word >> 21) & 31, (word >> 16) & 31, word & 0xffff
    if op in (0x36, 0x3e):
        offset = imm - 0x10000 if imm & 0x8000 else imm
        return "%s vf%d, %s(%s)" % ("lqc2" if op == 0x36 else "sqc2", rt, hex(offset), REGS[rs])
    if op != 0x12:
        return None
    if not word & (1 << 25):
        names = {1: "qmfc2", 2: "cfc2", 5: "qmtc2", 6: "ctc2"}
        if rs in names:
            return "%s %s, %s%d" % (names[rs], REGS[rt], "vi" if rs in (2, 6) else "vf", (word >> 11) & 31)
        return None
    ft, fs, fd, low = (word >> 16) & 31, (word >> 11) & 31, (word >> 6) & 31, word & 63
    if low < 0x3c:
        if low in SPECIAL1:
            return "%s.%s vf%d, vf%d, vf%d" % (SPECIAL1[low], dest(word), fd, fs, ft)
        base = low & ~3
        if base in SPECIAL1_BC:
            return "%s%s.%s vf%d, vf%d, vf%d%s" % (SPECIAL1_BC[base], BC[low & 3], dest(word), fd, fs, ft, BC[low & 3])
        return None
    index = (fd << 2) | (low & 3)
    if index in (0x38, 0x3a):
        return "%s Q, vf%d%s, vf%d%s" % (SPECIAL2[index], fs, BC[(word >> 21) & 3], ft, BC[(word >> 23) & 3])
    if index == 0x39:
        return "vsqrt Q, vf%d%s" % (ft, BC[(word >> 23) & 3])
    if index in SPECIAL2:
        return "%s.%s vf%d, vf%d" % (SPECIAL2[index], dest(word), ft if index in range(0x10, 0x18) or index in (0x1d, 0x30, 0x31) else fs, fs if index in range(0x10, 0x18) or index in (0x1d, 0x30, 0x31) else ft)
    base = index & ~3
    if base in SPECIAL2_BC:
        return "%s%s.%s ACC, vf%d, vf%d%s" % (SPECIAL2_BC[base], BC[index & 3], dest(word), fs, ft, BC[index & 3])
    return None


def main():
    dump, base, start, end = sys.argv[1], int(sys.argv[2], 16), int(sys.argv[3], 16), int(sys.argv[4], 16)
    data = open(dump, "rb").read()
    md = capstone.Cs(capstone.CS_ARCH_MIPS, capstone.CS_MODE_MIPS64 | capstone.CS_MODE_LITTLE_ENDIAN)
    for address in range(start, end, 4):
        chunk = data[address - base:address - base + 4]
        word = struct.unpack("<I", chunk)[0]
        text = vu(word)
        if text is None:
            decoded = list(md.disasm(chunk, address))
            text = "%s %s" % (decoded[0].mnemonic, decoded[0].op_str) if decoded else ".word 0x%08x" % word
        print("%08x  %s" % (address, text))


if __name__ == "__main__":
    main()
