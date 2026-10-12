// The memory card image: the reference reader (tools/mc/read_card.mjs) and the formatted-empty
// writer (tools/mc/make_card.mjs) against the image the OSD writes when Format is answered Yes
// (HDD OSD 1.10U, the Browser's Format dialog; the capture helper tools/mc/capture_format.mjs).
//   node verify_mc_image.mjs <osd-formatted-raw.ps2> [<blank.ps2>]
// The documented layout (References/readings/mc-format-sources.md) gives the expected values; what the
// documents leave open is listed under "from the oracle".
import fs from 'node:fs';
import { superblock, fat, chain, directory, info, eccReport, diffPages, pageData, pageSpare, RAW_PAGE, RAW_SIZE } from '../../tools/mc/read_card.mjs';
import { formattedEmpty, blankImage, timeOf } from '../../tools/mc/make_card.mjs';

const [oraclePath, blankPath] = process.argv.slice(2);
if (!oraclePath) { console.error('usage: node verify_mc_image.mjs <osd-formatted-raw.ps2> [<blank.ps2>]'); process.exit(2); }
const oracle = fs.readFileSync(oraclePath);
let compared = 0;
let wrong = 0;
const check = (what, got, want) => {
  compared += 1;
  const same = JSON.stringify(got) === JSON.stringify(want);
  if (!same) wrong += 1;
  console.log(`${same ? 'ok       ' : 'DIFFERENT'} ${what}: ${JSON.stringify(got)}${same ? '' : ` expected ${JSON.stringify(want)}`}`);
};

// Documented layout of a standard 8 MB card.
const PAGE_LEN = 512;
const PAGES_PER_CLUSTER = 2;
const CLUSTERS = 8192;
const ALLOC_OFFSET = 41;
const ALLOC_END = 8135;
const ROOT_CLUSTERS = 1;
const FREE = ALLOC_END - ROOT_CLUSTERS;
const BLOCK = 16 * RAW_PAGE;

check('image size (16384 pages of 528 bytes)', oracle.length, RAW_SIZE);
const sb = superblock(oracle);
const first = pageData(oracle, 0);
check('magic', sb.magic, 'Sony PS2 Memory Card Format ');
check('version', sb.version, '1.2.0.0');
check('page length', sb.pageLen, PAGE_LEN);
check('pages per cluster', sb.pagesPerCluster, PAGES_PER_CLUSTER);
check('pages per block', sb.pagesPerBlock, 16);
check('clusters per card', sb.clustersPerCard, CLUSTERS);
check('alloc offset', sb.allocOffset, ALLOC_OFFSET);
check('alloc end', sb.allocEnd, ALLOC_END);
check('root directory cluster', sb.rootdirCluster, 0);
check('backup blocks', [sb.backupBlock1, sb.backupBlock2], [1023, 1022]);
check('indirect FAT list', sb.ifcList.slice(0, 2), [8, 0]);
check('card type and flags (flags from the oracle)', [first[0x150], first[0x151], sb.cardType, sb.cardFlags], [2, 0x2b, 2, 0x2b]);
check('bad block list (unused entries)', Array.from({ length: 32 }, (_, i) => first.readUInt32LE(0xd0 + 4 * i)), Array(32).fill(0xffffffff));

const table = fat(oracle, sb);
check('FAT entries', table.length, CLUSTERS);
check('FAT entry 0 (root directory, last cluster)', table[0], 0xffffffff);
check('free FAT entries', table.filter((v) => v === 0x7fffffff).length, FREE);
check('FAT entries from alloc end (unallocatable)', table.slice(ALLOC_END).every((v) => v === 0xffffffff), true);
const root = directory(oracle, sb, table, sb.rootdirCluster, 99);
check('root entries', root.map((e) => [e.name, e.length]), [['.', 2], ['..', 0]]);
check('root entry modes', root.map((e) => e.mode), [0x8427, 0xa426]);
check('root entries: first cluster, directory entry, attribute', root.map((e) => [e.cluster, e.dirEntry, e.attr]), [[0, 0, 0], [0, 0, 0]]);
const raw = pageData(oracle, ALLOC_OFFSET * 2);
const timeAt = (at) => ({ sec: raw[at + 1], min: raw[at + 2], hour: raw[at + 3], day: raw[at + 4], month: raw[at + 5], year: raw[at + 6] | (raw[at + 7] << 8) });
check('root entry times (created, modified of both entries)', [root[0].created, root[0].modified, root[1].created, root[1].modified], [timeAt(8), timeAt(0x18), timeAt(8), timeAt(0x18)]);
check('time of a date (the oracle was formatted 2026-10-03 01:15:33)', timeOf(new Date(2026, 9, 3, 1, 15, 33)), timeAt(8));

