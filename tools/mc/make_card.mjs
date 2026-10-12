// node make_card.mjs <dir>: writes blank.ps2 and formatted-empty.ps2 (raw 528-byte pages).
// The layout is the public memory card format description (References/readings/mc-format-sources.md);
// the superblock words past 0x152 and the block-1023 copy are not in it and come from the OSD's own
// formatted image (verify_mc_image.mjs lists them).
import * as fs from 'node:fs';
import * as path from 'node:path';
import { eccPage } from './ecc.mjs';
import { MAGIC, PAGE, RAW_PAGE, RAW_SIZE } from './read_card.mjs';

export const DIR_MODE = 0x8427;
export const PARENT_MODE = 0xa426;

export const timeOf = (date) => ({ sec: date.getSeconds(), min: date.getMinutes(), hour: date.getHours(), day: date.getDate(), month: date.getMonth() + 1, year: date.getFullYear() });

export const blankImage = () => Buffer.alloc(RAW_SIZE, 0xff);

function putTime(buffer, at, t) {
  buffer[at] = 0;
  buffer[at + 1] = t.sec;
  buffer[at + 2] = t.min;
  buffer[at + 3] = t.hour;
  buffer[at + 4] = t.day;
  buffer[at + 5] = t.month;
  buffer.writeUInt16LE(t.year, at + 6);
}

const CLUSTER = 2 * PAGE;
const CLUSTERS = 8192;
const ALLOC_OFFSET = 41;
const IFC_CLUSTER = 8;
const FAT_ENTRY = 4;
const FAT_CLUSTERS = (CLUSTERS * FAT_ENTRY) / CLUSTER;
const ALLOC_END = 8135;
const TAIL_WORDS = [0x400, 0x100, 8, 0xffffffff, 0, 0, 0, 8001, 0, 0, 0xffffffff, 0];

export function superblockPage() {
  const d = Buffer.alloc(PAGE);
  d.fill(0xff, 0xd0);
  d.write(MAGIC, 0, 'latin1');
  d.write('1.2.0.0', 0x1c, 'latin1');
  d.writeUInt16LE(PAGE, 0x28);
  d.writeUInt16LE(2, 0x2a);
  d.writeUInt16LE(16, 0x2c);
  d.writeUInt16LE(0xff00, 0x2e);
  d.writeUInt32LE(CLUSTERS, 0x30);
  d.writeUInt32LE(ALLOC_OFFSET, 0x34);
  d.writeUInt32LE(ALLOC_END, 0x38);
  d.writeUInt32LE(1023, 0x40);
  d.writeUInt32LE(1022, 0x44);
  d.writeUInt32LE(IFC_CLUSTER, 0x50);
  d.set([2, 0x2b, 0, 0], 0x150);
  TAIL_WORDS.forEach((word, i) => d.writeUInt32LE(word, 0x154 + 4 * i));
  return d;
}

export function formattedEmpty(time) {
  const image = blankImage();
  const logical = new Map();
  const cluster = (n, bytes) => {
    if (bytes.length !== CLUSTER) throw new Error(`cluster ${n}: ${bytes.length} bytes`);
    logical.set(n * 2, bytes.subarray(0, PAGE));
    logical.set(n * 2 + 1, bytes.subarray(PAGE));
  };

  logical.set(0, superblockPage());

  const root = Buffer.alloc(CLUSTER);
  const entry = (at, mode, length, name) => {
    root.writeUInt16LE(mode, at);
    root.writeUInt32LE(length, at + 4);
    putTime(root, at + 8, time);
    putTime(root, at + 0x18, time);
    root.write(name, at + 0x40, 'latin1');
  };
  entry(0, DIR_MODE, 2, '.');
  entry(PAGE, PARENT_MODE, 0, '..');
  cluster(ALLOC_OFFSET, root);

  const entries = Buffer.alloc(FAT_CLUSTERS * CLUSTER);
  for (let c = 0; c < CLUSTERS; c++) entries.writeUInt32LE(c === 0 || c >= ALLOC_END ? 0xffffffff : 0x7fffffff, c * FAT_ENTRY);
  const ifc = Buffer.alloc(CLUSTER, 0xff);
  for (let i = 0; i < FAT_CLUSTERS; i++) {
    ifc.writeUInt32LE(IFC_CLUSTER + 1 + i, i * FAT_ENTRY);
    cluster(IFC_CLUSTER + 1 + i, entries.subarray(i * CLUSTER, (i + 1) * CLUSTER));
  }
  cluster(IFC_CLUSTER, ifc);

  const put = (page, data) => {
    data.copy(image, page * RAW_PAGE);
    Buffer.from(eccPage(data)).copy(image, page * RAW_PAGE + PAGE);
    image.fill(0, page * RAW_PAGE + PAGE + 12, (page + 1) * RAW_PAGE);
  };
  const erased = Buffer.alloc(PAGE, 0xff);
  for (let p = 0; p < 6 * 16; p++) put(p, logical.get(p) ?? erased);
  for (let p = 0; p < 16; p++) put(1023 * 16 + p, logical.get(p) ?? erased);
  return image;
}

if (process.argv[2] && process.argv[1].endsWith('make_card.mjs')) {
  const dir = process.argv[2];
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'blank.ps2'), blankImage());
  fs.writeFileSync(path.join(dir, 'formatted-empty.ps2'), formattedEmpty(timeOf(new Date())));
  console.log(`wrote ${dir}/blank.ps2 and ${dir}/formatted-empty.ps2`);
}
