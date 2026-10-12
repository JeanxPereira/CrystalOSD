// JS reference reader of the PS2 memory card image (public format description: see
// References/readings/mc-format-sources.md). Raw images hold 528-byte pages (512 data + 16 spare).
import * as fs from 'node:fs';
import { eccPage } from './ecc.mjs';

export const RAW_PAGE = 528;
export const PAGE = 512;
export const MAGIC = 'Sony PS2 Memory Card Format ';
export const RAW_SIZE = 8650752;

export const pageData = (image, page) => image.subarray(page * RAW_PAGE, page * RAW_PAGE + PAGE);
export const pageSpare = (image, page) => image.subarray(page * RAW_PAGE + PAGE, (page + 1) * RAW_PAGE);

export function superblock(image) {
  const d = pageData(image, 0);
  const text = d.subarray(0, 28).toString('latin1');
  if (text !== MAGIC) return null;
  const ifc = [];
  for (let i = 0; i < 32; i++) ifc.push(d.readUInt32LE(0x50 + 4 * i));
  return {
    magic: text,
    version: d.subarray(0x1c, 0x28).toString('latin1').replace(/\0.*$/s, ''),
    pageLen: d.readUInt16LE(0x28),
    pagesPerCluster: d.readUInt16LE(0x2a),
    pagesPerBlock: d.readUInt16LE(0x2c),
    clustersPerCard: d.readUInt32LE(0x30),
    allocOffset: d.readUInt32LE(0x34),
    allocEnd: d.readUInt32LE(0x38),
    rootdirCluster: d.readUInt32LE(0x3c),
    backupBlock1: d.readUInt32LE(0x40),
    backupBlock2: d.readUInt32LE(0x44),
    ifcList: ifc,
    cardType: d[0x150],
    cardFlags: d[0x151],
  };
}

export const clusterBytes = (image, sb, cluster) => {
  const out = Buffer.alloc(sb.pagesPerCluster * PAGE);
  for (let p = 0; p < sb.pagesPerCluster; p++) pageData(image, cluster * sb.pagesPerCluster + p).copy(out, p * PAGE);
  return out;
};

export function fat(image, sb) {
  const perCluster = (sb.pagesPerCluster * PAGE) / 4;
  const entries = [];
  for (const ifc of sb.ifcList) {
    if (ifc === 0xffffffff || ifc === 0) continue;
    const table = clusterBytes(image, sb, ifc);
    for (let i = 0; i < perCluster; i++) {
      const fatCluster = table.readUInt32LE(i * 4);
      if (fatCluster === 0xffffffff) continue;
      const bytes = clusterBytes(image, sb, fatCluster);
      for (let j = 0; j < perCluster; j++) entries.push(bytes.readUInt32LE(j * 4));
    }
  }
  return entries;
}

export const chain = (table, first) => {
  const seen = new Set();
  let cluster = first;
  while (!seen.has(cluster)) {
    seen.add(cluster);
    const next = table[cluster];
    if (!(next & 0x80000000) || next === 0xffffffff) break;
    cluster = next & 0x7fffffff;
  }
  return [...seen];
};

export function entryAt(buffer, offset) {
  const e = buffer.subarray(offset, offset + PAGE);
  const time = (at) => ({ sec: e[at + 1], min: e[at + 2], hour: e[at + 3], day: e[at + 4], month: e[at + 5], year: e.readUInt16LE(at + 6) });
  return {
    mode: e.readUInt16LE(0),
    length: e.readUInt32LE(4),
    created: time(8),
    cluster: e.readUInt32LE(0x10),
    dirEntry: e.readUInt32LE(0x14),
    modified: time(0x18),
    attr: e.readUInt32LE(0x20),
    name: e.subarray(0x40, 0x60).toString('latin1').replace(/\0.*$/s, ''),
  };
}

export function directory(image, sb, table, first, count) {
  const bytes = Buffer.concat(chain(table, first).map((c) => clusterBytes(image, sb, sb.allocOffset + c)));
  const out = [];
  for (let i = 0; i < count && (i + 1) * PAGE <= bytes.length; i++) out.push(entryAt(bytes, i * PAGE));
  return out;
}

export const diffPages = (a, b) => {
  const out = [];
  for (let p = 0; p < a.length / RAW_PAGE; p++) if (!a.subarray(p * RAW_PAGE, (p + 1) * RAW_PAGE).equals(b.subarray(p * RAW_PAGE, (p + 1) * RAW_PAGE))) out.push(p);
  return out;
};

export function eccReport(image) {
  let pages = 0;
  const badPages = [];
  for (let p = 0; p < image.length / RAW_PAGE; p++) {
    const spare = pageSpare(image, p);
    const data = pageData(image, p);
    if (data.every((x) => x === 0xff) && spare.every((x) => x === 0xff)) continue;
    pages += 1;
    if (Buffer.from(eccPage(data)).compare(spare.subarray(0, 12)) !== 0) badPages.push(p);
  }
  return { pages, bad: badPages.length, badPages };
}

/** The Browser's view of a slot: none, unformatted, or formatted with its free kilobytes. */
export function info(image) {
  if (!image) return { state: 'none' };
  const sb = superblock(image);
  if (!sb) return { state: 'unformatted' };
  const table = fat(image, sb);
  let free = 0;
  for (let c = 0; c < sb.allocEnd && c < table.length; c++) if (!(table[c] & 0x80000000)) free += 1;
  const entries = clusterBytes(image, sb, sb.allocOffset + sb.rootdirCluster).readUInt32LE(4);
  const names = directory(image, sb, table, sb.rootdirCluster, entries).map((e) => e.name);
  return {
    state: 'formatted',
    formatted: true,
    pageLen: sb.pageLen,
    pagesPerCluster: sb.pagesPerCluster,
    clusterBytes: sb.pagesPerCluster * sb.pageLen,
    freeClusters: free,
    freeKB: (free * sb.pagesPerCluster * sb.pageLen) / 1024,
    rootEntries: entries,
    rootNames: names,
  };
}

export const readImage = (file) => fs.readFileSync(file);

if (process.argv[2] && import.meta.url.endsWith('read_card.mjs') && process.argv[1].endsWith('read_card.mjs')) {
  const image = readImage(process.argv[2]);
  console.log(JSON.stringify(info(image), null, 1));
  console.log(JSON.stringify(superblock(image)));
  console.log(JSON.stringify(eccReport(image)));
}
