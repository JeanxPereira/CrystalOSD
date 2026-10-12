// The OSDSND tick timer from power-on: 14 calls at half the regular period, then the regular period (TICK_CYCLES of sound_osdsnd_sequencer.mjs).
export const WARMUP_TICKS = 14;
export const WARMUP_CYCLES = 299872;
export const FIRST_TICK_CYCLE = 73971858;
