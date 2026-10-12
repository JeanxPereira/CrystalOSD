// The clock's state as the program holds it: named pieces of EE memory, at their address in each
// build. A snapshot is these pieces read at the entry of the frame function; the model reads and
// writes them in place, so one frame's result is the next frame's snapshot.

/** name: [address in HDD OSD 1.10U, address in ROM 2.30, length]. */
export const LAYOUT = {
  time: [0x00409230, 0x00375200, 0x10],            // ms (float), seconds, minutes, hours
  item0: [0x00409130, 0x00375100, 4],              // configuration item 0
  eased: [0x00370a98, 0x002c8f50, 0x0c],           // second hand, hour hand (s16), progress copy, eased fraction
  orbConstants: [0x0036fbdc, 0x002c8178, 8],       // minute factor, easing factor of the fraction
  orbColour: [0x002b5670, 0x00296630, 0x10],
  orbColours: [0x002b5680, 0x00296640, 0x70],      // one colour per orb, used while the overlay mode is 2 or 3
  wide: [0x001f064c, 0x001f05ec, 4],               // 1 when the clock was entered from the opening
  mode: [0x00370ab4, 0x002c8f6c, 4],               // overlay mode
  display: [0x001f0a70, 0x001f0a10, 0x230],        // the two display draw environments
  index: [0x001f0ca0, 0x001f0c40, 4],              // which display buffer is drawn to
  screen: [0x001f0cb4, 0x001f0c50, 8],             // width, height
  spriteFade: [0x002b61b0, 0x00297410, 0x10],      // ramp of the orbs' sprites
  state: [0x00404f70, 0x00370f40, 0x2a0],          // the clock's state block
  orbRandom: [0x00405210, 0x003711e0, 0x1c],       // one random angle per orb, drawn when a mode is set
  template: [0x002b5490, 0x00296450, 0xe0],        // the rod record
  rings: [0x002b6200, 0x00297460, 0x2c30],         // seven orb rings
  scene: [0x002b2170, 0x0028a340, 0x0c],           // scale, -, field
  proportions: [0x002b217c, 0x0028a34c, 8],        // ax, ay
  position: [0x002b2190, 0x0028a360, 0x10],
  direction: [0x002b21a0, 0x0028a370, 0x10],
  up: [0x002b21b0, 0x0028a380, 0x10],
  rotation: [0x002b21c0, 0x0028a390, 0x10],
  clearColour: [0x002b21d0, 0x0028a3a0, 0x10],
  tint: [0x002b21e0, 0x0028a3b0, 0x3c],            // rectangle records: see `rectangle` in clock_rest.mjs
  bars: [0x002b2220, 0x0028a3f0, 0x3c],
  column: [0x002b2500, 0x0028a730, 0x3c],
  cameraOffset: [0x00370a80, 0x002c8f20, 4],
  zmax: [0x0036fb8c, 0x002c810c, 4],
  cameraFactor: [0x0036fb90, 0x002c8110, 4],
  greyRamp: [0x002b5cd0, 0x00296c90, 0x10],
  greys: [0x00370aa8, 0x002c8f60, 0x0c],
  counter: [0x003702d4, 0x002c88f8, 4],            // frame counter
  tubeConstants: [0x0036fc14, 0x002c81b8, 0x20],
  level: [0x00370aa4, 0x002c8f5c, 4],              // blur level
  menuRamp: [0x002b5780, 0x00296740, 0x10],
  body: [0x003702cc, 0x002c88f0, 4],
  tail: [0x003702d0, 0x002c88f4, 4],
  blurRecord: [0x002b6120, 0x00297320, 0x3c],
  copyRecord: [0x002b6060, 0x00297260, 0x3c],
  vignetteRamp: [0x002b5f20, 0x00297120, 0x10],
  vignetteLength: [0x003702e4, 0x002c8908, 4],
  overlayLevel: [0x00370ab8, 0x002c8f70, 4],
  fadeRecord: [0x002b5f30, 0x00297130, 0x3c],
  ringRecord: [0x002b5f70, 0x00297170, 0x18],      // the vignette: alpha, centre x, y, radii x, y, z (a month-days table follows)
  appearance: [0x002b5640, 0x00296600, 0x10],      // ramp of the rods' appearance
  colours: [0x002b5600, 0x002965c0, 0x40],
  cycleCounters: [0x00370268, 0x002c8880, 0x14],
  cycleTables: [0x002b5570, 0x00296530, 0x90],
  logicConstants: [0x0036fbcc, 0x002c8168, 0x0c],
  scaleTarget: [0x00370294, 0x002c88ac, 4],
  scaleFactor: [0x0036fc10, 0x002c81b4, 4],
  timeFilled: [0x00370324, null, 4],
  videoMode: [0x002ad228, 0x0027b380, 4],          // the console's region as cached: 2 is PAL
  vignettePal: [null, 0x002c81d8, 4],              // ROM 2.30: 1.15, the vignette's height factor in PAL
  pad: [0x00370330, 0x002c8944, 0x10],             // held, pressed, released, repeating
  // The cubes of System Configuration.
  cubeRamp: [0x002b5740, 0x00296700, 0x10],
  cubeColours: [0x002b5750, 0x00296710, 0x30],     // selected, plain, live
  cubeRecord: [0x002b5af0, 0x00296ab0, 0xe0],
  cubeList: [0x003702a8, 0x002c88c0, 0x18],        // pulse, pulsed place, position, left to go, speed, slowing
  spin: [0x00370290, 0x002c88a8, 4],
  cubeConstants: [0x0036fbe8, 0x002c8184, 0x18],   // 0.95 (standing), 0.95 (ring), 2 pi, 180000, pi / 2, -pi
  centreFactors: [0x0036fc50, 0x002c81fc, 8],      // 0.35 for a cube, 0.2 for the layer
  cubeScreen: [0x004090b0, 0x00375080, 0x40],      // the cubes' own matrices, set once: a screen matrix
  cubeView: [0x004090f0, 0x003750c0, 0x40],        // and the unit matrix in place of the view
  layerClear: [0x002b5cc0, 0x00296c80, 0x10],
  targetClear: [0x002b5fc0, 0x002971c0, 0x10],
  displayClear: [0x002b5fd0, 0x002971d0, 0x10],
  addRecord: [0x002b5fe0, 0x002971e0, 0x3c],
  halfRecord: [0x002b6020, 0x00297220, 0x3c],
  chainRecord: [0x002b60e0, 0x002972e0, 0x3c],
  // The menus (clock_menus.mjs).
  configPage: [0x002b2de8, 0x0028aff0, 0x38],            // entries, count, selected (+0x10), level (+0x18), ramp (+0x1c)
  configRamp: [0x002b2e04, 0x0028b00c, 0x10],
  configEntries: [0x002b2bf0, 0x0028ae30, 0x1f8],  // the list's entries, 0x38 bytes each (callbacks at +0x14, +0x20, +0x24); ROM: and its two templates
  mainMenu: [0x002b2e60, 0x0028b058, 0x28],              // count (+8), selected (+0x10), ramp (+0x18)
  versionRamp: [0x002b3000, 0x0028b110, 0x10],
  dialogRamp: [0x002b46b8, 0x00293ba8, 0x10],
  firstRunRamp: [0x002b46d0, 0x002953f0, 0x10],
  pagePointers: [0x003701c0, 0x002c87c0, 0x14],          // +0x10: the page func_0022AAF0 answers with
  entryActive: [0x003702c8, 0x002c88ec, 4],
  menuLengths: [0x003702e0, 0x002c8904, 0x0c],
  configGate: [0x00370300, 0x002c8920, 4],         // D_00370300: 1 lets config_load_clock_osd reload the items (the entries set it to 0 or -1 while open)
  configDirty: [0x00370304, null, 0x0c],           // HDD OSD: written by the configuration's save, outside the clock
  romWrite: [null, 0x001f00a4, 0x10],              // ROM 2.30: +0 and +0xc, the state of the clock's write to the drive
  configItems: [0x00409130, 0x00375100, 0x50],     // the configuration items, one word each
  listConstants: [0x0036fc00, 0x002c819c, 0x10],   // the frame rate 59.94, -, the ring's pulse -0.1, ROM: the standing cube's pulse
  screenCode: [0x00370a7c, 0x002c8f1c, 4],
  adjustFields: [0x002b2580, 0x0028a7b0, 0x48],   // Clock Adjustment's six fields: item, lowest, highest
  mechaconParam: [0x00371818, 0x002c9680, 8],     // the console's settings words: aspect ratio, time zone, summer time; date format
  language: [null, 0x0027b388, 0x10],               // ROM 2.30: the language the console reports, cached (+0), and the flag that it was read (+8)
  rtcMirror: [0x001f0d1c, 0x001f0cb8, 0x18],       // the console's clock as the mechacon read left it: year, month, day, hour, minute, second
  disc: [0x001f000c, 0x001f0010, 4],               // the disc state the drive reports
  // ROM 2.30 only: the standing cubes.
  cubeMode: [null, 0x002c88d8, 4],
  standing: [null, 0x00296b90, 0xf0],
};

