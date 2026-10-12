// Which build a verifier is looking at. The arithmetic is the same; the addresses are not.
//   CLOCK_BUILD=rom   ROM 2.30 (BIOS 0230AC20080220), the default
//   CLOCK_BUILD=hdd   HDD OSD 1.10U
export const BUILD = process.env.CLOCK_BUILD ?? 'rom';
if (!['rom', 'hdd'].includes(BUILD)) throw new Error(`CLOCK_BUILD must be rom or hdd, not ${BUILD}`);
export const BUILD_NAME = { rom: 'ROM 2.30', hdd: 'HDD OSD 1.10U' }[BUILD];
/** The value for the build in use. */
// The video mode of the capture: CLOCK_VIDEO=pal for a PAL run (region letter E), else NTSC.
export const PAL = process.env.CLOCK_VIDEO === 'pal';
export const FPS = PAL ? 50 : 60;
export const ROWS = PAL ? 256 : 224;
export const pick = (values) => values[BUILD];
const hex = (address) => `0x${address.toString(16).padStart(8, '0')}`;
/** A probe range at an absolute address. */
export const range = (address, length) => `${hex(address)}:0x${length.toString(16)}`;
export const pc = hex;
