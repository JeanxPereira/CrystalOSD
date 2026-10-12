// The probes of a cold-run capture: the snapshot probes of verify_frame.mjs only (every piece of clock_memory.mjs LAYOUT, at the
// first instructions of the clock's frame function, once per frame), so a run of thousands of frames holds every frame's state: the pad
// words, the clock (RTC mirror, time), the counter, the field, the random angles.
// node capture.mjs --verifiers cold_run_probes.mjs --build hdd --args SkipSearchLater --pad <schedule> --frames <n> --name <capture>
import { PROBES as ALL } from './verify_frame.mjs';
import { BUILD } from './builds.mjs';

const START = BUILD === 'hdd' ? 0x00225e80 : 0x00221558;
export const PROBES = ALL.filter((p) => { const at = parseInt(p.pc, 16); return at >= START && at < START + 0x20; });