const column = (build) => (build === 'hdd' ? 0 : 1);
export const addressOf = (build, name) => LAYOUT[name][column(build)];

/** The pieces of a build merged into as few ranges as cover them, each [address, length]. */
export function ranges(build, names = Object.keys(LAYOUT)) {
  const pieces = names.map((name) => [LAYOUT[name][column(build)], LAYOUT[name][2]]).filter(([address]) => address !== null).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [address, length] of pieces) {
    const last = out.at(-1);
    if (last && address - (last[0] + last[1]) <= 0x200 && address + length - last[0] <= 0x4000) last[1] = Math.max(last[1], address + length - last[0]);
    else out.push([address, length]);
  }
  return out;
}

export class Memory {
  /** `blocks`: [{ address, bytes }], the bytes owned by the memory from here on. */
  constructor(build, blocks) {
    this.build = build;
    this.blocks = blocks.map(({ address, bytes }) => ({ address, bytes: Buffer.from(bytes) }));
  }
  /** A live view of `length` bytes at `address`. */
  view(address, length) {
    for (const block of this.blocks) {
      if (address >= block.address && address + length <= block.address + block.bytes.length) return block.bytes.subarray(address - block.address, address - block.address + length);
    }
    throw new Error(`0x${address.toString(16)}:0x${length.toString(16)} is not in the snapshot`);
  }
  has(name) { try { this.at(name); return true; } catch { return false; } }
  /** A live view of a named piece. */
  at(name) {
    const [, , length] = LAYOUT[name];
    const address = addressOf(this.build, name);
    if (address === null) throw new Error(`${name} does not exist in this build`);
    return this.view(address, length);
  }
  /** The word at `offset` of a piece; a snapshot taken with a shorter range of the piece still holds it. */
  word(name, offset) {
    const address = addressOf(this.build, name);
    if (address === null) throw new Error(`${name} does not exist in this build`);
    return this.view(address + offset, 4);
  }
  int(name, offset = 0) { return this.word(name, offset).readInt32LE(0); }
  float(name, offset = 0) { return this.word(name, offset).readFloatLE(0); }
  setInt(name, value, offset = 0) { this.at(name).writeInt32LE(value | 0, offset); }
  setFloat(name, value, offset = 0) { this.at(name).writeFloatLE(value, offset); }
  clone() { return new Memory(this.build, this.blocks); }
}
