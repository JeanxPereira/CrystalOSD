// Where the untracked data lives. Every script locates it through here.
import path from 'node:path';

const home = (name, fallback) => (process.env[name] ?? fallback).split('\\').join('/').replace(/\/$/, '');

export const DATA_HOME = home('CRYSTALOSD_DATA', 'D:/CodingProjects/CrystalOSD-Data');
export const ASM_HOME = home('CRYSTALOSD_ASM', 'D:/CodingProjects/CrystalOSD-Decomp-Legacy/asm');
export const CAPTURES = home('CRYSTALOSD_CAPTURES', 'D:/CodingProjects/Watson/Runtime/captures');

/** An absolute path under the data home, e.g. dataPath('dumps/hddosd-host/hddosd.elf'). */
export const dataPath = (relative) => path.posix.join(DATA_HOME, relative);
/** An absolute path under the disassembly, e.g. asmPath('clock/func_002344F8.s'). */
export const asmPath = (relative) => path.posix.join(ASM_HOME, relative);