const result = info(oracle);
check('info state', result.state, 'formatted');
check('info free clusters (alloc end minus the root cluster)', result.freeClusters, FREE);
check('info cluster bytes', result.clusterBytes, PAGES_PER_CLUSTER * PAGE_LEN);
check('info free KB', result.freeKB, FREE * PAGES_PER_CLUSTER * PAGE_LEN / 1024);
check('info root entries', result.rootNames, ['.', '..']);

// ECC: every programmed page's twelve bytes, and exactly the pages that hold data or a programmed block.
const report = eccReport(oracle);
check('programmed pages (blocks 0..5 and the copy in block 1023)', report.pages, 7 * 16);
check('programmed pages with a wrong ECC', report.badPages, []);

// The writer against the oracle, with the root entries' time taken from the oracle.
const written = formattedEmpty(timeAt(8));
check('make_card image size', written.length, RAW_SIZE);
check('pages where make_card differs from the oracle', diffPages(written, oracle), []);
const touched = Buffer.from(oracle);
touched[5] ^= 0x10;
check('control: one changed byte in page 0 is page 0', diffPages(touched, oracle), [0]);
const touchedLast = Buffer.from(oracle);
touchedLast[RAW_SIZE - 1] ^= 0x10;
check('control: one changed byte in the last page is the last page', diffPages(touchedLast, oracle), [RAW_SIZE / RAW_PAGE - 1]);

// From the oracle: what the documents do not give.
console.log(`from the oracle: card flags 0x${first[0x151].toString(16)}, words 0x154 0x${first.readUInt32LE(0x154).toString(16)}, 0x158 0x${first.readUInt32LE(0x158).toString(16)}, 0x15C 0x${first.readUInt32LE(0x15c).toString(16)}, 0x170 ${first.readUInt32LE(0x170)}`);
check('block 1023 equals block 0 (data and spare)', oracle.subarray(oracle.length - BLOCK).equals(oracle.subarray(0, BLOCK)), true);
const spareBlock = oracle.subarray(oracle.length - 2 * BLOCK, oracle.length - BLOCK);
check('block 1022 is erased (length, all 0xFF)', [spareBlock.length, spareBlock.every((v) => v === 0xff)], [BLOCK, true]);
check('spare of an erased page of a programmed block', Array.from(pageSpare(oracle, 1)), [0x77, 0x7f, 0x7f, 0x77, 0x7f, 0x7f, 0x77, 0x7f, 0x7f, 0x77, 0x7f, 0x7f, 0, 0, 0, 0]);

// Positive control: damage the oracle; the reader must notice each.
const hit = Buffer.from(oracle);
hit[(ALLOC_OFFSET * 2) * RAW_PAGE + 3] ^= 0x01;
check('control: a flipped data bit is that page and no other', eccReport(hit).badPages, [ALLOC_OFFSET * 2]);
const noMagic = Buffer.from(oracle);
noMagic[0] ^= 0x20;
check('control: a broken magic is Unformatted', info(noMagic).state, 'unformatted');

const setEntry = (image, cluster, value) => {
  const byte = cluster * 4;
  image.writeUInt32LE(value, ((sb.ifcList[0] + 1) * 2 + Math.floor(byte / PAGE_LEN)) * RAW_PAGE + (byte % PAGE_LEN));
};
const taken = Buffer.from(oracle);
setEntry(taken, 1, 0xffffffff);
check('control: one allocated FAT entry is one free cluster fewer', info(taken).freeClusters, FREE - 1);
const beyond = Buffer.from(oracle);
setEntry(beyond, ALLOC_END, 0x7fffffff);
check('control: a free entry beyond the alloc end is not counted', info(beyond).freeClusters, FREE);
const edge = Buffer.from(oracle);
setEntry(edge, ALLOC_END - 1, 0xffffffff);
check('control: the last allocatable entry is counted', info(edge).freeClusters, FREE - 1);

