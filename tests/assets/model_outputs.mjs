// What References/model/sound_data.mjs computes from the user's own files, written for AssetsTest to compare
// with the C++ ports in Source/Assets: the decrypted HDD OSD containers, every ROMDIR listing, every member's Expand.
// node tests/assets/model_outputs.mjs <sound_data.mjs> <resource folder> <bios.bin> <out dir>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [modelFile, folder, biosFile, outDir] = process.argv.slice(2);
const { expand, decryptImage, imageKey, romdirStart, romdirEntries, CIPHER_TABLES, CIPHER_TABLE_SIZES } = await import(pathToFileURL(modelFile).href);

fs.mkdirSync(outDir, { recursive: true });
const elf = fs.readFileSync(path.join(folder, 'hddosd.elf'));
const segments = [];
for (let i = 0; i < elf.readUInt16LE(44); i++) {
  const at = elf.readUInt32LE(28) + i * elf.readUInt16LE(42);
  if (elf.readUInt32LE(at) === 1) segments.push({ offset: elf.readUInt32LE(at + 4), address: elf.readUInt32LE(at + 8), size: elf.readUInt32LE(at + 16) });
}
const bytesAt = (address, length) => {
  const s = segments.find((seg) => address >= seg.address && address + length <= seg.address + seg.size);
  return elf.subarray(s.offset + address - s.address, s.offset + address - s.address + length);
};
const tables = Object.fromEntries(Object.keys(CIPHER_TABLES).map((k) => [k, bytesAt(CIPHER_TABLES[k], CIPHER_TABLE_SIZES[k])]));
const words = bytesAt(0x002ad970, 16);
const key = imageKey(words.readBigUInt64LE(0), words.readBigUInt64LE(8));

const listing = {};
function members(tag, container, start) {
  const entries = romdirEntries(container, start);
  listing[tag] = { start, entries: entries.map((e) => ({ name: e.name, size: e.size, offset: e.offset })) };
  fs.mkdirSync(path.join(outDir, tag), { recursive: true });
  for (const e of entries) {
    if (e.size === 0 || ['RESET', 'ROMDIR', 'EXTINFO'].includes(e.name)) continue;
    try {
      const r = expand(container, e.offset);
      Object.assign(listing[tag].entries.find((x) => x.name === e.name), { expanded: r.size, produced: r.produced, consumed: r.consumed });
      fs.writeFileSync(path.join(outDir, tag, `${e.name}.expanded`), r.out);
    } catch (error) {
      listing[tag].entries.find((x) => x.name === e.name).error = String(error.message);
    }
  }
}

for (const name of ['TEXIMAGE', 'SNDIMAGE']) {
  const image = decryptImage(fs.readFileSync(path.join(folder, name)), tables, key);
  fs.writeFileSync(path.join(outDir, `hdd-${name}.decrypted`), image);
  members(`hdd-${name}`, image, romdirStart(image));
}

const bios = fs.readFileSync(biosFile);
const biosStart = romdirStart(bios, 0x100000);
const biosEntries = romdirEntries(bios, biosStart);
listing.bios = { start: biosStart, entries: biosEntries.map((e) => ({ name: e.name, size: e.size, offset: e.offset })) };
for (const name of ['TEXIMAGE', 'SNDIMAGE', 'ICOIMAGE']) {
  const e = biosEntries.find((x) => x.name === name);
  const member = bios.subarray(e.offset, e.offset + e.size);
  fs.writeFileSync(path.join(outDir, `bios-${name}.member`), member);
  members(`bios-${name}`, member, romdirStart(member));
}
fs.writeFileSync(path.join(outDir, 'listing.json'), JSON.stringify({ key: key.toString(16), ...listing }, null, 1));
console.log(`model outputs: ${Object.keys(listing).length} directories written to ${outDir}`);
