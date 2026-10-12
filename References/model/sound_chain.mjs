// The EE side of the sound chain from power-on: the ramp counter, the drain cadence and the S/PDIF push.
// HDD OSD 1.10U. sound_handler_2009E0 (0x002009E0) is the only writer of the ramp counter D_002AAF80: it adds one after each
// ramp enqueue and never stores zero, so the counter at the n-th drain since power-on is min(n, steps).
export const RAMP_STEPS = 15;
export const RAMP_COMMAND = 0x60d0;
export const SPDIF_COMMAND = 0x8070;

export const rampCounterAtDrain = (drainIndex, steps = RAMP_STEPS) => Math.min(drainIndex, steps);

// The drain runs in pad_sound_handler_thread_proc (0x0020CD20) once per wake; a drain that sent a ramp step is still inside
// sceSdRemote (0x00294738) when the next vblank wakes the thread, and the loop top (CancelWakeupThread, 0x0020CD58) discards that wake.
export const nextDrainFrame = (frame, sentIds) => frame + (sentIds.includes(RAMP_COMMAND) ? 2 : 1);

// pad_sound_handler_thread_proc 0x0020CDA0..0x0020CE28: the word 0x14 stored by main stores 0 on the stack, which is a3 of the push.
export const spdifA3 = (word) => (word === 0x14 ? 0 : undefined);

// sound_handler_queue_cmd 0x00200C00: the head counts every stored entry from power-on; the next entry goes to slot head & 127.
export const ringHead = (enqueuesBefore) => enqueuesBefore;
export const ringTemporaries = (head) => ({ a2: (0x065c + 8 * (head & 127)) & 0xffff, a3: (0x0658 + 8 * (head & 127)) & 0xffff });

// The module counter D_00370000 is the emulator frame minus 127 (OpeningInit stores 0 in the frame of the start sound).
export const counterOfFrame = (frame) => frame - 127;