// A root directory of two clusters: the chain 0 -> 1, two more entries in cluster 1.
const grown = Buffer.from(oracle);
setEntry(grown, 0, 0x80000001);
setEntry(grown, 1, 0xffffffff);
grown.writeUInt32LE(4, (ALLOC_OFFSET * 2) * RAW_PAGE + 4);
const put = (index, mode, length, name, cluster, directoryEntry, attribute) => {
  const at = ((ALLOC_OFFSET + 1) * 2 + index) * RAW_PAGE;
  grown.writeUInt16LE(mode, at);
  grown.writeUInt32LE(length, at + 4);
  grown.writeUInt32LE(cluster, at + 0x10);
  grown.writeUInt32LE(directoryEntry, at + 0x14);
  grown.writeUInt32LE(attribute, at + 0x20);
  grown.write(name.padEnd(32, '\0'), at + 0x40, 'latin1');
};
put(0, 0x8497, 0x1234, 'a', 5, 6, 7);
put(1, 0x8427, 9, 'b'.repeat(32), 10, 11, 12);
const big = info(grown);
const listed = directory(grown, sb, fat(grown, sb), 0, 99);
check('control: a two-cluster root lists four entries', [big.rootEntries, big.rootNames, listed.length], [4, ['.', '..', 'a', 'b'.repeat(32)], 4]);
check('control: it has one cluster less free', big.freeClusters, FREE - 1);
check('control: entry fields (mode, length, cluster, directory entry, attribute)', listed.slice(2).map((e) => [e.mode, e.length, e.cluster, e.dirEntry, e.attr]), [[0x8497, 0x1234, 5, 6, 7], [0x8427, 9, 10, 11, 12]]);
check('control: a self-looping chain ends', chain([0x80000000], 0), [0]);
check('control: a chain stops at a free entry', chain([0x80000001, 0x7fffffff], 0), [0, 1]);
check('control: a chain follows the next-cluster bits', chain([0x80000002, 0xffffffff, 0x80000001], 0), [0, 2, 1]);

// A card whose root directory is not the first allocatable cluster, and fields that sit next to others.
const moved = Buffer.from(oracle);
moved.writeUInt32LE(1, 0x3c);
setEntry(moved, 0, 0x7fffffff);
setEntry(moved, 1, 0xffffffff);
for (let p = 0; p < 2; p++) oracle.copy(moved, ((ALLOC_OFFSET + 1) * 2 + p) * RAW_PAGE, (ALLOC_OFFSET * 2 + p) * RAW_PAGE, (ALLOC_OFFSET * 2 + p + 1) * RAW_PAGE);
moved.writeUInt32LE(7, (ALLOC_OFFSET * 2) * RAW_PAGE + 4);
check('control: a root directory at cluster 1 is read from there', [info(moved).rootEntries, info(moved).rootNames, info(moved).freeClusters], [2, ['.', '..'], FREE]);
const wide = Buffer.from(oracle);
wide[0x28] = 0x41;
check('control: the version text ends at 0x28', superblock(wide).version, '1.2.0.0');
const listy = Buffer.from(oracle);
listy.writeUInt32LE(9, 0xd0);
check('control: the indirect FAT list is 32 entries', fat(listy, superblock(listy)).length, CLUSTERS);

// Blank card and the writer's blank.
check('info of nothing', info(null).state, 'none');
check('info of a blank image', info(blankImage()).state, 'unformatted');
if (blankPath) {
  const blank = fs.readFileSync(blankPath);
  check('instance card is blank (0xFF throughout)', blank.equals(blankImage()), true);
  check('info of the instance card', info(blank).state, 'unformatted');
}

console.log(`compared ${compared} items, ${wrong} different`);
console.log(`verdict: ${wrong === 0 && compared > 0 ? 'FOUND the card image reader and writer agree with the OSD formatted image' : 'PARTIAL see the lines marked DIFFERENT'}`);
process.exit(wrong ? 1 : 0);
